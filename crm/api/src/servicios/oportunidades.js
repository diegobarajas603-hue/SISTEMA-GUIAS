import { consultar, uno, valor, tx, armarUpdate, pool } from '../db/pool.js';
import { noEncontrado, peticionInvalida } from '../lib/errores.js';
import { diasEntre } from '../lib/fechas.js';
import motor from '../ia/motor.js';
import * as bitacora from './bitacora.js';
import { dispararEvento } from '../motor/ejecutor.js';

const ETAPAS = ['calificado', 'propuesta', 'negociacion', 'ganado', 'perdido'];

const SELECT_OP = `
  SELECT o.*, c.nombre AS cuenta_nombre, c.nombre_comercial AS cuenta_comercial,
         c.industria AS cuenta_industria, c.tamano AS cuenta_tamano,
         u.nombre AS propietario_nombre, u.avatar_tono AS propietario_tono,
         ct.nombre AS contacto_nombre, ct.puesto AS contacto_puesto, ct.email AS contacto_email,
         ca.nombre AS campana_nombre,
         EXTRACT(day FROM now() - COALESCE(o.ultima_actividad_en, o.creado_en))::int AS dias_inactiva,
         (SELECT count(*)::int FROM cotizaciones q WHERE q.oportunidad_id = o.id) AS total_cotizaciones,
         (SELECT count(*)::int FROM actividades a WHERE a.oportunidad_id = o.id AND a.estado = 'pendiente') AS pendientes,
         (SELECT max(creado_en) FROM etapa_historial h
           WHERE h.entidad_tipo = 'oportunidad' AND h.entidad_id = o.id) AS ultimo_cambio_etapa
    FROM oportunidades o
    JOIN cuentas c ON c.id = o.cuenta_id
    LEFT JOIN usuarios u ON u.id = o.propietario_id
    LEFT JOIN contactos ct ON ct.id = o.contacto_id
    LEFT JOIN campanas ca ON ca.id = o.campana_id`;

const ORDENABLES = ['monto', 'cierre_estimado', 'creado_en', 'probabilidad', 'ia_probabilidad', 'nombre', 'ultima_actividad_en'];

export async function listar(filtros = {}, usuario) {
  const {
    etapa, estado = 'abierta', propietario, cuenta, busqueda, montoMin, etiquetas,
    soloMios, estancadas, cierreDesde, cierreHasta, limite = 200, desplazamiento = 0,
    orden = { columna: 'monto', direccion: 'DESC' },
  } = filtros;

  const columna = ORDENABLES.includes(orden.columna) ? orden.columna : 'monto';
  const direccion = orden.direccion === 'ASC' ? 'ASC' : 'DESC';

  const params = [
    etapa ?? null, estado === 'todas' ? null : estado,
    soloMios ? usuario.id : (propietario ?? null), cuenta ?? null,
    busqueda ? `%${busqueda.toLowerCase()}%` : null, montoMin ?? null,
    etiquetas?.length ? etiquetas : null, estancadas ? true : false,
    cierreDesde ?? null, cierreHasta ?? null, limite, desplazamiento,
  ];

  const donde = `
    WHERE ($1::text IS NULL OR o.etapa = $1)
      AND ($2::text IS NULL OR o.estado = $2)
      AND ($3::int IS NULL OR o.propietario_id = $3)
      AND ($4::int IS NULL OR o.cuenta_id = $4)
      AND ($5::text IS NULL OR lower(o.nombre) LIKE $5 OR lower(c.nombre) LIKE $5)
      AND ($6::bigint IS NULL OR o.monto >= $6)
      AND ($7::text[] IS NULL OR o.etiquetas && $7)
      AND ($8 = false OR COALESCE(o.ultima_actividad_en, o.creado_en) < now() - interval '14 days')
      AND ($9::date IS NULL OR o.cierre_estimado >= $9)
      AND ($10::date IS NULL OR o.cierre_estimado <= $10)`;

  const [filas, total] = await Promise.all([
    consultar(`${SELECT_OP} ${donde} ORDER BY o.${columna} ${direccion} NULLS LAST, o.id DESC
               LIMIT $11 OFFSET $12`, params),
    valor(`SELECT count(*)::int FROM oportunidades o JOIN cuentas c ON c.id = o.cuenta_id ${donde}`,
      params.slice(0, 10)),
  ]);
  return { filas, total, limite, desplazamiento };
}

