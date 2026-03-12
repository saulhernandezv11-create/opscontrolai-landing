import axios from 'axios';
import { getAccessToken } from './auth-service';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071/api';

const apiClient = axios.create({ baseURL: BASE_URL });

// Attach Entra ID token to every request
apiClient.interceptors.request.use(async (config) => {
    try {
        const token = await getAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
    } catch {
        // Not authenticated – let the 401 propagate
    }
    return config;
});

// ─── Tenants ─────────────────────────────────────────────────
export const TenantsAPI = {
    list: () => apiClient.get('/tenants').then((r) => r.data),
    get: (id: string) => apiClient.get(`/tenants/${id}`).then((r) => r.data),
    create: (body: unknown) => apiClient.post('/tenants', body).then((r) => r.data),
    update: (id: string, body: unknown) => apiClient.patch(`/tenants/${id}`, body).then((r) => r.data),
};

// ─── Conversations ────────────────────────────────────────────
export const ConversationsAPI = {
    list: (tenantId: string, params?: Record<string, string>) =>
        apiClient.get(`/tenants/${tenantId}/conversations`, { params }).then((r) => r.data),
    get: (tenantId: string, id: string) =>
        apiClient.get(`/tenants/${tenantId}/conversations/${id}`).then((r) => r.data),
    resolve: (tenantId: string, id: string) =>
        apiClient.post(`/tenants/${tenantId}/conversations/${id}/resolve`).then((r) => r.data),
    handoff: (tenantId: string, id: string) =>
        apiClient.post(`/tenants/${tenantId}/conversations/${id}/handoff`).then((r) => r.data),
};

// ─── Contacts ─────────────────────────────────────────────────
export const ContactsAPI = {
    list: (tenantId: string, params?: Record<string, string>) =>
        apiClient.get(`/tenants/${tenantId}/contacts`, { params }).then((r) => r.data),
    get: (tenantId: string, id: string) =>
        apiClient.get(`/tenants/${tenantId}/contacts/${id}`).then((r) => r.data),
    update: (tenantId: string, id: string, body: unknown) =>
        apiClient.patch(`/tenants/${tenantId}/contacts/${id}`, body).then((r) => r.data),
    delete: (tenantId: string, id: string) =>
        apiClient.delete(`/tenants/${tenantId}/contacts/${id}`).then((r) => r.data),
};

// ─── Flows ───────────────────────────────────────────────────
export const FlowsAPI = {
    list: (tenantId: string) =>
        apiClient.get(`/tenants/${tenantId}/flows`).then((r) => r.data),
    create: (tenantId: string, body: unknown) =>
        apiClient.post(`/tenants/${tenantId}/flows`, body).then((r) => r.data),
    update: (tenantId: string, id: string, body: unknown) =>
        apiClient.put(`/tenants/${tenantId}/flows/${id}`, body).then((r) => r.data),
    delete: (tenantId: string, id: string) =>
        apiClient.delete(`/tenants/${tenantId}/flows/${id}`).then((r) => r.data),
};

// ─── Analytics ───────────────────────────────────────────────
export const AnalyticsAPI = {
    daily: (tenantId: string, from: string, to: string) =>
        apiClient.get(`/tenants/${tenantId}/analytics/daily`, { params: { from, to } }).then((r) => r.data),
    summary: (tenantId: string) =>
        apiClient.get(`/tenants/${tenantId}/analytics/summary`).then((r) => r.data),
};

export default apiClient;
