// ============================================================
// models/conversation.ts – Conversation and message schemas
// ============================================================

export type MessageDirection = 'inbound' | 'outbound';
export type MessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'interactive' | 'template';
export type ConversationStatus = 'active' | 'resolved' | 'handoff';
export type DetectedIntent = 'faq' | 'booking' | 'catalog' | 'lead' | 'payment' | 'invoice' | 'greeting' | 'farewell' | 'other';

export interface Message {
    id: string; // WhatsApp message ID
    timestamp: string; // ISO 8601
    direction: MessageDirection;
    type: MessageType;
    content: string; // Text content or media caption
    mediaUrl?: string; // Blob Storage URL for outbound, or Meta media URL for inbound
    mediaId?: string; // Meta media ID
    intent?: DetectedIntent;
    aiConfidence?: number; // 0.0–1.0
    tokensUsed?: number; // OpenAI tokens for this turn
    flowNodeId?: string; // If processed by flow engine
    deliveryStatus?: 'sent' | 'delivered' | 'read' | 'failed';
}

export interface Conversation {
    id: string; // UUID
    tenantId: string; // Partition key
    contactId: string;
    phoneNumber: string; // E.164
    messages: Message[];
    status: ConversationStatus;
    activeFlowId?: string;
    activeFlowNodeId?: string;
    tags: string[];
    metadata: {
        firstMessageAt: string; // ISO 8601
        lastMessageAt: string;
        totalMessages: number;
        totalTokensUsed: number;
        estimatedCostMXN: number;
        handoffRequestedAt?: string;
        resolvedAt?: string;
    };
    createdAt: string;
    updatedAt: string;
}
