// ============================================================
// src/server.ts – Express.js entry point
// Replaces: Azure Functions host.json + individual HTTP triggers
// ============================================================

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { connectDb } from './db';
import { getConversationQueue } from './queue';
import { startConversationWorker } from './workers/conversation-worker';
import { scheduleAnalyticsAggregation } from './workers/analytics-worker';
import webhookRouter from './routes/webhook';
import tenantsRouter from './routes/tenants';
import analyticsRouter from './routes/analytics';

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security middleware ───────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: [
        process.env.ADMIN_DASHBOARD_URL || 'http://localhost:5173',
        'https://admin.opscontrolai.com',
    ],
    credentials: true,
}));

// ─── Rate limiting (replaces Azure API Management) ────────────
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,    // 1 minute
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intenta en un momento.' },
});
app.use('/api', apiLimiter);

// Meta webhook calls – less strict limit (Meta may batch)
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
});
app.use('/webhooks', webhookLimiter);

// ─── Body parsing ─────────────────────────────────────────────
// Webhook: raw body needed for signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));
// All other routes: JSON
app.use(express.json({ limit: '5mb' }));

// ─── Routes ───────────────────────────────────────────────────
app.use('/webhooks', webhookRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/analytics', analyticsRouter);

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server] Unhandled error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── Bootstrap ────────────────────────────────────────────────
async function main() {
    await connectDb();
    const queue = getConversationQueue();
    startConversationWorker(queue);
    scheduleAnalyticsAggregation();

    app.listen(PORT, () => {
        console.info(`[Server] OpsControl AI running on port ${PORT}`);
        console.info(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
}

main().catch((err) => {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
});

export default app;
