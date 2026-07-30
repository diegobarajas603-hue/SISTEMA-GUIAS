import { consultar, uno } from '../db/pool.js';
import motor from '../ia/motor.js';
import { peticionInvalida } from '../lib/errores.js';

/**
 * Todos los reportes agregan **en Postgres**. Traer 500 filas para sumarlas en JS
 * funciona con la base de la demo y se cae con la de producción; un `GROUP BY`
 * indexado no.
 */

const filtroUsuario = (usuario, alcance) => {
  if (alcance === 'mio' || (alcance === 'auto' && usuario.rol === 'ejecutivo')) return usuario.id;
  return null;
};

/** Ingresos por mes con comparación contra el año anterior y la meta. */
export const ingresos = (usuario, { meses = 12, alcance = 'auto' } = {}) =>
  consultar(
    `WITH periodos AS (
       SELECT generate_series(date_trunc('month', now()) - ($2::int - 1) * interval '1 month',
                              date_trunc('month', now()), interval '1 month') AS mes)
     SELECT to_char(p.mes,'YYYY-MM') AS mes,
       COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'ganada'), 0)::bigint AS ganado,
       count(o.id) FILTER (WHERE o.estado = 'ganada')::int AS operaciones,
       COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'perdida'), 0)::bigint AS perdido,
       COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'ganada' AND o.tipo = 'nuevo'), 0)::bigint AS nuevos,
       COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'ganada' AND o.tipo <> 'nuevo'), 0)::bigint AS existentes,
       COALESCE((SELECT sum(m.objetivo) FROM metas m
                  WHERE m.tipo = 'ingresos' AND m.periodo = p.mes::date
                    AND ($1::int IS NULL OR m.usuario_id = $1)), 0)::bigint AS meta,
       COALESCE((SELECT sum(o2.monto) FROM oportunidades o2
                  WHERE o2.estado = 'ganada'
                    AND date_trunc('month', o2.cerrado_en) = p.mes - interval '1 year'
                    AND ($1::int IS NULL OR o2.propietario_id = $1)), 0)::bigint AS ano_anterior
     FROM periodos p
     LEFT JOIN oportunidades o
       ON date_trunc('month', o.cerrado_en) = p.mes AND o.estado <> 'abierta'
      AND ($1::int IS NULL OR o.propietario_id = $1)
     GROUP BY p.mes ORDER BY p.mes`,
    [filtroUsuario(usuario, alcance), meses],
  );

/** Conversión por vendedor, con ciclo de venta y ticket promedio. */
export const porVendedor = (usuario, { meses = 3 } = {}) =>
  consultar(
    `SELECT u.id, u.nombre, u.avatar_tono, u.puesto, u.zona, e.nombre AS equipo, u.meta_mensual,
       count(o.id) FILTER (WHERE o.estado <> 'abierta')::int AS cerradas,
       count(o.id) FILTER (WHERE o.estado = 'ganada')::int AS ganadas,
       count(o.id) FILTER (WHERE o.estado = 'perdida')::int AS perdidas,
       count(o.id) FILTER (WHERE o.estado = 'abierta')::int AS abiertas,
       COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'ganada'), 0)::bigint AS ingresos,
       COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'abierta'), 0)::bigint AS pipeline,
       CASE WHEN count(o.id) FILTER (WHERE o.estado <> 'abierta') > 0
            THEN round(100.0 * count(o.id) FILTER (WHERE o.estado = 'ganada')
                       / count(o.id) FILTER (WHERE o.estado <> 'abierta'), 1)
       END AS conversion,
       CASE WHEN count(o.id) FILTER (WHERE o.estado = 'ganada') > 0
            THEN (sum(o.monto) FILTER (WHERE o.estado = 'ganada')
                  / count(o.id) FILTER (WHERE o.estado = 'ganada'))::bigint
       END AS ticket_promedio,
       round(avg(EXTRACT(day FROM o.cerrado_en - o.creado_en))
         FILTER (WHERE o.estado = 'ganada'), 1) AS dias_ciclo,
       (SELECT count(*)::int FROM actividades a
         WHERE a.usuario_id = u.id AND a.estado = 'completada'
           AND a.completada_en > now() - ($1 || ' months')::interval) AS actividades
     FROM usuarios u
     LEFT JOIN equipos e ON e.id = u.equipo_id
     LEFT JOIN oportunidades o ON o.propietario_id = u.id
       AND (o.cerrado_en > now() - ($1 || ' months')::interval OR o.estado = 'abierta')
     WHERE u.activo AND u.rol IN ('ejecutivo','gerente')
     GROUP BY u.id, e.nombre
     ORDER BY ingresos DESC`,
    [String(meses)],
  );

