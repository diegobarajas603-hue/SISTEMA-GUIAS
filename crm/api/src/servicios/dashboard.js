import { consultar, uno } from '../db/pool.js';
import motor from '../ia/motor.js';
import { reciente } from './bitacora.js';

/**
 * El dashboard se resuelve en **una** llamada del cliente. Por dentro son varias
 * consultas agregadas que corren en paralelo: es mucho más rápido que doce
 * peticiones HTTP, y cada consulta agrega en Postgres en lugar de traer filas
 * para sumarlas en JS.
 *
 * `alcance` decide de quién son los números: un ejecutivo ve su cartera, un
 * gerente su equipo, un admin todo.
 */
export async function resumen(usuario, { alcance = 'auto' } = {}) {
  const filtro = resolverAlcance(usuario, alcance);

  const [
    ventasMes, serieMeses, embudo, actividadesHoy, objetivos, ranking,
    clientesNuevos, clientesInactivos, riesgos, proximas, pipeline, insights, feed, contadores,
  ] = await Promise.all([
    ventasDelMes(filtro),
    serieMensual(filtro, 12),
    embudoComercial(filtro),
    resumenActividadesHoy(filtro),
    progresoObjetivos(filtro),
    rankingVendedores(filtro),
    listaClientesNuevos(filtro),
    listaClientesInactivos(filtro),
    oportunidadesEnRiesgo(filtro),
    proximasActividades(filtro),
    resumenPipeline(filtro),
    insightsDestacados(filtro),
    reciente({ usuarioId: null, limite: 18 }),
    contadoresNavegacion(filtro),
  ]);

  const pronostico = motor.pronosticar({
    cerrado: ventasMes.total,
    abiertas: pipeline.abiertas,
    meta: objetivos.metaIngresos,
  });

  return {
    alcance: filtro.descripcion,
    ventasMes, serie: serieMeses, embudo, actividadesHoy, objetivos, ranking,
    clientesNuevos, clientesInactivos, oportunidadesRiesgo: riesgos, proximasActividades: proximas,
    pipeline: pipeline.porEtapa, pronostico, insights, feed, contadores,
  };
}

/**
 * Traduce el rol a una cláusula de filtrado. Devuelve SQL parametrizado, nunca
 * texto interpolado: `sql` solo contiene referencias a $1.
 */
export function resolverAlcance(usuario, alcance = 'auto') {
  const efectivo = alcance === 'auto'
    ? (usuario.rol === 'ejecutivo' ? 'mio' : 'todo')
    : alcance;

  if (efectivo === 'mio') {
    return {
      tipo: 'mio', usuarioIds: [usuario.id], param: [usuario.id],
      descripcion: `Cartera de ${usuario.nombre}`,
    };
  }
  if (efectivo === 'equipo' && usuario.equipo_id) {
    return {
      tipo: 'equipo', equipoId: usuario.equipo_id, param: null,
      descripcion: usuario.equipo_nombre || 'Mi equipo',
    };
  }
  return { tipo: 'todo', param: null, descripcion: 'Toda la operación' };
}

/**
 * Condición reutilizable sobre el propietario. Se genera con un solo parámetro y
 * subconsulta para el caso de equipo, de forma que todas las consultas del
 * dashboard comparten la misma forma.
 */
function condPropietario(filtro, columna = 'propietario_id') {
  if (filtro.tipo === 'mio') return { sql: `AND ${columna} = $1`, params: [filtro.usuarioIds[0]] };
  if (filtro.tipo === 'equipo') {
    return {
      sql: `AND ${columna} IN (SELECT id FROM usuarios WHERE equipo_id = $1)`,
      params: [filtro.equipoId],
    };
  }
  return { sql: '', params: [] };
}

// ---------------------------------------------------------------------------

async function ventasDelMes(filtro) {
  const { sql, params } = condPropietario(filtro, 'o.propietario_id');
  const fila = await uno(
    `SELECT
       COALESCE(sum(o.monto) FILTER (WHERE o.cerrado_en >= date_trunc('month', now())), 0)::bigint AS total,
       count(*) FILTER (WHERE o.cerrado_en >= date_trunc('month', now()))::int AS operaciones,
       COALESCE(sum(o.monto) FILTER (
         WHERE o.cerrado_en >= date_trunc('month', now()) - interval '1 month'
           AND o.cerrado_en < date_trunc('month', now())), 0)::bigint AS mes_anterior,
       COALESCE(sum(o.monto) FILTER (
         WHERE o.cerrado_en >= date_trunc('month', now() - interval '1 year')
           AND o.cerrado_en < date_trunc('month', now() - interval '1 year') + interval '1 month'), 0)::bigint AS mismo_mes_ano_anterior
     FROM oportunidades o
     WHERE o.estado = 'ganada' ${sql}`,
    params,
  );

  const total = Number(fila.total);
  const anterior = Number(fila.mes_anterior);
  return {
    total,
    operaciones: fila.operaciones,
    ticketPromedio: fila.operaciones > 0 ? Math.round(total / fila.operaciones) : 0,
    mesAnterior: anterior,
    variacion: anterior > 0 ? Math.round(((total - anterior) / anterior) * 100) : null,
    anoAnterior: Number(fila.mismo_mes_ano_anterior),
  };
}

