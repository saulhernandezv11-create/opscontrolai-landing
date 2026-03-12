// ============================================================
// src/routes/analytics.ts – Analytics API endpoints
// GET /api/analytics/:tenantId/daily – Daily metrics
// GET /api/analytics/:tenantId/summary – This month summary
// ============================================================

import { Router, Request, Response } from 'express';
import { AnalyticsDailyModel, AnalyticsModel } from '../db';
import { validateJwt } from '../../shared/tenant-resolver';

const router = Router();

// Middleware: require auth on all analytics routes
router.use(async (req: Request, res: Response, next) => {
    try {
        (req as any).user = await validateJwt(req);
        next();
    } catch (err) {
        res.status(401).json({ error: (err as Error).message });
    }
});

// GET /api/analytics/:tenantId/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/:tenantId/daily', async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const { from, to } = req.query as { from?: string; to?: string };

    const query: Record<string, unknown> = { tenantId };
    if (from || to) {
        query.date = {};
        if (from) (query.date as any).$gte = from;
        if (to) (query.date as any).$lte = to;
    }

    const records = await AnalyticsDailyModel.find(query)
        .sort({ date: -1 })
        .limit(90)
        .lean()
        .exec();

    res.json(records);
});

// GET /api/analytics/:tenantId/summary
router.get('/:tenantId/summary', async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const events = await AnalyticsModel.find({
        tenantId,
        timestamp: { $gte: firstOfMonth },
    }).lean().exec();

    const totalConversations = events.filter((e: any) => e.eventType === 'conversation_started').length;
    const totalMessages = events.filter((e: any) =>
        ['message_sent', 'message_received', 'intent_detected'].includes(e.eventType)).length;
    const totalTokens = events.reduce((sum: number, e: any) => sum + (e.metadata?.tokensUsed ?? 0), 0);
    const estimatedCostMXN = events.reduce((sum: number, e: any) => sum + (e.metadata?.estimatedCostMXN ?? 0), 0);

    res.json({
        tenantId,
        period: { from: firstOfMonth.split('T')[0], to: now.toISOString().split('T')[0] },
        totalConversations,
        totalMessages,
        totalTokens,
        estimatedCostMXN: Math.round(estimatedCostMXN * 100) / 100,
    });
});

export default router;