/** Velocidad del pipeline: cuánto tarda cada etapa y dónde se atora. */
export const velocidad = () =>
  consultar(
    `SELECT etapa_anterior AS etapa,
            count(*)::int AS transiciones,
            round(avg(dias_en_anterior), 1) AS dias_promedio,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY dias_en_anterior)::numeric, 1) AS dias_mediana,
            round(max(dias_en_anterior), 1) AS dias_max
       FROM etapa_historial
      WHERE entidad_tipo = 'oportunidad' AND etapa_anterior IS NOT NULL
        AND dias_en_anterior IS NOT NULL AND creado_en > now() - interval '12 months'
      GROUP BY etapa_anterior
      ORDER BY aura_nivel_etapa(etapa_anterior)`,
  );

/** Embudo con conversión real, misma lógica que el dashboard. */
export async function embudo(usuario, { alcance = 'auto', meses = 12 } = {}) {
  const id = filtroUsuario(usuario, alcance);
  const fila = await uno(
    `WITH poblacion AS (
       SELECT GREATEST(aura_nivel_etapa(l.etapa_max),
                       COALESCE(max(aura_nivel_etapa(o.etapa_max)), -1)) AS nivel_max,
              GREATEST(aura_nivel_etapa(l.etapa),
                       COALESCE(max(aura_nivel_etapa(o.etapa)), -1)) AS nivel_actual,
              COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'ganada'), 0)::bigint AS ganado
         FROM leads l
         LEFT JOIN oportunidades o ON o.lead_id = l.id
        WHERE l.creado_en > now() - ($2 || ' months')::interval
          AND ($1::int IS NULL OR l.propietario_id = $1)
        GROUP BY l.id, l.etapa_max, l.etapa
       UNION ALL
       SELECT aura_nivel_etapa(o.etapa_max), aura_nivel_etapa(o.etapa),
              CASE WHEN o.estado = 'ganada' THEN o.monto ELSE 0 END::bigint
         FROM oportunidades o
        WHERE o.lead_id IS NULL AND o.creado_en > now() - ($2 || ' months')::interval
          AND ($1::int IS NULL OR o.propietario_id = $1)
     )
     SELECT count(*)::int AS total,
       count(*) FILTER (WHERE nivel_max >= 1)::int AS alc_contacto,
       count(*) FILTER (WHERE nivel_max >= 2)::int AS alc_calificado,
       count(*) FILTER (WHERE nivel_max >= 3)::int AS alc_propuesta,
       count(*) FILTER (WHERE nivel_max >= 4)::int AS alc_negociacion,
       count(*) FILTER (WHERE nivel_max >= 5)::int AS alc_ganado,
       count(*) FILTER (WHERE nivel_actual = 0)::int AS en_lead,
       count(*) FILTER (WHERE nivel_actual = 1)::int AS en_contacto,
       count(*) FILTER (WHERE nivel_actual = 2)::int AS en_calificado,
       count(*) FILTER (WHERE nivel_actual = 3)::int AS en_propuesta,
       count(*) FILTER (WHERE nivel_actual = 4)::int AS en_negociacion,
       count(*) FILTER (WHERE nivel_actual = 5)::int AS en_ganado,
       COALESCE(sum(ganado),0)::bigint AS monto_ganado
     FROM poblacion`,
    [id, String(meses)],
  );

  return motor.construirEmbudo({
    enEtapa: {
      lead: fila.en_lead, contacto: fila.en_contacto, calificado: fila.en_calificado,
      propuesta: fila.en_propuesta, negociacion: fila.en_negociacion, ganado: fila.en_ganado,
    },
    alcanzaron: {
      lead: fila.total, contacto: fila.alc_contacto, calificado: fila.alc_calificado,
      propuesta: fila.alc_propuesta, negociacion: fila.alc_negociacion, ganado: fila.alc_ganado,
    },
  });
}

