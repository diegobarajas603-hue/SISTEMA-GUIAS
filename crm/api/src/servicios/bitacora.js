import { consultar, pool } from '../db/pool.js';

/**
 * La bitácora es la cronología unificada del CRM. Toda escritura relevante pasa
 * por aquí, y eso hace que la ficha 360 del cliente, el detalle de la oportunidad
 * y el feed del dashboard sean **la misma consulta con otro filtro**.
 *
 * Acepta un cliente de transacción opcional para poder registrar el evento dentro
 * de la misma transacción que la escritura que lo origina.
 */
export async function registrar(evento, tx = null) {
  const ejecutor = tx ?? { consultar: (sql, params) => consultar(sql, params) };
  const filas = await ejecutor.consultar(
    `INSERT INTO bitacora (entidad_tipo, entidad_id, cuenta_id, tipo, titulo, detalle, usuario_id, metadata, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, COALESCE($9, now())) RETURNING *`,
    [
      evento.entidad_tipo, evento.entidad_id, evento.cuenta_id ?? null, evento.tipo,
      evento.titulo, evento.detalle ?? null, evento.usuario_id ?? null,
      JSON.stringify(evento.metadata ?? {}), evento.creado_en ?? null,
    ],
  );
  return filas[0];
}

const SELECT_BASE = `
  SELECT b.*, u.nombre AS usuario_nombre, u.avatar_tono AS usuario_tono
    FROM bitacora b
    LEFT JOIN usuarios u ON u.id = b.usuario_id`;

/** Cronología de una entidad concreta. */
export const deEntidad = (entidadTipo, entidadId, limite = 60) =>
  consultar(`${SELECT_BASE} WHERE b.entidad_tipo = $1 AND b.entidad_id = $2
              ORDER BY b.creado_en DESC LIMIT $3`, [entidadTipo, entidadId, limite]);

/**
 * Cronología completa de una cuenta: incluye lo que ocurrió en sus oportunidades,
 * cotizaciones y tickets, no solo lo registrado contra la cuenta misma. Es lo que
 * hace que la ficha 360 muestre de verdad todo en una pantalla.
 */
export const deCuenta = (cuentaId, { tipos = null, limite = 120 } = {}) =>
  consultar(
    `${SELECT_BASE}
      WHERE (b.cuenta_id = $1 OR (b.entidad_tipo = 'cuenta' AND b.entidad_id = $1))
        AND ($2::text[] IS NULL OR b.tipo = ANY($2))
      ORDER BY b.creado_en DESC LIMIT $3`,
    [cuentaId, tipos, limite],
  );

/** Feed global reciente, para el dashboard. */
export const reciente = ({ usuarioId = null, limite = 40 } = {}) =>
  consultar(
    `${SELECT_BASE}
      WHERE ($1::int IS NULL OR b.usuario_id = $1)
      ORDER BY b.creado_en DESC LIMIT $2`,
    [usuarioId, limite],
  );

export async function notificar({ usuario_id, tipo = 'info', titulo, cuerpo = null, enlace = null }) {
  if (!usuario_id) return null;
  const { rows } = await pool.query(
    `INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, enlace)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [usuario_id, tipo, titulo, cuerpo, enlace],
  );
  return rows[0];
}

export const notificaciones = (usuarioId, { soloNoLeidas = false, limite = 30 } = {}) =>
  consultar(
    `SELECT * FROM notificaciones
      WHERE usuario_id = $1 AND ($2 = false OR leida = false)
      ORDER BY creado_en DESC LIMIT $3`,
    [usuarioId, soloNoLeidas, limite],
  );

export async function marcarLeidas(usuarioId, ids = null) {
  await pool.query(
    `UPDATE notificaciones SET leida = true
      WHERE usuario_id = $1 AND ($2::int[] IS NULL OR id = ANY($2))`,
    [usuarioId, ids],
  );
}
