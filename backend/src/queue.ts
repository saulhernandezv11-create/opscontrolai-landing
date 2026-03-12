// ============================================================
// src/queue.ts – Bull (Redis-backed) queue setup
// Replaces: Azure Storage Queues + Azure Functions Queue Trigger
// Uses: Upstash Redis (free tier) or local Redis in Docker
// ============================================================

import Bull from 'bull';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let _conversationQueue: Bull.Queue | null = null;

export function getConversationQueue(): Bull.Queue {
    if (_conversationQueue) return _conversationQueue;
    _conversationQueue = new Bull('conversation-queue', REDIS_URL, {
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: 100,  // keep last 100 completed jobs
            removeOnFail: 50,
        },
    });
    return _conversationQueue;
}

export interface QueueMessage {
    correlationId: string;
    tenantId: string;
    phoneNumberId: string;
    from: string;
    messageId: string;
    timestamp: string;
    type: string;
    text?: string;
    mediaId?: string;
    enqueuedAt: string;
}
