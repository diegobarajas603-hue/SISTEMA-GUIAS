/**
 * ============================================================================
 *  HERRAMIENTAS DEL COPILOTO
 * ============================================================================
 *
 *  Cada herramienta es una consulta real al CRM. El copiloto **no recibe un volcado
 *  de la base en el prompt**: pregunta por lo que necesita, se le entregan datos
 *  frescos y con ellos redacta.
 *
 *  Dos propiedades importantes:
 *
 *  1. **La IA hereda los permisos del usuario.** Toda herramienta recibe el usuario
 *     de la sesión y filtra por él cuando es ejecutivo. No hay forma de ver por chat
 *     algo que no se pueda ver en la interfaz.
 *  2. **Cada resultado trae `fuente`** — a qué pantalla ir a verificarlo. Una cifra
 *     sin trazabilidad no sirve para una junta.
 */

import { consultar, uno, valor } from '../db/pool.js';
import motor from './motor.js';
import * as reportes from '../servicios/reportes.js';
import * as actividades from '../servicios/actividades.js';
import * as oportunidadesSrv from '../servicios/oportunidades.js';

/** Un ejecutivo ve su cartera; gerentes y admin ven todo. */
const propio = (usuario) => (usuario.rol === 'ejecutivo' ? usuario.id : null);

// ---------------------------------------------------------------------------
//  Implementaciones
// ---------------------------------------------------------------------------

