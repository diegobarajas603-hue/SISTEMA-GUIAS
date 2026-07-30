import { consultar, uno, valor, tx, pool } from '../db/pool.js';
import { noEncontrado, peticionInvalida } from '../lib/errores.js';
import * as bitacora from './bitacora.js';
import { dispararEvento } from '../motor/ejecutor.js';

const SLA_POR_PRIORIDAD = { urgente: 4, alta: 8, media: 24, baja: 48 };

const SELECT_TK = `
  SELECT t.*, c.nombre AS cuenta_nombre, c.nombre_comercial AS cuenta_comercial,
         c.riesgo_churn AS cuenta_riesgo, c.ingresos_ano AS cuenta_ingresos,
         ct.nombre AS contacto_nombre, ct.email AS contacto_email, ct.telefono AS contacto_telefono,
         u.nombre AS asignado_nombre, u.avatar_tono AS asignado_tono,
         (t.sla_vence_en < now() AND t.estado IN ('nuevo','abierto','pendiente')) AS sla_incumplido,
         EXTRACT(epoch FROM t.sla_vence_en - now())/3600 AS horas_para_sla,
         (SELECT count(*)::int FROM ticket_mensajes m WHERE m.ticket_id = t.id) AS mensajes
    FROM tickets t
    LEFT JOIN cuentas c ON c.id = t.cuenta_id
    LEFT JOIN contactos ct ON ct.id = t.contacto_id
    LEFT JOIN usuarios u ON u.id = t.asignado_id`;

export async function listar(filtros = {}, usuario) {
  const {
    estado, prioridad, canal, categoria, cuenta, asignado, busqueda,
    soloMios, abiertos, slaVencido, limite = 80, desplazamiento = 0,
  } = filtros;

  const params = [
    estado ?? null, prioridad ?? null, canal ?? null, categoria ?? null, cuenta ?? null,
    soloMios ? usuario.id : (asignado ?? null),
    busqueda ? `%${busqueda.toLowerCase()}%` : null,
    abiertos ? true : false, slaVencido ? true : false,
    limite, desplazamiento,
  ];

  const donde = `
    WHERE ($1::text IS NULL OR t.estado = $1)
      AND ($2::text IS NULL OR t.prioridad = $2)
      AND ($3::text IS NULL OR t.canal = $3)
      AND ($4::text IS NULL OR t.categoria = $4)
      AND ($5::int IS NULL OR t.cuenta_id = $5)
      AND ($6::int IS NULL OR t.asignado_id = $6)
      AND ($7::text IS NULL OR lower(t.asunto) LIKE $7 OR lower(t.folio) LIKE $7
           OR lower(COALESCE(c.nombre,'')) LIKE $7 OR lower(COALESCE(t.guia_relacionada,'')) LIKE $7)
      AND ($8 = false OR t.estado IN ('nuevo','abierto','pendiente'))
      AND ($9 = false OR (t.sla_vence_en < now() AND t.estado IN ('nuevo','abierto','pendiente')))`;

  const [filas, total] = await Promise.all([
    consultar(
      `${SELECT_TK} ${donde}
        ORDER BY CASE t.prioridad WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1
                                  WHEN 'media' THEN 2 ELSE 3 END,
                 t.sla_vence_en ASC NULLS LAST
        LIMIT $10 OFFSET $11`, params),
    valor(`SELECT count(*)::int FROM tickets t LEFT JOIN cuentas c ON c.id = t.cuenta_id ${donde}`,
      params.slice(0, 9)),
  ]);
  return { filas, total, limite, desplazamiento };
}

/** Métricas de la mesa de servicio: SLA, tiempos y satisfacción. */
export const metricas = () =>
  uno(
    `SELECT
       count(*) FILTER (WHERE estado IN ('nuevo','abierto','pendiente'))::int AS abiertos,
       count(*) FILTER (WHERE estado = 'nuevo')::int AS nuevos,
       count(*) FILTER (WHERE estado IN ('nuevo','abierto','pendiente')
         AND sla_vence_en < now())::int AS sla_incumplido,
       count(*) FILTER (WHERE prioridad = 'urgente'
         AND estado IN ('nuevo','abierto','pendiente'))::int AS urgentes,
       count(*) FILTER (WHERE resuelto_en > now() - interval '7 days')::int AS resueltos_semana,
       count(*) FILTER (WHERE ia_resuelto)::int AS resueltos_ia,
       round(avg(EXTRACT(epoch FROM primera_respuesta_en - creado_en) / 3600)
         FILTER (WHERE primera_respuesta_en IS NOT NULL
           AND creado_en > now() - interval '90 days'), 1) AS horas_primera_respuesta,
       round(avg(EXTRACT(epoch FROM resuelto_en - creado_en) / 3600)
         FILTER (WHERE resuelto_en IS NOT NULL
           AND creado_en > now() - interval '90 days'), 1) AS horas_resolucion,
       round(avg(csat) FILTER (WHERE csat IS NOT NULL), 2) AS csat,
       round(100.0 * count(*) FILTER (WHERE resuelto_en IS NOT NULL AND resuelto_en <= sla_vence_en)
         / NULLIF(count(*) FILTER (WHERE resuelto_en IS NOT NULL), 0), 1) AS cumplimiento_sla
     FROM tickets`,
  );

