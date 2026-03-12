import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TenantInfo {
    id: string;
    businessName: string;
    subscriptionTier: string;
    usage: {
        conversationsThisMonth: number;
        conversationLimit: number;
    };
}

interface TenantStore {
    activeTenantId: string | null;
    tenants: TenantInfo[];
    setActiveTenantId: (id: string) => void;
    setTenants: (tenants: TenantInfo[]) => void;
    getActiveTenant: () => TenantInfo | null;
}

export const useTenantStore = create<TenantStore>()(
    persist(
        (set, get) => ({
            activeTenantId: null,
            tenants: [],
            setActiveTenantId: (id) => set({ activeTenantId: id }),
            setTenants: (tenants) => set({ tenants }),
            getActiveTenant: () => {
                const { activeTenantId, tenants } = get();
                return tenants.find((t) => t.id === activeTenantId) ?? null;
            },
        }),
        { name: 'opscontrol-tenant' },
    ),
);
