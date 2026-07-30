/**
 * Recálculo por lotes de los campos derivados de IA.
 *
 * Existe porque varias métricas dependen del **paso del tiempo**, no de que alguien
 * edite algo: una oportunidad se estanca sola, el riesgo de fuga crece con el
 * silencio. Sin un recálculo periódico, el tablero mostraría la foto del día en que
 * se tocó cada registro por última vez.
 *
 * Lo usan tres sitios y con el mismo código exacto: el programador (una vez al día),
 * el endpoint `POST /ia/recalcular` y la semilla. Que compartan implementación es lo
 * que garantiza que los números de la demo y los de producción se calculen igual.
 */

import { consultar, uno, pool } from '../db/pool.js';
import { diasEntre } from '../lib/fechas.js';
import motor from '../ia/motor.js';

export async function recalcularIA() {
  const catalogo = await consultar(
    'SELECT id, sku, nombre, precio_base, volumen_mensual FROM productos WHERE activo',
  );
  const insights = [];

  const [ops, cuentas] = await Promise.all([
    recalcularOportunidades(insights),
    recalcularCuentas(insights, catalogo),
  ]);

  // Se reemplazan los insights no atendidos: los que el usuario ya vio, aplicó o
  // descartó se conservan, para no volver a molestarle con lo mismo.
  await pool.query(`DELETE FROM ia_insights WHERE estado = 'nuevo'`);
  await insertarInsights(insights);

  return { oportunidades: ops, cuentas, insights: insights.length };
}

async function recalcularOportunidades(insights) {
  const abiertas = await consultar(`
    SELECT o.*, c.nombre AS cuenta_nombre, c.tamano,
           (SELECT count(*)::int FROM actividades a
             WHERE a.oportunidad_id = o.id AND a.estado = 'completada'
               AND a.creado_en > now() - interval '14 days') AS act_recientes,
           (SELECT max(creado_en) FROM etapa_historial h
             WHERE h.entidad_tipo = 'oportunidad' AND h.entidad_id = o.id) AS ultimo_cambio_etapa
      FROM oportunidades o
      JOIN cuentas c ON c.id = o.cuenta_id
     WHERE o.estado = 'abierta'`);

  if (!abiertas.length) return 0;

  const promedio = await uno(
    `SELECT COALESCE(avg(monto), 0)::bigint AS m FROM oportunidades WHERE estado = 'ganada'`,
  );
  const montoPromedio = Number(promedio.m);

  const [cots, contactos] = await Promise.all([
    consultar(`SELECT oportunidad_id, estado FROM cotizaciones WHERE oportunidad_id IS NOT NULL`),
    consultar('SELECT cuenta_id, rol_compra FROM contactos'),
  ]);
  const cotsPorOp = agrupar(cots, 'oportunidad_id');
  const contactosPorCuenta = agrupar(contactos, 'cuenta_id');

  const actualizaciones = abiertas.map((op) => {
    const analisis = motor.analizarOportunidad(op, {
      // El motor solo necesita saber cuántas actividades recientes hubo; se le pasa
      // la forma mínima que espera en lugar de traer las filas completas.
      actividades: Array.from({ length: op.act_recientes }, () => ({
        creado_en: new Date(), estado: 'completada',
      })),
      cotizaciones: cotsPorOp.get(op.id) ?? [],
      contactos: contactosPorCuenta.get(op.cuenta_id) ?? [],
      diasEnEtapa: diasEntre(op.ultimo_cambio_etapa || op.creado_en),
      montoPromedio,
    });

    for (const riesgo of analisis.riesgos) {
      if (!['alta', 'critica'].includes(riesgo.severidad)) continue;
      const estancada = /estancada|atascada/i.test(riesgo.titulo);
      insights.push({
        tipo: estancada ? 'estancada' : 'riesgo',
        entidad_tipo: 'oportunidad', entidad_id: op.id, usuario_id: op.propietario_id,
        titulo: `${riesgo.titulo} · ${op.cuenta_nombre}`,
        explicacion: riesgo.detalle,
        confianza: riesgo.severidad === 'critica' ? 88 : 76,
        impacto: op.monto,
        severidad: riesgo.severidad,
        acciones: analisis.acciones.slice(0, 2),
      });
    }

    return {
      id: op.id,
      p: analisis.probabilidad,
      r: JSON.stringify(analisis.riesgos),
      a: JSON.stringify(analisis.acciones),
    };
  });

  await pool.query(
    `UPDATE oportunidades o
        SET ia_probabilidad = d.p, ia_riesgos = d.r, ia_acciones = d.a, ia_calculado_en = now()
       FROM (SELECT (v->>'id')::int id, (v->>'p')::int p,
                    (v->>'r')::jsonb r, (v->>'a')::jsonb a
               FROM jsonb_array_elements($1::jsonb) v) d
      WHERE o.id = d.id`,
    [JSON.stringify(actualizaciones)],
  );

  return actualizaciones.length;
}

