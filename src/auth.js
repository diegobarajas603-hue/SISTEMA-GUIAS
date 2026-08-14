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

    -- Plaza del usuario (MTY o CDMX); NULL = puede operar en ambas
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plaza TEXT;

    -- Un usuario puede tener varios roles a la vez (por ejemplo Llegadas +
    -- Entregas a domicilio). Sustituye a la columna "rol", que se deja
    -- intacta (ya no se usa) para no perder el dato viejo.
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS roles TEXT[];
    UPDATE usuarios SET roles = ARRAY[rol] WHERE roles IS NULL;
    ALTER TABLE usuarios ALTER COLUMN roles SET NOT NULL;
    ALTER TABLE usuarios ALTER COLUMN roles SET DEFAULT ARRAY['operador'];

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
      'INSERT INTO usuarios (usuario, nombre, password_hash, rol, roles) VALUES ($1, $2, $3, $4, $5)',
      [usuario, 'Administrador', await hashPassword(password), 'admin', ['admin']]
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

  return {
    token,
    expiraEn,
    usuario: { id: u.id, usuario: u.usuario, nombre: u.nombre, roles: u.roles, plaza: u.plaza, modos: modosDeRoles(u.roles) },
  };
}

async function logout(token) {
  await pool.query('DELETE FROM sesiones WHERE token = $1', [token]);
}