const IMPL = {
  /** «¿Cuáles son mis oportunidades más cercanas a cerrar?» */
  async oportunidades_por_cerrar({ dias = 30, limite = 10 }, usuario) {
    const filas = await consultar(
      `SELECT o.id, o.nombre, o.monto, o.etapa, o.probabilidad, o.ia_probabilidad,
              o.cierre_estimado, c.nombre_comercial AS cuenta, u.nombre AS propietario,
              (o.cierre_estimado - CURRENT_DATE)::int AS dias_para_cierre
         FROM oportunidades o
         JOIN cuentas c ON c.id = o.cuenta_id
         LEFT JOIN usuarios u ON u.id = o.propietario_id
        WHERE o.estado = 'abierta'
          AND o.cierre_estimado <= CURRENT_DATE + ($2 || ' days')::interval
          AND ($1::int IS NULL OR o.propietario_id = $1)
        ORDER BY COALESCE(o.ia_probabilidad, o.probabilidad) DESC, o.monto DESC
        LIMIT $3`,
      [propio(usuario), String(dias), limite],
    );
    return {
      total: filas.length,
      monto_total: filas.reduce((s, f) => s + Number(f.monto), 0),
      oportunidades: filas,
      fuente: '/oportunidades',
    };
  },

  /** «¿Qué clientes llevan más de 20 días sin seguimiento?» */
  async cuentas_sin_seguimiento({ dias = 20, limite = 15 }, usuario) {
    const filas = await consultar(
      `SELECT c.id, c.nombre, c.nombre_comercial, c.ingresos_ano, c.riesgo_churn, c.tipo,
              c.ultima_actividad_en, u.nombre AS propietario,
              EXTRACT(day FROM now() - c.ultima_actividad_en)::int AS dias_sin_contacto
         FROM cuentas c LEFT JOIN usuarios u ON u.id = c.propietario_id
        WHERE c.tipo IN ('cliente','prospecto')
          AND (c.ultima_actividad_en IS NULL
               OR c.ultima_actividad_en < now() - ($2 || ' days')::interval)
          AND ($1::int IS NULL OR c.propietario_id = $1)
        ORDER BY c.ingresos_ano DESC NULLS LAST LIMIT $3`,
      [propio(usuario), String(dias), limite],
    );
    return {
      total: filas.length,
      ingresos_en_juego: filas.reduce((s, f) => s + Number(f.ingresos_ano || 0), 0),
      cuentas: filas,
      fuente: '/clientes',
    };
  },

  /** «¿Qué vendedor tiene mejor conversión?» */
  async conversion_por_vendedor({ meses = 3 }, usuario) {
    const filas = await reportes.porVendedor(usuario, { meses });
    const conCierres = filas.filter((f) => f.cerradas >= 3);
    return {
      // Se excluye a quien tiene menos de 3 operaciones cerradas: con una muestra de
      // 1 o 2, un 100 % de conversión no significa nada y engañaría al gerente.
      criterio: 'Solo se comparan vendedores con al menos 3 operaciones cerradas en el periodo.',
      periodo_meses: meses,
      vendedores: conCierres.sort((a, b) => Number(b.conversion) - Number(a.conversion)),
      excluidos: filas.length - conCierres.length,
      fuente: '/reportes',
    };
  },

  /** «Resume la actividad de hoy.» */
  async resumen_de_hoy(_args, usuario) {
    const [dia, pendientes, cerradas, nuevos] = await Promise.all([
      actividades.resumenDia(usuario),
      consultar(
        `SELECT a.tipo, a.asunto, a.vence_en, a.prioridad,
                COALESCE(c.nombre_comercial, l.nombre, o.nombre) AS relacionado
           FROM actividades a
           LEFT JOIN cuentas c ON c.id = a.cuenta_id
           LEFT JOIN leads l ON l.id = a.lead_id
           LEFT JOIN oportunidades o ON o.id = a.oportunidad_id
          WHERE a.estado = 'pendiente' AND a.vence_en::date <= CURRENT_DATE
            AND ($1::int IS NULL OR a.usuario_id = $1)
          ORDER BY a.prioridad, a.vence_en LIMIT 12`, [propio(usuario)]),
      consultar(
        `SELECT o.nombre, o.monto, c.nombre_comercial AS cuenta, o.estado
           FROM oportunidades o JOIN cuentas c ON c.id = o.cuenta_id
          WHERE o.cerrado_en::date = CURRENT_DATE
            AND ($1::int IS NULL OR o.propietario_id = $1)`, [propio(usuario)]),
      valor(
        `SELECT count(*)::int FROM leads
          WHERE creado_en::date = CURRENT_DATE AND ($1::int IS NULL OR propietario_id = $1)`,
        [propio(usuario)]),
    ]);
    return {
      actividades: dia,
      pendientes_hoy: pendientes,
      cerradas_hoy: cerradas,
      prospectos_nuevos: nuevos,
      fuente: '/agenda',
    };
  },

  /** Pronóstico del mes con el modelo probabilístico. */
  async pronostico(_args, usuario) {
    const p = await oportunidadesSrv.pronostico(usuario, { alcance: 'auto' });
    return {
      ...p,
      metodo: 'Suma de Bernoulli ponderada por monto; la probabilidad de alcanzar la meta '
        + 'es la cola de una distribución normal aproximada, no una estimación cualitativa.',
      fuente: '/reportes',
    };
  },

  /** Riesgos detectados: estancamiento, fechas vencidas, churn. */
  async riesgos_detectados({ limite = 10 }, usuario) {
    const filas = await consultar(
      `SELECT i.tipo, i.titulo, i.explicacion, i.confianza, i.impacto, i.severidad,
              i.entidad_tipo, i.entidad_id, i.acciones
         FROM ia_insights i
        WHERE i.estado IN ('nuevo','visto')
          AND i.tipo IN ('riesgo','estancada','churn')
          AND ($1::int IS NULL OR i.usuario_id = $1)
        ORDER BY CASE i.severidad WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END,
                 i.impacto DESC LIMIT $2`,
      [propio(usuario), limite],
    );
    return {
      total: filas.length,
      impacto_total: filas.reduce((s, f) => s + Number(f.impacto || 0), 0),
      riesgos: filas,
      fuente: '/oportunidades',
    };
  },

  /** Siguiente mejor acción, ordenada por valor esperado. */
  async siguiente_mejor_accion({ limite = 8 }, usuario) {
    const id = propio(usuario);
    const [ops, leads, cuentas, vencidas, cots] = await Promise.all([
      consultar(
        `SELECT o.id, o.nombre, o.monto, o.etapa, o.estado, o.probabilidad, o.ia_probabilidad,
                o.cierre_estimado, o.ultima_actividad_en, o.creado_en, c.nombre_comercial AS cuenta_nombre
           FROM oportunidades o JOIN cuentas c ON c.id = o.cuenta_id
          WHERE o.estado = 'abierta' AND ($1::int IS NULL OR o.propietario_id = $1)`, [id]),
      consultar(
        `SELECT id, nombre, empresa, score, etapa, valor_estimado, ultimo_contacto_en, creado_en
           FROM leads
          WHERE etapa NOT IN ('ganado','perdido') AND ($1::int IS NULL OR propietario_id = $1)`, [id]),
      consultar(
        `SELECT id, nombre, riesgo_churn, ingresos_ano FROM cuentas
          WHERE tipo = 'cliente' AND riesgo_churn >= 55
            AND ($1::int IS NULL OR propietario_id = $1)`, [id]),
      consultar(
        `SELECT id, asunto, tipo, vence_en FROM actividades
          WHERE estado = 'pendiente' AND vence_en < date_trunc('day', now())
            AND ($1::int IS NULL OR usuario_id = $1) LIMIT 20`, [id]),
      consultar(
        `SELECT q.id, q.folio, q.total, q.enviada_en, q.vista_en, c.nombre_comercial AS cuenta_nombre
           FROM cotizaciones q JOIN cuentas c ON c.id = q.cuenta_id
          WHERE q.estado IN ('enviada','vista') AND ($1::int IS NULL OR q.propietario_id = $1)`, [id]),
    ]);

    const acciones = motor.siguienteMejorAccion({
      oportunidades: ops, leads, cuentas,
      actividadesVencidas: vencidas, cotizacionesSinRespuesta: cots,
    });
    return { total: acciones.length, acciones: acciones.slice(0, limite), fuente: '/' };
  },

  /** Busca cualquier entidad por nombre: resuelve «este cliente» o «esa oportunidad». */
  async buscar_entidad({ termino, tipo = null }, _usuario) {
    const { buscar } = await import('../servicios/catalogo.js');
    const r = await buscar(termino, { limite: 8 });
    return {
      termino,
      resultados: tipo ? r.resultados.filter((x) => x.tipo === tipo) : r.resultados,
    };
  },

  /** Ficha resumida de una cuenta, para responder «¿qué hago con este cliente?». */
  async contexto_cuenta({ cuenta_id }, _usuario) {
    const { ficha360 } = await import('../servicios/cuentas.js');
    const f = await ficha360(cuenta_id);
    // Se recorta a lo relevante: mandar la ficha completa al modelo desperdicia
    // contexto y no mejora la respuesta.
    return {
      cuenta: {
        id: f.id, nombre: f.nombre, industria: f.industria, tamano: f.tamano,
        tipo: f.tipo, salud: f.salud, riesgo_churn: f.riesgo_churn,
        ingresos_ano: f.ingresos_ano, valor_vida: f.valor_vida,
        cliente_desde: f.cliente_desde, ultima_actividad_en: f.ultima_actividad_en,
        propietario: f.propietario_nombre, dias_credito: f.dias_credito,
      },
      contactos: f.contactos.map((c) => ({ nombre: c.nombre, puesto: c.puesto, rol_compra: c.rol_compra })),
      mapa_poder: f.mapaPoder,
      oportunidades_abiertas: f.oportunidades.filter((o) => o.estado === 'abierta')
        .map((o) => ({ nombre: o.nombre, monto: o.monto, etapa: o.etapa, cierre: o.cierre_estimado })),
      servicios_contratados: f.productos.map((p) => p.nombre),
      tickets_abiertos: f.tickets.filter((t) => ['nuevo', 'abierto', 'pendiente'].includes(t.estado)).length,
      facturacion: { ano: f.facturacion.ano, por_cobrar: f.facturacion.por_cobrar, vencido: f.facturacion.vencido },
      insights: f.insights.map((i) => ({ tipo: i.tipo, titulo: i.titulo, explicacion: i.explicacion })),
      ultimos_movimientos: f.cronologia.slice(0, 8).map((b) => ({ fecha: b.creado_en, titulo: b.titulo })),
      fuente: `/clientes/${f.id}`,
    };
  },

  /** Ficha resumida de una oportunidad con su análisis. */
  async contexto_oportunidad({ oportunidad_id }, _usuario) {
    const op = await oportunidadesSrv.porId(oportunidad_id);
    return {
      oportunidad: {
        id: op.id, nombre: op.nombre, cuenta: op.cuenta_nombre, monto: op.monto,
        etapa: op.etapa, probabilidad_vendedor: op.probabilidad,
        probabilidad_ia: op.analisis.probabilidad, cierre_estimado: op.cierre_estimado,
        competidor: op.competidor, siguiente_paso: op.siguiente_paso,
        dias_inactiva: op.dias_inactiva,
      },
      riesgos: op.analisis.riesgos,
      acciones_recomendadas: op.analisis.acciones,
      factores: op.analisis.factores,
      mapa_poder: op.mapaPoder,
      productos: op.productos.map((p) => ({ nombre: p.nombre, cantidad: p.cantidad, importe: p.importe })),
      cotizaciones: op.cotizaciones.map((c) => ({ folio: c.folio, estado: c.estado, total: c.total })),
      fuente: `/oportunidades/${op.id}`,
    };
  },

  /** Prospectos con mayor puntuación, con la explicación del score. */
  async mejores_prospectos({ limite = 10, scoreMin = 60 }, usuario) {
    const filas = await consultar(
      `SELECT id, nombre, empresa, score, temperatura, score_motivos, etapa, valor_estimado,
              necesidad, ultimo_contacto_en, creado_en
         FROM leads
        WHERE etapa NOT IN ('ganado','perdido') AND score >= $2
          AND ($1::int IS NULL OR propietario_id = $1)
        ORDER BY score DESC LIMIT $3`,
      [propio(usuario), scoreMin, limite],
    );
    return { total: filas.length, prospectos: filas, fuente: '/prospectos' };
  },

  /** Oportunidades de venta cruzada detectadas. */
  async venta_cruzada({ limite = 8 }, usuario) {
    const filas = await consultar(
      `SELECT i.titulo, i.explicacion, i.confianza, i.impacto, i.entidad_id,
              c.nombre_comercial AS cuenta
         FROM ia_insights i JOIN cuentas c ON c.id = i.entidad_id
        WHERE i.tipo = 'venta_cruzada' AND i.estado IN ('nuevo','visto')
          AND i.entidad_tipo = 'cuenta' AND ($1::int IS NULL OR i.usuario_id = $1)
        ORDER BY i.impacto DESC LIMIT $2`,
      [propio(usuario), limite],
    );
    return {
      total: filas.length,
      impacto_total: filas.reduce((s, f) => s + Number(f.impacto), 0),
      sugerencias: filas,
      fuente: '/clientes',
    };
  },

  /** Estado del embudo con conversión real. */
  async embudo(_args, usuario) {
    const e = await reportes.embudo(usuario, { alcance: 'auto' });
    const peor = [...e].slice(1).sort((a, b) => a.porcentajePaso - b.porcentajePaso)[0];
    return {
      etapas: e,
      cuello_de_botella: peor
        ? { etapa: peor.titulo, conversion: peor.porcentajePaso, se_pierden: peor.caida }
        : null,
      fuente: '/reportes',
    };
  },

  /** Métricas de la mesa de servicio. */
  async estado_soporte(_args, _usuario) {
    const { metricas } = await import('../servicios/tickets.js');
    return { ...(await metricas()), fuente: '/soporte' };
  },
};

