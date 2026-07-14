import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = ++idRef.current;
    setToasts(t => [...t, { id, texto, tipo }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={avisar}>
      {children}
      <div className="toasts">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.tipo}`}>
            <span>{t.tipo === 'error' ? '⚠️' : '✅'}</span>{t.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Modal ---------- */
export function Modal({ titulo, onCerrar, children, pie, ancha }) {
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className={`modal ${ancha ? 'ancha' : ''}`}>
        <div className="modal-head">
          <h3>{titulo}</h3>
          <button className="cerrar-x" onClick={onCerrar}>✕</button>
        </div>
        {children}
        {pie && <div className="modal-foot">{pie}</div>}
      </div>
    </div>
  );
}

export function Confirmar({ titulo = '¿Estás seguro?', mensaje, onSi, onNo, textoSi = 'Sí, continuar', peligro = true }) {
  return (
    <Modal titulo={titulo} onCerrar={onNo} pie={
      <>
        <button className="btn ghost" onClick={onNo}>Cancelar</button>
        <button className={`btn ${peligro ? 'danger' : ''}`} onClick={onSi}>{textoSi}</button>
      </>
    }>
      <p style={{ margin: 0, color: 'var(--ink-2)' }}>{mensaje}</p>
    </Modal>
  );
}

/* ---------- Buscador ---------- */
export function Buscador({ valor, onCambio, placeholder = 'Buscar...', total = null }) {
  return (
    <div className="search-bar">
      <span className="lupa">🔍</span>
      <input
        value={valor}
        onChange={e => onCambio(e.target.value)}
        placeholder={placeholder}
        onKeyDown={e => { if (e.key === 'Escape') onCambio(''); }}
      />
      {valor && <span className="search-count">{total !== null ? `${total} resultado(s)` : ''}</span>}
      {valor && <button className="btn ghost sm" onClick={() => onCambio('')}>✕</button>}
    </div>
  );
}

/* ---------- Foto con respaldo ---------- */
export function Foto({ src, mini = false, alt = '' }) {
  const [error, setError] = useState(false);
  const clase = mini ? 'mini-foto' : 'tool-foto';
  const claseFb = mini ? 'mini-foto-fallback' : 'tool-foto-fallback';
  if (!src || error) return <div className={claseFb}>🔧</div>;
  return <img className={clase} src={`/uploads/${src}`} alt={alt} onError={() => setError(true)} loading="lazy" />;
}

/* ---------- Vacío ---------- */
export function Vacio({ icono = '📭', texto = 'No hay nada aquí todavía' }) {
  return (
    <div className="empty">
      <div className="ico">{icono}</div>
      <div>{texto}</div>
    </div>
  );
}

/* ---------- utilidades ---------- */
export function iniciales(nombre = '') {
  return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
}

export function fechaBonita(str) {
  if (!str) return '';
  const [f, h] = String(str).split(' ');
  if (!f) return str;
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}${h ? ' ' + h.slice(0, 5) : ''}`;
}

export function normalizar(s = '') {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