async function validarSesion(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.usuario, u.nombre, u.roles, u.plaza
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = $1 AND s.expira_en > now()`,
    [token]
  );
  if (!rows[0]) return null;
  return { ...rows[0], modos: modosDeRoles(rows[0].roles) };
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
    req.usuario = { id: 0, usuario: 'app-token', nombre: 'Integracion (APP_TOKEN)', roles: ['operador'], modos: modosDeRoles(['operador']) };
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
  if (!esAdmin(req.usuario?.roles)) return res.status(403).json({ error: 'Se requiere rol de administrador' });
  next();
}

// ---------- Roles ----------

// Cada rol define que tipos de escaneo puede hacer su usuario. La pantalla de
// escaneo solo muestra los que le corresponden, pero la restriccion de verdad
// se aplica aqui y en el endpoint de escaneo: esconder el boton no basta.
//
// Un usuario puede tener varios roles a la vez (por ejemplo alguien de reparto
// necesita "Llegadas" y "Entregas a domicilio"); sus permisos son la union de
// los modos de todos sus roles.
//
// "Llegadas" y "Salidas" dan acceso al mismo modo ("bodega"): esa pantalla ya
// distingue sola si el escaneo es una salida o una llegada segun el estatus
// de la guia, el operador no elige direccion. Son dos etiquetas para el mismo
// permiso, pensadas para asignar segun lo que hace cada quien.
//
// "operador" es el rol anterior a esta separacion; se conserva para que los
// usuarios que ya existian sigan funcionando igual, pero ya no se ofrece al
// crear usuarios nuevos.
const ROLES = {
  admin: { nombre: 'Administrador', descripcion: 'Acceso a todo el sistema', modos: ['bodega', 'domicilio', 'ocurre'] },
  salidas: { nombre: 'Salidas de guias', descripcion: 'Solo bodega MTY <-> CDMX', modos: ['bodega'] },
  llegadas: { nombre: 'Llegadas de guias', descripcion: 'Solo bodega MTY <-> CDMX', modos: ['bodega'] },
  ocurre: { nombre: 'Entregas en ocurre', descripcion: 'Solo entregas en bodega', modos: ['ocurre'] },
  domicilio: { nombre: 'Entregas a domicilio', descripcion: 'Solo entregas a domicilio', modos: ['domicilio'] },
  operador: { nombre: 'Operador (todos los escaneos)', descripcion: 'Rol anterior: los tres tipos de escaneo', modos: ['bodega', 'domicilio', 'ocurre'] },
};

// Los que se pueden elegir al crear o cambiar un usuario
const ROLES_ASIGNABLES = ['admin', 'salidas', 'llegadas', 'ocurre', 'domicilio'];

// Un rol desconocido no puede escanear nada: ante la duda, se niega
function modosDeRol(rol) {
  return ROLES[rol] ? ROLES[rol].modos : [];
}

// Union de los modos de todos los roles de un usuario
function modosDeRoles(roles) {
  const set = new Set();
  for (const rol of roles || []) for (const modo of modosDeRol(rol)) set.add(modo);
  return [...set];
}

function puedeModo(roles, modo) {
  return modosDeRoles(roles).includes(modo);
}

function nombreDeRol(rol) {
  return ROLES[rol] ? ROLES[rol].nombre : rol;
}

function nombresDeRoles(roles) {
  return (roles || []).map(nombreDeRol);
}

function esAdmin(roles) {
  return (roles || []).includes('admin');
}

// Valida una lista de roles y quita duplicados; exige al menos uno
function validarRoles(roles) {
  const lista = [...new Set(Array.isArray(roles) ? roles : [roles].filter(Boolean))];
  if (!lista.length) throw new Error('Selecciona al menos un rol');
  for (const rol of lista) {
    if (!ROLES_ASIGNABLES.includes(rol)) {
      throw new Error(`Rol invalido: "${rol}". Usa: ${ROLES_ASIGNABLES.join(', ')}`);
    }
  }
  return lista;
}

// ---------- Gestion de usuarios ----------

async function listarUsuarios() {
  const { rows } = await pool.query('SELECT id, usuario, nombre, roles, plaza, creado_en FROM usuarios ORDER BY usuario');
  return rows;
}

function normalizarPlaza(plaza) {
  const p = String(plaza || '').trim().toUpperCase();
  if (!p) return null; // sin plaza = puede operar en ambas
  if (!['MTY', 'CDMX'].includes(p)) throw new Error('Plaza invalida (MTY, CDMX o vacia para ambas)');
  return p;
}

async function crearUsuario({ usuario, nombre, password, roles, plaza }) {
  if (!usuario || !/^[a-zA-Z0-9._-]{3,30}$/.test(usuario)) {
    throw new Error('El usuario debe tener de 3 a 30 caracteres (letras, numeros, punto, guion)');
  }
  if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  const rolesValidos = validarRoles(roles);
  try {
    const { rows } = await pool.query(
      'INSERT INTO usuarios (usuario, nombre, password_hash, roles, plaza) VALUES ($1, $2, $3, $4, $5) RETURNING id, usuario, nombre, roles, plaza, creado_en',
      [usuario.trim(), (nombre || usuario).trim(), await hashPassword(password), rolesValidos, normalizarPlaza(plaza)]
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw new Error('Ese usuario ya existe');
    throw e;
  }
}

async function actualizarPlaza(id, plaza) {
  const { rowCount } = await pool.query('UPDATE usuarios SET plaza = $1 WHERE id = $2', [
    normalizarPlaza(plaza),
    id,
  ]);
  if (!rowCount) throw new Error('Usuario no encontrado');
}

// Cambia los roles de un usuario. No se permite cambiar los propios (para no
// quitarse los permisos por error) ni dejar al sistema sin administradores.
async function actualizarRoles(id, roles, solicitante) {
  const rolesValidos = validarRoles(roles);
  if (Number(id) === solicitante.id) throw new Error('No puedes cambiar tus propios roles; pideselo a otro administrador');
  const { rows } = await pool.query('SELECT roles FROM usuarios WHERE id = $1', [id]);
  if (!rows[0]) throw new Error('Usuario no encontrado');
  if (esAdmin(rows[0].roles) && !rolesValidos.includes('admin')) {
    const { rows: admins } = await pool.query(`SELECT COUNT(*)::int AS n FROM usuarios WHERE 'admin' = ANY(roles)`);
    if (admins[0].n <= 1) throw new Error('No puedes quitarle el rol al ultimo administrador');
  }
  await pool.query('UPDATE usuarios SET roles = $1 WHERE id = $2', [rolesValidos, id]);
}

async function eliminarUsuario(id, solicitante) {
  if (Number(id) === solicitante.id) throw new Error('No puedes eliminar tu propio usuario');
  const { rows } = await pool.query('SELECT roles FROM usuarios WHERE id = $1', [id]);
  if (!rows[0]) throw new Error('Usuario no encontrado');
  if (esAdmin(rows[0].roles)) {
    const { rows: admins } = await pool.query(`SELECT COUNT(*)::int AS n FROM usuarios WHERE 'admin' = ANY(roles)`);
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
  ROLES,
  ROLES_ASIGNABLES,
  modosDeRol,
  modosDeRoles,
  puedeModo,
  nombreDeRol,
  nombresDeRoles,
  esAdmin,
  listarUsuarios,
  crearUsuario,
  actualizarPlaza,
  actualizarRoles,
  eliminarUsuario,
  cambiarPassword,
  resetPassword,
};
