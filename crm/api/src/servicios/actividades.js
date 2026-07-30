import { consultar, uno, valor, pool } from '../db/pool.js';
import { noEncontrado } from '../lib/errores.js';
import * as bitacora from './bitacora.js';

const SELECT_ACT = `
  SELECT a.*, u.nombre AS usuario_nombre, u.avatar_tono AS usuario_tono,
         c.id AS cuenta_id_ref, c.nombre_comercial AS cuenta_nombre,
         l.nombre AS lead_nombre, o.nombre AS oportunidad_nombre,
         ct.nombre AS contacto_nombre, ct.telefono AS contacto_telefono, ct.email AS contacto_email,
         t.folio AS ticket_folio
    FROM actividades a
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    LEFT JOIN cuentas c ON c.id = a.cuenta_id
    LEFT JOIN leads l ON l.id = a.lead_id
    LEFT JOIN oportunidades o ON o.id = a.oportunidad_id
    LEFT JOIN contactos ct ON ct.id = a.contacto_id
    LEFT JOIN tickets t ON t.id = a.ticket_id`;

export async function listar(filtros = {}, usuario) {
  const {
    tipo, estado, usuarioId, cuenta, oportunidad, lead, desde, hasta,
    soloMios, vencidas, hoy, limite = 200, desplazamiento = 0,
  } = filtros;

  const params = [
    tipo ?? null, estado ?? null,
    soloMios ? usuario.id : (usuarioId ?? null),
    cuenta ?? null, oportunidad ?? null, lead ?? null,
    desde ?? null, hasta ?? null,
    vencidas ? true : false, hoy ? true : false,
    limite, desplazamiento,
  ];

  const donde = `
    WHERE ($1::text IS NULL OR a.tipo = $1)
      AND ($2::text IS NULL OR a.estado = $2)
      AND ($3::int IS NULL OR a.usuario_id = $3)
      AND ($4::int IS NULL OR a.cuenta_id = $4)
      AND ($5::int IS NULL OR a.oportunidad_id = $5)
      AND ($6::int IS NULL OR a.lead_id = $6)
      AND ($7::timestamptz IS NULL OR a.vence_en >= $7)
      AND ($8::timestamptz IS NULL OR a.vence_en <= $8)
      AND ($9 = false OR (a.estado = 'pendiente' AND a.vence_en < date_trunc('day', now())))
      AND ($10 = false OR a.vence_en::date = CURRENT_DATE)`;

  const [filas, total] = await Promise.all([
    consultar(`${SELECT_ACT} ${donde} ORDER BY a.vence_en ASC NULLS LAST LIMIT $11 OFFSET $12`, params),
    valor(`SELECT count(*)::int FROM actividades a ${donde}`, params.slice(0, 10)),
  ]);
  return { filas, total, limite, desplazamiento };
}

/**
 * Agenda: actividades del rango con el conteo por día, para pintar el calendario
 * sin una segunda petición.
 */
export async function agenda(usuario, { desde, hasta, soloMios = true, usuarioId = null }) {
  const idFiltro = soloMios ? usuario.id : usuarioId;
  const [eventos, porDia] = await Promise.all([
    consultar(
      `${SELECT_ACT}
        WHERE a.vence_en >= $1 AND a.vence_en < $2 AND ($3::int IS NULL OR a.usuario_id = $3)
        ORDER BY a.vence_en`,
      [desde, hasta, idFiltro],
    ),
    consultar(
      `SELECT a.vence_en::date AS dia, count(*)::int AS total,
              count(*) FILTER (WHERE a.estado = 'pendiente')::int AS pendientes,
              count(*) FILTER (WHERE a.tipo = 'reunion')::int AS reuniones
         FROM actividades a
        WHERE a.vence_en >= $1 AND a.vence_en < $2 AND ($3::int IS NULL OR a.usuario_id = $3)
        GROUP BY 1 ORDER BY 1`,
      [desde, hasta, idFiltro],
    ),
  ]);
  return { eventos, porDia };
}

export const porId = async (id) => {
  const act = await uno(`${SELECT_ACT} WHERE a.id = $1`, [id]);
  if (!act) throw noEncontrado('actividad');
  return act;
};

export async function crear(datos, usuario) {
  const act = await uno(
    `INSERT INTO actividades (tipo, asunto, descripcion, estado, prioridad, usuario_id, cuenta_id,
                              contacto_id, lead_id, oportunidad_id, ticket_id, inicia_en, vence_en,
                              duracion_min, ubicacion, origen)
     VALUES ($1,$2,$3,COALESCE($4,'pendiente'),COALESCE($5,3),COALESCE($6::int,$16::int),$7,$8,$9,$10,$11,
             $12,COALESCE($13, now() + interval '1 day'),$14,$15,'manual')
     RETURNING *`,
    [
      datos.tipo, datos.asunto, datos.descripcion ?? null, datos.estado ?? null,
      datos.prioridad ?? null, datos.usuario_id ?? null, datos.cuenta_id ?? null,
      datos.contacto_id ?? null, datos.lead_id ?? null, datos.oportunidad_id ?? null,
      datos.ticket_id ?? null, datos.inicia_en ?? null, datos.vence_en ?? null,
      datos.duracion_min ?? null, datos.ubicacion ?? null, usuario.id,
    ],
  );
  await tocarEntidades(act);
  return porId(act.id);
}

