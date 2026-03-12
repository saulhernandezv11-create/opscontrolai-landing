import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const MOCK_CONTACTS = Array.from({ length: 20 }, (_, i) => ({
    id: `c${i}`,
    name: ['Ana García', 'Carlos Pérez', 'María López', 'Juan Rodríguez', 'Sofía Martínez', 'Luis Hernández', 'Valeria Torres', 'Miguel Ramírez'][i % 8],
    phoneNumber: `+5255${String(10000000 + i * 999).slice(0, 8)}`,
    tags: [['cliente', 'vip'], ['prospecto'], ['lead-calificado'], ['cliente']].flat().slice(0, i % 3 + 1),
    lastContactedAt: new Date(Date.now() - i * 86400000 * 2).toISOString(),
    conversationCount: Math.floor(Math.random() * 15) + 1,
    email: i % 3 === 0 ? `contacto${i}@ejemplo.com` : undefined,
}));

export default function Contacts() {
    const [contacts, setContacts] = useState(MOCK_CONTACTS);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);

    const filtered = contacts.filter((c) =>
        !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phoneNumber.includes(search),
    );

    const toggleSelect = (id: string) =>
        setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

    const exportCSV = () => {
        const headers = 'Nombre,Teléfono,Email,Etiquetas,Conversaciones,Último Contacto\n';
        const rows = filtered.map((c) =>
            `${c.name},${c.phoneNumber},${c.email ?? ''},${c.tags.join(';')},${c.conversationCount},${c.lastContactedAt}`,
        ).join('\n');
        const blob = new Blob([headers + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'contactos.csv'; a.click();
        toast.success('Exportación de contactos descargada');
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Contactos</h1>
                    <p className="page-sub">{filtered.length} contactos encontrados</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {selected.length > 0 && (
                        <button className="btn-ghost" onClick={() => { setSelected([]); toast.success(`${selected.length} contactos actualizados`); }}>
                            + Etiqueta ({selected.length})
                        </button>
                    )}
                    <button className="btn-ghost" onClick={exportCSV}>📥 Exportar CSV</button>
                </div>
            </div>

            <div style={{ marginBottom: 16 }}>
                <input className="input" placeholder="Buscar por nombre o teléfono..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}>
                                    <input type="checkbox" onChange={(e) => setSelected(e.target.checked ? filtered.map((c) => c.id) : [])} />
                                </th>
                                <th>Nombre</th>
                                <th>Teléfono</th>
                                <th>Etiquetas</th>
                                <th>Conversaciones</th>
                                <th>Último Contacto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((c) => (
                                <tr key={c.id}>
                                    <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                                    <td>
                                        <p style={{ fontWeight: 500, color: 'var(--color-white)' }}>{c.name}</p>
                                        {c.email && <p style={{ fontSize: '0.73rem', color: 'var(--color-muted)' }}>{c.email}</p>}
                                    </td>
                                    <td style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>{c.phoneNumber}</td>
                                    <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {c.tags.map((tag) => (
                                                <span key={tag} style={{ background: 'rgba(16,185,129,0.1)', color: '#6ee7b7', padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem' }}>{tag}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>{c.conversationCount}</td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                                        {format(new Date(c.lastContactedAt), "dd MMM yyyy", { locale: es })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
