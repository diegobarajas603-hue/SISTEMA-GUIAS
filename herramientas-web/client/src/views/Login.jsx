import React, { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onEntrar }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const u = await api.post('/api/login', { usuario, password });
      onEntrar(u);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={entrar}>
        <img className="login-logo" src="/uploads/logo-tauro.jpg" alt="Fletes Tauro"
          onError={e => { e.target.style.display = 'none'; }} />
        <div className="login-title">Control de Herramientas</div>
        <div className="login-sub">Fletes Tauro · Acceso al sistema</div>

        {error && <div className="aviso error">⚠️ {error}</div>}

        <div className="field">
          <label>Usuario</label>
          <input className="input" value={usuario} onChange={e => setUsuario(e.target.value)}
            autoFocus autoComplete="username" />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="current-password" />
        </div>
        <button className="btn" style={{ width: '100%', marginTop: 6 }} disabled={cargando}>
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