/**
 * Mapa de calor de actividad: día de la semana × hora. Sirve para saber cuándo se
 * contesta el teléfono, que es información operativa de verdad.
 */
export const mapaCalorActividad = (usuario, { alcance = 'auto', meses = 3 } = {}) =>
  consultar(
    `SELECT EXTRACT(dow FROM completada_en)::int AS dia,
            EXTRACT(hour FROM completada_en)::int AS hora,
            count(*)::int AS total
       FROM actividades
      WHERE estado = 'completada' AND completada_en > now() - ($2 || ' months')::interval
        AND ($1::int IS NULL OR usuario_id = $1)
      GROUP BY 1, 2 ORDER BY 1, 2`,
    [filtroUsuario(usuario, alcance), String(meses)],
  );

/** Rendimiento por industria: dónde ganamos y dónde no. */
export const porIndustria = () =>
  consultar(
    `SELECT c.industria,
            count(DISTINCT c.id)::int AS cuentas,
            count(o.id) FILTER (WHERE o.estado = 'ganada')::int AS ganadas,
            count(o.id) FILTER (WHERE o.estado = 'perdida')::int AS perdidas,
            COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'ganada'), 0)::bigint AS ingresos,
            CASE WHEN count(o.id) FILTER (WHERE o.estado <> 'abierta') > 0
                 THEN round(100.0 * count(o.id) FILTER (WHERE o.estado = 'ganada')
                            / count(o.id) FILTER (WHERE o.estado <> 'abierta'), 1)
            END AS conversion
       FROM cuentas c LEFT JOIN oportunidades o ON o.cuenta_id = c.id
      WHERE c.industria IS NOT NULL
      GROUP BY c.industria ORDER BY ingresos DESC`,
  );

/** Rendimiento por servicio del catálogo. */
export const porProducto = () =>
  consultar(
    `SELECT p.id, p.sku, p.nombre, p.categoria, p.unidad, p.precio_base, p.margen_meta,
            count(DISTINCT o.id) FILTER (WHERE o.estado = 'ganada')::int AS operaciones,
            COALESCE(sum(op.cantidad * op.precio_unitario * (1 - op.descuento_pct/100.0))
              FILTER (WHERE o.estado = 'ganada'), 0)::bigint AS ingresos,
            COALESCE(sum(op.cantidad) FILTER (WHERE o.estado = 'ganada'), 0)::numeric AS unidades,
            round(avg(op.descuento_pct) FILTER (WHERE o.estado = 'ganada'), 1) AS descuento_promedio,
            COALESCE(sum(op.cantidad * (op.precio_unitario - p.costo_base))
              FILTER (WHERE o.estado = 'ganada'), 0)::bigint AS margen
       FROM productos p
       LEFT JOIN oportunidad_productos op ON op.producto_id = p.id
       LEFT JOIN oportunidades o ON o.id = op.oportunidad_id
      GROUP BY p.id ORDER BY ingresos DESC`,
  );

