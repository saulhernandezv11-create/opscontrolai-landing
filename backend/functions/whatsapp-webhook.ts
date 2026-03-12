// ============================================================
// functions/whatsapp-webhook.ts – HTTP Trigger
// Receives WhatsApp messages from Meta Cloud API
// Verifies signature, enqueues for async processing, returns 200
// ============================================================

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import crypto from 'crypto';
import { QueueServiceClient } from '@azure/storage-queues';
import { DefaultAzureCredential } from '@azure/identity';
import { resolveTenantByPhoneNumberId } from '../shared/tenant-resolver';

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN!;
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME!;
const QUEUE_NAME = 'conversation-queue';

let queueClient: QueueServiceClient | null = null;

function getQueueClient(): QueueServiceClient {
    if (queueClient) return queueClient;
    if (process.env.NODE_ENV === 'production') {
        queueClient = new QueueServiceClient(
            `https://${STORAGE_ACCOUNT_NAME}.queue.core.windows.net`,
            new DefaultAzureCredential(),
        );
    } else {
        queueClient = QueueServiceClient.fromConnectionString(
            process.env.AzureWebJobsStorage!,
        );
    }
    return queueClient;
}

/**
 * Verifies the X-Hub-Signature-256 header from Meta.
 * Meta signs the payload with the app's secret.
 */
function verifyMetaSignature(body: string, signature: string, appSecret: string): boolean {
    const expected = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(body)
        .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * WhatsApp Webhook HTTP Trigger
 *
 * GET: Meta webhook verification challenge
 * POST: Inbound WhatsApp message notification
 */
async function whatsappWebhookHandler(
    req: HttpRequest,
    context: InvocationContext,
): Promise<HttpResponseInit> {
    const correlationId = req.headers.get('x-request-id') ?? crypto.randomUUID();
    context.log.info('[Webhook] Received request', { method: req.method, correlationId });

    // ─── GET: Hub verification challenge ──────────────────────
    if (req.method === 'GET') {
        const mode = req.query.get('hub.mode');
        const token = req.query.get('hub.verify_token');
        const challenge = req.query.get('hub.challenge');

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            context.log.info('[Webhook] Hub verification successful', { correlationId });
            return { status: 200, body: challenge ?? '' };
        }
        return { status: 403, body: 'Verificación de webhook fallida' };
    }

    // ─── POST: Inbound message notification ───────────────────
    if (req.method !== 'POST') {
        return { status: 405, body: 'Método no permitido' };
    }

    const rawBody = await req.text();

    // Verify Meta signature (use APP_SECRET from Key Vault in production)
    // For now, signature verification is conditional on having the secret configured
    const signature = req.headers.get('x-hub-signature-256') ?? '';
    const appSecret = process.env.META_APP_SECRET ?? '';
    if (appSecret && signature) {
        if (!verifyMetaSignature(rawBody, signature, appSecret)) {
            context.log.warn('[Webhook] Signature verification failed', { correlationId });
            return { status: 401, body: 'Firma de webhook inválida' };
        }
    }

    let payload: WhatsAppWebhookPayload;
    try {
        payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
    } catch {
        return { status: 400, body: 'Payload JSON inválido' };
    }

    // Process each entry/change asynchronously
    for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
            if (change.field !== 'messages') continue;

            const { value } = change;
            const phoneNumberId = value.metadata?.phone_number_id;

            // Resolve tenant from the phone number ID
            const tenant = await resolveTenantByPhoneNumberId(phoneNumberId);
            if (!tenant) {
                context.log.warn('[Webhook] Tenant not found for phone number ID', {
                    phoneNumberId,
                    correlationId,
                });
                continue;
            }

            // Enqueue each inbound message for async processing
            for (const message of value.messages ?? []) {
                const queueMessage = {
                    correlationId,
                    tenantId: tenant.id,
                    phoneNumberId,
                    from: message.from,
                    messageId: message.id,
                    timestamp: message.timestamp,
                    type: message.type,
                    text: message.text?.body,
                    mediaId: message.image?.id ?? message.document?.id ?? message.audio?.id,
                    enqueuedAt: new Date().toISOString(),
                };

                const queueSvc = getQueueClient();
                const queue = queueSvc.getQueueClient(QUEUE_NAME);
                await queue.sendMessage(
                    Buffer.from(JSON.stringify(queueMessage)).toString('base64'),
                );

                context.log.info('[Webhook] Message enqueued', {
                    tenantId: tenant.id,
                    from: message.from.slice(-4), // Log only last 4 digits for privacy
                    messageId: message.id,
                    correlationId,
                });
            }
        }
    }

    // Meta requires 200 OK within 20 seconds – always return immediately
    return { status: 200, body: 'OK' };
}

// ─── Type definitions for Meta webhook payload ───────────────
interface WhatsAppWebhookPayload {
    object: string;
    entry: Array<{
        id: string;
        changes: Array<{
            field: string;
            value: {
                metadata: { phone_number_id: string; display_phone_number: string };
                messages: Array<{
                    id: string;
                    from: string;
                    timestamp: string;
                    type: string;
                    text?: { body: string };
                    image?: { id: string; mime_type: string; caption?: string };
                    document?: { id: string; filename: string; mime_type: string };
                    audio?: { id: string; mime_type: string };
                    interactive?: { type: string; button_reply?: { id: string; title: string } };
                }>;
            };
        }>;
    }>;
}

// Register the function with Azure Functions runtime
app.http('whatsapp-webhook', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous', // Meta cannot pass function keys
    route: 'webhooks/{tenantId}',
    handler: whatsappWebhookHandler,
});
