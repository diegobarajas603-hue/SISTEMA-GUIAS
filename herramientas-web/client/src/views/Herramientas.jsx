import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Modal, Confirmar, Buscador, Foto, Vacio, Cargando, useToast, normalizar } from '../ui.jsx';

const ESTADOS = ['Bueno', 'Dañado', 'En reparación'];
const badgeEstado = e => e === 'Bueno' ? 'ok' : e === 'Dañado' ? 'bad' : 'warn';

function FormHerramienta({ inicial, categorias, onCerrar, onListo }) {
  const avisar = useToast();
  const [nombre, setNombre] = useState(inicial?.nombre || '');
  const [categoria, setCategoria] = useState(inicial?.categoria_id || '');
  const [estado, setEstado] = useState(inicial?.estado || 'Bueno');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion || '');
  const [foto, setFoto] = useState(null);
  const [preview, setPreview] = useState(inicial?.imagen ? `/uploads/${inicial.imagen}` : null);
  const [guardando, setGuardando] = useState(false);

  const elegirFoto = (f) => {
    setFoto(f);
    if (f) setPreview(URL.createObjectURL(f));
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const fd = new FormData();
      fd.append('nombre', nombre);
      fd.append('categoria_id', categoria);
      fd.append('estado', estado);
      fd.append('descripcion', descripcion);
      if (foto) fd.append('foto', foto);
      if (inicial) await api.put(`/api/herramientas/${inicial.id_herramienta}`, fd);
      else await api.post('/api/herramientas', fd);
      avisar(inicial ? 'Herramienta actualizada' : 'Herramienta creada');
      onListo();
    } catch (e) { avisar(e.message, 'error'); }
    finally { setGuardando(false); }
  };

  return (
    <Modal titulo={inicial ? 'Editar herramienta' : 'Nueva herramienta'} onCerrar={onCerrar} pie={
      <>
        <button className="btn ghost" onClick={onCerrar}>Cancelar</button>
        <button className="btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </>
    }>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 110, textAlign: 'center' }}>
          {preview
            ? <img src={preview} style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 12, background: 'var(--bg)' }} />
            : <div className="tool-foto-fallback" style={{ width: 96, height: 96, fontSize: 34 }}>🔧</div>}
          <label className="btn ghost sm" style={{ marginTop: 8, cursor: 'pointer' }}>
            📷 Foto
            <input type="file" accept="image/*" hidden onChange={e => elegirFoto(e.target.files[0])} />
          </label>
        </div>
        <div style={{ flex: 1 }}>
          <div className="field"><label>Nombre</label>
            <input className="input" value={nombre} onChange={e => setNombre(e.target.value)} autoFocus /></div>
          <div className="field"><label>Categoría</label>
            <select className="select" value={categoria} onChange={e => setCategoria(e.target.value)}>
              <option value="">— Sin categoría —</option>
              {categorias.map(c => <option key={c.id_categoria} value={c.id_categoria}>{c.nombre}</option>)}
            </select></div>
          <div className="field"><label>Estado</label>
            <select className="select" value={estado} onChange={e => setEstado(e.target.value)}>
              {ESTADOS.map(s => <option key={s}>{s}</option>)}
            </select></div>
          <div className="field" style={{ marginBottom: 0 }}><label>Descripción (opcional)</label>
            <input className="input" value={descripcion} onChange={e => setDescripcion(e.target.value)} /></div>
        </div>
      </div>
    </Modal>
  );
}

export default function Herramientas() {
  const avisar = useToast();
  const [herramientas, setHerramientas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [form, setForm] = useState(null);
  const [borrar, setBorrar] = useState(null);
  const [fotoModal, setFotoModal] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    setCargando(true);
    try {
      const [herrs, cats] = await Promise.all([
        api.get('/api/herramientas'),
        api.get('/api/categorias')
      ]);
      setHerramientas(herrs);
      setCategorias(cats);
    } catch (e) {}
    finally { setCargando(false); }
  };
  useEffect(() => { cargar(); }, []);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return herramientas.filter(h =>
      (!categoria || String(h.categoria_id) === String(categoria)) &&
      (!q || normalizar(`${h.nombre} ${h.categoria_nombre || ''}`).includes(q))
    );
  }, [herramientas, busqueda, categoria]);

  const confirmarBorrar = async () => {
    try {
      await api.del(`/api/herramientas/${borrar.id_herramienta}`);
      avisar('Herramienta eliminada');
      setBorrar(null);
      cargar();
    } catch (e) { avisar(e.message, 'error'); setBorrar(null); }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar herramienta..." total={visibles.length} />
        </div>
        <button className="btn" onClick={() => setForm({})}>＋ Nueva herramienta</button>
      </div>

      <div className="chips">
        <button className={`chip ${categoria === '' ? 'activo' : ''}`} onClick={() => setCategoria('')}>Todas</button>
        {categorias.map(c => (
          <button key={c.id_categoria}
            className={`chip ${String(categoria) === String(c.id_categoria) ? 'activo' : ''}`}
            onClick={() => setCategoria(String(categoria) === String(c.id_categoria) ? '' : String(c.id_categoria))}>
            {c.nombre}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="card"><Cargando /></div>
      ) : visibles.length === 0
        ? <div className="card"><Vacio icono="🔧" texto="No hay herramientas que coincidan" /></div>
        : (
          <div className="toolgrid">
            {visibles.map(h => (
              <div key={h.id_herramienta} className="tool-card" style={{ cursor: 'default' }}>
                <div onClick={() => h.imagen && setFotoModal(h)} style={{ cursor: h.imagen ? 'pointer' : 'default' }}>
                  <Foto src={h.imagen} alt={h.nombre} />
                </div>
                <div className="tool-nombre">{h.nombre}</div>
                <div className="tool-cat">{h.categoria_nombre || 'sin categoría'}</div>
                <div style={{ margin: '7px 0 9px', display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <span className={`badge ${badgeEstado(h.estado)}`}>{h.estado || 'Bueno'}</span>
                  {+h.asignadas > 0 && <span className="badge azul">{h.asignadas} asignada(s)</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                  <button className="btn ghost sm" onClick={() => setForm(h)}>✏️ Editar</button>
                  <button className="btn ghost sm" onClick={() => setBorrar(h)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}

      {form && (
        <FormHerramienta inicial={form.id_herramienta ? form : null} categorias={categorias}
          onCerrar={() => setForm(null)} onListo={() => { setForm(null); cargar(); }} />
      )}
      {borrar && (
        <Confirmar titulo="Eliminar herramienta"
          mensaje={`¿Eliminar "${borrar.nombre}" definitivamente? También se borra su historial de asignaciones.`}
          textoSi="Sí, eliminar"
          onSi={confirmarBorrar} onNo={() => setBorrar(null)} />
      )}

      {fotoModal && (
        <Modal ancha titulo={`🔧 ${fotoModal.nombre}`} onCerrar={() => setFotoModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <img src={`/uploads/${fotoModal.imagen}`} style={{ maxWidth: '100%', maxHeight: 500, borderRadius: 12, objectFit: 'contain', background: 'var(--bg)' }} alt={fotoModal.nombre} />
            <div style={{ textAlign: 'center', width: '100%' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{fotoModal.nombre}</div>
              <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>{fotoModal.categoria_nombre || 'sin categoría'}</div>
              {fotoModal.descripcion && <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 8 }}>{fotoModal.descripcion}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <span className={`badge ${badgeEstado(fotoModal.estado)}`}>{fotoModal.estado || 'Bueno'}</span>
                {+fotoModal.asignadas > 0 && <span className="badge azul">{fotoModal.asignadas} asignada(s)</span>}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