export async function porId(id) {
  const ticket = await uno(`${SELECT_TK} WHERE t.id = $1`, [id]);
  if (!ticket) throw noEncontrado('ticket');

  const [mensajes, actividades, cronologia, sugerencias, otros] = await Promise.all([
    consultar(
      `SELECT m.*, u.nombre AS usuario_nombre, u.avatar_tono AS usuario_tono
         FROM ticket_mensajes m LEFT JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.ticket_id = $1 ORDER BY m.creado_en`, [id]),
    consultar(
      `SELECT a.*, u.nombre AS usuario_nombre FROM actividades a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE a.ticket_id = $1 ORDER BY a.vence_en`, [id]),
    bitacora.deEntidad('ticket', id, 30),
    // Artículos de la base de conocimiento aplicables: la respuesta sugerida sale
    // de aquí, no de un modelo inventando políticas de la empresa.
    consultar(
      `SELECT id, titulo, categoria, cuerpo, utiles FROM articulos_kb
        WHERE publicado AND (categoria = $1
              OR to_tsvector('simple', titulo || ' ' || cuerpo) @@ plainto_tsquery('simple', $2))
        ORDER BY (categoria = $1) DESC, utiles DESC LIMIT 4`,
      [ticket.categoria, ticket.asunto]),
    ticket.cuenta_id
      ? consultar(
        `SELECT id, folio, asunto, estado, creado_en FROM tickets
          WHERE cuenta_id = $1 AND id <> $2 ORDER BY creado_en DESC LIMIT 6`, [ticket.cuenta_id, id])
      : [],
  ]);

  return { ...ticket, mensajes, actividades, cronologia, sugerencias, otrosDeLaCuenta: otros };
}

async function siguienteFolio(t) {
  const ultimo = await t.valor(
    `SELECT COALESCE(max(NULLIF(regexp_replace(folio, '\\D', '', 'g'), '')::int), 0) FROM tickets`,
  );
  return `TK-${String(Number(ultimo) + 1).padStart(5, '0')}`;
}

export async function crear(datos, usuario = null) {
  const resultado = await tx(async (t) => {
    const prioridad = datos.prioridad ?? 'media';
    const slaHoras = SLA_POR_PRIORIDAD[prioridad] ?? 24;
    const folio = await siguienteFolio(t);

    // Asignación al agente de soporte con menos tickets abiertos.
    let asignadoId = datos.asignado_id ?? null;
    if (!asignadoId) {
      const agente = await t.uno(
        `SELECT u.id FROM usuarios u
          WHERE u.activo AND u.rol IN ('soporte','admin')
          ORDER BY (SELECT count(*) FROM tickets tk
                     WHERE tk.asignado_id = u.id
                       AND tk.estado IN ('nuevo','abierto','pendiente')) ASC, u.id
          LIMIT 1`,
      );
      asignadoId = agente?.id ?? null;
    }

    const ticket = await t.uno(
      `INSERT INTO tickets (folio, asunto, descripcion, cuenta_id, contacto_id, canal, categoria,
                            prioridad, estado, asignado_id, sla_horas, sla_vence_en,
                            guia_relacionada, etiquetas)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,'correo'),$7,$8,'nuevo',$9,$10::int,
               now() + ($10::text || ' hours')::interval, $11, COALESCE($12::text[],'{}'))
       RETURNING *`,
      [
        folio, datos.asunto, datos.descripcion ?? null, datos.cuenta_id ?? null,
        datos.contacto_id ?? null, datos.canal ?? null, datos.categoria ?? null,
        prioridad, asignadoId, slaHoras, datos.guia_relacionada ?? null,
        datos.etiquetas ?? null,
      ],
    );

    if (datos.descripcion) {
      await t.consultar(
        `INSERT INTO ticket_mensajes (ticket_id, autor_tipo, cuerpo) VALUES ($1, 'cliente', $2)`,
        [ticket.id, datos.descripcion],
      );
    }

    await bitacora.registrar({
      entidad_tipo: 'ticket', entidad_id: ticket.id, cuenta_id: ticket.cuenta_id, tipo: 'ticket',
      titulo: `Ticket ${folio} · ${ticket.categoria ?? 'general'}`,
      detalle: `${ticket.asunto} · prioridad ${prioridad}, SLA ${slaHoras} h.`,
      usuario_id: usuario?.id ?? null,
      metadata: { folio, prioridad, canal: ticket.canal },
    }, t);

    return ticket;
  });

  if (resultado.asignado_id) {
    await bitacora.notificar({
      usuario_id: resultado.asignado_id,
      tipo: resultado.prioridad === 'urgente' ? 'alerta' : 'info',
      titulo: `Ticket ${resultado.folio} asignado`,
      cuerpo: `${resultado.asunto} · SLA ${resultado.sla_horas} h`,
      enlace: `/soporte/${resultado.id}`,
    }).catch(() => {});
  }
  dispararEvento('ticket.creado', {
    entidad_tipo: 'ticket', entidad_id: resultado.id, cuenta_id: resultado.cuenta_id,
    propietario_id: resultado.asignado_id, prioridad: resultado.prioridad,
  }).catch(() => {});

  return resultado;
}

