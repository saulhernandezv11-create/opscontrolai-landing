// ============================================================
// functions/analytics-aggregator.ts – Timer Trigger (daily)
// Aggregates previous day's analytics events into daily summary
// ============================================================

import { app, InvocationContext, Timer } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { Containers } from '../shared/cosmos-client';
import type { AnalyticsEvent, DailyAnalytics } from '../models/contact';
import type { Tenant } from '../models/tenant';

/**
 * Analytics Aggregator – Runs daily at 02:00 Mexico City time (08:00 UTC).
 * Reads raw analytics events from the previous day and rolls them up
 * into per-tenant DailyAnalytics documents.
 */
async function analyticsAggregatorHandler(
    _timer: Timer,
    context: InvocationContext,
): Promise<void> {
    // Get yesterday's date range in UTC
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
    const dayStart = `${dateStr}T00:00:00.000Z`;
    const dayEnd = `${dateStr}T23:59:59.999Z`;

    context.log.info('[Analytics] Starting daily aggregation', { date: dateStr });

    // Load all active tenants
    const { resources: tenants } = await Containers.tenants()
        .items.query<Tenant>({
            query: 'SELECT c.id FROM c WHERE c.status = "active"',
        })
        .fetchAll();

    for (const { id: tenantId } of tenants) {
        try {
            // Fetch all analytics events for this tenant on that day
            const { resources: events } = await Containers.analytics()
                .items.query<AnalyticsEvent>({
                    query: `SELECT * FROM c WHERE c.tenantId = @tenantId 
                  AND c.timestamp >= @start AND c.timestamp <= @end`,
                    parameters: [
                        { name: '@tenantId', value: tenantId },
                        { name: '@start', value: dayStart },
                        { name: '@end', value: dayEnd },
                    ],
                })
                .fetchAll();

            if (events.length === 0) continue;

            // ─── Compute metrics ──────────────────────────────────
            const conversations = events.filter((e) => e.eventType === 'conversation_started').length;
            const sent = events.filter((e) => e.eventType === 'message_sent').length;
            const received = events.filter((e) => e.eventType === 'message_received').length;

            const intentEvents = events.filter((e) => e.eventType === 'intent_detected');
            const intentDist = {
                faq: 0, booking: 0, catalog: 0, lead: 0, payment: 0, other: 0,
            };
            for (const e of intentEvents) {
                const intent = (e.metadata.intent ?? 'other') as keyof typeof intentDist;
                if (intent in intentDist) intentDist[intent]++;
                else intentDist.other++;
            }

            const responseTimes = intentEvents
                .map((e) => e.metadata.responseTimeMs ?? 0)
                .filter((t) => t > 0);
            const avgResponseTimeMs = responseTimes.length > 0
                ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
                : 0;

            const totalTokens = events.reduce((sum, e) => sum + (e.metadata.tokensUsed ?? 0), 0);
            const estimatedCostMXN = events.reduce((sum, e) => sum + (e.metadata.estimatedCostMXN ?? 0), 0);

            const appointmentsBooked = events.filter((e) => e.eventType === 'appointment_booked').length;
            const paymentsCompleted = events.filter((e) => e.eventType === 'payment_completed').length;
            const leadsQualified = events.filter((e) => e.eventType === 'intent_detected' && e.metadata.intent === 'lead').length;

            const daily: DailyAnalytics = {
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
            };

            // Upsert (replace if exists for idempotency)
            await Containers.analyticsDaily().items.upsert(daily);

            context.log.info('[Analytics] Aggregated', {
                tenantId,
                date: dateStr,
                conversations,
                totalTokens,
            });
        } catch (err) {
            context.log.error('[Analytics] Failed to aggregate for tenant', { tenantId, error: err });
            // Continue processing other tenants
        }
    }

    context.log.info('[Analytics] Daily aggregation complete', { date: dateStr, tenants: tenants.length });
}

// Runs every day at 08:00 UTC (02:00 America/Mexico_City)
app.timer('analytics-aggregator', {
    schedule: '0 0 8 * * *',
    handler: analyticsAggregatorHandler,
});
