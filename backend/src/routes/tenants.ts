// ============================================================
// src/routes/tenants.ts – Tenant provisioning REST endpoint
// POST /api/tenants – Onboards a new SMB client
// Replaces: functions/tenant-provisioning.ts (Azure Functions HTTP Trigger)
// ============================================================

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { TenantModel, FlowModel } from '../db';
import { WhatsAppCloudAPI } from '../../shared/whatsapp-api';
import { validateJwt, requireRole } from '../../shared/tenant-resolver';

const router = Router();

const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.opscontrolai.com';
const CONVERSATION_LIMIT_MAP: Record<string, number> = {
    basico: 1000,
    profesional: 5000,
    empresarial: 999999,
};

interface ProvisioningRequest {
    businessName: string;
    contactEmail: string;
    phoneNumber: string;
    subscriptionTier: 'basico' | 'profesional' | 'empresarial';
    whatsappPhoneNumberId: string;
    whatsappBusinessAccountId: string;
    metaApiToken: string;
    adminEmail: string;
}

async function createDefaultFlows(tenantId: string): Promise<void> {
    await FlowModel.create({
        id: uuidv4(),
        tenantId,
        name: 'FAQ Automático',
        description: 'Responde preguntas frecuentes',
        triggerKeywords: ['horario', 'hora', 'dirección', 'donde', 'precio', 'costo', 'servicio', 'info'],
        nodes: [
            {
                id: 'start', type: 'question', label: '¿Qué necesitas saber?',
                config: {
                    message: '¿Sobre qué te puedo informar?',
                    options: ['Horarios', 'Dirección', 'Precios', 'Servicios'],
                    routes: { 'Horarios': 'horario-node', '1': 'horario-node', 'Dirección': 'direccion-node', '2': 'direccion-node', 'Precios': 'precio-node', '3': 'precio-node', 'Servicios': 'servicios-node', '4': 'servicios-node' },
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
    });

    await FlowModel.create({
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
    });
}

// POST /api/tenants
router.post('/', async (req: Request, res: Response) => {
    let authUser;
    try {
        authUser = await validateJwt(req);
        requireRole(authUser, 'Platform.SuperAdmin');
    } catch (err) {
        res.status(401).json({ error: (err as Error).message });
        return;
    }

    const body = req.body as ProvisioningRequest;
    const { businessName, contactEmail, phoneNumber, subscriptionTier,
        whatsappPhoneNumberId, whatsappBusinessAccountId, metaApiToken } = body;

    if (!businessName || !contactEmail || !phoneNumber || !subscriptionTier || !whatsappPhoneNumberId) {
        res.status(400).json({ error: 'Faltan campos requeridos' });
        return;
    }

    if (!/^\+52[0-9]{10}$/.test(phoneNumber) && !/^\+52[0-9]{8}$/.test(phoneNumber)) {
        res.status(400).json({ error: 'Formato de teléfono inválido. Use +52 seguido de 10 dígitos' });
        return;
    }

    const tenantId = uuidv4();
    const webhookUrl = `${API_BASE_URL}/webhooks/${tenantId}`;
    const now = new Date().toISOString();

    console.info('[Provisioning] Starting tenant provisioning', { tenantId, businessName });

    try {
        await TenantModel.create({
            id: tenantId,
            businessName,
            contactEmail,
            phoneNumber,
            subscriptionTier,
            conversationLimit: CONVERSATION_LIMIT_MAP[subscriptionTier],
            whatsappConfig: {
                phoneNumberId: whatsappPhoneNumberId,
                apiToken: metaApiToken,  // Stored in DB (encrypted at rest by MongoDB Atlas)
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
        });

        await createDefaultFlows(tenantId);

        // Register WhatsApp webhook with Meta
        const wa = new WhatsAppCloudAPI(whatsappPhoneNumberId, tenantId);
        try {
            await wa.registerWebhook(webhookUrl, process.env.META_WEBHOOK_VERIFY_TOKEN!);
        } catch (err) {
            console.warn('[Provisioning] Webhook registration failed – configure manually', { err });
        }

        console.info('[Provisioning] Tenant provisioned', { tenantId, businessName });

        res.status(201).json({
            tenantId,
            businessName,
            webhookUrl,
            adminDashboardUrl: `${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:5173'}?tenant=${tenantId}`,
            message: `Tenant "${businessName}" creado exitosamente. Configure el webhook URL en la consola de Meta: ${webhookUrl}`,
        });
    } catch (err) {
        console.error('[Provisioning] Failed', { tenantId, error: err });
        res.status(500).json({ error: 'Error interno al aprovisionar el tenant.' });
    }
});

// GET /api/tenants – List all tenants (admin only)
router.get('/', async (req: Request, res: Response) => {
    try {
        await validateJwt(req);
    } catch (err) {
        res.status(401).json({ error: (err as Error).message });
        return;
    }

    const tenants = await TenantModel.find({}, { 'whatsappConfig.apiToken': 0 }).lean().exec();
    res.json(tenants);
});

export default router;
