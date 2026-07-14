import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Foto, Vacio, fechaBonita } from '../ui.jsx';

const TILES = [
  { k: 'herramientas', lbl: 'Herramientas registradas', ico: '🔧', fondo: 'var(--primary-soft)' },
  { k: 'empleados', lbl: 'Empleados activos', ico: '👥', fondo: 'var(--violet-soft)' },
  { k: 'asignadas', lbl: 'Piezas asignadas', ico: '📦', fondo: 'var(--warn-soft)' },
  { k: 'disponibles', lbl: 'Herramientas sin asignar', ico: '✅', fondo: 'var(--ok-soft)' },
  { k: 'salidas', lbl: 'Salidas de almacén', ico: '🚚', fondo: 'var(--bg)' }
];

export default function Dashboard({ onIrAsignar }) {
  const [datos, setDatos] = useState(null);

  useEffect(() => { api.get('/api/dashboard').then(setDatos).catch(() => {}); }, []);

  if (!datos) return <div className="skeleton" style={{ height: 120 }} />;

  return (
    <>
      <div className="kpi-grid">
        {TILES.map(t => (
          <div className="kpi" key={t.k}>
            <div className="kpi-ico" style={{ background: t.fondo }}>{t.ico}</div>
            <div>
              <div className="kpi-num">{datos[t.k]}</div>
              <div className="kpi-lbl">{t.lbl}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">🕓 Últimos movimientos</div>
          {datos.movimientos.length === 0 && <Vacio icono="🕓" texto="Aún no hay movimientos" />}
          {datos.movimientos.map(m => (
            <div className="list-row" key={m.id_asignacion}>
              <Foto src={m.imagen} mini />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                  {m.herramienta}{m.cantidad > 1 ? ` (x${m.cantidad})` : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {m.empleado} · {fechaBonita(m.activa ? m.fecha_asignacion : m.fecha_fin)}
                </div>
              </div>
              {m.activa
                ? <span className="badge azul">Asignada</span>
                : <span className="badge neutro">Devuelta</span>}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title">🚚 Últimas salidas de almacén</div>
          {datos.ultimasSalidas.length === 0 && <Vacio icono="🚚" texto="Sin salidas registradas" />}
          {datos.ultimasSalidas.map(s => (
            <div className="list-row" key={s.id_salida}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.folio}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.nombre} · {fechaBonita(s.created_at)}</div>
              </div>
              <a className="btn ghost sm" href={`/api/salidas/${s.id_salida}/pdf`} target="_blank" rel="noreferrer">📄 PDF</a>
            </div>
          ))}
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={onIrAsignar}>📦 Asignar herramientas</button>
          </div>
        </div>
      </div>
    </>
  );
}