// ---------------------------------------------------------------------------
//  Definiciones para el modelo (formato de la API de Claude)
// ---------------------------------------------------------------------------

export const DEFINICIONES = [
  {
    name: 'oportunidades_por_cerrar',
    description: 'Oportunidades abiertas con fecha de cierre próxima, ordenadas por probabilidad. Úsala para «qué está por cerrar», «qué cierro este mes».',
    input_schema: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Ventana en días hacia adelante (30 por defecto).' },
        limite: { type: 'integer' },
      },
    },
  },
  {
    name: 'cuentas_sin_seguimiento',
    description: 'Clientes y prospectos sin actividad registrada en N días, ordenados por facturación. Úsala para «quién lleva X días sin seguimiento», «a quién tengo abandonado».',
    input_schema: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Días sin contacto (20 por defecto).' },
        limite: { type: 'integer' },
      },
    },
  },
  {
    name: 'conversion_por_vendedor',
    description: 'Tasa de conversión, ingresos, ciclo de venta y ticket promedio por vendedor. Úsala para comparar desempeño del equipo.',
    input_schema: {
      type: 'object',
      properties: { meses: { type: 'integer', description: 'Periodo en meses (3 por defecto).' } },
    },
  },
  {
    name: 'resumen_de_hoy',
    description: 'Actividades del día, pendientes, operaciones cerradas hoy y prospectos nuevos. Úsala para «resume el día», «qué tengo hoy».',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'pronostico',
    description: 'Pronóstico de cierre del mes con proyección, rango, probabilidad de alcanzar la meta y ritmo requerido.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'riesgos_detectados',
    description: 'Riesgos activos: oportunidades estancadas, fechas vencidas y clientes con riesgo de fuga, con su explicación.',
    input_schema: { type: 'object', properties: { limite: { type: 'integer' } } },
  },
  {
    name: 'siguiente_mejor_accion',
    description: 'Lista priorizada por valor esperado de lo que conviene hacer ahora. Úsala para «qué hago primero», «por dónde empiezo».',
    input_schema: { type: 'object', properties: { limite: { type: 'integer' } } },
  },
  {
    name: 'buscar_entidad',
    description: 'Busca cuentas, contactos, prospectos, oportunidades, cotizaciones o tickets por nombre o folio. Úsala cuando el usuario menciona una empresa o persona por su nombre.',
    input_schema: {
      type: 'object',
      properties: {
        termino: { type: 'string' },
        tipo: { type: 'string', enum: ['cuenta', 'contacto', 'lead', 'oportunidad', 'cotizacion', 'ticket'] },
      },
      required: ['termino'],
    },
  },
  {
    name: 'contexto_cuenta',
    description: 'Ficha completa de una cuenta: salud, riesgo de fuga, contactos con su rol de compra, oportunidades, facturación e insights. Úsala para «qué hago con este cliente».',
    input_schema: {
      type: 'object',
      properties: { cuenta_id: { type: 'integer' } },
      required: ['cuenta_id'],
    },
  },
  {
    name: 'contexto_oportunidad',
    description: 'Detalle de una oportunidad con su análisis: probabilidad, riesgos, factores y acciones recomendadas.',
    input_schema: {
      type: 'object',
      properties: { oportunidad_id: { type: 'integer' } },
      required: ['oportunidad_id'],
    },
  },
  {
    name: 'mejores_prospectos',
    description: 'Prospectos mejor puntuados con el desglose de por qué. Úsala para «a quién llamo primero», «qué prospectos valen la pena».',
    input_schema: {
      type: 'object',
      properties: { limite: { type: 'integer' }, scoreMin: { type: 'integer' } },
    },
  },
  {
    name: 'venta_cruzada',
    description: 'Cuentas candidatas a venta cruzada o adicional, con el servicio sugerido y el impacto estimado.',
    input_schema: { type: 'object', properties: { limite: { type: 'integer' } } },
  },
  {
    name: 'embudo',
    description: 'Embudo comercial con conversión real por etapa e identificación del cuello de botella.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'estado_soporte',
    description: 'Métricas de atención al cliente: tickets abiertos, cumplimiento de SLA, tiempos de respuesta y CSAT.',
    input_schema: { type: 'object', properties: {} },
  },
];

export async function ejecutarHerramienta(nombre, argumentos, usuario) {
  const fn = IMPL[nombre];
  if (!fn) throw new Error(`Herramienta desconocida: ${nombre}`);
  return fn(argumentos ?? {}, usuario);
}

export const nombres = Object.keys(IMPL);

export default { DEFINICIONES, ejecutarHerramienta, nombres };
