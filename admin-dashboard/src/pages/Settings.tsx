import React, { useState } from 'react';
import toast from 'react-hot-toast';

const DEFAULT_SETTINGS = {
    businessName: 'Mi Negocio',
    welcomeMessage: '¡Hola! Bienvenido a {{businessName}}. ¿En qué puedo ayudarte hoy? 😊',
    customResponses: [
        { key: 'horario', value: 'Lunes a viernes de 9:00 a 18:00 hrs. Sábados de 10:00 a 14:00 hrs.' },
        { key: 'dirección', value: 'Nos encontramos en [tu dirección aquí].' },
        { key: 'precios', value: 'Por favor contáctenos para recibir una cotización personalizada.' },
    ] as { key: string; value: string }[],
    businessHours: [
        { day: 'Lunes', start: '09:00', end: '18:00', enabled: true },
        { day: 'Martes', start: '09:00', end: '18:00', enabled: true },
        { day: 'Miércoles', start: '09:00', end: '18:00', enabled: true },
        { day: 'Jueves', start: '09:00', end: '18:00', enabled: true },
        { day: 'Viernes', start: '09:00', end: '18:00', enabled: true },
        { day: 'Sábado', start: '10:00', end: '14:00', enabled: false },
        { day: 'Domingo', start: '10:00', end: '14:00', enabled: false },
    ],
    webhookUrl: 'https://api.opscontrolai.com/webhooks/tu-tenant-id',
};

export default function Settings() {
    const [s, setS] = useState(DEFAULT_SETTINGS);
    const [saved, setSaved] = useState(false);

    const toggleDay = (idx: number) =>
        setS((prev) => ({
            ...prev,
            businessHours: prev.businessHours.map((d, i) => i === idx ? { ...d, enabled: !d.enabled } : d),
        }));

    const updateHour = (idx: number, field: 'start' | 'end', val: string) =>
        setS((prev) => ({
            ...prev,
            businessHours: prev.businessHours.map((d, i) => i === idx ? { ...d, [field]: val } : d),
        }));

    const addResponse = () =>
        setS((prev) => ({ ...prev, customResponses: [...prev.customResponses, { key: '', value: '' }] }));

    const saveSettings = () => {
        setSaved(true);
        toast.success('¡Configuración guardada exitosamente!');
        setTimeout(() => setSaved(false), 3000);
    };

    return (
        <div className="fade-in" style={{ maxWidth: 760 }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Configuración</h1>
                    <p className="page-sub">Personaliza tu asistente virtual de WhatsApp</p>
                </div>
                <button className="btn-primary" onClick={saveSettings}>{saved ? '✅ Guardado' : '💾 Guardar Cambios'}</button>
            </div>

            {/* ── Business Name ────────────────────────────────────── */}
            <div className="card" style={{ marginBottom: 20 }}>
                <h2 style={{ fontWeight: 600, marginBottom: 16, color: 'var(--color-white)' }}>🏪 Información del Negocio</h2>
                <div className="input-group">
                    <label className="input-label">Nombre del Negocio</label>
                    <input className="input" value={s.businessName} onChange={(e) => setS((p) => ({ ...p, businessName: e.target.value }))} />
                </div>
                <div className="input-group" style={{ marginTop: 14 }}>
                    <label className="input-label">Mensaje de Bienvenida</label>
                    <textarea className="textarea" value={s.welcomeMessage} onChange={(e) => setS((p) => ({ ...p, welcomeMessage: e.target.value }))} rows={3} />
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>Usa {`{{businessName}}`} para incluir el nombre de tu negocio.</p>
                </div>
            </div>

            {/* ── Business Hours ───────────────────────────────────── */}
            <div className="card" style={{ marginBottom: 20 }}>
                <h2 style={{ fontWeight: 600, marginBottom: 16, color: 'var(--color-white)' }}>🕐 Horario de Atención</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {s.businessHours.map((d, i) => (
                        <div key={d.day} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 80px', gap: 12, alignItems: 'center' }}>
                            <label style={{ fontSize: '0.875rem', color: d.enabled ? 'var(--color-text)' : 'var(--color-muted)' }}>{d.day}</label>
                            <input type="time" className="input" value={d.start} disabled={!d.enabled} onChange={(e) => updateHour(i, 'start', e.target.value)} style={{ opacity: d.enabled ? 1 : 0.4 }} />
                            <input type="time" className="input" value={d.end} disabled={!d.enabled} onChange={(e) => updateHour(i, 'end', e.target.value)} style={{ opacity: d.enabled ? 1 : 0.4 }} />
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input type="checkbox" checked={d.enabled} onChange={() => toggleDay(i)} />
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{d.enabled ? 'Activo' : 'Off'}</span>
                            </label>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Custom Responses ─────────────────────────────────── */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 style={{ fontWeight: 600, color: 'var(--color-white)' }}>💬 Respuestas Automáticas</h2>
                    <button className="btn-ghost" onClick={addResponse}>+ Agregar</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {s.customResponses.map((r, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 40px', gap: 10, alignItems: 'start' }}>
                            <input className="input" placeholder="Palabra clave" value={r.key}
                                onChange={(e) => setS((p) => ({ ...p, customResponses: p.customResponses.map((x, j) => j === i ? { ...x, key: e.target.value } : x) }))}
                            />
                            <textarea className="textarea" placeholder="Respuesta automática" value={r.value} rows={2}
                                onChange={(e) => setS((p) => ({ ...p, customResponses: p.customResponses.map((x, j) => j === i ? { ...x, value: e.target.value } : x) }))}
                                style={{ minHeight: 'auto', resize: 'none' }}
                            />
                            <button className="btn-danger" style={{ padding: '8px' }}
                                onClick={() => setS((p) => ({ ...p, customResponses: p.customResponses.filter((_, j) => j !== i) }))}>
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Webhook URL ──────────────────────────────────────── */}
            <div className="card">
                <h2 style={{ fontWeight: 600, marginBottom: 16, color: 'var(--color-white)' }}>🔗 URL del Webhook</h2>
                <div style={{ display: 'flex', gap: 10 }}>
                    <input className="input" value={s.webhookUrl} readOnly style={{ flex: 1, opacity: 0.7 }} />
                    <button className="btn-ghost" onClick={() => { navigator.clipboard.writeText(s.webhookUrl); toast.success('URL copiada al portapapeles'); }}>
                        📋 Copiar
                    </button>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 8 }}>
                    Registra esta URL como tu Webhook en Meta Business Manager para recibir mensajes de WhatsApp.
                </p>
            </div>
        </div>
    );
}