/** Serie de ingresos ganados por mes, con los meses vacíos rellenos en SQL. */
async function serieMensual(filtro, meses) {
  const { sql, params } = condPropietario(filtro, 'o.propietario_id');
  return consultar(
    `WITH periodos AS (
       SELECT generate_series(
         date_trunc('month', now()) - ($${params.length + 1}::int - 1) * interval '1 month',
         date_trunc('month', now()), interval '1 month') AS mes
     )
     SELECT to_char(p.mes, 'YYYY-MM') AS mes,
            to_char(p.mes, 'TMMon') AS etiqueta,
            COALESCE(sum(o.monto), 0)::bigint AS ingresos,
            count(o.id)::int AS operaciones,
            COALESCE(sum(o.monto) FILTER (WHERE o.tipo = 'nuevo'), 0)::bigint AS nuevos,
            COALESCE(sum(o.monto) FILTER (WHERE o.tipo <> 'nuevo'), 0)::bigint AS recurrentes
       FROM periodos p
       LEFT JOIN oportunidades o
         ON date_trunc('month', o.cerrado_en) = p.mes AND o.estado = 'ganada' ${sql}
      GROUP BY p.mes ORDER BY p.mes`,
    [...params, meses],
  );
}

/**
 * Embudo de 6 etapas con conversión real.
 *
 * La clave está en definir **una sola población**: cada intento comercial se
 * cuenta una vez. Un intento es un lead (junto con la oportunidad en la que se
 * haya convertido) o una oportunidad nacida directamente sin lead previo
 * (prospección en frío, cliente que llama). Su nivel alcanzado es el máximo entre
 * el suyo y el de su oportunidad.
 *
 * Contar leads y oportunidades por separado —el error obvio— produce conversiones
 * superiores al 100 % en cuanto un lead genera más de una oportunidad, o cuando
 * las ventanas de tiempo de las dos tablas no coinciden.
 */
async function embudoComercial(filtro) {
  const cl = condPropietario(filtro, 'l.propietario_id');
  const co = condPropietario(filtro, 'o.propietario_id');
  // Ambas condiciones usan $1 con el mismo valor, así que un único parámetro sirve.
  const params = cl.params;

  const fila = await uno(
    `WITH poblacion AS (
       -- Un renglón por lead, con el avance máximo entre él y sus oportunidades.
       SELECT GREATEST(
                aura_nivel_etapa(l.etapa_max),
                COALESCE(max(aura_nivel_etapa(o.etapa_max)), -1)
              ) AS nivel_max,
              GREATEST(
                aura_nivel_etapa(l.etapa),
                COALESCE(max(aura_nivel_etapa(o.etapa)), -1)
              ) AS nivel_actual,
              COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'ganada'), 0)::bigint AS ganado
         FROM leads l
         LEFT JOIN oportunidades o ON o.lead_id = l.id
        WHERE l.creado_en > now() - interval '12 months' ${cl.sql}
        GROUP BY l.id, l.etapa_max, l.etapa

       UNION ALL

       -- Oportunidades sin lead: entraron al embudo por su propio pie.
       SELECT aura_nivel_etapa(o.etapa_max), aura_nivel_etapa(o.etapa),
              CASE WHEN o.estado = 'ganada' THEN o.monto ELSE 0 END::bigint
         FROM oportunidades o
        WHERE o.lead_id IS NULL AND o.creado_en > now() - interval '12 months' ${co.sql}
     )
     SELECT
       count(*)::int                                   AS total,
       count(*) FILTER (WHERE nivel_max >= 1)::int     AS alc_contacto,
       count(*) FILTER (WHERE nivel_max >= 2)::int     AS alc_calificado,
       count(*) FILTER (WHERE nivel_max >= 3)::int     AS alc_propuesta,
       count(*) FILTER (WHERE nivel_max >= 4)::int     AS alc_negociacion,
       count(*) FILTER (WHERE nivel_max >= 5)::int     AS alc_ganado,
       count(*) FILTER (WHERE nivel_actual = 0)::int   AS en_lead,
       count(*) FILTER (WHERE nivel_actual = 1)::int   AS en_contacto,
       count(*) FILTER (WHERE nivel_actual = 2)::int   AS en_calificado,
       count(*) FILTER (WHERE nivel_actual = 3)::int   AS en_propuesta,
       count(*) FILTER (WHERE nivel_actual = 4)::int   AS en_negociacion,
       count(*) FILTER (WHERE nivel_actual = 5)::int   AS en_ganado,
       COALESCE(sum(ganado), 0)::bigint                AS monto_ganado
     FROM poblacion`,
    params,
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
  }).map((e) => (e.clave === 'ganado' ? { ...e, monto: Number(fila.monto_ganado) } : e));
}

