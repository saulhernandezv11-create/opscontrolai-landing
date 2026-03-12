// ============================================================
// src/workers/conversation-worker.ts – Bull queue worker
// Replaces: functions/conversation-processor.ts (Azure Queue Trigger)
// Same processing logic, just wired to Bull instead of Azure queues
// ============================================================

import Bull from 'bull';
import { v4 as uuidv4 } from 'uuid';
import {
    ConversationModel,
    ContactModel,
    FlowModel,
    AnalyticsModel,
} from '../db';
import { generateResponse, detectIntent } from '../../shared/openai-client';
import { WhatsAppCloudAPI } from '../../shared/whatsapp-api';
import { resolveTenantById } from '../../shared/tenant-resolver';
import { executeFlow } from '../../functions/flow-engine';
import type { Tenant } from '../../models/tenant';
import type { Conversation, Message, DetectedIntent } from '../../models/conversation';
import type { Contact } from '../../models/contact';

interface QueueMessage {
    correlationId: string;
    tenantId: string;
    phoneNumberId: string;
    from: string;
    messageId: string;
    timestamp: string;
    type: string;
    text?: string;
    mediaId?: string;
    enqueuedAt: string;
}

async function upsertContact(tenantId: string, phoneNumber: string): Promise<Contact> {
    const existing = await ContactModel.findOne({ tenantId, phoneNumber }).lean<Contact>().exec();

    if (existing) {
        await ContactModel.updateOne(
            { id: existing.id },
            { $set: { lastContactedAt: new Date().toISOString() }, $inc: { conversationCount: 1 } },
        ).exec();
        return existing;
    }

    const newContact: Contact = {
        id: uuidv4(),
        tenantId,
        phoneNumber,
        name: phoneNumber,
        tags: [],
        customFields: {},
        conversationCount: 1,
        firstContactedAt: new Date().toISOString(),
        lastContactedAt: new Date().toISOString(),
        isBlocked: false,
        optedOut: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    await ContactModel.create(newContact);
    return newContact;
}

async function getOrCreateConversation(
    tenantId: string,
    contactId: string,
    phoneNumber: string,
): Promise<Conversation> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const existing = await ConversationModel.findOne({
        tenantId,
        contactId,
        status: 'active',
        'metadata.lastMessageAt': { $gt: cutoff },
    })
        .sort({ 'metadata.lastMessageAt': -1 })
        .lean<Conversation>()
        .exec();

    if (existing) return existing;

    const now = new Date().toISOString();
    const conv: Conversation = {
        id: uuidv4(),
        tenantId,
        contactId,
        phoneNumber,
        messages: [],
        status: 'active',
        tags: [],
        metadata: {
            firstMessageAt: now,
            lastMessageAt: now,
            totalMessages: 0,
            totalTokensUsed: 0,
            estimatedCostMXN: 0,
        },
        createdAt: now,
        updatedAt: now,
    };
    await ConversationModel.create(conv);
    return conv;
}

async function emitAnalyticsEvent(
    tenantId: string,
    eventType: string,
    metadata: Record<string, unknown>,
): Promise<void> {
    await AnalyticsModel.create({
        id: uuidv4(),
        tenantId,
        eventType,
        timestamp: new Date().toISOString(),
        metadata,
    });
}

async function checkConversationLimit(tenant: Tenant): Promise<boolean> {
    if (tenant.subscriptionTier === 'empresarial') return true;
    return tenant.usage.conversationsThisMonth < tenant.conversationLimit;
}

