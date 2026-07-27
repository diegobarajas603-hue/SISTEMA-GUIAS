'use strict';
// Autenticacion con sesiones, bloqueo por intentos fallidos y
// administracion de usuarios (roles: admin, gerente, vendedor).

const express = require('express');
const { get, all, run } = require('./db');
const { hashPassword, verifyPassword, tokenAleatorio, ahora, limpiarTexto } = require('./util');

const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const MAX_FALLOS = 10;
const MINUTOS_BLOQUEO = 15;
const ROLES = ['admin', 'gerente', 'vendedor'];

// ---------- Sesiones ----------

function crearSesion(usuarioId) {
  const token = tokenAleatorio(32);
  const expira = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  run('INSERT INTO sesiones (token, usuario_id, creada_en, expira_en) VALUES (?, ?, ?, ?)', token, usuarioId, ahora(), expira);
  // limpieza ocasional de sesiones vencidas
  if (Math.random() < 0.05) run('DELETE FROM sesiones WHERE expira_en < ?', ahora());
  return { token, expira };
}

function usuarioPorToken(token) {
  if (!token) return null;
  const fila = get(
    `SELECT u.id, u.usuario, u.nombre, u.email, u.telefono, u.rol, u.activo, s.expira_en
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = ?`, token
  );
  if (!fila) return null;
  if (fila.expira_en < ahora() || !fila.activo) {
    run('DELETE FROM sesiones WHERE token = ?', token);
    return null;
  }
  return fila;
}

// Middleware: requiere sesion valida; deja el usuario en req.usuario
function autenticar(req, res, next) {
  const encabezado = req.headers.authorization || '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : '';
  const usuario = usuarioPorToken(token);
  if (!usuario) return res.status(401).json({ error: 'Sesion invalida o expirada. Inicia sesion de nuevo.' });
  req.usuario = usuario;
  req.token = token;
  next();
}

// Middleware: limita una ruta a ciertos roles
function requerirRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta operacion.' });
    }
    next();
  };
}

const esAdminOGerente = (usuario) => usuario.rol === 'admin' || usuario.rol === 'gerente';

// ---------- Rutas de autenticacion ----------

const rutasAuth = express.Router();

rutasAuth.post('/login', (req, res) => {
  const usuario = limpiarTexto(req.body.usuario, 100).toLowerCase();
  const password = String(req.body.password || '');
  if (!usuario || !password) return res.status(400).json({ error: 'Escribe tu usuario y contrasena.' });

  const intento = get('SELECT * FROM intentos_login WHERE usuario = ?', usuario);
  if (intento && intento.bloqueado_hasta && intento.bloqueado_hasta > ahora()) {
    return res.status(429).json({ error: `Demasiados intentos fallidos. Espera ${MINUTOS_BLOQUEO} minutos e intenta de nuevo.` });
  }

  const fila = get('SELECT * FROM usuarios WHERE lower(usuario) = ? AND activo = 1', usuario);
  if (!fila || !verifyPassword(password, fila.password_hash)) {
    const fallos = (intento ? intento.fallos : 0) + 1;
    const bloqueo = fallos >= MAX_FALLOS ? new Date(Date.now() + MINUTOS_BLOQUEO * 60000).toISOString() : null;
    run(
      `INSERT INTO intentos_login (usuario, fallos, bloqueado_hasta) VALUES (?, ?, ?)
       ON CONFLICT(usuario) DO UPDATE SET fallos = excluded.fallos, bloqueado_hasta = excluded.bloqueado_hasta`,
      usuario, bloqueo ? 0 : fallos, bloqueo
    );
    return res.status(401).json({ error: 'Usuario o contrasena incorrectos.' });
  }

  run('DELETE FROM intentos_login WHERE usuario = ?', usuario);
  const { token, expira } = crearSesion(fila.id);
  res.json({
    token,
    expiraEn: expira,
    usuario: { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, email: fila.email, telefono: fila.telefono, rol: fila.rol },
  });
});

rutasAuth.post('/logout', autenticar, (req, res) => {
  run('DELETE FROM sesiones WHERE token = ?', req.token);
  res.json({ ok: true });
});

rutasAuth.get('/me', autenticar, (req, res) => {
  const u = req.usuario;
  res.json({ id: u.id, usuario: u.usuario, nombre: u.nombre, email: u.email, telefono: u.telefono, rol: u.rol });
});

