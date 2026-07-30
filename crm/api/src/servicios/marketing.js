import { consultar, uno, pool } from '../db/pool.js';
import { noEncontrado, peticionInvalida } from '../lib/errores.js';

/**
 * El ROI **no se guarda**: se calcula. Un ROI almacenado queda obsoleto en cuanto se
 * cierra un trato más, y nadie vuelve a confiar en él. Aquí se atribuyen los
 * ingresos ganados a la campaña vía `leads.campana_id` y `oportunidades.campana_id`.
 */
const SELECT_CAMPANA = `
  SELECT ca.*,
    u.nombre AS responsable_nombre,
    (SELECT count(*)::int FROM leads l WHERE l.campana_id = ca.id) AS leads,
    (SELECT count(*)::int FROM leads l WHERE l.campana_id = ca.id
      AND aura_nivel_etapa(l.etapa_max) >= 2) AS leads_calificados,
    (SELECT count(*)::int FROM oportunidades o WHERE o.campana_id = ca.id) AS oportunidades,
    (SELECT count(*)::int FROM oportunidades o
      WHERE o.campana_id = ca.id AND o.estado = 'ganada') AS ganadas,
    COALESCE((SELECT sum(o.monto) FROM oportunidades o
      WHERE o.campana_id = ca.id AND o.estado = 'ganada'), 0)::bigint AS ingresos,
    COALESCE((SELECT sum(o.monto) FROM oportunidades o
      WHERE o.campana_id = ca.id AND o.estado = 'abierta'), 0)::bigint AS pipeline,
    COALESCE((SELECT sum(e.enviados) FROM envios_email e WHERE e.campana_id = ca.id), 0)::int AS enviados,
    COALESCE((SELECT sum(e.abiertos) FROM envios_email e WHERE e.campana_id = ca.id), 0)::int AS abiertos,
    COALESCE((SELECT sum(e.clics) FROM envios_email e WHERE e.campana_id = ca.id), 0)::int AS clics
  FROM campanas ca
  LEFT JOIN usuarios u ON u.id = ca.responsable_id`;

/** Métricas derivadas: se calculan aquí para que la interfaz no tenga que dividir. */
function conMetricas(c) {
  const costo = Number(c.costo) || 0;
  const ingresos = Number(c.ingresos) || 0;
  const leads = c.leads || 0;
  return {
    ...c,
    roi: costo > 0 ? Math.round(((ingresos - costo) / costo) * 100) : null,
    costoPorLead: leads > 0 ? Math.round(costo / leads) : null,
    costoPorOportunidad: c.oportunidades > 0 ? Math.round(costo / c.oportunidades) : null,
    costoPorGanada: c.ganadas > 0 ? Math.round(costo / c.ganadas) : null,
    tasaCalificacion: leads > 0 ? Math.round((c.leads_calificados / leads) * 100) : null,
    tasaConversion: leads > 0 ? Math.round((c.ganadas / leads) * 100) : null,
    tasaApertura: c.enviados > 0 ? Math.round((c.abiertos / c.enviados) * 100) : null,
    tasaClic: c.abiertos > 0 ? Math.round((c.clics / c.abiertos) * 100) : null,
    avanceMeta: c.meta_leads > 0 ? Math.round((leads / c.meta_leads) * 100) : null,
  };
}

export async function listarCampanas(filtros = {}) {
  const { estado, tipo, busqueda } = filtros;
  const filas = await consultar(
    `${SELECT_CAMPANA}
      WHERE ($1::text IS NULL OR ca.estado = $1)
        AND ($2::text IS NULL OR ca.tipo = $2)
        AND ($3::text IS NULL OR lower(ca.nombre) LIKE $3)
      ORDER BY ca.inicia_en DESC NULLS LAST`,
    [estado ?? null, tipo ?? null, busqueda ? `%${busqueda.toLowerCase()}%` : null],
  );
  return filas.map(conMetricas);
}

