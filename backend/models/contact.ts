// ============================================================
// models/contact.ts – WhatsApp contact schema
// ============================================================

export interface Contact {
    id: string; // UUID
    tenantId: string; // Partition key
    phoneNumber: string; // E.164 (+52...), composite unique with tenantId
    name: string;
    email?: string;
    tags: string[];
    customFields: {
        rfc?: string; // Mexican tax ID
        empresa?: string;
        ciudad?: string;
        [key: string]: string | undefined;
    };
    conversationCount: number;
    firstContactedAt: string; // ISO 8601
    lastContactedAt: string;
    isBlocked: boolean;
    optedOut: boolean; // LFPDPPP compliance – opted out of automated messages
    createdAt: string;
    updatedAt: string;
}

// ─── models/flow.ts – Conversation flow schema ───────────────

export type FlowNodeType = 'message' | 'question' | 'condition' | 'api-call' | 'handoff';

export interface FlowNodeConfig {
    // message / question nodes
    message?: string;
    options?: string[]; // Quick reply options
    variable?: string; // Variable name to store the answer in

    // condition nodes
    condition?: string; // e.g. "{{answer}} == 'cita'"

    // api-call nodes
    apiUrl?: string;
    apiMethod?: 'GET' | 'POST';
    apiHeaders?: Record<string, string>;
    apiBody?: string; // Template string with {{variables}}

    // routing
    next?: string; // Default next node ID
    routes?: Record<string, string>; // answer → node ID mapping (for question nodes)

    // handoff
    handoffMessage?: string;
}

export interface FlowNode {
    id: string;
    type: FlowNodeType;
    label: string;
    config: FlowNodeConfig;
    // Visual position for admin dashboard flow builder
    position?: { x: number; y: number };
}

export interface ConversationFlow {
    id: string; // UUID
    tenantId: string; // Partition key
    name: string;
    description: string;
    triggerKeywords: string[]; // e.g. ["cita", "reservar", "agendar"]
    nodes: FlowNode[];
    entryNodeId: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

// ─── models/analytics.ts – Analytics event schema ───────────

export type AnalyticsEventType =
    | 'conversation_started'
    | 'message_sent'
    | 'message_received'
    | 'intent_detected'
    | 'payment_completed'
    | 'appointment_booked'
    | 'flow_completed'
    | 'handoff_requested'
    | 'openai_call';

export interface AnalyticsEvent {
    id: string; // UUID
    tenantId: string; // Partition key
    eventType: AnalyticsEventType;
    timestamp: string; // ISO 8601 – TTL source
    metadata: {
        conversationId?: string;
        contactId?: string;
        intent?: string;
        responseTimeMs?: number;
        tokensUsed?: number;
        estimatedCostMXN?: number;
        flowId?: string;
        errorMessage?: string;
    };
    ttl?: number; // Cosmos DB TTL (auto-set to 90 days)
}

export interface DailyAnalytics {
    id: string; // `${tenantId}-${YYYY-MM-DD}`
    tenantId: string; // Partition key
    date: string; // YYYY-MM-DD
    metrics: {
        totalConversations: number;
        totalMessages: number;
        inboundMessages: number;
        outboundMessages: number;
        avgResponseTimeMs: number;
        intentDistribution: {
            faq: number;
            booking: number;
            catalog: number;
            lead: number;
            payment: number;
            other: number;
        };
        conversions: {
            appointmentsBooked: number;
            paymentsCompleted: number;
            leadsQualified: number;
        };
        totalTokens: number;
        estimatedCostMXN: number;
    };
}