/** Encabezados del tablero: conteo, monto y monto ponderado por etapa. */
export const resumenPorEtapa = (usuario, soloMios = false) =>
  consultar(
    `SELECT etapa, count(*)::int AS total, COALESCE(sum(monto),0)::bigint AS monto,
            COALESCE(sum(monto * COALESCE(ia_probabilidad, probabilidad) / 100.0), 0)::bigint AS ponderado,
            round(avg(COALESCE(ia_probabilidad, probabilidad)))::int AS probabilidad_media
       FROM oportunidades
      WHERE estado = 'abierta' AND ($1::int IS NULL OR propietario_id = $1)
      GROUP BY etapa`,
    [soloMios ? usuario.id : null],
  );

export async function porId(id) {
  const op = await uno(`${SELECT_OP} WHERE o.id = $1`, [id]);
  if (!op) throw noEncontrado('oportunidad');

  const [productos, cotizaciones, actividades, cronologia, notas, contactos, historial, archivos] =
    await Promise.all([
      consultar(`SELECT op.*, p.nombre, p.sku, p.categoria, p.unidad, p.precio_base,
                        (op.cantidad * op.precio_unitario * (1 - op.descuento_pct / 100.0))::bigint AS importe
                   FROM oportunidad_productos op
                   JOIN productos p ON p.id = op.producto_id
                  WHERE op.oportunidad_id = $1 ORDER BY importe DESC`, [id]),
      consultar('SELECT * FROM cotizaciones WHERE oportunidad_id = $1 ORDER BY creado_en DESC', [id]),
      consultar(`SELECT a.*, u.nombre AS usuario_nombre, u.avatar_tono AS usuario_tono
                   FROM actividades a LEFT JOIN usuarios u ON u.id = a.usuario_id
                  WHERE a.oportunidad_id = $1 ORDER BY a.vence_en DESC NULLS LAST`, [id]),
      bitacora.deEntidad('oportunidad', id),
      consultar(`SELECT n.*, u.nombre AS usuario_nombre FROM notas n
                   LEFT JOIN usuarios u ON u.id = n.usuario_id
                  WHERE n.oportunidad_id = $1 ORDER BY n.fijada DESC, n.creado_en DESC`, [id]),
      consultar('SELECT * FROM contactos WHERE cuenta_id = $1 ORDER BY es_principal DESC', [op.cuenta_id]),
      consultar(`SELECT * FROM etapa_historial
                  WHERE entidad_tipo = 'oportunidad' AND entidad_id = $1 ORDER BY creado_en`, [id]),
      consultar('SELECT * FROM archivos WHERE oportunidad_id = $1 ORDER BY creado_en DESC', [id]),
    ]);

  // El análisis se recalcula al abrir: los días de inactividad cambian solos.
  const promedio = await valor(
    `SELECT COALESCE(avg(monto), 0)::bigint FROM oportunidades WHERE estado = 'ganada'`,
  );
  const analisis = motor.analizarOportunidad(op, {
    actividades, cotizaciones, contactos,
    diasEnEtapa: diasEntre(op.ultimo_cambio_etapa || op.creado_en),
    montoPromedio: Number(promedio),
  });

  return {
    ...op,
    productos, cotizaciones, actividades, cronologia, notas, contactos, historial, archivos,
    analisis,
    mapaPoder: {
      decisor: contactos.find((c) => c.rol_compra === 'decisor') ?? null,
      campeon: contactos.find((c) => c.rol_compra === 'campeon') ?? null,
      bloqueador: contactos.find((c) => c.rol_compra === 'bloqueador') ?? null,
    },
  };
}

export async function crear(datos, usuario) {
  return tx(async (t) => {
    const op = await t.uno(
      `INSERT INTO oportunidades (nombre, cuenta_id, contacto_id, propietario_id, campana_id,
                                  etapa, etapa_max, estado, monto, moneda, probabilidad,
                                  cierre_estimado, competidor, origen, tipo, siguiente_paso, etiquetas)
       VALUES ($1,$2,$3,COALESCE($4::int,$15::int),$5,COALESCE($6,'calificado'),COALESCE($6,'calificado'),
               'abierta',COALESCE($7,0),'MXN',$8,COALESCE($9, CURRENT_DATE + 30),$10,$11,
               COALESCE($12,'nuevo'),$13,COALESCE($14::text[],'{}'))
       RETURNING *`,
      [
        datos.nombre, datos.cuenta_id, datos.contacto_id ?? null, datos.propietario_id ?? null,
        datos.campana_id ?? null, datos.etapa ?? null, datos.monto ?? null,
        motor.PROBABILIDAD_ETAPA[datos.etapa ?? 'calificado'] ?? 25,
        datos.cierre_estimado ?? null, datos.competidor ?? null, datos.origen ?? null,
        datos.tipo ?? null, datos.siguiente_paso ?? null, datos.etiquetas ?? null,
        usuario.id,
      ],
    );

    if (datos.productos?.length) await reemplazarProductos(t, op.id, datos.productos);

    await t.consultar(
      `INSERT INTO etapa_historial (entidad_tipo, entidad_id, etapa_nueva, usuario_id)
       VALUES ('oportunidad', $1, $2, $3)`,
      [op.id, op.etapa, usuario.id],
    );

    await bitacora.registrar({
      entidad_tipo: 'oportunidad', entidad_id: op.id, cuenta_id: op.cuenta_id, tipo: 'creado',
      titulo: 'Oportunidad creada',
      detalle: `Monto estimado ${(op.monto / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.`,
      usuario_id: usuario.id, metadata: { monto: op.monto },
    }, t);

    return op;
  });
}