export async function campanaPorId(id) {
  const campana = await uno(`${SELECT_CAMPANA} WHERE ca.id = $1`, [id]);
  if (!campana) throw noEncontrado('campaña');

  const [envios, leads, oportunidades, landings, porOrigen, serie] = await Promise.all([
    consultar('SELECT * FROM envios_email WHERE campana_id = $1 ORDER BY enviado_en DESC', [id]),
    consultar(
      `SELECT l.id, l.nombre, l.empresa, l.score, l.etapa, l.temperatura, l.creado_en,
              u.nombre AS propietario
         FROM leads l LEFT JOIN usuarios u ON u.id = l.propietario_id
        WHERE l.campana_id = $1 ORDER BY l.score DESC LIMIT 40`, [id]),
    consultar(
      `SELECT o.id, o.nombre, o.monto, o.etapa, o.estado, c.nombre_comercial AS cuenta
         FROM oportunidades o JOIN cuentas c ON c.id = o.cuenta_id
        WHERE o.campana_id = $1 ORDER BY o.monto DESC LIMIT 30`, [id]),
    consultar('SELECT * FROM landing_pages WHERE campana_id = $1', [id]),
    consultar(
      `SELECT origen AS valor, count(*)::int AS total FROM leads
        WHERE campana_id = $1 GROUP BY 1 ORDER BY 2 DESC`, [id]),
    consultar(
      `WITH meses AS (
         SELECT generate_series(date_trunc('month', $2::date), date_trunc('month', now()),
                                interval '1 month') AS mes)
       SELECT to_char(m.mes,'YYYY-MM') AS mes, count(l.id)::int AS leads
         FROM meses m LEFT JOIN leads l
           ON date_trunc('month', l.creado_en) = m.mes AND l.campana_id = $1
        GROUP BY m.mes ORDER BY m.mes`,
      [id, campana.inicia_en ?? new Date()]),
  ]);

  return {
    ...conMetricas(campana),
    // `campana.leads` (del spread de conMetricas) es el CONTEO; aquí se listan los
    // registros bajo otro nombre para no pisarlo — un objeto no puede tener dos
    // valores para la misma clave, y el conteo es lo que usa el embudo de arriba.
    envios, listaLeads: leads, oportunidades, landings,
    porOrigen, serieLeads: serie,
    embudo: [
      { etapa: 'Impactos', total: campana.enviados || null },
      { etapa: 'Interacciones', total: campana.abiertos || null },
      { etapa: 'Leads', total: campana.leads },
      { etapa: 'Calificados', total: campana.leads_calificados },
      { etapa: 'Oportunidades', total: campana.oportunidades },
      { etapa: 'Ganadas', total: campana.ganadas },
    ].filter((e) => e.total !== null),
  };
}

export async function crearCampana(datos, usuario) {
  return uno(
    `INSERT INTO campanas (nombre, tipo, estado, canal, presupuesto, costo, meta_leads,
                           inicia_en, termina_en, utm_source, utm_medium, utm_campaign,
                           responsable_id, descripcion)
     VALUES ($1,COALESCE($2,'email'),COALESCE($3,'borrador'),$4,COALESCE($5,0),COALESCE($6,0),
             COALESCE($7,0),$8,$9,$10,$11,$12,COALESCE($13::int,$14::int),$15) RETURNING *`,
    [
      datos.nombre, datos.tipo ?? null, datos.estado ?? null, datos.canal ?? null,
      datos.presupuesto ?? null, datos.costo ?? null, datos.meta_leads ?? null,
      datos.inicia_en ?? null, datos.termina_en ?? null, datos.utm_source ?? null,
      datos.utm_medium ?? null, datos.utm_campaign ?? null, datos.responsable_id ?? null,
      usuario.id, datos.descripcion ?? null,
    ],
  );
}

export async function actualizarCampana(id, datos) {
  const permitidas = ['nombre', 'tipo', 'estado', 'canal', 'presupuesto', 'costo', 'meta_leads',
    'inicia_en', 'termina_en', 'utm_source', 'utm_medium', 'utm_campaign', 'responsable_id', 'descripcion'];
  const columnas = Object.keys(datos).filter((k) => permitidas.includes(k) && datos[k] !== undefined);
  if (!columnas.length) return campanaPorId(id);
  const asignaciones = columnas.map((k, i) => `${k} = $${i + 1}`);
  const fila = await uno(
    `UPDATE campanas SET ${asignaciones.join(', ')} WHERE id = $${columnas.length + 1} RETURNING id`,
    [...columnas.map((k) => datos[k]), id],
  );
  if (!fila) throw noEncontrado('campaña');
  return campanaPorId(id);
}

export async function eliminarCampana(id) {
  const borrado = await uno('DELETE FROM campanas WHERE id = $1 RETURNING id', [id]);
  if (!borrado) throw noEncontrado('campaña');
}

