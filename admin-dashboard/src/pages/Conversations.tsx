import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { ConversationsAPI } from '../services/api-client';
import { useTenantStore } from '../hooks/useTenant';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Mock conversations ───────────────────────────────────────
const MOCK_CONVS = Array.from({ length: 12 }, (_, i) => ({
    id: `conv-${i}`,
    phoneNumber: `+5255${String(10000000 + i * 123456).slice(0, 8)}`,
    contactName: ['Ana García', 'Carlos Pérez', 'María López', 'Juan Rodríguez', 'Sofía Martínez'][i % 5],
    lastMessage: ['Hola, ¿cuál es su horario?', '¿Tienen servicio de envío?', 'Quiero agendar una cita', 'Me puede dar más información', '¿Cuáles son sus precios?'][i % 5],
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    status: ['active', 'resolved', 'handoff'][i % 3] as 'active' | 'resolved' | 'handoff',
    intent: ['faq', 'booking', 'catalog', 'lead'][i % 4],
    messages: [
        { direction: 'inbound', content: '¡Hola! ¿En qué me pueden ayudar?', timestamp: new Date().toISOString() },
        { direction: 'outbound', content: '¡Bienvenido! ¿En qué puedo ayudarte hoy? 😊', timestamp: new Date().toISOString() },
        { direction: 'inbound', content: '¿Cuál es su horario de atención?', timestamp: new Date().toISOString() },
        { direction: 'outbound', content: 'Nuestro horario es de lunes a viernes de 9:00 a 18:00 hrs. Los sábados de 10:00 a 14:00. 🕐', timestamp: new Date().toISOString() },
    ],
}));

const STATUS_LABELS = { active: 'Activa', resolved: 'Resuelta', handoff: 'En espera' };
const STATUS_CLASS = { active: 'badge-active', resolved: 'badge-resolved', handoff: 'badge-handoff' };

export default function Conversations() {
    const activeTenant = useTenantStore((s) => s.getActiveTenant());
    const [convs, setConvs] = useState(MOCK_CONVS);
    const [selected, setSelected] = useState<(typeof MOCK_CONVS)[0] | null>(null);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    const filtered = convs.filter((c) => {
        const matchSearch = !search || c.contactName.toLowerCase().includes(search.toLowerCase()) || c.phoneNumber.includes(search);
        const matchStatus = filterStatus === 'all' || c.status === filterStatus;
        return matchSearch && matchStatus;
    });

    const handleHandoff = async (convId: string) => {
        if (!activeTenant) return;
        try {
            setConvs((prev) => prev.map((c) => c.id === convId ? { ...c, status: 'handoff' as const } : c));
            toast.success('Conversación transferida a un agente humano');
        } catch { toast.error('Error al transferir la conversación'); }
    };

    const handleResolve = async (convId: string) => {
        setConvs((prev) => prev.map((c) => c.id === convId ? { ...c, status: 'resolved' as const } : c));
        toast.success('Conversación marcada como resuelta');
        setSelected(null);
    };

    return (
        <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 420px' : '1fr', gap: 24, height: 'calc(100vh - 64px)' }}>
            {/* ── Conversation List ─────────────────────────────────── */}
            <div>
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Conversaciones</h1>
                        <p className="page-sub">{filtered.length} conversaciones</p>
                    </div>
                </div>

                {/* ── Filters ──────────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                    <input
                        className="input"
                        placeholder="Buscar por teléfono o nombre..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ flex: 1 }}
                    />
                    <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 160 }}>
                        <option value="all">Todos los estados</option>
                        <option value="active">Activas</option>
                        <option value="resolved">Resueltas</option>
                        <option value="handoff">En espera</option>
                    </select>
                </div>

                {/* ── Table ────────────────────────────────────────────── */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Contacto</th>
                                    <th>Último Mensaje</th>
                                    <th>Hora</th>
                                    <th>Estado</th>
                                    <th>Intención</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((c) => (
                                    <tr key={c.id} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
                                        <td>
                                            <p style={{ fontWeight: 500, color: 'var(--color-white)' }}>{c.contactName}</p>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{c.phoneNumber}</p>
                                        </td>
                                        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-muted)' }}>
                                            {c.lastMessage}
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                                            {format(new Date(c.timestamp), 'dd MMM HH:mm', { locale: es })}
                                        </td>
                                        <td><span className={`badge ${STATUS_CLASS[c.status]}`}>{STATUS_LABELS[c.status]}</span></td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{c.intent}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ── Conversation Detail ───────────────────────────────── */}
            {selected && (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p style={{ fontWeight: 600, color: 'var(--color-white)' }}>{selected.contactName}</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{selected.phoneNumber}</p>
                        </div>
                        <button className="btn-ghost" style={{ fontSize: '1.2rem', padding: '4px 10px' }} onClick={() => setSelected(null)}>×</button>
                    </div>

                    {/* Messages */}
                    <div className="chat-list" style={{ flex: 1 }}>
                        {selected.messages.map((m, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
                                <div className={`chat-bubble ${m.direction}`}>{m.content}</div>
                                <p className="chat-meta">{format(new Date(m.timestamp), 'HH:mm')}</p>
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div style={{ padding: 16, borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8 }}>
                        <button className="btn-ghost" style={{ flex: 1 }} onClick={() => handleHandoff(selected.id)}>
                            🙋 Transferir a Agente
                        </button>
                        <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleResolve(selected.id)}>
                            ✅ Resolver
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
