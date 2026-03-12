// ============================================================
// src/services/auth-service.ts – MSAL.js Entra ID auth
// ============================================================
import {
    PublicClientApplication,
    Configuration,
    InteractionRequiredAuthError,
    AccountInfo,
} from '@azure/msal-browser';

const msalConfig: Configuration = {
    auth: {
        clientId: import.meta.env.VITE_ENTRA_CLIENT_ID as string,
        authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
        redirectUri: window.location.origin + '/auth/callback',
        postLogoutRedirectUri: window.location.origin,
    },
    cache: {
        cacheLocation: 'localStorage',
        storeAuthStateInCookie: false,
    },
};

export const msalInstance = new PublicClientApplication(msalConfig);

const LOGIN_SCOPES = [
    'User.Read',
    `api://${import.meta.env.VITE_ENTRA_CLIENT_ID}/Tenant.Manage`,
];

export async function login(): Promise<void> {
    await msalInstance.loginRedirect({ scopes: LOGIN_SCOPES });
}

export async function logout(): Promise<void> {
    await msalInstance.logoutRedirect();
}

export async function getAccessToken(): Promise<string> {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) throw new Error('No active session');

    try {
        const result = await msalInstance.acquireTokenSilent({
            scopes: LOGIN_SCOPES,
            account: accounts[0],
        });
        return result.accessToken;
    } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
            await msalInstance.loginRedirect({ scopes: LOGIN_SCOPES });
        }
        throw err;
    }
}

export function getCurrentUser(): AccountInfo | null {
    const accounts = msalInstance.getAllAccounts();
    return accounts.length > 0 ? accounts[0] : null;
}

export function isAuthenticated(): boolean {
    return msalInstance.getAllAccounts().length > 0;
}
