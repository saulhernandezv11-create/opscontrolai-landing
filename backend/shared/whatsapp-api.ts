// ============================================================
// shared/whatsapp-api.ts – Meta Cloud API v21.0 wrapper
// CHANGE: Removed @azure/keyvault-secrets + DefaultAzureCredential
// Tokens are now stored in env vars or DB per tenant (no Key Vault)
// ============================================================

import axios, { AxiosInstance } from 'axios';
import { TenantModel } from '../src/db';

const META_API_BASE = 'https://graph.facebook.com/v21.0';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface InteractiveButtonPayload {
    type: 'button';
    body: { text: string };
    action: {
        buttons: Array<{
            type: 'reply';
            reply: { id: string; title: string };
        }>;
    };
}

export interface InteractiveListPayload {
    type: 'list';
    header?: { type: 'text'; text: string };
    body: { text: string };
    action: {
        button: string;
        sections: Array<{
            title: string;
            rows: Array<{ id: string; title: string; description?: string }>;
        }>;
    };
}

export type InteractiveMessagePayload = InteractiveButtonPayload | InteractiveListPayload;

export interface BusinessProfile {
    name: string;
    description?: string;
    email?: string;
    websites?: string[];
    address?: string;
}

// Cache for tenant API tokens
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Gets the Meta API token for a tenant.
 * Token is stored directly in the tenant's DB record (whatsappConfig.apiToken).
 * Fall back to META_API_TOKEN env var for single-tenant setups.
 */
async function getTenantToken(tenantId: string): Promise<string> {
    const cacheKey = `token:${tenantId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const tenant = await TenantModel.findOne({ id: tenantId }).select('whatsappConfig.apiToken').lean().exec();
    const token = (tenant as any)?.whatsappConfig?.apiToken || process.env.META_API_TOKEN || '';

    if (!token) throw new Error(`No Meta API token found for tenant ${tenantId}`);
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 5 * 60 * 1000 });
    return token;
}

async function metaApiCall(
    method: 'get' | 'post' | 'delete',
    path: string,
    token: string,
    data?: unknown,
): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const resp = await axios({
                method,
                url: `${META_API_BASE}${path}`,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                data,
            });
            return resp.data;
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const status = err.response?.status ?? 0;
                if (status >= 500) {
                    lastError = err;
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * 2 ** attempt));
                    continue;
                }
                console.error('[WhatsApp API] Client error', {
                    status,
                    path,
                    error: err.response?.data,
                });
            }
            throw err;
        }
    }
    throw lastError!;
}

export class WhatsAppCloudAPI {
    private phoneNumberId: string;
    private tenantId: string;

    constructor(phoneNumberId: string, tenantId: string) {
        this.phoneNumberId = phoneNumberId;
        this.tenantId = tenantId;
    }

    private async token(): Promise<string> {
        return getTenantToken(this.tenantId);
    }

    async sendMessage(to: string, message: string): Promise<void> {
        await metaApiCall('post', `/${this.phoneNumberId}/messages`, await this.token(), {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: message, preview_url: false },
        });
    }

    async sendMedia(
        to: string,
        mediaUrl: string,
        mediaType: 'image' | 'document' | 'audio' | 'video',
        caption?: string,
    ): Promise<void> {
        await metaApiCall('post', `/${this.phoneNumberId}/messages`, await this.token(), {
            messaging_product: 'whatsapp',
            to,
            type: mediaType,
            [mediaType]: { link: mediaUrl, caption },
        });
    }

    async sendInteractiveMessage(to: string, payload: InteractiveMessagePayload): Promise<void> {
        await metaApiCall('post', `/${this.phoneNumberId}/messages`, await this.token(), {
            messaging_product: 'whatsapp',
            to,
            type: 'interactive',
            interactive: payload,
        });
    }

    async sendTemplate(
        to: string,
        templateName: string,
        languageCode: string,
        components: unknown[],
    ): Promise<void> {
        await metaApiCall('post', `/${this.phoneNumberId}/messages`, await this.token(), {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
                name: templateName,
                language: { code: languageCode },
                components,
            },
        });
    }

    async markAsRead(messageId: string): Promise<void> {
        await metaApiCall('post', `/${this.phoneNumberId}/messages`, await this.token(), {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId,
        });
    }

    async uploadMedia(fileBuffer: Buffer, mimeType: string): Promise<string> {
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('file', fileBuffer, { contentType: mimeType, filename: 'upload' });
        form.append('messaging_product', 'whatsapp');

        const token = await this.token();
        const resp = await axios.post(
            `${META_API_BASE}/${this.phoneNumberId}/media`,
            form,
            { headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` } },
        );
        return resp.data.id as string;
    }

    async registerWebhook(webhookUrl: string, verifyToken: string): Promise<void> {
        await metaApiCall('post', `/${this.phoneNumberId}/subscribed_apps`, await this.token(), {
            subscribed_fields: ['messages'],
        });
        console.info('[WhatsApp API] Webhook registered', { webhookUrl });
    }

    async getBusinessProfile(): Promise<BusinessProfile> {
        const data = await metaApiCall(
            'get',
            `/${this.phoneNumberId}/whatsapp_business_profile?fields=name,description,email,websites,address`,
            await this.token(),
        ) as { data: BusinessProfile[] };
        return data.data[0];
    }
}
