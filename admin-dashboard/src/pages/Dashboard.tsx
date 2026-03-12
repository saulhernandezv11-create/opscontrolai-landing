import React, { useEffect, useState } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import { AnalyticsAPI } from '../services/api-client';
import { useTenantStore } from '../hooks/useTenant';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

// ─── Mock data (used when no tenant selected or API offline) ──
const genMockDaily = () => Array.from({ length: 30 }, (_, i) => ({
    date: format(subDays(new Date(), 29 - i), 'dd/MM', { locale: es }),
    conversaciones: Math.floor(Math.random() * 80 + 20),
    mensajes: Math.floor(Math.random() * 300 + 80),
}));

const MOCK_INTENTS = [
    { name: 'FAQ', value: 40 },
    { name: 'Cita', value: 28 },
    { name: 'Catálogo', value: 15 },
    { name: 'Lead', value: 10 },
    { name: 'Otro', value: 7 },
];

const MOCK_RESPONSE_TIMES = [
    { rango: '<1s', count: 120 }, { rango: '1-2s', count: 85 },
    { rango: '2-3s', count: 42 }, { rango: '>3s', count: 8 },
];

export default function Dashboard() {
    const activeTenant = useTenantStore((s) => s.getActiveTenant());
    const [dailyData, setDailyData] = useState(genMockDaily());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!activeTenant) return;
        setLoading(true);
        const from = format(subDays(new Date(), 30), 'yyyy-MM-dd');
        const to = format(new Date(), 'yyyy-MM-dd');
        AnalyticsAPI.daily(activeTenant.id, from, to)
            .then((data) => {
                if (data?.length) {
                    setDailyData(data.map((d: { date: string; metrics: { totalConversations: number; totalMessages: number } }) => ({
                        date: format(new Date(d.date), 'dd/MM', { locale: es }),
                        conversaciones: d.metrics.totalConversations,
                        mensajes: d.metrics.totalMessages,
                    })));
                }
            })
            .catch(() => { }) // Keep mock data on error
            .finally(() => setLoading(false));
    }, [activeTenant?.id]);

    const totalConv = dailyData.reduce((s, d) => s + d.conversaciones, 0);
    const totalMsg = dailyData.reduce((s, d) => s + d.mensajes, 0);

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Panel de Control</h1>
                    <p className="page-sub">Resumen de los últimos 30 días</p>
                </div>
            </div>

            {/* ── Metric Cards ─────────────────────────────────────── */}
            <div className="grid-4" style={{ marginBottom: 28 }}>
                {[
                    { label: 'Conversaciones', value: totalConv.toLocaleString('es-MX'), trend: '↑ 12% vs mes anterior', icon: '💬' },
                    { label: 'Mensajes Totales', value: totalMsg.toLocaleString('es-MX'), trend: '↑ 8% vs mes anterior', icon: '📨' },
                    { label: 'T. Respuesta Prom.', value: '1.8s', trend: '↓ 0.3s vs mes anterior', icon: '⚡' },
                    { label: 'Conversiones', value: '24', trend: '↑ 4 citas + 6 pagos', icon: '✅' },
                ].map((m) => (
                    <div className="metric-card" key={m.label}>
                        <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{m.icon}</div>
                        <p className="metric-label">{m.label}</p>
                        <p className="metric-value">{m.value}</p>
                        <p className="metric-trend">{m.trend}</p>
                    </div>
                ))}
            </div>

            {/* ── Charts Row ────────────────────────────────────────── */}
            <div className="grid-2" style={{ marginBottom: 24 }}>
                {/* Line: Conversations per day */}
                <div className="card">
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16, color: 'var(--color-white)' }}>
                        Conversaciones por Día
                    </h2>
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={dailyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
                            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: '#e2e8f0' }}
                            />
                            <Line type="monotone" dataKey="conversaciones" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Pie: Intent distribution */}
                <div className="card">
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16, color: 'var(--color-white)' }}>
                        Distribución de Intenciones
                    </h2>
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie data={MOCK_INTENTS} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                                {MOCK_INTENTS.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ── Response time histogram ───────────────────────────── */}
            <div className="card">
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16, color: 'var(--color-white)' }}>
                    Histograma de Tiempos de Respuesta
                </h2>
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={MOCK_RESPONSE_TIMES}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="rango" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Conversaciones" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