const ESTADOS = ['nuevo', 'abierto', 'pendiente', 'resuelto', 'cerrado'];

export async function cambiarEstado(id, estadoNuevo, usuario, { csat } = {}) {
  if (!ESTADOS.includes(estadoNuevo)) {
    throw peticionInvalida(`Estado inválido. Válidos: ${ESTADOS.join(', ')}.`);
  }
  const ticket = await uno(
    `UPDATE tickets
        SET estado = $2,
            resuelto_en = CASE WHEN $2 IN ('resuelto','cerrado') THEN COALESCE(resuelto_en, now())
                               ELSE NULL END,
            cerrado_en = CASE WHEN $2 = 'cerrado' THEN now() ELSE NULL END,
            csat = COALESCE($3, csat),
            actualizado_en = now()
      WHERE id = $1 RETURNING *`,
    [id, estadoNuevo, csat ?? null],
  );
  if (!ticket) throw noEncontrado('ticket');

  await bitacora.registrar({
    entidad_tipo: 'ticket', entidad_id: id, cuenta_id: ticket.cuenta_id, tipo: 'ticket',
    titulo: `Ticket ${ticket.folio} → ${estadoNuevo}`, usuario_id: usuario.id,
    metadata: { estado: estadoNuevo },
  });
  return ticket;
}

export async function actualizar(id, datos, usuario) {
  const permitidas = ['asunto', 'prioridad', 'categoria', 'asignado_id', 'sentimiento', 'etiquetas', 'guia_relacionada'];
  const columnas = Object.keys(datos).filter((k) => permitidas.includes(k) && datos[k] !== undefined);
  if (!columnas.length) return porId(id);

  const asignaciones = columnas.map((k, i) => `${k} = $${i + 1}`);
  // Cambiar la prioridad recalcula el SLA desde la creación: es el compromiso real
  // con el cliente, no un contador que se reinicia cada vez que alguien reclasifica.
  const extra = datos.prioridad
    ? `, sla_horas = $${columnas.length + 2}::int,
         sla_vence_en = creado_en + ($${columnas.length + 2}::text || ' hours')::interval`
    : '';
  const params = [...columnas.map((k) => datos[k]), id];
  if (datos.prioridad) params.push(SLA_POR_PRIORIDAD[datos.prioridad] ?? 24);

  const ticket = await uno(
    `UPDATE tickets SET ${asignaciones.join(', ')}${extra}, actualizado_en = now()
      WHERE id = $${columnas.length + 1} RETURNING *`,
    params,
  );
  if (!ticket) throw noEncontrado('ticket');
  void usuario;
  return porId(id);
}

/**
 * Añade un mensaje. Si es la primera respuesta de un agente, sella
 * `primera_respuesta_en` (la métrica de SLA que de verdad se mide) y pasa el ticket
 * a abierto.
 */
