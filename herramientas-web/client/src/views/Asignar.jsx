import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Foto, Buscador, Vacio, useToast, normalizar } from '../ui.jsx';

export default function Asignar({ empleadoInicial }) {
  const avisar = useToast();
  const [empleados, setEmpleados] = useState([]);
  const [herramientas, setHerramientas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [empleado, setEmpleado] = useState(empleadoInicial || '');
  const [categoria, setCategoria] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState({}); // id -> {herramienta, cantidad}
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(null); // {empleadoId, nombre}

  const cargar = () => {
    api.get('/api/empleados').then(setEmpleados).catch(() => {});
    api.get('/api/herramientas').then(setHerramientas).catch(() => {});
    api.get('/api/categorias').then(setCategorias).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);

  const porDepto = useMemo(() => {
    const g = {};
    for (const e of empleados.filter(e => e.activo)) {
      const d = e.departamento || 'Sin departamento';
      (g[d] = g[d] || []).push(e);
    }
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [empleados]);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return herramientas.filter(h =>
      (!categoria || String(h.categoria_id) === String(categoria)) &&
      (!q || normalizar(`${h.nombre} ${h.categoria_nombre || ''}`).includes(q))
    );
  }, [herramientas, categoria, busqueda]);

  const alternar = (h) => {
    setExito(null);
    setCarrito(c => {
      const n = { ...c };
      if (n[h.id_herramienta]) delete n[h.id_herramienta];
      else n[h.id_herramienta] = { herramienta: h, cantidad: 1 };
      return n;
    });
  };

  const cambiarCantidad = (id, cant) => {
    setCarrito(c => ({ ...c, [id]: { ...c[id], cantidad: Math.max(1, Math.min(999, cant)) } }));
  };

  const items = Object.values(carrito);
  const totalPiezas = items.reduce((s, i) => s + i.cantidad, 0);
  const empSel = empleados.find(e => String(e.id_empleado) === String(empleado));

  const confirmar = async () => {
    if (!empleado) return avisar('Primero elige al empleado', 'error');
    if (!items.length) return avisar('Selecciona al menos una herramienta', 'error');
    setGuardando(true);
    try {
      await api.post('/api/asignaciones', {
        empleado_id: +empleado,
        items: items.map(i => ({ herramienta_id: i.herramienta.id_herramienta, cantidad: i.cantidad }))
      });
      avisar(`${totalPiezas} pieza(s) asignadas a ${empSel?.nombre}`);
      setExito({ empleadoId: +empleado, nombre: empSel?.nombre });
      setCarrito({});
      cargar();
    } catch (e) {
      avisar(e.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="asignar-layout">
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>1 · ¿A quién se le asigna?</label>
            <select className="select" value={empleado} onChange={e => { setEmpleado(e.target.value); setExito(null); }}>
              <option value="">— Elige al empleado —</option>
              {porDepto.map(([depto, lista]) => (
                <optgroup key={depto} label={`📁 ${depto}`}>
                  {lista.map(e => <option key={e.id_empleado} value={e.id_empleado}>{e.nombre}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className="card">
          <div className="card-title">2 · Elige las herramientas (clic para agregar)</div>
          <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar herramienta..." total={visibles.length} />
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
          {visibles.length === 0
            ? <Vacio icono="🔍" texto="No hay herramientas que coincidan" />
            : (
              <div className="toolgrid">
                {visibles.map(h => {
                  const sel = !!carrito[h.id_herramienta];
                  return (
                    <div key={h.id_herramienta} className={`tool-card ${sel ? 'sel' : ''}`} onClick={() => alternar(h)}>
                      {sel && <div className="tool-check">✓</div>}
                      <Foto src={h.imagen} alt={h.nombre} />
                      <div className="tool-nombre">{h.nombre}</div>
                      <div className="tool-cat">{h.categoria_nombre || 'sin categoría'}</div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      </div>

      <div className="carrito">
        <div className="card">
          <div className="card-title">3 · Confirmar asignación</div>

          {empSel && <div className="aviso info">👤 {empSel.nombre} <span style={{ color: 'var(--muted)' }}>· {empSel.departamento}</span></div>}

          {items.length === 0 && !exito && <Vacio icono="🛒" texto="Aún no eliges herramientas" />}

          {items.map(({ herramienta: h, cantidad }) => (
            <div className="carrito-item" key={h.id_herramienta}>
              <Foto src={h.imagen} mini />
              <div className="carrito-nombre">{h.nombre}</div>
              <div className="qty">
                <button onClick={() => cambiarCantidad(h.id_herramienta, cantidad - 1)}>−</button>
                <input value={cantidad}
                  onChange={e => cambiarCantidad(h.id_herramienta, parseInt(e.target.value) || 1)} />
                <button onClick={() => cambiarCantidad(h.id_herramienta, cantidad + 1)}>+</button>
              </div>
              <button className="quitar" title="Quitar"
                onClick={() => setCarrito(c => { const n = { ...c }; delete n[h.id_herramienta]; return n; })}>🗑</button>
            </div>
          ))}

          {items.length > 0 && (
            <>
              <div style={{ margin: '12px 0 10px', fontWeight: 700 }}>
                Total: {totalPiezas} pieza(s) · {items.length} herramienta(s)
              </div>
              <button className="btn ok" style={{ width: '100%' }} disabled={guardando} onClick={confirmar}>
                {guardando ? 'Guardando…' : '✓ Asignar y guardar'}
              </button>
            </>
          )}

          {exito && (
            <div style={{ marginTop: 14 }}>
              <div className="aviso ok">✅ Asignación guardada para {exito.nombre}</div>
              <a className="btn" style={{ width: '100%', marginBottom: 8 }} target="_blank" rel="noreferrer"
                href={`/api/responsiva/${exito.empleadoId}?alcance=ultimas`}>
                🖨 Imprimir responsiva de ESTA asignación
              </a>
              <a className="btn ghost" style={{ width: '100%' }} target="_blank" rel="noreferrer"
                href={`/api/responsiva/${exito.empleadoId}?alcance=todas`}>
                📑 Responsiva completa (todo lo que tiene)
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
