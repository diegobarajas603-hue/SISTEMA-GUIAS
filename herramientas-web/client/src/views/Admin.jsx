import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Modal, Vacio, useToast, fechaBonita } from '../ui.jsx';

function FormUsuario({ onCerrar, onListo }) {
  const avisar = useToast();
  const [usuario, setUsuario] = useState('');
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('usuario');
  const guardar = async () => {
    try {
      await api.post('/api/usuarios', { usuario, nombre, password, rol });
      avisar('Usuario creado');
      onListo();
    } catch (e) { avisar(e.message, 'error'); }
  };
  return (
    <Modal titulo="Nuevo usuario" onCerrar={onCerrar} pie={
      <>
        <button className="btn ghost" onClick={onCerrar}>Cancelar</button>
        <button className="btn" onClick={guardar}>Crear</button>
      </>
    }>
      <div className="field"><label>Usuario (para entrar)</label>
        <input className="input" value={usuario} onChange={e => setUsuario(e.target.value)} autoFocus /></div>
      <div className="field"><label>Nombre completo</label>
        <input className="input" value={nombre} onChange={e => setNombre(e.target.value)} /></div>
      <div className="field"><label>Contraseña (mínimo 6)</label>
        <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
      <div className="field"><label>Rol</label>
        <select className="select" value={rol} onChange={e => setRol(e.target.value)}>
          <option value="usuario">Usuario (usa el sistema)</option>
          <option value="admin">Administrador (usuarios y migración)</option>
        </select></div>
    </Modal>
  );
}

function Subida({ titulo, descripcion, acepta, url, onResultado }) {
  const avisar = useToast();
  const inputRef = useRef();
  const [subiendo, setSubiendo] = useState(false);

  const subir = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const r = await api.post(url, fd);
      onResultado(r);
    } catch (e) { avisar(e.message, 'error'); }
    finally { setSubiendo(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  return (
    <div className="subir-zona">
      <div style={{ fontSize: 26 }}>{subiendo ? '⏳' : '📤'}</div>
      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{titulo}</div>
      <div style={{ fontSize: 12.5, margin: '4px 0 12px' }}>{descripcion}</div>
      <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
        {subiendo ? 'Subiendo… espera' : 'Elegir archivo'}
        <input ref={inputRef} type="file" accept={acepta} hidden disabled={subiendo}
          onChange={e => subir(e.target.files[0])} />
      </label>
    </div>
  );
}

export default function Admin({ user }) {
  const avisar = useToast();
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState(false);
  const [passUser, setPassUser] = useState(null);
  const [passNueva, setPassNueva] = useState('');
  const [estado, setEstado] = useState(null);

  const cargar = () => {
    api.get('/api/usuarios').then(setUsuarios).catch(() => {});
    api.get('/api/migracion/estado').then(setEstado).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);

  const toggle = async (u) => {
    try { await api.post(`/api/usuarios/${u.id}/toggle`); cargar(); }
    catch (e) { avisar(e.message, 'error'); }
  };

  const cambiarPass = async () => {
    try {
      await api.post(`/api/usuarios/${passUser.id}/password`, { password: passNueva });
      avisar(`Contraseña de ${passUser.usuario} actualizada`);
      setPassUser(null); setPassNueva('');
    } catch (e) { avisar(e.message, 'error'); }
  };

  return (
    <>
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between' }}>
          <span>👤 Usuarios del sistema</span>
          <button className="btn sm" onClick={() => setForm(true)}>＋ Nuevo usuario</button>
        </div>
        {usuarios.length === 0 && <Vacio icono="👤" texto="Sin usuarios" />}
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 700 }}>{u.usuario}</td>
                  <td>{u.nombre}</td>
                  <td>{u.rol === 'admin' ? <span className="badge azul">Admin</span> : <span className="badge neutro">Usuario</span>}</td>
                  <td>{u.activo ? <span className="badge ok">Activo</span> : <span className="badge bad">Inactivo</span>}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{fechaBonita(u.created_at)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn ghost sm" onClick={() => setPassUser(u)}>🔑 Contraseña</button>{' '}
                    {u.id !== user.id &&
                      <button className="btn ghost sm" onClick={() => toggle(u)}>{u.activo ? '🚫 Desactivar' : '✅ Activar'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🚚 Migración desde tu sistema anterior (XAMPP)</div>
        <div className="aviso info">
          <span>💡 En tu computadora corre <b>respaldo.bat</b> (crea la carpeta con <b>base_de_datos.sql</b> y la carpeta <b>uploads</b>).
          Sube aquí ese archivo .sql, y las fotos comprimidas en un .zip. Puedes repetirlo las veces que necesites.</span>
        </div>
        <div className="grid-2">
          <Subida titulo="1 · Base de datos" acepta=".sql"
            descripcion="Archivo base_de_datos.sql de tu respaldo. REEMPLAZA los datos actuales del sistema en línea."
            url="/api/migracion/sql"
            onResultado={r => { avisar('Base de datos importada'); cargar(); }} />
          <Subida titulo="2 · Fotos (ZIP)" acepta=".zip"
            descripcion="Comprime tu carpeta uploads en un ZIP y súbelo. Las fotos se agregan sin borrar las existentes."
            url="/api/migracion/fotos"
            onResultado={r => { avisar(`${r.copiadas} foto(s) copiadas`); cargar(); }} />
        </div>
        {estado && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge neutro">📁 {estado.departamentos} departamentos</span>
            <span className="badge neutro">👥 {estado.empleados} empleados</span>
            <span className="badge neutro">🏷️ {estado.categorias} categorías</span>
            <span className="badge neutro">🔧 {estado.herramientas} herramientas</span>
            <span className="badge neutro">📦 {estado.asignaciones} asignaciones</span>
            <span className="badge neutro">🚚 {estado.salidas_almacen} salidas</span>
            <span className="badge neutro">🖼️ {estado.fotos} fotos</span>
          </div>
        )}
      </div>

      {form && <FormUsuario onCerrar={() => setForm(false)} onListo={() => { setForm(false); cargar(); }} />}

      {passUser && (
        <Modal titulo={`Nueva contraseña para ${passUser.usuario}`} onCerrar={() => setPassUser(null)} pie={
          <>
            <button className="btn ghost" onClick={() => setPassUser(null)}>Cancelar</button>
            <button className="btn" onClick={cambiarPass}>Guardar</button>
          </>
        }>
          <div className="field"><label>Contraseña nueva (mínimo 6)</label>
            <input className="input" type="password" autoFocus value={passNueva} onChange={e => setPassNueva(e.target.value)} /></div>
        </Modal>
      )}
    </>
  );
}
