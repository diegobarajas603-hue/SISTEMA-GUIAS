import { consultar, uno, pool } from '../db/pool.js';
import { config } from '../config.js';
import { hashPassword, verificarPassword, tokenSesion, hashToken } from '../lib/cripto.js';
import { ErrorHTTP, noAutenticado, peticionInvalida } from '../lib/errores.js';

// Cada columna prefijada con `u.`: el join con `equipos` también tiene `nombre`,
// así que una lista sin prefijo es ambigua para Postgres en cuanto se usa con JOIN.
const CAMPOS_PUBLICOS = `u.id, u.email, u.nombre, u.rol, u.puesto, u.telefono, u.zona, u.equipo_id,
  u.avatar_tono, u.meta_mensual, u.activo, u.preferencias, u.ultimo_acceso`;

export async function login(email, password, ip) {
  const usuario = await uno(
    `SELECT id, email, nombre, rol, password_hash, activo, intentos, bloqueado_hasta
       FROM usuarios WHERE lower(email) = lower($1)`,
    [email],
  );

  // Mensaje idéntico para usuario inexistente y contraseña incorrecta: no se
  // filtra qué correos existen en el sistema.
  const generico = new ErrorHTTP(401, 'credenciales', 'Correo o contraseña incorrectos.');
  if (!usuario) throw generico;
  if (!usuario.activo) throw new ErrorHTTP(403, 'inactivo', 'Esta cuenta está desactivada.');

  if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
    const minutos = Math.ceil((new Date(usuario.bloqueado_hasta) - new Date()) / 60000);
    throw new ErrorHTTP(429, 'bloqueado', `Demasiados intentos. Vuelve a intentar en ${minutos} min.`);
  }

  if (!verificarPassword(password, usuario.password_hash)) {
    const intentos = usuario.intentos + 1;
    const bloquear = intentos >= config.auth.intentosMax;
    await pool.query(
      `UPDATE usuarios SET intentos = $2,
              bloqueado_hasta = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE bloqueado_hasta END
         WHERE id = $1`,
      [usuario.id, bloquear ? 0 : intentos, bloquear, String(config.auth.bloqueoMinutos)],
    );
    throw generico;
  }

  const token = tokenSesion();
  const expira = new Date(Date.now() + config.sesion.horas * 3_600_000);
  await pool.query(
    `INSERT INTO sesiones (token_hash, usuario_id, expira_en, ip) VALUES ($1, $2, $3, $4)`,
    [hashToken(token), usuario.id, expira, ip || null],
  );
  await pool.query(
    `UPDATE usuarios SET intentos = 0, bloqueado_hasta = NULL, ultimo_acceso = now() WHERE id = $1`,
    [usuario.id],
  );

  // Limpieza oportunista de sesiones caducadas: evita una tarea programada solo
  // para esto.
  pool.query('DELETE FROM sesiones WHERE expira_en < now()').catch(() => {});

  return { token, expira, usuario: await porId(usuario.id) };
}

export async function logout(token) {
  if (!token) return;
  await pool.query('DELETE FROM sesiones WHERE token_hash = $1', [hashToken(token)]);
}

export async function usuarioDeToken(token) {
  if (!token) return null;
  const fila = await uno(
    `SELECT ${CAMPOS_PUBLICOS}, e.nombre AS equipo_nombre
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       LEFT JOIN equipos e ON e.id = u.equipo_id
      WHERE s.token_hash = $1 AND s.expira_en > now() AND u.activo`,
    [hashToken(token)],
  );
  return fila;
}

export const porId = (id) =>
  uno(`SELECT ${CAMPOS_PUBLICOS}, e.nombre AS equipo_nombre
         FROM usuarios u LEFT JOIN equipos e ON e.id = u.equipo_id WHERE u.id = $1`, [id]);

export const listar = () =>
  consultar(`SELECT ${CAMPOS_PUBLICOS}, e.nombre AS equipo_nombre,
                    (SELECT count(*)::int FROM oportunidades o
                      WHERE o.propietario_id = u.id AND o.estado = 'abierta') AS oportunidades_abiertas
               FROM usuarios u LEFT JOIN equipos e ON e.id = u.equipo_id
              ORDER BY u.activo DESC, u.nombre`);

export async function cambiarPassword(usuarioId, actual, nueva) {
  if (!nueva || nueva.length < 8) {
    throw peticionInvalida('La nueva contraseña debe tener al menos 8 caracteres.');
  }
  const usuario = await uno('SELECT password_hash FROM usuarios WHERE id = $1', [usuarioId]);
  if (!usuario) throw noAutenticado();
  if (!verificarPassword(actual, usuario.password_hash)) {
    throw peticionInvalida('La contraseña actual no es correcta.');
  }
  await pool.query('UPDATE usuarios SET password_hash = $2 WHERE id = $1', [usuarioId, hashPassword(nueva)]);
  // Al cambiar la contraseña se invalidan las demás sesiones del usuario.
  await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [usuarioId]);
}

export async function guardarPreferencias(usuarioId, preferencias) {
  const fila = await uno(
    `UPDATE usuarios SET preferencias = preferencias || $2::jsonb WHERE id = $1
      RETURNING preferencias`,
    [usuarioId, JSON.stringify(preferencias)],
  );
  return fila?.preferencias ?? {};
}

export const equipos = () =>
  consultar(`SELECT e.*, count(u.id)::int AS miembros
               FROM equipos e LEFT JOIN usuarios u ON u.equipo_id = e.id
              GROUP BY e.id ORDER BY e.nombre`);