const ACTUALIZABLES = [
  'nombre', 'contacto_id', 'propietario_id', 'monto', 'monto_recurrente', 'probabilidad',
  'cierre_estimado', 'competidor', 'origen', 'tipo', 'siguiente_paso', 'etiquetas', 'campana_id',
];

export async function actualizar(id, datos, usuario) {
  const previo = await uno('SELECT * FROM oportunidades WHERE id = $1', [id]);
  if (!previo) throw noEncontrado('oportunidad');

  const consulta = armarUpdate('oportunidades', id, datos, ACTUALIZABLES);
  let op = previo;
  if (consulta) op = await uno(consulta.sql, consulta.valores);

  if (datos.productos) {
    await tx(async (t) => {
      await reemplazarProductos(t, id, datos.productos);
      // El monto se recalcula desde las líneas: es la única fuente de verdad
      // cuando la oportunidad tiene productos.
      const suma = await t.valor(
        `SELECT COALESCE(sum(cantidad * precio_unitario * (1 - descuento_pct / 100.0)), 0)::bigint
           FROM oportunidad_productos WHERE oportunidad_id = $1`, [id]);
      op = await t.uno('UPDATE oportunidades SET monto = $2 WHERE id = $1 RETURNING *', [id, suma]);
    });
  }

  if (datos.monto != null && Number(datos.monto) !== Number(previo.monto)) {
    await bitacora.registrar({
      entidad_tipo: 'oportunidad', entidad_id: id, cuenta_id: previo.cuenta_id, tipo: 'monto',
      titulo: 'Monto actualizado',
      detalle: `De ${(previo.monto / 100).toLocaleString('es-MX')} a ${(datos.monto / 100).toLocaleString('es-MX')} MXN.`,
      usuario_id: usuario.id,
    });
  }
  return op;
}

async function reemplazarProductos(t, oportunidadId, productos) {
  await t.consultar('DELETE FROM oportunidad_productos WHERE oportunidad_id = $1', [oportunidadId]);
  for (const p of productos) {
    await t.consultar(
      `INSERT INTO oportunidad_productos (oportunidad_id, producto_id, cantidad, precio_unitario, descuento_pct)
       VALUES ($1,$2,COALESCE($3,1),COALESCE($4,0),COALESCE($5,0))`,
      [oportunidadId, p.producto_id, p.cantidad, p.precio_unitario, p.descuento_pct],
    );
  }
}

/**
 * Cambio de etapa. Es la escritura más frecuente del CRM (arrastrar en el tablero),
 * así que hace todo lo necesario de una vez: historial, `etapa_max`, cierre,
 * bitácora y disparo de automatizaciones.
 */
