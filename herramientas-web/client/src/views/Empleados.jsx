import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Modal, Confirmar, Buscador, Foto, Vacio, useToast, iniciales, fechaBonita, normalizar } from '../ui.jsx';

function FormEmpleado({ inicial, departamentos, onCerrar, onListo }) {
  const avisar = useToast();
  const [nombre, setNombre] = useState(inicial?.nombre || '');
  const [depto, setDepto] = useState(inicial?.departamento_id || '');
  const guardar = async () => {
    try {
      if (inicial) await api.put(`/api/empleados/${inicial.id_empleado}`, { nombre, departamento_id: depto });
      else await api.post('/api/empleados', { nombre, departamento_id: depto });
      avisar(inicial ? 'Empleado actualizado' : 'Empleado creado');
      onListo();
    } catch (e) { avisar(e.message, 'error'); }
  };
  return (
    <Modal titulo={inicial ? 'Editar empleado' : 'Nuevo empleado'} onCerrar={onCerrar} pie={
      <>
        <button className="btn ghost" onClick={onCerrar}>Cancelar</button>
        <button className="btn" onClick={guardar}>Guardar</button>
      </>
    }>
      <div className="field"><label>Nombre completo</label>
        <input className="input" value={nombre} onChange={e => setNombre(e.target.value)} autoFocus /></div>
      <div className="field"><label>Departamento</label>
        <select className="select" value={depto} onChange={e => setDepto(e.target.value)}>
          <option value="">— Elige —</option>
          {departamentos.map(d => <option key={d.id_departamento} value={d.id_departamento}>{d.nombre}</option>)}
        </select></div>
    </Modal>
  );
}

function DetalleEmpleado({ id, onCerrar, onCambio, onAsignar }) {
  const avisar = useToast();
  const [emp, setEmp] = useState(null);
  const [retirar, setRetirar] = useState(null);

  const cargar = () => api.get(`/api/empleados/${id}`).then(setEmp).catch(e => avisar(e.message, 'error'));
  useEffect(() => { cargar(); }, [id]);

  const confirmarRetiro = async () => {
    try {
      await api.post(`/api/asignaciones/${retirar.id_asignacion}/retirar`);
      avisar(`${retirar.nombre} devuelta`);
      setRetirar(null);
      cargar();
      onCambio();
    } catch (e) { avisar(e.message, 'error'); }
  };

  if (!emp) return null;
  const totalPiezas = emp.asignaciones.reduce((s, a) => s + (a.cantidad || 1), 0);

  return (
    <Modal ancha titulo={`👤 ${emp.nombre}`} onCerrar={onCerrar}>
      <div style={{ color: 'var(--muted)', marginTop: -10, marginBottom: 14 }}>
        {emp.departamento || 'Sin departamento'} · {totalPiezas} pieza(s) asignada(s)
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <a className="btn sm" target="_blank" rel="noreferrer" href={`/api/responsiva/${emp.id_empleado}?alcance=todas`}>📑 Responsiva: todas</a>
        <a className="btn ghost sm" target="_blank" rel="noreferrer" href={`/api/responsiva/${emp.id_empleado}?alcance=ultimas`}>🆕 Responsiva: últimas</a>
        <button className="btn ok sm" onClick={() => onAsignar(emp.id_empleado)}>📦 Asignarle más</button>
      </div>

      {emp.asignaciones.length === 0 && <Vacio icono="📭" texto="No tiene herramientas asignadas" />}
      {emp.asignaciones.map(a => (
        <div className="list-row" key={a.id_asignacion}>
          <Foto src={a.imagen} mini />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>
              {a.nombre}{a.cantidad > 1 && <span className="badge azul" style={{ marginLeft: 7 }}>x{a.cantidad}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {a.categoria || 'sin categoría'} · asignada el {fechaBonita(a.fecha_asignacion)}
            </div>
          </div>
          <button className="btn ghost sm" onClick={() => setRetirar(a)}>↩ Devolver</button>
        </div>
      ))}

      {retirar && (
        <Confirmar titulo="Devolver herramienta"
          mensaje={`¿Marcar "${retirar.nombre}"${retirar.cantidad > 1 ? ` (x${retirar.cantidad})` : ''} como devuelta por ${emp.nombre}?`}
          textoSi="Sí, devolver" peligro={false}
          onSi={confirmarRetiro} onNo={() => setRetirar(null)} />
      )}
    </Modal>
  );
}

export default function Empleados({ onAsignar }) {
  const avisar = useToast();
  const [empleados, setEmpleados] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(null);       // null | {} | empleado
  const [detalle, setDetalle] = useState(null); // id

  const cargar = () => {
    api.get('/api/empleados').then(setEmpleados).catch(() => {});
    api.get('/api/departamentos').then(setDepartamentos).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda);
    return empleados.filter(e => !q || normalizar(`${e.nombre} ${e.departamento || ''}`).includes(q));
  }, [empleados, busqueda]);

  const grupos = useMemo(() => {
    const g = {};
    for (const e of filtrados) {
      const d = e.departamento || 'Sin departamento';
      (g[d] = g[d] || []).push(e);
    }
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados]);

  const toggle = async (e) => {
    try {
      await api.post(`/api/empleados/${e.id_empleado}/toggle`);
      avisar(e.activo ? `${e.nombre} marcado como inactivo` : `${e.nombre} activado`);
      cargar();
    } catch (err) { avisar(err.message, 'error'); }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar empleado o departamento..." total={filtrados.length} />
        </div>
        <button className="btn" onClick={() => setForm({})}>＋ Nuevo empleado</button>
      </div>

      {grupos.length === 0 && <div className="card"><Vacio icono="👥" texto="No se encontraron empleados" /></div>}

      {grupos.map(([depto, lista]) => (
        <div key={depto}>
          <div className="grupo-titulo">📁 {depto} <span className="grupo-linea" /> <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{lista.length}</span></div>
          <div className="emp-grid">
            {lista.map(e => (
              <div key={e.id_empleado} className={`emp-card ${e.activo ? '' : 'inactivo'}`}>
                <div className="emp-top">
                  <div className="avatar" style={{ width: 38, height: 38, fontSize: 14 }}>{iniciales(e.nombre)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="emp-nombre">{e.nombre}</div>
                    <div className="emp-depto">
                      {+e.herramientas > 0 ? `${e.herramientas} pieza(s) asignada(s)` : 'sin herramientas'}
                    </div>
                  </div>
                  {e.activo ? <span className="badge ok">Activo</span> : <span className="badge neutro">Inactivo</span>}
                </div>
                <div className="emp-actions">
                  <button className="btn sm" onClick={() => setDetalle(e.id_empleado)}>Ver herramientas</button>
                  <button className="btn ghost sm" onClick={() => setForm(e)}>✏️</button>
                  <button className="btn ghost sm" onClick={() => toggle(e)}>{e.activo ? '🚫 Baja' : '✅ Alta'}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {form && (
        <FormEmpleado inicial={form.id_empleado ? form : null} departamentos={departamentos}
          onCerrar={() => setForm(null)}
          onListo={() => { setForm(null); cargar(); }} />
      )}
      {detalle && (
        <DetalleEmpleado id={detalle} onCerrar={() => setDetalle(null)} onCambio={cargar}
          onAsignar={(id) => { setDetalle(null); onAsignar(id); }} />
      )}
    </>
  );
}