async function resumenActividadesHoy(filtro) {
  const { sql, params } = condPropietario(filtro, 'a.usuario_id');
  const fila = await uno(
    `SELECT
       count(*) FILTER (WHERE a.tipo = 'llamada')::int AS llamadas,
       count(*) FILTER (WHERE a.tipo = 'correo')::int AS correos,
       count(*) FILTER (WHERE a.tipo = 'reunion')::int AS reuniones,
       count(*) FILTER (WHERE a.tipo = 'whatsapp')::int AS whatsapp,
       count(*) FILTER (WHERE a.tipo IN ('seguimiento','tarea'))::int AS seguimientos,
       count(*) FILTER (WHERE a.tipo = 'visita')::int AS visitas,
       count(*)::int AS total,
       count(*) FILTER (WHERE a.estado = 'completada')::int AS completadas
     FROM actividades a
     WHERE a.vence_en::date = CURRENT_DATE ${sql}`,
    params,
  );

  const vencidas = await uno(
    `SELECT count(*)::int AS n FROM actividades a
      WHERE a.estado = 'pendiente' AND a.vence_en < date_trunc('day', now()) ${sql}`,
    params,
  );

  const cotizaciones = await uno(
    `SELECT count(*)::int AS n FROM cotizaciones c
      WHERE c.creado_en::date = CURRENT_DATE ${condPropietario(filtro, 'c.propietario_id').sql}`,
    condPropietario(filtro, 'c.propietario_id').params,
  );

  return { ...fila, cotizaciones: cotizaciones.n, vencidas: vencidas.n };
}

async function progresoObjetivos(filtro) {
  const { sql, params } = condPropietario(filtro, 'm.usuario_id');
  const metas = await consultar(
    `SELECT m.tipo, sum(m.objetivo)::bigint AS objetivo
       FROM metas m
      WHERE m.periodo = date_trunc('month', CURRENT_DATE)::date ${sql}
      GROUP BY m.tipo`,
    params,
  );

  const co = condPropietario(filtro, 'o.propietario_id');
  const ca = condPropietario(filtro, 'a.usuario_id');
  const cc = condPropietario(filtro, 'c.propietario_id');

  const [ingresos, actividades, cotizaciones] = await Promise.all([
    uno(`SELECT COALESCE(sum(o.monto), 0)::bigint AS v, count(*)::int AS n FROM oportunidades o
          WHERE o.estado = 'ganada' AND o.cerrado_en >= date_trunc('month', now()) ${co.sql}`, co.params),
    uno(`SELECT count(*) FILTER (WHERE a.tipo = 'reunion')::int AS reuniones,
                count(*) FILTER (WHERE a.tipo = 'llamada')::int AS llamadas
           FROM actividades a
          WHERE a.estado = 'completada' AND a.completada_en >= date_trunc('month', now()) ${ca.sql}`, ca.params),
    uno(`SELECT count(*)::int AS n FROM cotizaciones c
          WHERE c.creado_en >= date_trunc('month', now()) ${cc.sql}`, cc.params),
  ]);

  const objetivo = (tipo) => Number(metas.find((m) => m.tipo === tipo)?.objetivo ?? 0);
  const item = (clave, titulo, actual, meta, formato) => ({
    clave, titulo, actual, meta,
    porcentaje: meta > 0 ? Math.min(Math.round((actual / meta) * 100), 999) : null,
    formato,
  });

  return {
    metaIngresos: objetivo('ingresos'),
    items: [
      item('ingresos', 'Ingresos', Number(ingresos.v), objetivo('ingresos'), 'dinero'),
      item('oportunidades', 'Operaciones ganadas', ingresos.n, objetivo('oportunidades') || ingresos.n, 'numero'),
      item('reuniones', 'Reuniones', actividades.reuniones, objetivo('reuniones'), 'numero'),
      item('llamadas', 'Llamadas', actividades.llamadas, objetivo('llamadas'), 'numero'),
      item('cotizaciones', 'Cotizaciones', cotizaciones.n, objetivo('cotizaciones'), 'numero'),
    ].filter((i) => i.meta > 0),
  };
}