const ACTUALIZABLES = [
  'tipo', 'asunto', 'descripcion', 'prioridad', 'usuario_id', 'contacto_id',
  'inicia_en', 'vence_en', 'duracion_min', 'ubicacion', 'resultado',
];

export async function actualizar(id, datos) {
  const previo = await uno('SELECT id FROM actividades WHERE id = $1', [id]);
  if (!previo) throw noEncontrado('actividad');

  // `actividades` no lleva `actualizado_en`, así que no se usa `armarUpdate`; la
  // lista blanca de columnas es la misma idea.
  const columnas = Object.keys(datos).filter(
    (k) => ACTUALIZABLES.includes(k) && datos[k] !== undefined,
  );
  if (columnas.length) {
    const asignaciones = columnas.map((k, i) => `${k} = $${i + 1}`);
    await pool.query(
      `UPDATE actividades SET ${asignaciones.join(', ')} WHERE id = $${columnas.length + 1}`,
      [...columnas.map((k) => datos[k]), id],
    );
  }
  return porId(id);
}

/**
 * Completar una actividad es la acción más repetida del día de un vendedor, así que
 * hace todo de una vez: marca, registra el resultado en la cronología y refresca la
 * «última actividad» de la cuenta y la oportunidad (que es lo que alimenta la
 * detección de estancamiento).
 */
export async function completar(id, { resultado, duracion_min } = {}, usuario) {
  const act = await uno(
    `UPDATE actividades
        SET estado = 'completada', completada_en = now(),
            resultado = COALESCE($2, resultado),
            duracion_min = COALESCE($3, duracion_min)
      WHERE id = $1 RETURNING *`,
    [id, resultado ?? null, duracion_min ?? null],
  );
  if (!act) throw noEncontrado('actividad');

  const ETIQUETAS = {
    llamada: 'Llamada realizada', correo: 'Correo enviado', reunion: 'Reunión realizada',
    whatsapp: 'WhatsApp enviado', tarea: 'Tarea completada', visita: 'Visita realizada',
    seguimiento: 'Seguimiento realizado', demo: 'Demostración realizada',
  };

  const entidad = act.oportunidad_id ? 'oportunidad'
    : act.lead_id ? 'lead'
      : act.ticket_id ? 'ticket' : 'cuenta';
  const entidadId = act.oportunidad_id ?? act.lead_id ?? act.ticket_id ?? act.cuenta_id;

  if (entidadId) {
    await bitacora.registrar({
      entidad_tipo: entidad, entidad_id: entidadId, cuenta_id: act.cuenta_id,
      tipo: act.tipo, titulo: `${ETIQUETAS[act.tipo] ?? 'Actividad'}: ${act.asunto}`,
      detalle: act.resultado, usuario_id: usuario.id,
      metadata: { actividad_id: act.id, tipo: act.tipo },
    });
  }
  await tocarEntidades(act);
  return porId(id);
}

export async function reabrir(id) {
  const act = await uno(
    `UPDATE actividades SET estado = 'pendiente', completada_en = NULL WHERE id = $1 RETURNING *`,
    [id],
  );
  if (!act) throw noEncontrado('actividad');
  return porId(id);
}

export async function eliminar(id) {
  const borrado = await uno('DELETE FROM actividades WHERE id = $1 RETURNING id', [id]);
  if (!borrado) throw noEncontrado('actividad');
}

/**
 * Refresca `ultima_actividad_en` en cuenta, oportunidad y lead. Es el latido que
 * usa el motor de IA para saber qué está vivo y qué se está enfriando.
 */
async function tocarEntidades(act) {
  const tareas = [];
  if (act.cuenta_id) {
    tareas.push(pool.query(
      'UPDATE cuentas SET ultima_actividad_en = now() WHERE id = $1', [act.cuenta_id]));
  }
  if (act.oportunidad_id) {
    tareas.push(pool.query(
      'UPDATE oportunidades SET ultima_actividad_en = now() WHERE id = $1', [act.oportunidad_id]));
  }
  if (act.lead_id) {
    tareas.push(pool.query(
      'UPDATE leads SET ultimo_contacto_en = now() WHERE id = $1', [act.lead_id]));
  }
  await Promise.all(tareas);
}

/** Resumen del día: lo que alimenta «Actividades de hoy» y la respuesta del copiloto. */
export const resumenDia = (usuario, fecha = new Date()) =>
  uno(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE estado = 'completada')::int AS completadas,
       count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
       count(*) FILTER (WHERE tipo = 'llamada')::int AS llamadas,
       count(*) FILTER (WHERE tipo = 'correo')::int AS correos,
       count(*) FILTER (WHERE tipo = 'reunion')::int AS reuniones,
       count(*) FILTER (WHERE tipo = 'whatsapp')::int AS whatsapp,
       count(*) FILTER (WHERE tipo IN ('seguimiento','tarea'))::int AS seguimientos,
       count(*) FILTER (WHERE tipo = 'visita')::int AS visitas,
       COALESCE(sum(duracion_min) FILTER (WHERE estado = 'completada'), 0)::int AS minutos
     FROM actividades
     WHERE vence_en::date = $2::date AND ($1::int IS NULL OR usuario_id = $1)`,
    [usuario.rol === 'ejecutivo' ? usuario.id : null, fecha],
  );