/** Panorama de marketing: atribución, origen del lead y rendimiento por canal. */
export async function panorama() {
  const [porTipo, porOrigen, resumen, mejores, serie, landings] = await Promise.all([
    consultar(
      `SELECT ca.tipo,
              count(DISTINCT ca.id)::int AS campanas,
              COALESCE(sum(ca.costo),0)::bigint AS costo,
              (SELECT count(*)::int FROM leads l WHERE l.campana_id IN
                (SELECT id FROM campanas WHERE tipo = ca.tipo)) AS leads,
              COALESCE((SELECT sum(o.monto) FROM oportunidades o
                WHERE o.estado = 'ganada' AND o.campana_id IN
                  (SELECT id FROM campanas WHERE tipo = ca.tipo)), 0)::bigint AS ingresos
         FROM campanas ca GROUP BY ca.tipo ORDER BY ingresos DESC`),
    consultar(
      `SELECT l.origen AS valor, count(*)::int AS leads,
              count(*) FILTER (WHERE aura_nivel_etapa(l.etapa_max) >= 2)::int AS calificados,
              COALESCE((SELECT sum(o.monto) FROM oportunidades o
                 WHERE o.estado = 'ganada' AND o.origen = l.origen), 0)::bigint AS ingresos
         FROM leads l GROUP BY l.origen ORDER BY leads DESC`),
    uno(
      `SELECT
         (SELECT count(*)::int FROM campanas WHERE estado = 'activa') AS activas,
         (SELECT COALESCE(sum(costo),0)::bigint FROM campanas
           WHERE inicia_en > CURRENT_DATE - 365) AS inversion_ano,
         (SELECT count(*)::int FROM leads WHERE creado_en > now() - interval '30 days') AS leads_mes,
         (SELECT count(*)::int FROM leads WHERE campana_id IS NOT NULL
           AND creado_en > now() - interval '30 days') AS leads_mes_campana,
         (SELECT COALESCE(sum(o.monto),0)::bigint FROM oportunidades o
           WHERE o.estado = 'ganada' AND o.campana_id IS NOT NULL
             AND o.cerrado_en > now() - interval '365 days') AS ingresos_atribuidos`),
    consultar(`${SELECT_CAMPANA} WHERE ca.costo > 0 ORDER BY
                 (SELECT COALESCE(sum(o.monto),0) FROM oportunidades o
                   WHERE o.campana_id = ca.id AND o.estado = 'ganada') DESC LIMIT 5`),
    consultar(
      `WITH meses AS (
         SELECT generate_series(date_trunc('month', now()) - interval '11 months',
                                date_trunc('month', now()), interval '1 month') AS mes)
       SELECT to_char(m.mes,'YYYY-MM') AS mes,
              count(l.id)::int AS leads,
              count(l.id) FILTER (WHERE l.campana_id IS NOT NULL)::int AS de_campana
         FROM meses m LEFT JOIN leads l ON date_trunc('month', l.creado_en) = m.mes
        GROUP BY m.mes ORDER BY m.mes`),
    consultar(
      `SELECT lp.*, ca.nombre AS campana,
              CASE WHEN lp.visitas > 0
                   THEN round(100.0 * lp.conversiones / lp.visitas, 1) ELSE NULL END AS tasa
         FROM landing_pages lp LEFT JOIN campanas ca ON ca.id = lp.campana_id
        ORDER BY lp.conversiones DESC`),
  ]);

  return {
    resumen, porTipo, porOrigen, serieLeads: serie, landings,
    mejoresCampanas: mejores.map(conMetricas),
  };
}

// ------------------------------------------------------------------ segmentos

const CAMPOS_SEGMENTO = {
  lead: ['score', 'etapa', 'temperatura', 'origen', 'industria', 'tamano_empresa', 'estado', 'intencion', 'urgencia', 'valor_estimado'],
  cuenta: ['tipo', 'industria', 'tamano', 'estado', 'riesgo_churn', 'salud', 'ingresos_ano', 'origen'],
  contacto: ['rol_compra', 'puesto'],
};
const OPERADORES = { '=': '=', '<>': '<>', '>': '>', '>=': '>=', '<': '<', '<=': '<=' };

/**
 * Traduce el árbol de reglas JSONB a SQL. Cada campo se valida contra una lista
 * blanca por entidad y cada valor va parametrizado: nada del cliente llega al SQL
 * como texto.
 */