/** Ranking del mes: incluye tasa de conversión, no solo importe. */
const rankingVendedores = (filtro) =>
  consultar(
    `SELECT u.id, u.nombre, u.avatar_tono, u.puesto, u.zona, e.nombre AS equipo,
            COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'ganada'
              AND o.cerrado_en >= date_trunc('month', now())), 0)::bigint AS ingresos,
            count(o.id) FILTER (WHERE o.estado = 'ganada'
              AND o.cerrado_en >= date_trunc('month', now()))::int AS ganadas,
            count(o.id) FILTER (WHERE o.estado <> 'abierta'
              AND o.cerrado_en >= date_trunc('month', now()) - interval '3 months')::int AS cerradas_trim,
            count(o.id) FILTER (WHERE o.estado = 'ganada'
              AND o.cerrado_en >= date_trunc('month', now()) - interval '3 months')::int AS ganadas_trim,
            u.meta_mensual,
            COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'abierta'), 0)::bigint AS pipeline
       FROM usuarios u
       LEFT JOIN equipos e ON e.id = u.equipo_id
       LEFT JOIN oportunidades o ON o.propietario_id = u.id
      WHERE u.activo AND u.rol IN ('ejecutivo','gerente')
        AND ($1::int IS NULL OR u.equipo_id = $1)
      GROUP BY u.id, e.nombre
      ORDER BY ingresos DESC`,
    [filtro.tipo === 'equipo' ? filtro.equipoId : null],
  );

const listaClientesNuevos = (filtro) => {
  const { sql, params } = condPropietario(filtro, 'c.propietario_id');
  return consultar(
    `SELECT c.id, c.nombre, c.nombre_comercial, c.industria, c.tamano, c.ciudad, c.estado,
            c.cliente_desde, c.ingresos_ano, u.nombre AS propietario, u.avatar_tono
       FROM cuentas c LEFT JOIN usuarios u ON u.id = c.propietario_id
      WHERE c.tipo = 'cliente' AND c.cliente_desde > CURRENT_DATE - 45 ${sql}
      ORDER BY c.cliente_desde DESC LIMIT 8`,
    params,
  );
};

const listaClientesInactivos = (filtro) => {
  const { sql, params } = condPropietario(filtro, 'c.propietario_id');
  return consultar(
    `SELECT c.id, c.nombre, c.nombre_comercial, c.industria, c.ingresos_ano, c.riesgo_churn,
            c.ultima_actividad_en,
            EXTRACT(day FROM now() - c.ultima_actividad_en)::int AS dias_sin_actividad,
            u.nombre AS propietario, u.avatar_tono
       FROM cuentas c LEFT JOIN usuarios u ON u.id = c.propietario_id
      WHERE c.tipo IN ('cliente','inactivo')
        AND (c.ultima_actividad_en IS NULL OR c.ultima_actividad_en < now() - interval '60 days')
        ${sql}
      ORDER BY c.ingresos_ano DESC NULLS LAST LIMIT 8`,
    params,
  );
};

const oportunidadesEnRiesgo = (filtro) => {
  const { sql, params } = condPropietario(filtro, 'o.propietario_id');
  return consultar(
    `SELECT o.id, o.nombre, o.monto, o.etapa, o.probabilidad, o.ia_probabilidad, o.ia_riesgos,
            o.cierre_estimado, o.ultima_actividad_en,
            EXTRACT(day FROM now() - COALESCE(o.ultima_actividad_en, o.creado_en))::int AS dias_inactiva,
            c.nombre AS cuenta_nombre, c.nombre_comercial AS cuenta_comercial, c.id AS cuenta_id,
            u.nombre AS propietario, u.avatar_tono
       FROM oportunidades o
       JOIN cuentas c ON c.id = o.cuenta_id
       LEFT JOIN usuarios u ON u.id = o.propietario_id
      WHERE o.estado = 'abierta'
        AND (jsonb_array_length(o.ia_riesgos) > 0
             OR o.cierre_estimado < CURRENT_DATE
             OR COALESCE(o.ultima_actividad_en, o.creado_en) < now() - interval '14 days')
        ${sql}
      ORDER BY o.monto DESC LIMIT 8`,
    params,
  );
};

