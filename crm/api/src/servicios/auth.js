import { consultar, uno, pool } from '../db/pool.js';
import { config } from '../config.js';
import { hashPassword, verificarPassword, tokenSesion, hashToken } from '../lib/cripto.js';
import { ErrorHTTP, noAutenticado, peticionInvalida, noEncontrado, conflicto } from '../lib/errores.js';

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

// ---------------------------------------------------------------- alta y edición

const ROLES = ['admin', 'gerente', 'ejecutivo', 'marketing', 'soporte'];
const EDITABLES = ['nombre', 'rol', 'puesto', 'telefono', 'zona', 'equipo_id', 'meta_mensual', 'activo', 'avatar_tono'];

/**
 * Da de alta a una persona del equipo. La contraseña se define aquí y el usuario
 * la cambia después desde Ajustes; no hay correo de invitación porque el envío
 * todavía no está conectado, y un alta que promete un correo que nunca llega es
 * peor que pedirle la contraseña al administrador.
 */
export async function crearUsuario(datos) {
  const email = String(datos.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw peticionInvalida('El correo no tiene un formato válido.');
  }
  if (!datos.nombre?.trim()) throw peticionInvalida('El nombre es obligatorio.');
  if (!datos.password || datos.password.length < 8) {
    throw peticionInvalida('La contraseña debe tener al menos 8 caracteres.');
  }
  if (datos.rol && !ROLES.includes(datos.rol)) {
    throw peticionInvalida(`El rol debe ser uno de: ${ROLES.join(', ')}.`);
  }

  const repetido = await uno('SELECT id FROM usuarios WHERE lower(email) = $1', [email]);
  if (repetido) throw conflicto('Ya existe un usuario con ese correo.');

  const creado = await uno(
    `INSERT INTO usuarios (email, nombre, password_hash, rol, puesto, telefono, zona,
                           equipo_id, meta_mensual, avatar_tono)
     VALUES ($1,$2,$3,COALESCE($4,'ejecutivo'),$5,$6,$7,$8,COALESCE($9,0),COALESCE($10,0))
     RETURNING id`,
    [
      email, datos.nombre.trim(), hashPassword(datos.password), datos.rol ?? null,
      datos.puesto ?? null, datos.telefono ?? null, datos.zona ?? null,
      datos.equipo_id ?? null, datos.meta_mensual ?? null, datos.avatar_tono ?? null,
    ],
  );
  return porId(creado.id);
}

export async function actualizarUsuario(id, datos, quienEdita) {
  const previo = await uno('SELECT id, rol, activo FROM usuarios WHERE id = $1', [id]);
  if (!previo) throw noEncontrado('usuario');
  if (datos.rol && !ROLES.includes(datos.rol)) {
    throw peticionInvalida(`El rol debe ser uno de: ${ROLES.join(', ')}.`);
  }
  // Nadie puede quitarse a sí mismo el acceso y dejar el sistema sin quien lo administre.
  if (quienEdita?.id === id && datos.activo === false) {
    throw peticionInvalida('No puedes desactivar tu propia cuenta.');
  }
  if (quienEdita?.id === id && datos.rol && datos.rol !== previo.rol && previo.rol === 'admin') {
    throw peticionInvalida('No puedes quitarte a ti mismo el rol de administrador.');
  }

  // `usuarios` no lleva `actualizado_en`, así que no se usa `armarUpdate`; la
  // lista blanca de columnas se aplica igual y nada del cliente entra al SQL.
  const columnas = Object.keys(datos).filter((k) => EDITABLES.includes(k) && datos[k] !== undefined);
  if (columnas.length) {
    const asignaciones = columnas.map((k, i) => `${k} = $${i + 2}`);
    await pool.query(
      `UPDATE usuarios SET ${asignaciones.join(', ')} WHERE id = $1`,
      [id, ...columnas.map((k) => datos[k])],
    );
  }
  // Al desactivar a alguien se cierran sus sesiones: si no, sigue dentro hasta que caduque.
  if (datos.activo === false) await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [id]);
  return porId(id);
}

/** Restablece la contraseña de otra persona; la suya propia se cambia con `cambiarPassword`. */
export async function restablecerPassword(id, nueva) {
  if (!nueva || nueva.length < 8) {
    throw peticionInvalida('La contraseña debe tener al menos 8 caracteres.');
  }
  const usuario = await uno('SELECT id FROM usuarios WHERE id = $1', [id]);
  if (!usuario) throw noEncontrado('usuario');
  await pool.query(
    'UPDATE usuarios SET password_hash = $2, intentos = 0, bloqueado_hasta = NULL WHERE id = $1',
    [id, hashPassword(nueva)],
  );
  await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [id]);
}

export async function crearEquipo(datos) {
  if (!datos.nombre?.trim()) throw peticionInvalida('El nombre del equipo es obligatorio.');
  return uno(
    'INSERT INTO equipos (nombre, zona) VALUES ($1,$2) RETURNING *',
    [datos.nombre.trim(), datos.zona ?? null],
  );
}

export async function actualizarEquipo(id, datos) {
  const equipo = await uno('SELECT id FROM equipos WHERE id = $1', [id]);
  if (!equipo) throw noEncontrado('equipo');
  return uno(
    'UPDATE equipos SET nombre = COALESCE($2, nombre), zona = COALESCE($3, zona) WHERE id = $1 RETURNING *',
    [id, datos.nombre?.trim() ?? null, datos.zona ?? null],
  );
}

export async function eliminarEquipo(id) {
  const borrado = await uno('DELETE FROM equipos WHERE id = $1 RETURNING id', [id]);
  if (!borrado) throw noEncontrado('equipo');
}
