import React, { useState } from 'react';
import toast from 'react-hot-toast';

const MOCK_FLOWS = [
    { id: '1', name: 'FAQ Automático', description: 'Responde preguntas frecuentes', triggerKeywords: ['horario', 'dirección', 'precio'], isActive: true, nodeCount: 7 },
    { id: '2', name: 'Cita / Reservación', description: 'Flujo de agendamiento paso a paso', triggerKeywords: ['cita', 'agendar', 'reservar'], isActive: true, nodeCount: 6 },
    { id: '3', name: 'Calificación de Lead', description: 'Recopila información del prospecto', triggerKeywords: ['información', 'cotización', 'interesado'], isActive: false, nodeCount: 5 },
];

export default function Flows() {
    const [flows, setFlows] = useState(MOCK_FLOWS);

    const toggleFlow = (id: string) => {
        setFlows((prev) => prev.map((f) => f.id === id ? { ...f, isActive: !f.isActive } : f));
        toast.success('Estado del flujo actualizado');
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Flujos de Conversación</h1>
                    <p className="page-sub">Automatizaciones predefinidas para tus clientes</p>
                </div>
                <button className="btn-primary">+ Crear Flujo</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {flows.map((flow) => (
                    <div key={flow.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                <span style={{ fontSize: '1.5rem' }}>🔀</span>
                                <div>
                                    <h3 style={{ fontWeight: 600, color: 'var(--color-white)' }}>{flow.name}</h3>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{flow.description}</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {flow.triggerKeywords.map((kw) => (
                                    <span key={kw} style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd', padding: '2px 10px', borderRadius: 99, fontSize: '0.75rem' }}>
                                        {kw}
                                    </span>
                                ))}
                                <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem', marginLeft: 8 }}>{flow.nodeCount} nodos</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span className={`badge ${flow.isActive ? 'badge-active' : 'badge-resolved'}`}>{flow.isActive ? 'Activo' : 'Inactivo'}</span>
                            <button className="btn-ghost" onClick={() => toggleFlow(flow.id)}>
                                {flow.isActive ? 'Desactivar' : 'Activar'}
                            </button>
                            <button className="btn-ghost">✏️ Editar</button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="card" style={{ marginTop: 24, textAlign: 'center', padding: 40, borderStyle: 'dashed' }}>
                <p style={{ fontSize: '2rem', marginBottom: 12 }}>✨</p>
                <p style={{ color: 'var(--color-muted)', marginBottom: 16 }}>
                    Crea flujos personalizados para catálogo de productos, pagos, facturas CFDI y más.
                </p>
                <button className="btn-primary">+ Crear Nuevo Flujo</button>
            </div>
        </div>
    );
}
