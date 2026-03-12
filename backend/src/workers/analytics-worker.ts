// ============================================================
// src/workers/analytics-worker.ts – Daily analytics aggregation
// Replaces: functions/analytics-aggregator.ts (Azure Timer Trigger)
// Uses node-cron to run daily at 02:00 America/Mexico_City
// ============================================================

import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { TenantModel, AnalyticsModel, AnalyticsDailyModel } from '../db';

export function scheduleAnalyticsAggregation(): void {
    // Run every day at 08:00 UTC (02:00 America/Mexico_City)
    cron.schedule('0 8 * * *', async () => {
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        const dayStart = `${dateStr}T00:00:00.000Z`;
        const dayEnd = `${dateStr}T23:59:59.999Z`;

        console.info('[Analytics] Starting daily aggregation', { date: dateStr });

        const tenants = await TenantModel.find({ status: 'active' }).select('id').lean().exec();

        for (const tenant of tenants) {
            const tenantId = (tenant as any).id as string;
            try {
                const events = await AnalyticsModel.find({
                    tenantId,
                    timestamp: { $gte: dayStart, $lte: dayEnd },
                }).lean().exec();

                if (events.length === 0) continue;

                const conversations = events.filter((e: any) => e.eventType === 'conversation_started').length;
                const sent = events.filter((e: any) => e.eventType === 'message_sent').length;
                const received = events.filter((e: any) => e.eventType === 'message_received').length;

                const intentEvents = events.filter((e: any) => e.eventType === 'intent_detected');
                const intentDist = { faq: 0, booking: 0, catalog: 0, lead: 0, payment: 0, other: 0 };
                for (const e of intentEvents) {
                    const intent = ((e as any).metadata?.intent ?? 'other') as keyof typeof intentDist;
                    if (intent in intentDist) intentDist[intent]++;
                    else intentDist.other++;
                }

                const responseTimes = intentEvents
                    .map((e: any) => e.metadata?.responseTimeMs ?? 0)
                    .filter((t: number) => t > 0);
                const avgResponseTimeMs = responseTimes.length > 0
                    ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
                    : 0;

                const totalTokens = events.reduce((sum: number, e: any) => sum + (e.metadata?.tokensUsed ?? 0), 0);
                const estimatedCostMXN = events.reduce((sum: number, e: any) => sum + (e.metadata?.estimatedCostMXN ?? 0), 0);

                const appointmentsBooked = events.filter((e: any) => e.eventType === 'appointment_booked').length;
                const paymentsCompleted = events.filter((e: any) => e.eventType === 'payment_completed').length;
                const leadsQualified = events.filter((e: any) => e.eventType === 'intent_detected' && e.metadata?.intent === 'lead').length;

                await AnalyticsDailyModel.findOneAndUpdate(
                    { id: `${tenantId}-${dateStr}` },
                    {
                        $set: {
                            id: `${tenantId}-${dateStr}`,
                            tenantId,
                            date: dateStr,
                            metrics: {
                                totalConversations: conversations,
                                totalMessages: sent + received,
                                inboundMessages: received,
                                outboundMessages: sent,
                                avgResponseTimeMs,
                                intentDistribution: intentDist,
                                conversions: { appointmentsBooked, paymentsCompleted, leadsQualified },
                                totalTokens,
                                estimatedCostMXN: Math.round(estimatedCostMXN * 100) / 100,
                            },
                        },
                    },
                    { upsert: true, new: true },
                ).exec();

                console.info('[Analytics] Aggregated', { tenantId, date: dateStr, conversations, totalTokens });
            } catch (err) {
                console.error('[Analytics] Failed for tenant', { tenantId, error: err });
            }
        }

        console.info('[Analytics] Daily aggregation complete', { date: dateStr, tenants: tenants.length });
    }, { timezone: 'UTC' });

    console.info('[Analytics] Daily aggregation scheduled (08:00 UTC)');
}