export async function moverEtapa(id, etapaNueva, usuario, extra = {}) {
  if (!ETAPAS.includes(etapaNueva)) {
    throw peticionInvalida(`Etapa inválida. Válidas: ${ETAPAS.join(', ')}.`);
  }

  const resultado = await tx(async (t) => {
    const previo = await t.uno('SELECT * FROM oportunidades WHERE id = $1 FOR UPDATE', [id]);
    if (!previo) throw noEncontrado('oportunidad');
    if (previo.etapa === etapaNueva) return { op: previo, cambio: false };

    if (etapaNueva === 'perdido' && !extra.motivo_perdida) {
      throw peticionInvalida('Para marcar una oportunidad como perdida hay que indicar el motivo.');
    }

    const ultimo = await t.uno(
      `SELECT creado_en FROM etapa_historial
        WHERE entidad_tipo = 'oportunidad' AND entidad_id = $1
        ORDER BY creado_en DESC LIMIT 1`, [id]);
    const desde = ultimo?.creado_en ?? previo.creado_en;
    const dias = (Date.now() - new Date(desde).getTime()) / 86_400_000;

    const cerrada = ['ganado', 'perdido'].includes(etapaNueva);
    const estado = etapaNueva === 'ganado' ? 'ganada' : etapaNueva === 'perdido' ? 'perdida' : 'abierta';
    const etapaMax = etapaNueva === 'perdido' ? previo.etapa_max : motor.etapaMayor(previo.etapa_max, etapaNueva);

    const op = await t.uno(
      `UPDATE oportunidades
          SET etapa = $2, etapa_max = $3, estado = $4,
              probabilidad = $5,
              motivo_perdida = CASE WHEN $2 = 'perdido' THEN $6 ELSE NULL END,
              cerrado_en = CASE WHEN $7 THEN now() ELSE NULL END,
              ultima_actividad_en = now(), actualizado_en = now()
        WHERE id = $1 RETURNING *`,
      [
        id, etapaNueva, etapaMax, estado,
        motor.PROBABILIDAD_ETAPA[etapaNueva] ?? previo.probabilidad,
        extra.motivo_perdida ?? null, cerrada,
      ],
    );

    await t.consultar(
      `INSERT INTO etapa_historial (entidad_tipo, entidad_id, etapa_anterior, etapa_nueva,
                                    dias_en_anterior, usuario_id)
       VALUES ('oportunidad', $1, $2, $3, $4, $5)`,
      [id, previo.etapa, etapaNueva, dias.toFixed(2), usuario.id],
    );

    // Al ganar, la cuenta pasa a cliente si aún era prospecto.
    if (etapaNueva === 'ganado') {
      await t.consultar(
        `UPDATE cuentas SET tipo = 'cliente',
                cliente_desde = COALESCE(cliente_desde, CURRENT_DATE)
           WHERE id = $1 AND tipo IN ('prospecto','inactivo')`,
        [previo.cuenta_id],
      );
    }

    await bitacora.registrar({
      entidad_tipo: 'oportunidad', entidad_id: id, cuenta_id: previo.cuenta_id,
      tipo: etapaNueva === 'ganado' ? 'ganada' : etapaNueva === 'perdido' ? 'perdida' : 'etapa',
      titulo: etapaNueva === 'ganado'
        ? '🎉 Oportunidad ganada'
        : etapaNueva === 'perdido' ? 'Oportunidad perdida' : `Etapa: ${previo.etapa} → ${etapaNueva}`,
      detalle: etapaNueva === 'perdido'
        ? `Motivo: ${extra.motivo_perdida}`
        : `Tras ${Math.round(dias)} días en «${previo.etapa}».`,
      usuario_id: usuario.id,
      metadata: { etapa: etapaNueva, anterior: previo.etapa, monto: op.monto },
    }, t);

    return { op, cambio: true, anterior: previo.etapa };
  });

  if (resultado.cambio) {
    if (etapaNueva === 'ganado') {
      dispararEvento('oportunidad.ganada', {
        entidad_tipo: 'oportunidad', entidad_id: id,
        cuenta_id: resultado.op.cuenta_id, propietario_id: resultado.op.propietario_id,
      }).catch(() => {});
    }
    dispararEvento('oportunidad.etapa', {
      entidad_tipo: 'oportunidad', entidad_id: id,
      cuenta_id: resultado.op.cuenta_id, propietario_id: resultado.op.propietario_id,
      etapa: etapaNueva,
    }).catch(() => {});
    // El análisis de IA se refresca porque la etapa cambia la probabilidad base.
    recalcularUna(id).catch(() => {});
  }
  return resultado.op;
}

/** Recalcula el análisis de IA de una oportunidad y lo persiste. */
export async function recalcularUna(id) {
  const op = await uno(
    `SELECT o.*, (SELECT max(creado_en) FROM etapa_historial h
                   WHERE h.entidad_tipo = 'oportunidad' AND h.entidad_id = o.id) AS ultimo_cambio_etapa
       FROM oportunidades o WHERE o.id = $1`, [id]);
  if (!op || op.estado !== 'abierta') return null;

  const [actividades, cotizaciones, contactos, promedio] = await Promise.all([
    consultar(`SELECT creado_en, estado FROM actividades
                WHERE oportunidad_id = $1 AND creado_en > now() - interval '30 days'`, [id]),
    consultar('SELECT estado FROM cotizaciones WHERE oportunidad_id = $1', [id]),
    consultar('SELECT rol_compra FROM contactos WHERE cuenta_id = $1', [op.cuenta_id]),
    valor(`SELECT COALESCE(avg(monto),0)::bigint FROM oportunidades WHERE estado = 'ganada'`),
  ]);

  const analisis = motor.analizarOportunidad(op, {
    actividades, cotizaciones, contactos,
    diasEnEtapa: diasEntre(op.ultimo_cambio_etapa || op.creado_en),
    montoPromedio: Number(promedio),
  });

  await pool.query(
    `UPDATE oportunidades SET ia_probabilidad = $2, ia_riesgos = $3::jsonb,
            ia_acciones = $4::jsonb, ia_calculado_en = now() WHERE id = $1`,
    [id, analisis.probabilidad, JSON.stringify(analisis.riesgos), JSON.stringify(analisis.acciones)],
  );
  return analisis;
}