/** Cartera de clientes: concentración y salud. */
export async function cartera() {
  const [top, distribucion, salud, cohortes] = await Promise.all([
    consultar(
      `SELECT c.id, c.nombre, c.nombre_comercial, c.industria, c.ingresos_ano, c.valor_vida,
              c.salud, c.riesgo_churn, u.nombre AS propietario
         FROM cuentas c LEFT JOIN usuarios u ON u.id = c.propietario_id
        WHERE c.tipo = 'cliente' ORDER BY c.ingresos_ano DESC LIMIT 15`),
    consultar(
      `SELECT tamano, count(*)::int AS cuentas,
              COALESCE(sum(ingresos_ano),0)::bigint AS ingresos
         FROM cuentas WHERE tipo = 'cliente' AND tamano IS NOT NULL
        GROUP BY tamano ORDER BY ingresos DESC`),
    uno(
      `SELECT
         count(*) FILTER (WHERE riesgo_churn >= 65)::int AS critico,
         count(*) FILTER (WHERE riesgo_churn >= 40 AND riesgo_churn < 65)::int AS alto,
         count(*) FILTER (WHERE riesgo_churn >= 20 AND riesgo_churn < 40)::int AS medio,
         count(*) FILTER (WHERE riesgo_churn < 20)::int AS bajo,
         COALESCE(sum(ingresos_ano) FILTER (WHERE riesgo_churn >= 55), 0)::bigint AS ingresos_en_riesgo,
         round(avg(salud), 1) AS salud_promedio
       FROM cuentas WHERE tipo = 'cliente'`),
    consultar(
      `SELECT to_char(date_trunc('quarter', cliente_desde), 'YYYY-"T"Q') AS cohorte,
              count(*)::int AS clientes,
              COALESCE(sum(valor_vida),0)::bigint AS valor_vida,
              count(*) FILTER (WHERE tipo = 'inactivo')::int AS perdidos
         FROM cuentas WHERE cliente_desde IS NOT NULL
        GROUP BY 1 ORDER BY 1`),
  ]);

  // Concentración: qué porcentaje de los ingresos depende de los 5 clientes mayores.
  const totalIngresos = await uno(
    `SELECT COALESCE(sum(ingresos_ano),0)::bigint AS t FROM cuentas WHERE tipo = 'cliente'`);
  const top5 = top.slice(0, 5).reduce((s, c) => s + Number(c.ingresos_ano), 0);

  return {
    top, distribucion, salud, cohortes,
    concentracion: {
      top5,
      total: Number(totalIngresos.t),
      porcentaje: Number(totalIngresos.t) > 0 ? Math.round((top5 / Number(totalIngresos.t)) * 100) : 0,
    },
  };
}

/** Motivos de pérdida: la información que más ayuda a corregir el discurso. */
export const perdidas = () =>
  consultar(
    `SELECT motivo_perdida AS motivo, count(*)::int AS total,
            COALESCE(sum(monto),0)::bigint AS monto,
            round(avg(EXTRACT(day FROM cerrado_en - creado_en)), 1) AS dias_promedio
       FROM oportunidades
      WHERE estado = 'perdida' AND motivo_perdida IS NOT NULL
        AND cerrado_en > now() - interval '12 months'
      GROUP BY 1 ORDER BY 2 DESC`,
  );

/** Competencia: contra quién perdemos y con qué frecuencia. */
export const competencia = () =>
  consultar(
    `SELECT competidor,
            count(*)::int AS enfrentamientos,
            count(*) FILTER (WHERE estado = 'ganada')::int AS ganados,
            count(*) FILTER (WHERE estado = 'perdida')::int AS perdidos,
            CASE WHEN count(*) FILTER (WHERE estado <> 'abierta') > 0
                 THEN round(100.0 * count(*) FILTER (WHERE estado = 'ganada')
                            / count(*) FILTER (WHERE estado <> 'abierta'), 1)
            END AS tasa_victoria,
            COALESCE(sum(monto) FILTER (WHERE estado = 'perdida'), 0)::bigint AS monto_perdido
       FROM oportunidades
      WHERE competidor IS NOT NULL AND creado_en > now() - interval '12 months'
      GROUP BY competidor ORDER BY enfrentamientos DESC`,
  );