export function compilarSegmento(entidad, definicion) {
  const tabla = { lead: 'leads', cuenta: 'cuentas', contacto: 'contactos' }[entidad];
  if (!tabla) throw peticionInvalida('Entidad de segmento no válida.');

  const permitidos = CAMPOS_SEGMENTO[entidad];
  const condiciones = [];
  const params = [];

  for (const regla of definicion?.reglas ?? []) {
    if (!permitidos.includes(regla.campo)) {
      throw peticionInvalida(`El campo «${regla.campo}» no se puede usar en un segmento de ${entidad}.`);
    }
    if (regla.op === 'en') {
      if (!Array.isArray(regla.valor) || !regla.valor.length) continue;
      params.push(regla.valor.map(String));
      condiciones.push(`${regla.campo}::text = ANY($${params.length})`);
    } else if (regla.op === 'contiene') {
      params.push(`%${String(regla.valor).toLowerCase()}%`);
      condiciones.push(`lower(${regla.campo}::text) LIKE $${params.length}`);
    } else {
      const op = OPERADORES[regla.op];
      if (!op) throw peticionInvalida(`Operador no soportado: ${regla.op}`);
      params.push(regla.valor);
      condiciones.push(`${regla.campo} ${op} $${params.length}`);
    }
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return { tabla, sql: `SELECT * FROM ${tabla} ${donde}`, conteo: `SELECT count(*)::int FROM ${tabla} ${donde}`, params };
}

export const listarSegmentos = () =>
  consultar('SELECT * FROM segmentos ORDER BY nombre');

export async function evaluarSegmento(id, { limite = 50 } = {}) {
  const seg = await uno('SELECT * FROM segmentos WHERE id = $1', [id]);
  if (!seg) throw noEncontrado('segmento');
  const { sql, conteo, params } = compilarSegmento(seg.entidad, seg.definicion);
  const [filas, total] = await Promise.all([
    consultar(`${sql} LIMIT ${Number(limite) || 50}`, params),
    uno(conteo, params),
  ]);
  const totalNum = Object.values(total)[0];
  await pool.query('UPDATE segmentos SET total_cache = $2 WHERE id = $1', [id, totalNum]);
  return { segmento: seg, total: totalNum, filas };
}

export async function crearSegmento(datos) {
  // Se compila antes de guardar: un segmento inválido no llega a la base.
  compilarSegmento(datos.entidad ?? 'lead', datos.definicion);
  return uno(
    `INSERT INTO segmentos (nombre, descripcion, entidad, definicion, dinamico)
     VALUES ($1,$2,COALESCE($3,'lead'),$4::jsonb,COALESCE($5,true)) RETURNING *`,
    [datos.nombre, datos.descripcion ?? null, datos.entidad ?? null,
      JSON.stringify(datos.definicion ?? { reglas: [] }), datos.dinamico ?? null],
  );
}

export async function eliminarSegmento(id) {
  const borrado = await uno('DELETE FROM segmentos WHERE id = $1 RETURNING id', [id]);
  if (!borrado) throw noEncontrado('segmento');
}

// -------------------------------------------------------------------- envíos

export const listarEnvios = (campanaId = null) =>
  consultar(
    `SELECT e.*, ca.nombre AS campana, s.nombre AS segmento,
            CASE WHEN e.enviados > 0 THEN round(100.0 * e.abiertos / e.enviados, 1) END AS tasa_apertura,
            CASE WHEN e.abiertos > 0 THEN round(100.0 * e.clics / e.abiertos, 1) END AS tasa_clic
       FROM envios_email e
       LEFT JOIN campanas ca ON ca.id = e.campana_id
       LEFT JOIN segmentos s ON s.id = e.segmento_id
      WHERE ($1::int IS NULL OR e.campana_id = $1)
      ORDER BY e.enviado_en DESC NULLS LAST`,
    [campanaId],
  );

/**
 * Crea el envío en estado borrador. **No envía correo**: la integración de correo
 * masivo no está conectada, y un botón que dice «enviado» sin enviar nada es peor
 * que no tener el botón.
 */
export async function crearEnvio(datos) {
  return uno(
    `INSERT INTO envios_email (campana_id, nombre, asunto, plantilla, segmento_id, estado)
     VALUES ($1,$2,$3,$4,$5,'borrador') RETURNING *`,
    [datos.campana_id ?? null, datos.nombre, datos.asunto, datos.plantilla ?? null,
      datos.segmento_id ?? null],
  );
}

export const listarLandings = () =>
  consultar(
    `SELECT lp.*, ca.nombre AS campana,
            CASE WHEN lp.visitas > 0 THEN round(100.0 * lp.conversiones / lp.visitas, 2) END AS tasa
       FROM landing_pages lp LEFT JOIN campanas ca ON ca.id = lp.campana_id
      ORDER BY lp.conversiones DESC`,
  );
