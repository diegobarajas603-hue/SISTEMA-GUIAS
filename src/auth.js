const crypto = require('crypto');
const { promisify } = require('util');
const { pool } = require('./db');

const scrypt = promisify(crypto.scrypt);

// Duracion de la sesion en horas (12 h por defecto, configurable por env)
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;

// ---------- Hash de contraseñas (scrypt, sin dependencias externas) ----------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

async function verificarPassword(password, almacenado) {
  const [esquema, salt, hashHex] = String(almacenado || '').split(':');
  if (esquema !== 'scrypt' || !salt || !hashHex) return false;
  const hash = await scrypt(password, salt, 64);
  const esperado = Buffer.from(hashHex, 'hex');
  return hash.length === esperado.length && crypto.timingSafeEqual(hash, esperado);
}

// ---------- Tablas y usuario administrador inicial ----------

async function initAuth() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      usuario TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'operador',
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      token TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      expira_en TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sesiones_expira_en ON sesiones (expira_en);
  `);

  // Si no hay usuarios, crea el administrador inicial
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios');
  if (rows[0].n === 0) {
    const usuario = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    await pool.query(
      'INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES ($1, $2, $3, $4)',
      [usuario, 'Administrador', await hashPassword(password), 'admin']
    );
    if (!process.env.ADMIN_PASSWORD) {
      console.warn(`[auth] Usuario inicial creado: "${usuario}" con contraseña "admin123". CAMBIALA desde Configuracion o define ADMIN_PASSWORD en .env`);
    } else {
      console.log(`[auth] Usuario administrador inicial creado: "${usuario}"`);
    }
  }
}

// ---------- Limite de intentos de login (en memoria) ----------

const intentos = new Map(); // clave -> { fallos, desde }
const MAX_INTENTOS = 10;
const VENTANA_MS = 15 * 60 * 1000;

function bloqueado(clave) {
  const reg = intentos.get(clave);
  if (!reg) return false;
  if (Date.now() - reg.desde > VENTANA_MS) { intentos.delete(clave); return false; }
  return reg.fallos >= MAX_INTENTOS;
}

function registrarFallo(clave) {
  const reg = intentos.get(clave);
  if (!reg || Date.now() - reg.desde > VENTANA_MS) intentos.set(clave, { fallos: 1, desde: Date.now() });
  else reg.fallos += 1;
}

// ---------- Sesiones ----------

async function login(usuario, password, ip) {
  const clave = `${ip}|${usuario.toLowerCase()}`;
  if (bloqueado(clave)) throw new Error('Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.');

  const { rows } = await pool.query('SELECT * FROM usuarios WHERE lower(usuario) = lower($1)', [usuario]);
  const u = rows[0];
  if (!u || !(await verificarPassword(password, u.password_hash))) {
    registrarFallo(clave);
    throw new Error('Usuario o contraseña incorrectos');
  }
  intentos.delete(clave);

  const token = crypto.randomBytes(32).toString('hex');
  const expiraEn = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await pool.query('INSERT INTO sesiones (token, usuario_id, expira_en) VALUES ($1, $2, $3)', [token, u.id, expiraEn]);
  // Limpia sesiones vencidas de vez en cuando
  pool.query('DELETE FROM sesiones WHERE expira_en < now()').catch(() => {});

  return { token, expiraEn, usuario: { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol } };
}

async function logout(token) {
  await pool.query('DELETE FROM sesiones WHERE token = $1', [token]);
}

async function validarSesion(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.usuario, u.nombre, u.rol
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = $1 AND s.expira_en > now()`,
    [token]
  );
  return rows[0] || null;
}

// ---------- Middlewares ----------

// Token de sesion: header Authorization: Bearer <token> o X-Session-Token.
// Se mantiene compatibilidad con el APP_TOKEN anterior (X-App-Token o ?token=)
// para integraciones existentes como la pistola de escaneo.
function extraerToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return req.headers['x-session-token'] || null;
}

function requireAuth(req, res, next) {
  const APP_TOKEN = process.env.APP_TOKEN || '';
  const legado = req.headers['x-app-token'] || req.query.token;
  if (APP_TOKEN && legado === APP_TOKEN) {
    req.usuario = { id: 0, usuario: 'app-token', nombre: 'Integracion (APP_TOKEN)', rol: 'operador' };
    return next();
  }
  validarSesion(extraerToken(req))
    .then((usuario) => {
      if (!usuario) return res.status(401).json({ error: 'Sesion invalida o expirada. Inicia sesion de nuevo.' });
      req.usuario = usuario;
      next();
    })
    .catch(next);
}

function requireAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') return res.status(403).json({ error: 'Se requiere rol de administrador' });
  next();
}

// ---------- Gestion de usuarios ----------

async function listarUsuarios() {
  const { rows } = await pool.query('SELECT id, usuario, nombre, rol, creado_en FROM usuarios ORDER BY usuario');
  return rows;
}

async function crearUsuario({ usuario, nombre, password, rol }) {
  if (!usuario || !/^[a-zA-Z0-9._-]{3,30}$/.test(usuario)) {
    throw new Error('El usuario debe tener de 3 a 30 caracteres (letras, numeros, punto, guion)');
  }
  if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  if (!['admin', 'operador'].includes(rol)) throw new Error('Rol invalido (admin u operador)');
  try {
    const { rows } = await pool.query(
      'INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id, usuario, nombre, rol, creado_en',
      [usuario.trim(), (nombre || usuario).trim(), await hashPassword(password), rol]
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw new Error('Ese usuario ya existe');
    throw e;
  }
}

async function eliminarUsuario(id, solicitante) {
  if (Number(id) === solicitante.id) throw new Error('No puedes eliminar tu propio usuario');
  const { rows } = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [id]);
  if (!rows[0]) throw new Error('Usuario no encontrado');
  if (rows[0].rol === 'admin') {
    const { rows: admins } = await pool.query(`SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'admin'`);
    if (admins[0].n <= 1) throw new Error('No puedes eliminar al ultimo administrador');
  }
  await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
}

async function cambiarPassword(usuarioId, actual, nueva, tokenActual) {
  if (!nueva || nueva.length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
  const { rows } = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [usuarioId]);
  if (!rows[0] || !(await verificarPassword(actual, rows[0].password_hash))) {
    throw new Error('La contraseña actual es incorrecta');
  }
  await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [await hashPassword(nueva), usuarioId]);
  // Cierra las demas sesiones del usuario por seguridad (conserva la actual)
  await pool.query('DELETE FROM sesiones WHERE usuario_id = $1 AND token <> $2', [usuarioId, tokenActual || '']);
}

// Restablece la contraseña de cualquier usuario (accion de administrador,
// no requiere la contraseña actual) y cierra todas sus sesiones.
async function resetPassword(usuarioId, nueva) {
  if (!nueva || nueva.length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
  const { rowCount } = await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [
    await hashPassword(nueva),
    usuarioId,
  ]);
  if (!rowCount) throw new Error('Usuario no encontrado');
  await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [usuarioId]);
}

module.exports = {
  initAuth,
  login,
  logout,
  extraerToken,
  requireAuth,
  requireAdmin,
  listarUsuarios,
  crearUsuario,
  eliminarUsuario,
  cambiarPassword,
  resetPassword,
};
