// ============================================================
// src/routes/webhook.ts – WhatsApp Meta Cloud API webhook
// GET: hub verification challenge
// POST: inbound message notification → enqueue for processing
// Replaces: functions/whatsapp-webhook.ts (Azure Functions HTTP trigger)
// ============================================================

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getConversationQueue } from '../queue';
import { resolveTenantByPhoneNumberId } from '../../shared/tenant-resolver';

const router = Router();

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN!;

function verifyMetaSignature(rawBody: Buffer, signature: string, appSecret: string): boolean {
    const expected = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
        return false;
    }
}

// ─── GET /webhooks/:tenantId – Hub verification ───────────────
router.get('/:tenantId', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.info('[Webhook] Hub verification successful', { tenantId: req.params.tenantId });
        res.status(200).send(challenge);
        return;
    }
    res.status(403).send('Verificación de webhook fallida');
});

// ─── POST /webhooks/:tenantId – Inbound message ───────────────
router.post('/:tenantId', async (req: Request, res: Response) => {
    const correlationId = (req.headers['x-request-id'] as string) ?? uuidv4();

    // Verify Meta signature (rawBody available because of express.raw middleware)
    const rawBody = req.body as Buffer;
    const signature = (req.headers['x-hub-signature-256'] as string) ?? '';
    const appSecret = process.env.META_APP_SECRET ?? '';

    if (appSecret && signature) {
        if (!verifyMetaSignature(rawBody, signature, appSecret)) {
            console.warn('[Webhook] Signature verification failed', { correlationId });
            res.status(401).send('Firma de webhook inválida');
            return;
        }
    }

    let payload: WhatsAppWebhookPayload;
    try {
        payload = JSON.parse(rawBody.toString('utf8')) as WhatsAppWebhookPayload;
    } catch {
        res.status(400).send('Payload JSON inválido');
        return;
    }

    const queue = getConversationQueue();

    // Process each entry/change
    for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
            if (change.field !== 'messages') continue;

            const { value } = change;
            const phoneNumberId = value.metadata?.phone_number_id;

            const tenant = await resolveTenantByPhoneNumberId(phoneNumberId);
            if (!tenant) {
                console.warn('[Webhook] Tenant not found for phone number ID', { phoneNumberId, correlationId });
                continue;
            }

            for (const message of value.messages ?? []) {
                const jobData = {
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

                await queue.add(jobData);

                console.info('[Webhook] Message enqueued', {
                    tenantId: tenant.id,
                    from: message.from.slice(-4),
                    messageId: message.id,
                    correlationId,
                });
            }
        }
    }

    // Meta requires 200 OK within 20 seconds
    res.status(200).send('OK');
});

// ─── Type definitions ─────────────────────────────────────────
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

export default router;