/** KPIs de encabezado, todo en una consulta. */
export const kpis = (usuario, { alcance = 'auto' } = {}) => {
  const id = filtroUsuario(usuario, alcance);
  return uno(
    `SELECT
       COALESCE((SELECT sum(monto) FROM oportunidades
          WHERE estado = 'ganada' AND cerrado_en >= date_trunc('month', now())
            AND ($1::int IS NULL OR propietario_id = $1)), 0)::bigint AS ingresos_mes,
       COALESCE((SELECT sum(monto) FROM oportunidades
          WHERE estado = 'ganada' AND cerrado_en >= date_trunc('year', now())
            AND ($1::int IS NULL OR propietario_id = $1)), 0)::bigint AS ingresos_ano,
       COALESCE((SELECT sum(monto) FROM oportunidades
          WHERE estado = 'abierta' AND ($1::int IS NULL OR propietario_id = $1)), 0)::bigint AS pipeline,
       (SELECT count(*)::int FROM oportunidades
          WHERE estado = 'abierta' AND ($1::int IS NULL OR propietario_id = $1)) AS oportunidades_abiertas,
       (SELECT round(100.0 * count(*) FILTER (WHERE estado = 'ganada')
                / NULLIF(count(*) FILTER (WHERE estado <> 'abierta'), 0), 1)
          FROM oportunidades
         WHERE cerrado_en > now() - interval '12 months'
           AND ($1::int IS NULL OR propietario_id = $1)) AS conversion,
       (SELECT round(avg(EXTRACT(day FROM cerrado_en - creado_en)), 1) FROM oportunidades
         WHERE estado = 'ganada' AND cerrado_en > now() - interval '12 months'
           AND ($1::int IS NULL OR propietario_id = $1)) AS dias_ciclo,
       (SELECT (avg(monto))::bigint FROM oportunidades
         WHERE estado = 'ganada' AND cerrado_en > now() - interval '12 months'
           AND ($1::int IS NULL OR propietario_id = $1)) AS ticket_promedio,
       (SELECT count(*)::int FROM cuentas WHERE tipo = 'cliente'
          AND ($1::int IS NULL OR propietario_id = $1)) AS clientes,
       (SELECT count(*)::int FROM cuentas WHERE tipo = 'cliente' AND riesgo_churn >= 55
          AND ($1::int IS NULL OR propietario_id = $1)) AS clientes_en_riesgo,
       (SELECT count(*)::int FROM leads
          WHERE creado_en > date_trunc('month', now())
            AND ($1::int IS NULL OR propietario_id = $1)) AS leads_mes`,
    [id],
  );
};

/**
 * Exportación a CSV. Se genera en el servidor con lista blanca de reportes; el
 * cliente solo elige cuál. Escapa comillas según RFC 4180.
 */
export async function exportarCSV(reporte, usuario, opciones = {}) {
  const REPORTES = {
    ingresos: () => ingresos(usuario, opciones),
    vendedores: () => porVendedor(usuario, opciones),
    industrias: () => porIndustria(),
    productos: () => porProducto(),
    perdidas: () => perdidas(),
    competencia: () => competencia(),
    velocidad: () => velocidad(),
  };
  const fn = REPORTES[reporte];
  if (!fn) {
    throw peticionInvalida(`Reporte no disponible. Válidos: ${Object.keys(REPORTES).join(', ')}.`);
  }

  const filas = await fn();
  if (!filas.length) return 'sin datos\n';

  const columnas = Object.keys(filas[0]);
  const escapar = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM para que Excel en Windows reconozca UTF-8 y no rompa los acentos.
  return `﻿${[columnas.join(','), ...filas.map((f) => columnas.map((c) => escapar(f[c])).join(','))].join('\n')}\n`;
}