const proximasActividades = (filtro) => {
  const { sql, params } = condPropietario(filtro, 'a.usuario_id');
  return consultar(
    `SELECT a.id, a.tipo, a.asunto, a.vence_en, a.prioridad, a.duracion_min, a.ubicacion, a.origen,
            c.id AS cuenta_id, c.nombre_comercial AS cuenta, l.id AS lead_id, l.nombre AS lead,
            o.id AS oportunidad_id, o.nombre AS oportunidad, ct.nombre AS contacto,
            u.nombre AS usuario, u.avatar_tono
       FROM actividades a
       LEFT JOIN cuentas c ON c.id = a.cuenta_id
       LEFT JOIN leads l ON l.id = a.lead_id
       LEFT JOIN oportunidades o ON o.id = a.oportunidad_id
       LEFT JOIN contactos ct ON ct.id = a.contacto_id
       LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.estado = 'pendiente' AND a.vence_en < now() + interval '10 days' ${sql}
      ORDER BY a.vence_en LIMIT 12`,
    params,
  );
};

async function resumenPipeline(filtro) {
  const { sql, params } = condPropietario(filtro, 'o.propietario_id');
  const [porEtapa, abiertas] = await Promise.all([
    consultar(
      `SELECT o.etapa, count(*)::int AS operaciones, sum(o.monto)::bigint AS monto,
              round(avg(COALESCE(o.ia_probabilidad, o.probabilidad)))::int AS probabilidad_media,
              sum(o.monto * COALESCE(o.ia_probabilidad, o.probabilidad) / 100.0)::bigint AS ponderado
         FROM oportunidades o WHERE o.estado = 'abierta' ${sql}
        GROUP BY o.etapa`,
      params,
    ),
    consultar(
      `SELECT o.id, o.monto, o.probabilidad, o.ia_probabilidad, o.cierre_estimado
         FROM oportunidades o WHERE o.estado = 'abierta' ${sql}`,
      params,
    ),
  ]);
  return { porEtapa, abiertas };
}

const insightsDestacados = (filtro) => {
  const { sql, params } = condPropietario(filtro, 'i.usuario_id');
  return consultar(
    `SELECT i.*, CASE i.entidad_tipo
              WHEN 'cuenta' THEN (SELECT nombre_comercial FROM cuentas WHERE id = i.entidad_id)
              WHEN 'oportunidad' THEN (SELECT nombre FROM oportunidades WHERE id = i.entidad_id)
              WHEN 'lead' THEN (SELECT nombre FROM leads WHERE id = i.entidad_id)
            END AS entidad_nombre
       FROM ia_insights i
      WHERE i.estado IN ('nuevo','visto') ${sql}
      ORDER BY CASE i.severidad WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
               i.impacto DESC
      LIMIT 10`,
    params,
  );
};

/** Contadores para los badges de la navegación. */
async function contadoresNavegacion(filtro) {
  const ca = condPropietario(filtro, 'a.usuario_id');
  const co = condPropietario(filtro, 'o.propietario_id');
  const cl = condPropietario(filtro, 'l.propietario_id');

  const [act, tickets, ops, leads] = await Promise.all([
    uno(`SELECT count(*) FILTER (WHERE a.vence_en::date = CURRENT_DATE)::int AS hoy,
                count(*) FILTER (WHERE a.vence_en < date_trunc('day', now()))::int AS vencidas
           FROM actividades a WHERE a.estado = 'pendiente' ${ca.sql}`, ca.params),
    uno(`SELECT count(*) FILTER (WHERE estado IN ('nuevo','abierto'))::int AS abiertos,
                count(*) FILTER (WHERE estado IN ('nuevo','abierto','pendiente')
                  AND sla_vence_en < now())::int AS sla_vencido
           FROM tickets`),
    uno(`SELECT count(*)::int AS abiertas FROM oportunidades o WHERE o.estado = 'abierta' ${co.sql}`, co.params),
    uno(`SELECT count(*)::int AS nuevos FROM leads l
          WHERE l.etapa = 'lead' AND l.creado_en > now() - interval '7 days' ${cl.sql}`, cl.params),
  ]);

  return {
    actividadesHoy: act.hoy, actividadesVencidas: act.vencidas,
    ticketsAbiertos: tickets.abiertos, ticketsSlaVencido: tickets.sla_vencido,
    oportunidadesAbiertas: ops.abiertas, prospectosNuevos: leads.nuevos,
  };
}

export { contadoresNavegacion };
