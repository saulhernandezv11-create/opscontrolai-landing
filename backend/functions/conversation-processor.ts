// ============================================================
// functions/conversation-processor.ts – Queue Trigger
// Dequeues WhatsApp messages, routes to AI or flow engine,
// sends response via WhatsApp API, saves to Cosmos DB
// ============================================================

import { app, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { Containers } from '../shared/cosmos-client';
import { generateResponse, detectIntent } from '../shared/openai-client';
import { WhatsAppCloudAPI } from '../shared/whatsapp-api';
import { resolveTenantById } from '../shared/tenant-resolver';
import { executeFlow } from './flow-engine';
import type { Tenant, CONVERSATION_LIMITS } from '../models/tenant';
import type { Conversation, Message, DetectedIntent } from '../models/conversation';
import type { Contact } from '../models/contact';
import type { AnalyticsEvent } from '../models/contact';

interface QueueMessage {
    correlationId: string;
    tenantId: string;
    phoneNumberId: string;
    from: string; // Sender's phone number (E.164)
    messageId: string;
    timestamp: string;
    type: string;
    text?: string;
    mediaId?: string;
    enqueuedAt: string;
}

/**
 * Looks up or creates a Contact record for the sender.
 */
async function upsertContact(tenantId: string, phoneNumber: string): Promise<Contact> {
    const { resources } = await Containers.contacts()
        .items.query<Contact>({
            query: 'SELECT * FROM c WHERE c.tenantId = @tenantId AND c.phoneNumber = @phone',
            parameters: [
                { name: '@tenantId', value: tenantId },
                { name: '@phone', value: phoneNumber },
            ],
        })
        .fetchAll();

    if (resources.length > 0) {
        // Update last contacted timestamp
        const contact = resources[0];
        contact.lastContactedAt = new Date().toISOString();
        contact.conversationCount += 1;
        await Containers.contacts().item(contact.id, tenantId).replace(contact);
        return contact;
    }

    // Create new contact
    const newContact: Contact = {
        id: uuidv4(),
        tenantId,
        phoneNumber,
        name: phoneNumber, // Will be updated if user provides name
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
    await Containers.contacts().items.create(newContact);
    return newContact;
}

/**
 * Gets the active conversation for a contact, or creates a new one.
 */
async function getOrCreateConversation(
    tenantId: string,
    contactId: string,
    phoneNumber: string,
): Promise<Conversation> {
    // Look for an active conversation in the last 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { resources } = await Containers.conversations()
        .items.query<Conversation>({
            query: `SELECT * FROM c WHERE c.tenantId = @tenantId AND c.contactId = @contactId 
              AND c.status = 'active' AND c.metadata.lastMessageAt > @cutoff ORDER BY c.metadata.lastMessageAt DESC OFFSET 0 LIMIT 1`,
            parameters: [
                { name: '@tenantId', value: tenantId },
                { name: '@contactId', value: contactId },
                { name: '@cutoff', value: cutoff },
            ],
        })
        .fetchAll();

    if (resources.length > 0) return resources[0];

    // Create fresh conversation
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
    await Containers.conversations().items.create(conv);
    return conv;
}

/**
 * Emits an analytics event to Cosmos DB.
 */
async function emitAnalyticsEvent(
    tenantId: string,
    eventType: AnalyticsEvent['eventType'],
    metadata: AnalyticsEvent['metadata'],
): Promise<void> {
    const event: AnalyticsEvent = {
        id: uuidv4(),
        tenantId,
        eventType,
        timestamp: new Date().toISOString(),
        metadata,
        ttl: 7776000, // 90 days
    };
    await Containers.analytics().items.create(event);
}

/**
 * Checks if a tenant has exceeded their monthly conversation limit.
 */
async function checkConversationLimit(tenant: Tenant): Promise<boolean> {
    if (tenant.subscriptionTier === 'empresarial') return true;
    return tenant.usage.conversationsThisMonth < tenant.conversationLimit;
}

/**
 * Conversation Processor – Queue Trigger
 * Processes one WhatsApp message per invocation.
 */
async function conversationProcessorHandler(
    queueItem: unknown,
    context: InvocationContext,
): Promise<void> {
    const startTime = Date.now();
    const msg = queueItem as QueueMessage;
    const { correlationId, tenantId, phoneNumberId, from, messageId, text, type } = msg;

    context.log.info('[Processor] Processing message', {
        correlationId,
        tenantId,
        messageType: type,
        from: from.slice(-4),
    });

    // ─── 1. Load tenant config ────────────────────────────────
    const tenant = await resolveTenantById(tenantId);
    if (!tenant) {
        context.log.error('[Processor] Tenant not found', { tenantId, correlationId });
        return;
    }

    // ─── 2. Check subscription limits ────────────────────────
    const withinLimit = await checkConversationLimit(tenant);
    if (!withinLimit) {
        const wa = new WhatsAppCloudAPI(phoneNumberId, tenant.whatsappConfig.apiTokenSecretName);
        await wa.sendMessage(
            from,
            '¡Hola! Has alcanzado el límite de conversaciones de tu plan este mes. ' +
            'Por favor contacta a tu proveedor para actualizar tu suscripción.',
        );
        return;
    }

    // ─── 3. Upsert contact & conversation ────────────────────
    const contact = await upsertContact(tenantId, from);
    const conversation = await getOrCreateConversation(tenantId, contact.id, from);

    const isNewConversation = conversation.messages.length === 0;

    // ─── 4. Append inbound message to conversation ───────────
    const inboundMessage: Message = {
        id: messageId,
        timestamp: msg.timestamp,
        direction: 'inbound',
        type: type as Message['type'],
        content: text ?? `[${type}]`,
        mediaId: msg.mediaId,
        deliveryStatus: 'delivered',
    };

    // ─── 5. Detect intent ─────────────────────────────────────
    let detectedIntent: DetectedIntent = 'other';
    let confidence = 0;

    if (text) {
        const intentResult = await detectIntent(text);
        detectedIntent = intentResult.intent as DetectedIntent;
        confidence = intentResult.confidence;
        inboundMessage.intent = detectedIntent;
        inboundMessage.aiConfidence = confidence;
    }

    // ─── 6. Route to appropriate handler ─────────────────────
    const wa = new WhatsAppCloudAPI(phoneNumberId, tenant.whatsappConfig.apiTokenSecretName);
    await wa.markAsRead(messageId); // Mark message as read

    let botResponseText = '';
    let tokensUsed = 0;
    let costMXN = 0;

    // Check if there's an active flow
    if (conversation.activeFlowId) {
        const flowResult = await executeFlow(tenant, conversation, text ?? '', context);
        botResponseText = flowResult.responseText;
        if (flowResult.completed) {
            conversation.activeFlowId = undefined;
            conversation.activeFlowNodeId = undefined;
        } else {
            conversation.activeFlowNodeId = flowResult.nextNodeId;
        }
    }
    // Check if intent matches a flow trigger keyword
    else if (text) {
        const { resources: flows } = await Containers.flows()
            .items.query({
                query: `SELECT * FROM c WHERE c.tenantId = @tenantId AND c.isActive = true`,
                parameters: [{ name: '@tenantId', value: tenantId }],
            })
            .fetchAll();

        const matchedFlow = flows.find((f: { triggerKeywords: string[] }) =>
            f.triggerKeywords.some((kw: string) => text.toLowerCase().includes(kw.toLowerCase())),
        );

        if (matchedFlow) {
            // Start the flow
            conversation.activeFlowId = matchedFlow.id;
            const flowResult = await executeFlow(tenant, conversation, text, context);
            botResponseText = flowResult.responseText;
            conversation.activeFlowNodeId = flowResult.nextNodeId;
        }
        // Check tenant custom responses (keyword matching)
        else {
            const customMatch = Object.entries(tenant.customResponses).find(([kw]) =>
                text.toLowerCase().includes(kw.toLowerCase()),
            );

            if (customMatch) {
                botResponseText = customMatch[1];
            }
            // Fall back to GPT-4o
            else {
                const aiResult = await generateResponse(tenant, conversation.messages, text);
                botResponseText = aiResult.response;
                tokensUsed = aiResult.totalTokens;
                costMXN = aiResult.estimatedCostMXN;
                inboundMessage.tokensUsed = tokensUsed;
            }
        }
    } else {
        // Non-text message (image, audio, etc.)
        botResponseText =
            'Recibí tu mensaje. ¿En qué puedo ayudarte? Puedes escribirme lo que necesitas.';
    }

    // Send welcome message for new conversations
    if (isNewConversation) {
        const welcomeMsg =
            `¡Bienvenido a ${tenant.branding.businessName}! ` +
            (botResponseText || '¿En qué podemos ayudarte hoy?');
        botResponseText = welcomeMsg;
    }

    // ─── 7. Send WhatsApp response ────────────────────────────
    await wa.sendMessage(from, botResponseText);

    // ─── 8. Append bot message to conversation ────────────────
    const outboundMessage: Message = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        direction: 'outbound',
        type: 'text',
        content: botResponseText,
        deliveryStatus: 'sent',
        tokensUsed,
    };

    conversation.messages.push(inboundMessage, outboundMessage);
    conversation.metadata.lastMessageAt = new Date().toISOString();
    conversation.metadata.totalMessages += 2;
    conversation.metadata.totalTokensUsed += tokensUsed;
    conversation.metadata.estimatedCostMXN += costMXN;
    conversation.updatedAt = new Date().toISOString();

    // ─── 9. Persist conversation ──────────────────────────────
    await Containers.conversations().item(conversation.id, tenantId).replace(conversation);

    // ─── 10. Emit analytics events ────────────────────────────
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

    context.log.info('[Processor] Message processed successfully', {
        correlationId,
        tenantId,
        responseTimeMs,
        intent: detectedIntent,
        tokensUsed,
    });
}

app.storageQueue('conversation-processor', {
    queueName: 'conversation-queue',
    connection: 'AzureWebJobsStorage',
    handler: conversationProcessorHandler,
});
