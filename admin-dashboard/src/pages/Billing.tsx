import React from 'react';

const PLAN_DETAILS = {
    basico: {
        name: 'Plan Básico',
        price: '$1,200 – $1,800 MXN/mes',
        color: '#10b981',
        features: ['1,000 conversaciones/mes', 'Flujos básicos de FAQ', 'Respuestas automáticas', 'Soporte por email'],
    },
    profesional: {
        name: 'Plan Profesional',
        price: '$2,500 – $4,000 MXN/mes',
        color: '#3b82f6',
        features: ['5,000 conversaciones/mes', 'Integración CRM', 'Agendamiento de citas', 'Analíticas avanzadas', 'Soporte prioritario'],
    },
    empresarial: {
        name: 'Plan Empresarial',
        price: '$6,000 – $10,000 MXN/mes',
        color: '#8b5cf6',
        features: ['Conversaciones ilimitadas', 'IA multi-agente', 'Integración de pagos', 'Flujos personalizados', 'Soporte dedicado 24/7', 'Facturación CFDI'],
    },
};

const CURRENT_TIER = 'profesional';
const USAGE = { conversations: 2340, conversationLimit: 5000, storageMB: 1230, storageLimitMB: 5120 };

function PlanUpgrade({ targetTier }: { targetTier: keyof typeof PLAN_DETAILS }) {
    const plan = PLAN_DETAILS[targetTier];
    return (
        <div className="card" style={{ border: `1px solid ${plan.color}40`, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                    <p style={{ fontWeight: 700, color: 'var(--color-white)', fontSize: '1.1rem' }}>{plan.name}</p>
                    <p style={{ color: plan.color, fontWeight: 600, marginTop: 4 }}>{plan.price}</p>
                </div>
                {targetTier !== CURRENT_TIER && (
                    <button className="btn-primary" style={{ background: plan.color }}>Actualizar</button>
                )}
                {targetTier === CURRENT_TIER && (
                    <span className="badge badge-active">Plan Actual</span>
                )}
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plan.features.map((f) => (
                    <li key={f} style={{ fontSize: '0.875rem', color: 'var(--color-muted)', display: 'flex', gap: 8 }}>
                        <span style={{ color: plan.color }}>✓</span> {f}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function Billing() {
    const convPercent = Math.round((USAGE.conversations / USAGE.conversationLimit) * 100);
    const storagePercent = Math.round((USAGE.storageMB / USAGE.storageLimitMB) * 100);

    return (
        <div className="fade-in" style={{ maxWidth: 900 }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Facturación y Suscripción</h1>
                    <p className="page-sub">Ciclo de facturación: 1 – 31 de marzo 2026</p>
                </div>
            </div>

            {/* ── Usage ────────────────────────────────────────────── */}
            <div className="card" style={{ marginBottom: 24 }}>
                <h2 style={{ fontWeight: 600, marginBottom: 20, color: 'var(--color-white)' }}>📊 Uso del Mes Actual</h2>

                <div className="progress-container">
                    <div className="progress-label">
                        <span>Conversaciones</span>
                        <span>{USAGE.conversations.toLocaleString('es-MX')} / {USAGE.conversationLimit.toLocaleString('es-MX')}</span>
                    </div>
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${convPercent}%`, background: convPercent > 80 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : undefined }} />
                    </div>
                    {convPercent > 80 && <p style={{ fontSize: '0.75rem', color: 'var(--color-warning)', marginTop: 6 }}>⚠️ Estás usando el {convPercent}% de tus conversaciones. Considera actualizar tu plan.</p>}
                </div>

                <div className="progress-container">
                    <div className="progress-label">
                        <span>Almacenamiento</span>
                        <span>{(USAGE.storageMB / 1024).toFixed(1)} GB / {(USAGE.storageLimitMB / 1024).toFixed(0)} GB</span>
                    </div>
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${storagePercent}%` }} />
                    </div>
                </div>
            </div>

            {/* ── Plans ────────────────────────────────────────────── */}
            <h2 style={{ fontWeight: 600, marginBottom: 16, color: 'var(--color-white)' }}>💳 Planes Disponibles</h2>
            <div className="grid-3">
                {Object.keys(PLAN_DETAILS).map((tier) => (
                    <PlanUpgrade key={tier} targetTier={tier as keyof typeof PLAN_DETAILS} />
                ))}
            </div>

            {/* ── Invoice History (stub) ────────────────────────────── */}
            <div className="card" style={{ marginTop: 24 }}>
                <h2 style={{ fontWeight: 600, marginBottom: 16, color: 'var(--color-white)' }}>🧾 Historial de Facturas</h2>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Estado</th><th>CFDI</th></tr>
                        </thead>
                        <tbody>
                            {[
                                { date: '01 Mar 2026', concept: 'Plan Profesional – Marzo 2026', amount: '$3,200 MXN', status: 'Pagada' },
                                { date: '01 Feb 2026', concept: 'Plan Profesional – Febrero 2026', amount: '$3,200 MXN', status: 'Pagada' },
                                { date: '01 Ene 2026', concept: 'Plan Básico – Enero 2026 + Setup', amount: '$9,800 MXN', status: 'Pagada' },
                            ].map((inv, i) => (
                                <tr key={i}>
                                    <td style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>{inv.date}</td>
                                    <td style={{ fontSize: '0.875rem' }}>{inv.concept}</td>
                                    <td style={{ fontWeight: 600, color: 'var(--color-white)' }}>{inv.amount}</td>
                                    <td><span className="badge badge-active">{inv.status}</span></td>
                                    <td><button className="btn-ghost" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>📄 Descargar</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
