import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { Toaster } from 'react-hot-toast';
import { msalInstance, login } from './services/auth-service';
import Dashboard from './pages/Dashboard';
import Conversations from './pages/Conversations';
import Flows from './pages/Flows';
import Contacts from './pages/Contacts';
import Settings from './pages/Settings';
import Billing from './pages/Billing';
import { useTenantStore } from './hooks/useTenant';

// ─── Nav item type ────────────────────────────────────────────
const NAV_ITEMS = [
    { to: '/dashboard', label: 'Panel', icon: '📊' },
    { to: '/conversations', label: 'Conversaciones', icon: '💬' },
    { to: '/flows', label: 'Flujos', icon: '🔀' },
    { to: '/contacts', label: 'Contactos', icon: '👥' },
    { to: '/settings', label: 'Configuración', icon: '⚙️' },
    { to: '/billing', label: 'Facturación', icon: '💳' },
];

function Sidebar() {
    const activeT = useTenantStore((s) => s.getActiveTenant());
    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <span className="logo-icon">🤖</span>
                <div>
                    <p className="logo-title">OpsControl AI</p>
                    {activeT && <p className="logo-sub">{activeT.businessName}</p>}
                </div>
            </div>
            <nav className="sidebar-nav">
                {NAV_ITEMS.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>
            <div className="sidebar-footer">
                <button onClick={login} className="btn-ghost">Cerrar Sesión</button>
            </div>
        </aside>
    );
}

function LoginPage() {
    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">🤖</div>
                <h1 className="login-title">OpsControl AI</h1>
                <p className="login-sub">Plataforma de Automatización WhatsApp</p>
                <button className="btn-primary login-btn" onClick={login}>
                    Iniciar Sesión con Microsoft
                </button>
                <p className="login-hint">Autenticación empresarial segura con Entra ID</p>
            </div>
        </div>
    );
}

function AppShell() {
    return (
        <BrowserRouter>
            <MsalProvider instance={msalInstance}>
                <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
                <AuthenticatedTemplate>
                    <div className="app-layout">
                        <Sidebar />
                        <main className="main-content">
                            <Routes>
                                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                                <Route path="/dashboard" element={<Dashboard />} />
                                <Route path="/conversations" element={<Conversations />} />
                                <Route path="/flows" element={<Flows />} />
                                <Route path="/contacts" element={<Contacts />} />
                                <Route path="/settings" element={<Settings />} />
                                <Route path="/billing" element={<Billing />} />
                                <Route path="*" element={<Navigate to="/dashboard" replace />} />
                            </Routes>
                        </main>
                    </div>
                </AuthenticatedTemplate>
                <UnauthenticatedTemplate>
                    <LoginPage />
                </UnauthenticatedTemplate>
            </MsalProvider>
        </BrowserRouter>
    );
}

export default AppShell;
