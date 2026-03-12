// ============================================================
// shared/tenant-resolver.ts – Resolves tenant by phone number or ID
// Replaces: Cosmos DB queries → Mongoose/MongoDB queries
// Auth: standard JWT (RS256) – no longer tied to Entra ID / Azure AD
// ============================================================

import { TenantModel } from '../src/db';
import type { Tenant } from '../models/tenant';
import { Request } from 'express';
import jwt from 'jsonwebtoken';

const tenantCache = new Map<string, { tenant: Tenant; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function resolveTenantByPhoneNumberId(phoneNumberId: string): Promise<Tenant | null> {
    const cacheKey = `pnid:${phoneNumberId}`;
    const cached = tenantCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.tenant;

    const doc = await TenantModel.findOne({
        'whatsappConfig.phoneNumberId': phoneNumberId,
        status: 'active',
    }).lean<Tenant>().exec();

    if (!doc) return null;
    tenantCache.set(cacheKey, { tenant: doc, expiresAt: Date.now() + CACHE_TTL_MS });
    return doc;
}

export async function resolveTenantById(tenantId: string): Promise<Tenant | null> {
    const cacheKey = `id:${tenantId}`;
    const cached = tenantCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.tenant;

    const doc = await TenantModel.findOne({ id: tenantId, status: 'active' }).lean<Tenant>().exec();
    if (!doc) return null;
    tenantCache.set(cacheKey, { tenant: doc, expiresAt: Date.now() + CACHE_TTL_MS });
    return doc;
}

export function invalidateTenantCache(tenantId: string): void {
    for (const key of tenantCache.keys()) {
        if (key.includes(tenantId)) tenantCache.delete(key);
    }
}

// ─── JWT Auth (standard RS256 or HS256) ──────────────────────

export interface AuthenticatedUser {
    id: string;
    email: string;
    roles: string[];
    name: string;
}

/**
 * Validates a Bearer JWT from the Authorization header.
 * Uses JWT_SECRET env var (HS256) for simplicity in free tier.
 * Swap to RS256 with jwks-rsa if needed for enterprise.
 */
export async function validateJwt(req: Request): Promise<AuthenticatedUser> {
    const authHeader = req.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
        throw new Error('Token de autorización faltante o inválido');
    }
    const token = authHeader.slice(7);

    const secret = process.env.JWT_SECRET!;
    if (!secret) throw new Error('JWT_SECRET no configurado');

    const payload = jwt.verify(token, secret) as jwt.JwtPayload;

    return {
        id: payload.sub as string || payload.id as string,
        email: payload.email as string || '',
        roles: (payload.roles as string[]) ?? [],
        name: payload.name as string || '',
    };
}

export function requireRole(user: AuthenticatedUser, role: string): void {
    if (!user.roles.includes(role) && !user.roles.includes('Platform.SuperAdmin')) {
        throw new Error(`Acceso denegado: se requiere el rol "${role}"`);
    }
}
