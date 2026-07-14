import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Confirmar, Vacio, useToast } from '../ui.jsx';

function Catalogo({ titulo, icono, url, campoId, extraCol, extraLabel }) {
  const avisar = useToast();
  const [items, setItems] = useState([]);
  const [nuevo, setNuevo] = useState('');
  const [editando, setEditando] = useState(null); // {id, nombre}
  const [borrar, setBorrar] = useState(null);

  const cargar = () => api.get(url).then(setItems).catch(() => {});
  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    if (!nuevo.trim()) return;
    try {
      await api.post(url, { nombre: nuevo });
      avisar('Agregado correctamente');
      setNuevo('');
      cargar();
    } catch (err) { avisar(err.message, 'error'); }
  };

  const renombrar = async () => {
    try {
      await api.put(`${url}/${editando.id}`, { nombre: editando.nombre });
      avisar('Nombre actualizado');
      setEditando(null);
      cargar();
    } catch (err) { avisar(err.message, 'error'); }
  };

  const confirmarBorrar = async () => {
    try {
      await api.del(`${url}/${borrar[campoId]}`);
      avisar('Eliminado');
      setBorrar(null);
      cargar();
    } catch (err) { avisar(err.message, 'error'); setBorrar(null); }
  };

  return (
    <div className="card">
      <div className="card-title">{icono} {titulo}</div>

      <form onSubmit={crear} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input className="input" placeholder={`Agregar ${titulo.toLowerCase().slice(0, -1)}...`}
          value={nuevo} onChange={e => setNuevo(e.target.value)} />
        <button className="btn">＋</button>
      </form>

      {items.length === 0 && <Vacio icono={icono} texto="Sin registros" />}
      {items.map(it => (
        <div className="list-row" key={it[campoId]}>
          {editando?.id === it[campoId]
            ? (
              <>
                <input className="input" autoFocus value={editando.nombre}
                  onChange={e => setEditando({ ...editando, nombre: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') renombrar(); if (e.key === 'Escape') setEditando(null); }} />
                <button className="btn sm" onClick={renombrar}>✓</button>
                <button className="btn ghost sm" onClick={() => setEditando(null)}>✕</button>
              </>
            )
            : (
              <>
                <div style={{ flex: 1, fontWeight: 600 }}>{it.nombre}</div>
                <span className="badge neutro">{it[extraCol]} {extraLabel}</span>
                <button className="btn ghost sm" onClick={() => setEditando({ id: it[campoId], nombre: it.nombre })}>✏️</button>
                <button className="btn ghost sm" onClick={() => setBorrar(it)}>🗑</button>
              </>
            )}
        </div>
      ))}

      {borrar && (
        <Confirmar titulo={`Eliminar de ${titulo.toLowerCase()}`}
          mensaje={`¿Eliminar "${borrar.nombre}"?`}
          textoSi="Sí, eliminar"
          onSi={confirmarBorrar} onNo={() => setBorrar(null)} />
      )}
    </div>
  );
}

export default function Catalogos() {
  return (
    <div className="grid-2">
      <Catalogo titulo="Departamentos" icono="📁" url="/api/departamentos"
        campoId="id_departamento" extraCol="empleados" extraLabel="empleado(s)" />
      <Catalogo titulo="Categorías" icono="🏷️" url="/api/categorias"
        campoId="id_categoria" extraCol="herramientas" extraLabel="herramienta(s)" />
    </div>
  );
}