export async function responder(id, { cuerpo, autor_tipo = 'agente', interno = false }, usuario) {
  return tx(async (t) => {
    const ticket = await t.uno('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [id]);
    if (!ticket) throw noEncontrado('ticket');

    const mensaje = await t.uno(
      `INSERT INTO ticket_mensajes (ticket_id, autor_tipo, usuario_id, cuerpo, interno)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, autor_tipo, autor_tipo === 'agente' ? usuario.id : null, cuerpo, interno],
    );

    if (autor_tipo === 'agente' && !interno) {
      await t.consultar(
        `UPDATE tickets
            SET primera_respuesta_en = COALESCE(primera_respuesta_en, now()),
                estado = CASE WHEN estado = 'nuevo' THEN 'abierto' ELSE estado END,
                actualizado_en = now()
          WHERE id = $1`,
        [id],
      );
    }
    if (autor_tipo === 'cliente') {
      // Si el cliente responde, el ticket vuelve a estar en la cancha del agente.
      await t.consultar(
        `UPDATE tickets SET estado = CASE WHEN estado IN ('pendiente','resuelto') THEN 'abierto'
                                          ELSE estado END,
                actualizado_en = now() WHERE id = $1`,
        [id],
      );
    }

    return { ...mensaje, usuario_nombre: autor_tipo === 'agente' ? usuario.nombre : null };
  });
}

/**
 * Respuesta sugerida por IA a partir de la base de conocimiento.
 *
 * No inventa políticas: busca el artículo aplicable y lo devuelve como borrador para
 * que un agente lo revise. En un CRM de logística, una respuesta inventada sobre
 * plazos o seguros puede costar dinero de verdad.
 */
export async function sugerirRespuesta(id) {
  const ticket = await uno('SELECT * FROM tickets WHERE id = $1', [id]);
  if (!ticket) throw noEncontrado('ticket');

  const articulos = await consultar(
    `SELECT id, titulo, cuerpo, categoria FROM articulos_kb
      WHERE publicado AND (categoria = $1
            OR to_tsvector('simple', titulo || ' ' || cuerpo) @@ plainto_tsquery('simple', $2))
      ORDER BY (categoria = $1) DESC, utiles DESC LIMIT 3`,
    [ticket.categoria, `${ticket.asunto} ${ticket.descripcion ?? ''}`],
  );

  if (!articulos.length) {
    return {
      disponible: false,
      motivo: 'No hay ningún artículo de la base de conocimiento que aplique a este ticket. '
        + 'Conviene redactar la respuesta a mano y luego documentarla.',
      articulos: [],
    };
  }

  const principal = articulos[0];
  const saludo = 'Hola, gracias por escribirnos.';
  const cierre = 'Quedo al pendiente por cualquier duda adicional.';
  const borrador = `${saludo}\n\n${principal.cuerpo}\n\n${cierre}`;

  await pool.query('UPDATE tickets SET ia_sugerencia = $2 WHERE id = $1', [id, borrador]);

  return {
    disponible: true,
    borrador,
    fuente: { id: principal.id, titulo: principal.titulo },
    articulos,
    // Se dice explícitamente de dónde viene el texto: es un extracto de la base de
    // conocimiento, no una redacción original del modelo.
    aviso: 'Borrador armado con el artículo de la base de conocimiento indicado. Revísalo antes de enviarlo.',
  };
}

export const facetas = async () => {
  const [categorias, canales, agentes] = await Promise.all([
    consultar(`SELECT categoria AS valor, count(*)::int AS total FROM tickets
                WHERE categoria IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`),
    consultar(`SELECT canal AS valor, count(*)::int AS total FROM tickets GROUP BY 1 ORDER BY 2 DESC`),
    consultar(`SELECT u.id, u.nombre, u.avatar_tono,
                      count(t.id) FILTER (WHERE t.estado IN ('nuevo','abierto','pendiente'))::int AS abiertos
                 FROM usuarios u LEFT JOIN tickets t ON t.asignado_id = u.id
                WHERE u.activo AND u.rol IN ('soporte','admin') GROUP BY u.id ORDER BY u.nombre`),
  ]);
  return { categorias, canales, agentes };
};

// ------------------------------------------------------- base de conocimiento

export const listarKB = (busqueda = null) =>
  consultar(
    `SELECT id, titulo, slug, categoria, cuerpo, etiquetas, vistas, utiles, actualizado_en
       FROM articulos_kb
      WHERE publicado
        AND ($1::text IS NULL OR to_tsvector('simple', titulo || ' ' || cuerpo)
             @@ plainto_tsquery('simple', $1))
      ORDER BY categoria, titulo`,
    [busqueda],
  );

export async function verArticulo(id) {
  const art = await uno(
    'UPDATE articulos_kb SET vistas = vistas + 1 WHERE id = $1 RETURNING *', [id]);
  if (!art) throw noEncontrado('artículo');
  return art;
}

export async function crearArticulo(datos, usuario) {
  const slug = (datos.titulo || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80);
  return uno(
    `INSERT INTO articulos_kb (titulo, slug, categoria, cuerpo, etiquetas, autor_id)
     VALUES ($1,$2,$3,$4,COALESCE($5::text[],'{}'),$6) RETURNING *`,
    [datos.titulo, slug, datos.categoria ?? null, datos.cuerpo, datos.etiquetas ?? null, usuario.id],
  );
}