async function processMessage(msg: QueueMessage): Promise<void> {
    const startTime = Date.now();
    const { correlationId, tenantId, phoneNumberId, from, messageId, text, type } = msg;

    console.info('[Worker] Processing message', { correlationId, tenantId, messageType: type, from: from.slice(-4) });

    const tenant = await resolveTenantById(tenantId);
    if (!tenant) {
        console.error('[Worker] Tenant not found', { tenantId, correlationId });
        return;
    }

    const withinLimit = await checkConversationLimit(tenant);
    const wa = new WhatsAppCloudAPI(phoneNumberId, tenantId);

    if (!withinLimit) {
        await wa.sendMessage(
            from,
            '¡Hola! Has alcanzado el límite de conversaciones de tu plan este mes. ' +
            'Por favor contacta a tu proveedor para actualizar tu suscripción.',
        );
        return;
    }

    const contact = await upsertContact(tenantId, from);
    const conversation = await getOrCreateConversation(tenantId, contact.id, from);
    const isNewConversation = conversation.messages.length === 0;

    const inboundMessage: Message = {
        id: messageId,
        timestamp: msg.timestamp,
        direction: 'inbound',
        type: type as Message['type'],
        content: text ?? `[${type}]`,
        mediaId: msg.mediaId,
        deliveryStatus: 'delivered',
    };

    let detectedIntent: DetectedIntent = 'other';
    let confidence = 0;

    if (text) {
        const intentResult = await detectIntent(text);
        detectedIntent = intentResult.intent as DetectedIntent;
        confidence = intentResult.confidence;
        inboundMessage.intent = detectedIntent;
        inboundMessage.aiConfidence = confidence;
    }

    await wa.markAsRead(messageId);

    let botResponseText = '';
    let tokensUsed = 0;
    let costMXN = 0;

    // Context object to replace Azure InvocationContext
    const ctx = {
        log: {
            info: (...args: unknown[]) => console.info(...args),
            warn: (...args: unknown[]) => console.warn(...args),
            error: (...args: unknown[]) => console.error(...args),
        },
    };

    if (conversation.activeFlowId) {
        const flowResult = await executeFlow(tenant, conversation, text ?? '', ctx as any);
        botResponseText = flowResult.responseText;
        if (flowResult.completed) {
            conversation.activeFlowId = undefined;
            conversation.activeFlowNodeId = undefined;
        } else {
            conversation.activeFlowNodeId = flowResult.nextNodeId;
        }
    } else if (text) {
        const flows = await FlowModel.find({ tenantId, isActive: true }).lean().exec();
        const matchedFlow = flows.find((f: any) =>
            f.triggerKeywords?.some((kw: string) => text.toLowerCase().includes(kw.toLowerCase())),
        );

        if (matchedFlow) {
            conversation.activeFlowId = (matchedFlow as any).id;
            const flowResult = await executeFlow(tenant, conversation, text, ctx as any);
            botResponseText = flowResult.responseText;
            conversation.activeFlowNodeId = flowResult.nextNodeId;
        } else {
            const customMatch = Object.entries(tenant.customResponses || {}).find(([kw]) =>
                text.toLowerCase().includes(kw.toLowerCase()),
            );

            if (customMatch) {
                botResponseText = customMatch[1] as string;
            } else {
                const aiResult = await generateResponse(tenant, conversation.messages, text);
                botResponseText = aiResult.response;
                tokensUsed = aiResult.totalTokens;
                costMXN = aiResult.estimatedCostMXN;
                inboundMessage.tokensUsed = tokensUsed;
            }
        }
    } else {
        botResponseText = 'Recibí tu mensaje. ¿En qué puedo ayudarte? Puedes escribirme lo que necesitas.';
    }

    if (isNewConversation) {
        botResponseText = `¡Bienvenido a ${tenant.branding.businessName}! ` +
            (botResponseText || '¿En qué podemos ayudarte hoy?');
    }

    await wa.sendMessage(from, botResponseText);

    const outboundMessage: Message = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        direction: 'outbound',
        type: 'text',
        content: botResponseText,
        deliveryStatus: 'sent',
        tokensUsed,
    };

    const updatedMessages = [...conversation.messages, inboundMessage, outboundMessage];
    const now = new Date().toISOString();

    await ConversationModel.updateOne(
        { id: conversation.id },
        {
            $set: {
                messages: updatedMessages,
                updatedAt: now,
                activeFlowId: conversation.activeFlowId,
                activeFlowNodeId: conversation.activeFlowNodeId,
                'metadata.lastMessageAt': now,
                'metadata.totalMessages': (conversation.metadata.totalMessages || 0) + 2,
                'metadata.totalTokensUsed': (conversation.metadata.totalTokensUsed || 0) + tokensUsed,
                'metadata.estimatedCostMXN': (conversation.metadata.estimatedCostMXN || 0) + costMXN,
            },
        },
    ).exec();

    const responseTimeMs = Date.now() - startTime;

    if (isNewConversation) {
        await emitAnalyticsEvent(tenantId, 'conversation_started', {
            conversationId: conversation.id,
            contactId: contact.id,
        });
    }

    await emitAnalyticsEvent(tenantId, 'intent_detected', {
        conversationId: conversation.id,
        intent: detectedIntent,
        responseTimeMs,
        tokensUsed,
        estimatedCostMXN: costMXN,
    });

    console.info('[Worker] Message processed', { correlationId, tenantId, responseTimeMs, intent: detectedIntent });
}

export function startConversationWorker(queue: Bull.Queue): void {
    queue.process(5 /* concurrency */, async (job) => {
        await processMessage(job.data as QueueMessage);
    });

    queue.on('failed', (job, err) => {
        console.error('[Worker] Job failed', { jobId: job.id, error: err.message });
    });

    queue.on('completed', (job) => {
        console.info('[Worker] Job completed', { jobId: job.id });
    });

    console.info('[Worker] Conversation worker started (concurrency: 5)');
}
