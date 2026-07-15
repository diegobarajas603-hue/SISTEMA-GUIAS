import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Confirmar, Buscador, Vacio, Cargando, useToast, fechaBonita, normalizar } from '../ui.jsx';

export default function Salidas() {
  const avisar = useToast();
  const [salidas, setSalidas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [borrar, setBorrar] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorFolio, setErrorFolio] = useState('');
  const [form, setForm] = useState({ folio: '', nombre: '', proveedor: '', departamento: '', observaciones: '' });

  const cargar = async () => {
    setCargando(true);
    try { setSalidas(await api.get('/api/salidas')); }
    catch (e) {}
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return salidas.filter(s => !q || normalizar(`${s.folio} ${s.nombre} ${s.proveedor} ${s.observaciones} ${s.departamento || ''}`).includes(q));
  }, [salidas, busqueda]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); if (k === 'folio') setErrorFolio(''); };

  const registrar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorFolio('');
    try {
      const r = await api.post('/api/salidas', form);
      avisar(`Salida ${form.folio} registrada`);
      setForm({ folio: '', nombre: '', proveedor: '', departamento: '', observaciones: '' });
      cargar();
      window.open(`/api/salidas/${r.id}/pdf`, '_blank');
    } catch (err) {
      setErrorFolio(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const confirmarBorrar = async () => {
    try {
      await api.del(`/api/salidas/${borrar.id_salida}`);
      avisar(`Salida ${borrar.folio} eliminada`);
      setBorrar(null);
      cargar();
    } catch (e) { avisar(e.message, 'error'); setBorrar(null); }
  };

  return (
    <div className="grid-2" style={{ gridTemplateColumns: '380px 1fr', alignItems: 'start' }}>
      <form className="card" onSubmit={registrar}>
        <div className="card-title">📄 Nueva salida de almacén</div>

        {errorFolio && <div className="aviso error">❌ {errorFolio}</div>}

        <div className="field"><label>Folio</label>
          <input className="input" required placeholder="Ej: SAL-0001"
            value={form.folio} onChange={e => set('folio', e.target.value)} /></div>
        <div className="field"><label>Nombre (quien recibe)</label>
          <input className="input" required value={form.nombre} onChange={e => set('nombre', e.target.value)} /></div>
        <div className="field"><label>Proveedor</label>
          <input className="input" required value={form.proveedor} onChange={e => set('proveedor', e.target.value)} /></div>
        <div className="field"><label>¿Para qué departamento será usada la herramienta?</label>
          <input className="input" required placeholder="Ej: Taller mecánico, Lavado, Oficina..."
            value={form.departamento} onChange={e => set('departamento', e.target.value)} /></div>
        <div className="field"><label>Observaciones</label>
          <textarea className="textarea" required placeholder="Describe el material que sale..."
            value={form.observaciones} onChange={e => set('observaciones', e.target.value)} /></div>

        <button className="btn" style={{ width: '100%' }} disabled={guardando}>
          {guardando ? 'Generando…' : '📄 Registrar y generar PDF'}
        </button>
      </form>

      <div className="card">
        <div className="card-title">🚚 Salidas registradas</div>
        <Buscador valor={busqueda} onCambio={setBusqueda}
          placeholder="Buscar por folio, nombre, proveedor u observaciones..." total={visibles.length} />

        {cargando ? <Cargando />
          : visibles.length === 0
          ? <Vacio icono="🚚" texto="No hay salidas que coincidan" />
          : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr><th>Folio</th><th>Nombre</th><th>Departamento</th><th>Fecha</th><th style={{ width: 170 }}></th></tr>
                </thead>
                <tbody>
                  {visibles.map(s => (
                    <tr key={s.id_salida}>
                      <td style={{ fontWeight: 700 }}>{s.folio}</td>
                      <td>{s.nombre}</td>
                      <td style={{ fontSize: 13, color: 'var(--muted)' }}>{s.departamento || '—'}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{fechaBonita(s.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <a className="btn ghost sm" href={`/api/salidas/${s.id_salida}/pdf`} target="_blank" rel="noreferrer">📄 PDF</a>{' '}
                        <button className="btn ghost sm" onClick={() => setBorrar(s)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {borrar && (
        <Confirmar titulo="Eliminar salida"
          mensaje={`¿Eliminar la salida con folio "${borrar.folio}"? Su PDF dejará de estar disponible.`}
          textoSi="Sí, eliminar"
          onSi={confirmarBorrar} onNo={() => setBorrar(null)} />
      )}
    </div>
  );
}