// Cualquier usuario puede cambiar su propia contrasena
rutasAuth.put('/password', autenticar, (req, res) => {
  const actual = String(req.body.actual || '');
  const nueva = String(req.body.nueva || '');
  if (nueva.length < 6) return res.status(400).json({ error: 'La nueva contrasena debe tener al menos 6 caracteres.' });
  const fila = get('SELECT password_hash FROM usuarios WHERE id = ?', req.usuario.id);
  if (!verifyPassword(actual, fila.password_hash)) return res.status(400).json({ error: 'La contrasena actual no es correcta.' });
  run('UPDATE usuarios SET password_hash = ? WHERE id = ?', hashPassword(nueva), req.usuario.id);
  run('DELETE FROM sesiones WHERE usuario_id = ? AND token != ?', req.usuario.id, req.token);
  res.json({ ok: true });
});

// ---------- Rutas de usuarios (equipo de 10 personas) ----------

const rutasUsuarios = express.Router();
rutasUsuarios.use(autenticar);

// Lista para llenar selectores de vendedor: visible para todos.
// Los datos completos (usuario de acceso, correo, telefono) solo para admin/gerente.
rutasUsuarios.get('/', (req, res) => {
  const completo = esAdminOGerente(req.usuario);
  const filas = all('SELECT id, usuario, nombre, email, telefono, rol, activo, creado_en FROM usuarios ORDER BY activo DESC, nombre');
  if (completo) return res.json(filas);
  res.json(filas.map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol, activo: u.activo })));
});

rutasUsuarios.post('/', requerirRol('admin'), (req, res) => {
  const usuario = limpiarTexto(req.body.usuario, 50).toLowerCase().replace(/\s+/g, '');
  const nombre = limpiarTexto(req.body.nombre, 120);
  const rol = ROLES.includes(req.body.rol) ? req.body.rol : 'vendedor';
  const password = String(req.body.password || '');
  if (!usuario || !nombre) return res.status(400).json({ error: 'Usuario y nombre son obligatorios.' });
  if (password.length < 6) return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres.' });
  if (get('SELECT id FROM usuarios WHERE lower(usuario) = ?', usuario)) {
    return res.status(400).json({ error: `El usuario "${usuario}" ya existe.` });
  }
  const info = run(
    'INSERT INTO usuarios (usuario, nombre, email, telefono, rol, password_hash, activo, creado_en) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    usuario, nombre, limpiarTexto(req.body.email, 120), limpiarTexto(req.body.telefono, 30), rol, hashPassword(password), ahora()
  );
  res.status(201).json(get('SELECT id, usuario, nombre, email, telefono, rol, activo, creado_en FROM usuarios WHERE id = ?', info.lastInsertRowid));
});

rutasUsuarios.put('/:id', requerirRol('admin'), (req, res) => {
  const id = Number(req.params.id);
  const fila = get('SELECT * FROM usuarios WHERE id = ?', id);
  if (!fila) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const rol = ROLES.includes(req.body.rol) ? req.body.rol : fila.rol;
  const activo = req.body.activo === undefined ? fila.activo : (req.body.activo ? 1 : 0);
  if (id === req.usuario.id && (!activo || rol !== 'admin')) {
    return res.status(400).json({ error: 'No puedes desactivarte ni quitarte el rol de administrador a ti mismo.' });
  }
  run(
    'UPDATE usuarios SET nombre = ?, email = ?, telefono = ?, rol = ?, activo = ? WHERE id = ?',
    limpiarTexto(req.body.nombre, 120) || fila.nombre,
    req.body.email === undefined ? fila.email : limpiarTexto(req.body.email, 120),
    req.body.telefono === undefined ? fila.telefono : limpiarTexto(req.body.telefono, 30),
    rol, activo, id
  );
  if (!activo) run('DELETE FROM sesiones WHERE usuario_id = ?', id);
  res.json(get('SELECT id, usuario, nombre, email, telefono, rol, activo, creado_en FROM usuarios WHERE id = ?', id));
});

// El administrador restablece la contrasena de cualquier usuario
rutasUsuarios.put('/:id/password', requerirRol('admin'), (req, res) => {
  const id = Number(req.params.id);
  const nueva = String(req.body.nueva || '');
  if (!get('SELECT id FROM usuarios WHERE id = ?', id)) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (nueva.length < 6) return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres.' });
  run('UPDATE usuarios SET password_hash = ? WHERE id = ?', hashPassword(nueva), id);
  run('DELETE FROM sesiones WHERE usuario_id = ?', id);
  res.json({ ok: true });
});

module.exports = { rutasAuth, rutasUsuarios, autenticar, requerirRol, esAdminOGerente };
