// ============================================================
// src/db.ts – MongoDB (Atlas) singleton connection via Mongoose
// Replaces: @azure/cosmos CosmosClient
// ============================================================

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;

let _connected = false;

export async function connectDb(): Promise<void> {
    if (_connected) return;
    await mongoose.connect(MONGODB_URI, {
        dbName: process.env.MONGODB_DB || 'opscontrol',
        serverSelectionTimeoutMS: 5000,
    });
    _connected = true;
    console.info('[DB] Connected to MongoDB');
}

// ─── Mongoose Schemas ─────────────────────────────────────────

const messageSchema = new mongoose.Schema({
    id: String,
    timestamp: String,
    direction: { type: String, enum: ['inbound', 'outbound'] },
    type: String,
    content: String,
    mediaId: String,
    deliveryStatus: String,
    intent: String,
    aiConfidence: Number,
    tokensUsed: { type: Number, default: 0 },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true, index: true },
    contactId: String,
    phoneNumber: String,
    messages: [messageSchema],
    status: { type: String, default: 'active' },
    tags: [String],
    activeFlowId: String,
    activeFlowNodeId: String,
    metadata: {
        firstMessageAt: String,
        lastMessageAt: String,
        totalMessages: { type: Number, default: 0 },
        totalTokensUsed: { type: Number, default: 0 },
        estimatedCostMXN: { type: Number, default: 0 },
    },
    createdAt: String,
    updatedAt: String,
});
conversationSchema.index({ tenantId: 1, 'metadata.lastMessageAt': -1 });

const contactSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true, index: true },
    phoneNumber: { type: String, required: true },
    name: String,
    tags: [String],
    customFields: mongoose.Schema.Types.Mixed,
    conversationCount: { type: Number, default: 0 },
    firstContactedAt: String,
    lastContactedAt: String,
    isBlocked: { type: Boolean, default: false },
    optedOut: { type: Boolean, default: false },
    createdAt: String,
    updatedAt: String,
});
contactSchema.index({ tenantId: 1, phoneNumber: 1 }, { unique: true });

const tenantSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    businessName: String,
    contactEmail: String,
    phoneNumber: String,
    subscriptionTier: { type: String, enum: ['basico', 'profesional', 'empresarial'] },
    conversationLimit: Number,
    whatsappConfig: {
        phoneNumberId: String,
        apiToken: String,       // stored as plain env secret (was Key Vault)
        businessAccountId: String,
    },
    systemPrompt: String,
    customResponses: mongoose.Schema.Types.Mixed,
    businessHours: mongoose.Schema.Types.Mixed,
    branding: { businessName: String, logoUrl: String },
    webhookUrl: String,
    status: { type: String, default: 'active' },
    usage: {
        conversationsThisMonth: Number,
        messagesThisMonth: Number,
        storageUsedBytes: Number,
        billingCycleStart: String,
    },
    createdAt: String,
    updatedAt: String,
});
tenantSchema.index({ 'whatsappConfig.phoneNumberId': 1 });

const flowSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true, index: true },
    name: String,
    description: String,
    triggerKeywords: [String],
    nodes: mongoose.Schema.Types.Mixed,
    entryNodeId: String,
    isActive: { type: Boolean, default: true },
    createdAt: String,
    updatedAt: String,
});

const analyticsSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true, index: true },
    eventType: String,
    timestamp: String,
    metadata: mongoose.Schema.Types.Mixed,
}, { expireAfterSeconds: 7776000 }); // 90-day TTL

const analyticsDailySchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    tenantId: { type: String, required: true, index: true },
    date: String,
    metrics: mongoose.Schema.Types.Mixed,
});

// ─── Model exports ────────────────────────────────────────────
export const ConversationModel = mongoose.models.Conversation
    || mongoose.model('Conversation', conversationSchema, 'conversations');

export const ContactModel = mongoose.models.Contact
    || mongoose.model('Contact', contactSchema, 'contacts');

export const TenantModel = mongoose.models.Tenant
    || mongoose.model('Tenant', tenantSchema, 'tenants');

export const FlowModel = mongoose.models.Flow
    || mongoose.model('Flow', flowSchema, 'flows');

export const AnalyticsModel = mongoose.models.Analytics
    || mongoose.model('Analytics', analyticsSchema, 'analytics');

export const AnalyticsDailyModel = mongoose.models.AnalyticsDaily
    || mongoose.model('AnalyticsDaily', analyticsDailySchema, 'analytics_daily');