export async function eliminar(id) {
  const borrado = await uno('DELETE FROM oportunidades WHERE id = $1 RETURNING id', [id]);
  if (!borrado) throw noEncontrado('oportunidad');
}

/** Pronóstico del periodo con el modelo probabilístico del motor. */
export async function pronostico(usuario, { alcance = 'auto' } = {}) {
  const soloMios = alcance === 'mio' || (alcance === 'auto' && usuario.rol === 'ejecutivo');
  const usuarioId = soloMios ? usuario.id : null;

  const [cerrado, abiertas, meta, porVendedor] = await Promise.all([
    valor(`SELECT COALESCE(sum(monto),0)::bigint FROM oportunidades
            WHERE estado = 'ganada' AND cerrado_en >= date_trunc('month', now())
              AND ($1::int IS NULL OR propietario_id = $1)`, [usuarioId]),
    consultar(`SELECT id, nombre, monto, probabilidad, ia_probabilidad, cierre_estimado, etapa,
                      propietario_id
                 FROM oportunidades
                WHERE estado = 'abierta' AND ($1::int IS NULL OR propietario_id = $1)`, [usuarioId]),
    valor(`SELECT COALESCE(sum(objetivo),0)::bigint FROM metas
            WHERE tipo = 'ingresos' AND periodo = date_trunc('month', CURRENT_DATE)::date
              AND ($1::int IS NULL OR usuario_id = $1)`, [usuarioId]),
    consultar(`SELECT u.id, u.nombre, u.avatar_tono, u.meta_mensual,
                      COALESCE(sum(o.monto) FILTER (WHERE o.estado = 'ganada'
                        AND o.cerrado_en >= date_trunc('month', now())), 0)::bigint AS cerrado,
                      COALESCE(sum(o.monto * COALESCE(o.ia_probabilidad, o.probabilidad) / 100.0)
                        FILTER (WHERE o.estado = 'abierta'
                          AND o.cierre_estimado <= (date_trunc('month', now()) + interval '1 month - 1 day')::date), 0)::bigint AS ponderado
                 FROM usuarios u LEFT JOIN oportunidades o ON o.propietario_id = u.id
                WHERE u.activo AND u.rol IN ('ejecutivo','gerente')
                  AND ($1::int IS NULL OR u.id = $1)
                GROUP BY u.id ORDER BY cerrado DESC`, [usuarioId]),
  ]);

  return {
    ...motor.pronosticar({ cerrado: Number(cerrado), abiertas, meta: Number(meta) }),
    porVendedor,
    detalle: abiertas
      .filter((o) => o.cierre_estimado
        && new Date(o.cierre_estimado) <= new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 20),
  };
}

/** Oportunidades estancadas con su análisis, para el panel de riesgos. */
export const estancadas = (usuario, dias = 14) =>
  consultar(
    `SELECT o.*, c.nombre_comercial AS cuenta, u.nombre AS propietario, u.avatar_tono,
            EXTRACT(day FROM now() - COALESCE(o.ultima_actividad_en, o.creado_en))::int AS dias_inactiva
       FROM oportunidades o
       JOIN cuentas c ON c.id = o.cuenta_id
       LEFT JOIN usuarios u ON u.id = o.propietario_id
      WHERE o.estado = 'abierta'
        AND COALESCE(o.ultima_actividad_en, o.creado_en) < now() - ($2 || ' days')::interval
        AND ($1::int IS NULL OR o.propietario_id = $1)
      ORDER BY o.monto DESC LIMIT 50`,
    [usuario.rol === 'ejecutivo' ? usuario.id : null, String(dias)],
  );

export const motivosPerdida = () =>
  consultar(
    `SELECT motivo_perdida AS motivo, count(*)::int AS total,
            COALESCE(sum(monto),0)::bigint AS monto
       FROM oportunidades
      WHERE estado = 'perdida' AND motivo_perdida IS NOT NULL
        AND cerrado_en > now() - interval '12 months'
      GROUP BY 1 ORDER BY 2 DESC`,
  );
