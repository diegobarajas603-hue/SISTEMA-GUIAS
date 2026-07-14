import React, { useEffect, useState } from 'react';
import { api, setOnSesionExpirada } from './api.js';
import { ToastProvider, Modal, useToast, iniciales } from './ui.jsx';
import Login from './views/Login.jsx';
import Dashboard from './views/Dashboard.jsx';
import Asignar from './views/Asignar.jsx';
import Empleados from './views/Empleados.jsx';
import Herramientas from './views/Herramientas.jsx';
import Salidas from './views/Salidas.jsx';
import Catalogos from './views/Catalogos.jsx';
import Admin from './views/Admin.jsx';

const SECCIONES = [
  { id: 'dashboard', nombre: 'Inicio', icono: '📊', titulo: 'Panel general' },
  { id: 'asignar', nombre: 'Asignar', icono: '📦', titulo: 'Asignar herramientas' },
  { id: 'empleados', nombre: 'Empleados', icono: '👥', titulo: 'Empleados' },
  { id: 'herramientas', nombre: 'Herramientas', icono: '🔧', titulo: 'Herramientas' },
  { id: 'salidas', nombre: 'Salidas', icono: '🚚', titulo: 'Salidas de almacén' },
  { id: 'catalogos', nombre: 'Catálogos', icono: '🗂️', titulo: 'Departamentos y categorías' },
  { id: 'admin', nombre: 'Administración', icono: '⚙️', titulo: 'Usuarios y migración', soloAdmin: true }
];

function CambiarPass({ onCerrar }) {
  const avisar = useToast();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [nueva2, setNueva2] = useState('');
  const guardar = async () => {
    if (nueva !== nueva2) return avisar('Las contraseñas nuevas no coinciden', 'error');
    try {
      await api.post('/api/password', { actual, nueva });
      avisar('Contraseña actualizada');
      onCerrar();
    } catch (e) { avisar(e.message, 'error'); }
  };
  return (
    <Modal titulo="Cambiar mi contraseña" onCerrar={onCerrar} pie={
      <>
        <button className="btn ghost" onClick={onCerrar}>Cancelar</button>
        <button className="btn" onClick={guardar}>Guardar</button>
      </>
    }>
      <div className="field"><label>Contraseña actual</label>
        <input className="input" type="password" value={actual} onChange={e => setActual(e.target.value)} /></div>
      <div className="field"><label>Nueva contraseña (mínimo 6)</label>
        <input className="input" type="password" value={nueva} onChange={e => setNueva(e.target.value)} /></div>
      <div className="field"><label>Repetir nueva contraseña</label>
        <input className="input" type="password" value={nueva2} onChange={e => setNueva2(e.target.value)} /></div>
    </Modal>
  );
}

function Shell({ user, onSalir }) {
  const [seccion, setSeccion] = useState('dashboard');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cambiarPass, setCambiarPass] = useState(false);
  const [irAsignar, setIrAsignar] = useState(null); // empleado preseleccionado

  const visibles = SECCIONES.filter(s => !s.soloAdmin || user.rol === 'admin');
  const actual = SECCIONES.find(s => s.id === seccion) || SECCIONES[0];

  const navegarAsignar = (empleadoId = null) => { setIrAsignar(empleadoId); setSeccion('asignar'); };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/uploads/logo-tauro.jpg" alt="" onError={e => { e.target.style.display = 'none'; }} />
          <div>
            <div className="brand-name">Fletes Tauro</div>
            <div className="brand-sub">Control de herramientas</div>
          </div>
        </div>
        {visibles.map(s => (
          <button key={s.id} className={`nav-item ${seccion === s.id ? 'activo' : ''}`} onClick={() => setSeccion(s.id)}>
            <span className="nav-icon">{s.icono}</span>{s.nombre}
          </button>
        ))}
        <div className="sidebar-foot">Sesión: {user.usuario}</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{actual.titulo}</h1>
          <div className="user-chip" onClick={() => setMenuAbierto(m => !m)}>
            <div className="avatar">{iniciales(user.nombre || user.usuario)}</div>
            <span>{user.nombre || user.usuario}</span>
          </div>
          {menuAbierto && (
            <div className="user-menu" onMouseLeave={() => setMenuAbierto(false)}>
              <button onClick={() => { setCambiarPass(true); setMenuAbierto(false); }}>🔑 Cambiar contraseña</button>
              <button onClick={onSalir}>🚪 Cerrar sesión</button>
            </div>
          )}
        </header>

        <main className="content">
          {seccion === 'dashboard' && <Dashboard onIrAsignar={() => navegarAsignar()} />}
          {seccion === 'asignar' && <Asignar empleadoInicial={irAsignar} />}
          {seccion === 'empleados' && <Empleados onAsignar={navegarAsignar} />}
          {seccion === 'herramientas' && <Herramientas />}
          {seccion === 'salidas' && <Salidas />}
          {seccion === 'catalogos' && <Catalogos />}
          {seccion === 'admin' && user.rol === 'admin' && <Admin user={user} />}
        </main>
      </div>

      <nav className="bottom-nav">
        {visibles.slice(0, 5).map(s => (
          <button key={s.id} className={seccion === s.id ? 'activo' : ''} onClick={() => setSeccion(s.id)}>
            <span className="ico">{s.icono}</span>{s.nombre}
          </button>
        ))}
      </nav>

      {cambiarPass && <CambiarPass onCerrar={() => setCambiarPass(false)} />}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setOnSesionExpirada(() => setUser(null));
    api.get('/api/me').then(setUser).catch(() => {}).finally(() => setCargando(false));
  }, []);

  const salir = async () => { try { await api.post('/api/logout'); } catch {} setUser(null); };

  if (cargando) return null;

  return (
    <ToastProvider>
      {user
        ? <Shell user={user} onSalir={salir} />
        : <Login onEntrar={setUser} />}
    </ToastProvider>
  );
}
