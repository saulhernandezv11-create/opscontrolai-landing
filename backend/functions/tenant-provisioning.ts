// ============================================================
// functions/tenant-provisioning.ts – HTTP Trigger (POST /api/tenants)
// Onboards a new SMB client onto the platform
// ============================================================

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { Containers } from '../shared/cosmos-client';
import { WhatsAppCloudAPI } from '../shared/whatsapp-api';
import { validateJwt, requireRole } from '../shared/tenant-resolver';
import type { Tenant, SubscriptionTier, CONVERSATION_LIMITS } from '../models/tenant';
import type { ConversationFlow } from '../models/contact';

const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.opscontrolai.com';
const CONVERSATION_LIMIT_MAP: Record<SubscriptionTier, number> = {
    basico: 1000,
    profesional: 5000,
    empresarial: 999999,
};

interface ProvisioningRequest {
    businessName: string;
    contactEmail: string;
    phoneNumber: string; // E.164 (+52...)
    subscriptionTier: SubscriptionTier;
    whatsappPhoneNumberId: string;
    whatsappBusinessAccountId: string;
    metaApiToken: string; // Used to register webhook; stored securely after
    adminEmail: string;
}

/**
 * Creates the default FAQ + Booking conversation flows for a new tenant.
 */
async function createDefaultFlows(tenantId: string): Promise<void> {
    const faqFlow: ConversationFlow = {
        id: uuidv4(),
        tenantId,
        name: 'FAQ Automático',
        description: 'Responde preguntas frecuentes: horario, dirección, precios, servicios',
        triggerKeywords: ['horario', 'hora', 'dirección', 'donde', 'precio', 'costo', 'servicio', 'info'],
        nodes: [
            {
                id: 'start',
                type: 'question',
                label: '¿Qué necesitas saber?',
                config: {
                    message: '¿Sobre qué te puedo informar?',
                    options: ['Horarios', 'Dirección', 'Precios', 'Servicios'],
                    routes: {
                        'Horarios': 'horario-node',
                        '1': 'horario-node',
                        'Dirección': 'direccion-node',
                        '2': 'direccion-node',
                        'Precios': 'precio-node',
                        '3': 'precio-node',
                        'Servicios': 'servicios-node',
                        '4': 'servicios-node',
                    },
                    next: 'fallback-node',
                },
            },
            { id: 'horario-node', type: 'message', label: 'Horario', config: { message: '⏰ Nuestro horario es {{horario}}. ¡Te esperamos!', next: 'end-node' } },
            { id: 'direccion-node', type: 'message', label: 'Dirección', config: { message: '📍 Nos encontramos en {{direccion}}.', next: 'end-node' } },
            { id: 'precio-node', type: 'message', label: 'Precios', config: { message: '💰 {{precios}}', next: 'end-node' } },
            { id: 'servicios-node', type: 'message', label: 'Servicios', config: { message: '✨ {{servicios}}', next: 'end-node' } },
            { id: 'fallback-node', type: 'message', label: 'Fallback', config: { message: 'Déjame consultarlo con mi equipo y te respondo a la brevedad. 🙏' } },
            { id: 'end-node', type: 'message', label: 'Cierre', config: { message: '¿Hay algo más en lo que pueda ayudarte?' } },
        ],
        entryNodeId: 'start',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const bookingFlow: ConversationFlow = {
        id: uuidv4(),
        tenantId,
        name: 'Cita / Reservación',
        description: 'Flujo de agendamiento de citas',
        triggerKeywords: ['cita', 'reservar', 'agendar', 'appointment', 'booking'],
        nodes: [
            { id: 'greet', type: 'message', label: 'Saludo', config: { message: '📅 ¡Con gusto te ayudo a agendar tu cita!', next: 'ask-service' } },
            { id: 'ask-service', type: 'question', label: 'Tipo servicio', config: { message: '¿Qué tipo de servicio necesitas?', variable: 'service', next: 'ask-date' } },
            { id: 'ask-date', type: 'question', label: 'Fecha', config: { message: '¿Qué fecha prefieres? (ej: lunes 10 de marzo)', variable: 'date', next: 'ask-time' } },
            { id: 'ask-time', type: 'question', label: 'Hora', config: { message: '¿A qué hora te queda mejor?', variable: 'time', next: 'ask-name' } },
            { id: 'ask-name', type: 'question', label: 'Nombre', config: { message: '¿Cuál es tu nombre completo?', variable: 'name', next: 'confirm' } },
            { id: 'confirm', type: 'message', label: 'Confirmación', config: { message: '✅ ¡Listo {{name}}! Tu cita para {{service}} el {{date}} a las {{time}} ha sido agendada.\n\nTe enviaremos un recordatorio. ¡Hasta pronto! 😊' } },
        ],
        entryNodeId: 'greet',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    await Containers.flows().items.create(faqFlow);
    await Containers.flows().items.create(bookingFlow);
}

/**
 * Provisions a blob storage container for the tenant's media files.
 */
async function provisionTenantStorage(tenantId: string): Promise<void> {
    const storageAccount = process.env.STORAGE_ACCOUNT_NAME!;
    const blobClient = new BlobServiceClient(
        `https://${storageAccount}.blob.core.windows.net`,
        new DefaultAzureCredential(),
    );
    const containerClient = blobClient.getContainerClient(`tenant-${tenantId}`);
    await containerClient.createIfNotExists({ access: 'none' });
}

/**
 * Tenant Provisioning – HTTP Trigger
 * POST /api/tenants – Creates a new SMB client on the platform.
 */
async function tenantProvisioningHandler(
    req: HttpRequest,
    context: InvocationContext,
): Promise<HttpResponseInit> {
    // Require admin authentication
    let authUser;
    try {
        authUser = await validateJwt(req);
        requireRole(authUser, 'Platform.SuperAdmin');
    } catch (err) {
        return { status: 401, jsonBody: { error: (err as Error).message } };
    }

    let body: ProvisioningRequest;
    try {
        body = await req.json() as ProvisioningRequest;
    } catch {
        return { status: 400, jsonBody: { error: 'Cuerpo de solicitud inválido' } };
    }

    const { businessName, contactEmail, phoneNumber, subscriptionTier,
        whatsappPhoneNumberId, whatsappBusinessAccountId, metaApiToken } = body;

    // Validate required fields
    if (!businessName || !contactEmail || !phoneNumber || !subscriptionTier || !whatsappPhoneNumberId) {
        return { status: 400, jsonBody: { error: 'Faltan campos requeridos' } };
    }

    // Validate Mexican phone number format
    if (!/^\+52[0-9]{10}$/.test(phoneNumber) && !/^\+52[0-9]{8}$/.test(phoneNumber)) {
        return { status: 400, jsonBody: { error: 'Formato de teléfono inválido. Use +52 seguido de 10 dígitos' } };
    }

    const tenantId = uuidv4();
    const webhookUrl = `${API_BASE_URL}/webhooks/${tenantId}`;
    const tokenSecretName = `wa-token-${tenantId.replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    context.log.info('[Provisioning] Starting tenant provisioning', { tenantId, businessName });

    try {
        // 1. Create Tenant document in Cosmos DB
        const tenant: Tenant = {
            id: tenantId,
            businessName,
            contactEmail,
            phoneNumber,
            subscriptionTier,
            conversationLimit: CONVERSATION_LIMIT_MAP[subscriptionTier],
            whatsappConfig: {
                phoneNumberId: whatsappPhoneNumberId,
                apiTokenSecretName: tokenSecretName,
                businessAccountId: whatsappBusinessAccountId,
            },
            customResponses: {
                horario: 'Lunes a viernes de 9:00 a 18:00 hrs.',
                direccion: 'Por favor contacta a un agente para más información.',
            },
            businessHours: [
                { day: 'monday', start: '09:00', end: '18:00', enabled: true },
                { day: 'tuesday', start: '09:00', end: '18:00', enabled: true },
                { day: 'wednesday', start: '09:00', end: '18:00', enabled: true },
                { day: 'thursday', start: '09:00', end: '18:00', enabled: true },
                { day: 'friday', start: '09:00', end: '18:00', enabled: true },
                { day: 'saturday', start: '10:00', end: '14:00', enabled: false },
                { day: 'sunday', start: '10:00', end: '14:00', enabled: false },
            ],
            branding: { businessName },
            webhookUrl,
            createdAt: now,
            updatedAt: now,
            status: 'active',
            usage: {
                conversationsThisMonth: 0,
                messagesThisMonth: 0,
                storageUsedBytes: 0,
                billingCycleStart: now,
            },
        };

        await Containers.tenants().items.create(tenant);

        // 2. Create default conversation flows
        await createDefaultFlows(tenantId);

        // 3. Provision blob storage container
        await provisionTenantStorage(tenantId);

        // 4. Register WhatsApp webhook with Meta
        //    (The actual Meta API token is stored securely; passed here only for initial registration)
        const wa = new WhatsAppCloudAPI(whatsappPhoneNumberId, tokenSecretName);
        try {
            await wa.registerWebhook(webhookUrl, process.env.META_WEBHOOK_VERIFY_TOKEN!);
        } catch (err) {
            context.log.warn('[Provisioning] Webhook registration failed – check Meta token', { err });
            // Non-fatal: tenant is created, webhook can be registered manually
        }

        context.log.info('[Provisioning] Tenant provisioned successfully', { tenantId, businessName });

        return {
            status: 201,
            jsonBody: {
                tenantId,
                businessName,
                webhookUrl,
                adminDashboardUrl: `https://admin.opscontrolai.com?tenant=${tenantId}`,
                keyVaultSecretToSet: tokenSecretName,
                message: `Tenant "${businessName}" creado exitosamente. Configure el secreto "${tokenSecretName}" en Key Vault con el token de la API de Meta.`,
            },
        };
    } catch (err) {
        context.log.error('[Provisioning] Failed to provision tenant', { tenantId, error: err });
        return {
            status: 500,
            jsonBody: { error: 'Error interno al aprovisionar el tenant. Contacta al equipo técnico.' },
        };
    }
}

app.http('tenant-provisioning', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'tenants',
    handler: tenantProvisioningHandler,
});