async function recalcularCuentas(insights, catalogo) {
  const filas = await consultar(`
    SELECT c.*,
      COALESCE((SELECT sum(total) FROM facturas f WHERE f.cuenta_id = c.id
                 AND f.emitida_en > CURRENT_DATE - 365), 0)::bigint AS ingresos_12m,
      COALESCE((SELECT sum(total) FROM facturas f WHERE f.cuenta_id = c.id), 0)::bigint AS ltv,
      COALESCE((SELECT sum(total) FROM facturas f WHERE f.cuenta_id = c.id
                 AND f.emitida_en > CURRENT_DATE - 90), 0)::bigint AS fact_90,
      COALESCE((SELECT sum(total) FROM facturas f WHERE f.cuenta_id = c.id
                 AND f.emitida_en BETWEEN CURRENT_DATE - 180 AND CURRENT_DATE - 90), 0)::bigint AS fact_prev,
      (SELECT count(*)::int FROM facturas f WHERE f.cuenta_id = c.id AND f.estado = 'vencida') AS fact_vencidas,
      (SELECT count(*)::int FROM tickets t WHERE t.cuenta_id = c.id
        AND t.sentimiento IN ('negativo','frustrado')
        AND t.creado_en > now() - interval '120 days') AS tickets_neg,
      (SELECT avg(csat) FROM tickets t WHERE t.cuenta_id = c.id AND t.csat IS NOT NULL) AS csat,
      (SELECT count(*)::int FROM oportunidades o
        WHERE o.cuenta_id = c.id AND o.estado = 'abierta') AS ops_abiertas,
      (SELECT max(a.creado_en) FROM actividades a WHERE a.cuenta_id = c.id) AS ult_act,
      (SELECT min(termina_en) FROM contratos ct
        WHERE ct.cuenta_id = c.id AND ct.estado IN ('vigente','por_vencer')) AS contrato_vence,
      (SELECT bool_or(renovacion_auto) FROM contratos ct
        WHERE ct.cuenta_id = c.id AND ct.estado IN ('vigente','por_vencer')) AS renov_auto,
      ARRAY(SELECT DISTINCT p.sku FROM oportunidades o
              JOIN oportunidad_productos op ON op.oportunidad_id = o.id
              JOIN productos p ON p.id = op.producto_id
             WHERE o.cuenta_id = c.id AND o.estado = 'ganada') AS skus,
      ARRAY(SELECT DISTINCT p.sku FROM oportunidades o
              JOIN oportunidad_productos op ON op.oportunidad_id = o.id
              JOIN productos p ON p.id = op.producto_id
             WHERE o.cuenta_id = c.id AND o.estado = 'abierta') AS skus_pipeline
      FROM cuentas c`);

  const actualizaciones = filas.map((c) => {
    const cuenta = { ...c, ultima_actividad_en: c.ult_act, renovacion_auto: c.renov_auto };
    const contexto = {
      facturasRecientes: Number(c.fact_90),
      facturasPrevias: Number(c.fact_prev),
      ticketsNegativos: c.tickets_neg,
      csatPromedio: c.csat != null ? Number(c.csat) : null,
      facturasVencidas: c.fact_vencidas,
      contratoPorVencer: c.contrato_vence ? Math.round(diasEntre(new Date(), c.contrato_vence)) : null,
      oportunidadesAbiertas: c.ops_abiertas,
    };

    const churn = motor.riesgoChurn(cuenta, contexto);
    const salud = motor.saludCuenta(cuenta, contexto);

    if (c.tipo === 'cliente' && churn.riesgo >= 55) {
      insights.push({
        tipo: 'churn', entidad_tipo: 'cuenta', entidad_id: c.id, usuario_id: c.propietario_id,
        titulo: `Riesgo de fuga en ${c.nombre_comercial || c.nombre}`,
        explicacion: churn.motivos.slice(0, 3).map((m) => `${m.titulo}: ${m.detalle}`).join(' '),
        confianza: Math.min(60 + churn.riesgo / 3, 94),
        impacto: Number(c.ingresos_12m),
        severidad: churn.riesgo >= 75 ? 'critica' : 'alta',
        acciones: [
          { titulo: 'Agendar reunión de retención', detalle: 'Revisar nivel de servicio y condiciones antes de que decida salir.', tipo: 'reunion' },
          { titulo: 'Cerrar incidencias abiertas', detalle: 'Resolver los tickets pendientes de esta cuenta antes del contacto.', tipo: 'tarea' },
        ],
      });
    }

    // Venta cruzada solo en cuentas sanas: proponer servicios extra a un cliente a
    // punto de irse es exactamente lo que no hay que hacer.
    if (c.tipo === 'cliente' && churn.riesgo < 55) {
      const cruzadas = motor.ventaCruzada(cuenta, {
        skusComprados: c.skus ?? [],
        catalogo,
        oportunidadesAbiertas: [{ skus: c.skus_pipeline ?? [] }],
      });
      if (cruzadas.length) {
        const mejor = cruzadas[0];
        insights.push({
          tipo: 'venta_cruzada', entidad_tipo: 'cuenta', entidad_id: c.id, usuario_id: c.propietario_id,
          titulo: `${mejor.producto} para ${c.nombre_comercial || c.nombre}`,
          explicacion: mejor.motivo,
          confianza: mejor.confianza,
          impacto: mejor.impacto,
          severidad: 'media',
          acciones: [{
            titulo: `Proponer ${mejor.producto}`,
            detalle: 'Preparar propuesta de servicio complementario con tarifa preferente.',
            tipo: 'cotizacion',
          }],
        });
      }
    }

    // Reactivación: cliente valioso en silencio pero sin señales de deterioro.
    const diasSilencio = c.ult_act ? diasEntre(c.ult_act) : null;
    if (c.tipo === 'cliente' && churn.riesgo < 55 && diasSilencio != null
        && diasSilencio > 45 && Number(c.ingresos_12m) > 0) {
      insights.push({
        tipo: 'reactivacion', entidad_tipo: 'cuenta', entidad_id: c.id, usuario_id: c.propietario_id,
        titulo: `Reactivar contacto con ${c.nombre_comercial || c.nombre}`,
        explicacion: `Cliente activo sin contacto registrado desde hace ${Math.floor(diasSilencio)} días. Su facturación no ha caído, así que la relación está sana: es el momento de hablar de volumen, no de rescate.`,
        confianza: 70,
        impacto: Math.round(Number(c.ingresos_12m) * 0.15),
        severidad: 'baja',
        acciones: [{ titulo: 'Llamada de seguimiento', detalle: 'Revisión trimestral de servicio y volúmenes proyectados.', tipo: 'llamada' }],
      });
    }

    return {
      id: c.id,
      ingresos: Number(c.ingresos_12m),
      ltv: Number(c.ltv),
      churn: churn.riesgo,
      salud,
      ult_act: c.ult_act,
    };
  });

  await pool.query(
    `UPDATE cuentas c
        SET ingresos_ano = d.ingresos, valor_vida = d.ltv, riesgo_churn = d.churn,
            salud = d.salud, ultima_actividad_en = d.ult_act
       FROM (SELECT (v->>'id')::int id, (v->>'ingresos')::bigint ingresos,
                    (v->>'ltv')::bigint ltv, (v->>'churn')::int churn,
                    (v->>'salud')::int salud, (v->>'ult_act')::timestamptz ult_act
               FROM jsonb_array_elements($1::jsonb) v) d
      WHERE c.id = d.id`,
    [JSON.stringify(actualizaciones)],
  );

  return actualizaciones.length;
}

async function insertarInsights(insights) {
  if (!insights.length) return;
  await pool.query(
    `INSERT INTO ia_insights (tipo, entidad_tipo, entidad_id, usuario_id, titulo, explicacion,
                              confianza, impacto, severidad, acciones)
     SELECT v->>'tipo', v->>'entidad_tipo', (v->>'entidad_id')::int,
            NULLIF(v->>'usuario_id','')::int, v->>'titulo', v->>'explicacion',
            (v->>'confianza')::int, (v->>'impacto')::bigint, v->>'severidad',
            COALESCE(v->'acciones', '[]'::jsonb)
       FROM jsonb_array_elements($1::jsonb) v`,
    [JSON.stringify(insights.map((i) => ({ ...i, confianza: Math.round(i.confianza) })))],
  );
}

function agrupar(filas, clave) {
  const mapa = new Map();
  for (const fila of filas) {
    if (!mapa.has(fila[clave])) mapa.set(fila[clave], []);
    mapa.get(fila[clave]).push(fila);
  }
  return mapa;
}

export default { recalcularIA };
