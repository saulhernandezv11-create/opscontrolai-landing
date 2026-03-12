// ============================================================
// models/tenant.ts – Tenant (SMB client) schema
// ============================================================

export type SubscriptionTier = 'basico' | 'profesional' | 'empresarial';
export type TenantStatus = 'active' | 'suspended' | 'cancelled';

export interface BusinessHours {
    day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
    start: string; // HH:MM (24hr, Mexico City timezone)
    end: string;
    enabled: boolean;
}

export const CONVERSATION_LIMITS: Record<SubscriptionTier, number> = {
    basico: 1000,
    profesional: 5000,
    empresarial: Infinity,
};

export interface Tenant {
    id: string; // UUID, partition key
    businessName: string;
    contactEmail: string;
    phoneNumber: string; // E.164 (+52...)
    subscriptionTier: SubscriptionTier;
    conversationLimit: number;
    whatsappConfig: {
        phoneNumberId: string;
        apiTokenSecretName: string; // Key Vault secret name (NOT the actual token)
        businessAccountId: string;
    };
    customResponses: Record<string, string>; // keyword → response text
    businessHours: BusinessHours[];
    branding: {
        businessName: string;
        logoUrl?: string;
        primaryColor?: string;
    };
    systemPrompt?: string; // Custom AI persona for this tenant
    webhookUrl: string; // Generated on provisioning
    createdAt: string; // ISO 8601
    updatedAt: string;
    status: TenantStatus;
    usage: {
        conversationsThisMonth: number;
        messagesThisMonth: number;
        storageUsedBytes: number;
        billingCycleStart: string; // ISO 8601
    };
}
