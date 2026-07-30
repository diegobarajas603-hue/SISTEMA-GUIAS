import { consultar, uno, valor, armarUpdate, tx } from '../db/pool.js';
import { noEncontrado } from '../lib/errores.js';
import motor from '../ia/motor.js';
import * as bitacora from './bitacora.js';

const SELECT_CUENTA = `
  SELECT c.*, u.nombre AS propietario_nombre, u.avatar_tono AS propietario_tono,
         (SELECT count(*)::int FROM contactos ct WHERE ct.cuenta_id = c.id) AS total_contactos,
         (SELECT count(*)::int FROM oportunidades o WHERE o.cuenta_id = c.id AND o.estado = 'abierta') AS oportunidades_abiertas,
         (SELECT COALESCE(sum(o.monto),0)::bigint FROM oportunidades o WHERE o.cuenta_id = c.id AND o.estado = 'abierta') AS pipeline,
         (SELECT count(*)::int FROM tickets t WHERE t.cuenta_id = c.id AND t.estado IN ('nuevo','abierto','pendiente')) AS tickets_abiertos
    FROM cuentas c
    LEFT JOIN usuarios u ON u.id = c.propietario_id`;

const ORDENABLES = ['nombre', 'ingresos_ano', 'valor_vida', 'riesgo_churn', 'salud', 'creado_en', 'ultima_actividad_en'];

export async function listar(filtros = {}, usuario) {
  const {
    tipo, industria, tamano, estado, propietario, busqueda, riesgoMin, etiquetas,
    soloMios, inactivas, limite = 60, desplazamiento = 0,
    orden = { columna: 'ingresos_ano', direccion: 'DESC' },
  } = filtros;

  const columna = ORDENABLES.includes(orden.columna) ? orden.columna : 'ingresos_ano';
  const direccion = orden.direccion === 'ASC' ? 'ASC' : 'DESC';

  const params = [
    tipo ?? null, industria ?? null, tamano ?? null, estado ?? null,
    soloMios ? usuario.id : (propietario ?? null),
    busqueda ? `%${busqueda.toLowerCase()}%` : null,
    riesgoMin ?? null, etiquetas?.length ? etiquetas : null,
    inactivas ? true : false, limite, desplazamiento,
  ];

  const donde = `
    WHERE ($1::text IS NULL OR c.tipo = $1)
      AND ($2::text IS NULL OR c.industria = $2)
      AND ($3::text IS NULL OR c.tamano = $3)
      AND ($4::text IS NULL OR c.estado = $4)
      AND ($5::int IS NULL OR c.propietario_id = $5)
      AND ($6::text IS NULL OR lower(c.nombre) LIKE $6 OR lower(COALESCE(c.nombre_comercial,'')) LIKE $6
           OR lower(COALESCE(c.rfc,'')) LIKE $6)
      AND ($7::int IS NULL OR c.riesgo_churn >= $7)
      AND ($8::text[] IS NULL OR c.etiquetas && $8)
      AND ($9 = false OR c.ultima_actividad_en IS NULL OR c.ultima_actividad_en < now() - interval '60 days')`;

  const [filas, total] = await Promise.all([
    consultar(`${SELECT_CUENTA} ${donde} ORDER BY c.${columna} ${direccion} NULLS LAST, c.id DESC
               LIMIT $10 OFFSET $11`, params),
    valor(`SELECT count(*)::int FROM cuentas c ${donde}`, params.slice(0, 9)),
  ]);
  return { filas, total, limite, desplazamiento };
}

/**
 * FICHA 360: absolutamente todo lo de la cuenta en una sola respuesta.
 *
 * Son 12 consultas en paralelo. Es deliberado: 12 consultas indexadas contra la
 * misma conexión tardan menos que 12 viajes HTTP desde el navegador, y la pantalla
 * se pinta de una vez en lugar de irse llenando por partes.
 */
export async function ficha360(id) {
  const cuenta = await uno(`${SELECT_CUENTA} WHERE c.id = $1`, [id]);
  if (!cuenta) throw noEncontrado('cliente');

  const [
    contactos, oportunidades, cotizaciones, facturas, contratos, tickets,
    actividades, notas, archivos, cronologia, insights, resumenFacturacion, productos,
  ] = await Promise.all([
    consultar(`SELECT * FROM contactos WHERE cuenta_id = $1
                ORDER BY es_principal DESC, nombre`, [id]),
    consultar(`SELECT o.*, u.nombre AS propietario_nombre, u.avatar_tono AS propietario_tono
                 FROM oportunidades o LEFT JOIN usuarios u ON u.id = o.propietario_id
                WHERE o.cuenta_id = $1
                ORDER BY (o.estado = 'abierta') DESC, o.monto DESC LIMIT 30`, [id]),
    consultar(`SELECT * FROM cotizaciones WHERE cuenta_id = $1
                ORDER BY creado_en DESC LIMIT 20`, [id]),
    consultar(`SELECT * FROM facturas WHERE cuenta_id = $1
                ORDER BY emitida_en DESC LIMIT 24`, [id]),
    consultar(`SELECT * FROM contratos WHERE cuenta_id = $1 ORDER BY termina_en DESC`, [id]),
    consultar(`SELECT t.*, u.nombre AS asignado_nombre FROM tickets t
                 LEFT JOIN usuarios u ON u.id = t.asignado_id
                WHERE t.cuenta_id = $1 ORDER BY t.creado_en DESC LIMIT 20`, [id]),
    consultar(`SELECT a.*, u.nombre AS usuario_nombre, u.avatar_tono AS usuario_tono,
                      ct.nombre AS contacto_nombre
                 FROM actividades a
                 LEFT JOIN usuarios u ON u.id = a.usuario_id
                 LEFT JOIN contactos ct ON ct.id = a.contacto_id
                WHERE a.cuenta_id = $1 ORDER BY a.vence_en DESC NULLS LAST LIMIT 40`, [id]),
    consultar(`SELECT n.*, u.nombre AS usuario_nombre, u.avatar_tono AS usuario_tono
                 FROM notas n LEFT JOIN usuarios u ON u.id = n.usuario_id
                WHERE n.cuenta_id = $1 ORDER BY n.fijada DESC, n.creado_en DESC`, [id]),
    consultar(`SELECT * FROM archivos WHERE cuenta_id = $1 ORDER BY creado_en DESC LIMIT 30`, [id]),
    bitacora.deCuenta(id, { limite: 100 }),
    consultar(`SELECT * FROM ia_insights
                WHERE entidad_tipo = 'cuenta' AND entidad_id = $1 AND estado IN ('nuevo','visto')
                ORDER BY impacto DESC`, [id]),
    uno(`SELECT
           COALESCE(sum(total) FILTER (WHERE emitida_en > CURRENT_DATE - 365), 0)::bigint AS ano,
           COALESCE(sum(total) FILTER (WHERE estado = 'pagada'), 0)::bigint AS cobrado,
           COALESCE(sum(total) FILTER (WHERE estado IN ('emitida','vencida')), 0)::bigint AS por_cobrar,
           COALESCE(sum(total) FILTER (WHERE estado = 'vencida'), 0)::bigint AS vencido,
           count(*)::int AS facturas
         FROM facturas WHERE cuenta_id = $1`, [id]),
    consultar(`SELECT p.id, p.sku, p.nombre, p.categoria, p.unidad,
                      sum(op.cantidad)::numeric AS cantidad_total,
                      count(DISTINCT o.id)::int AS operaciones
                 FROM oportunidades o
                 JOIN oportunidad_productos op ON op.oportunidad_id = o.id
                 JOIN productos p ON p.id = op.producto_id
                WHERE o.cuenta_id = $1 AND o.estado = 'ganada'
                GROUP BY p.id ORDER BY cantidad_total DESC`, [id]),
  ]);

  // Serie de facturación mensual: es la gráfica que hace evidente si la cuenta
  // está creciendo o apagándose.
  const serieFacturacion = await consultar(
    `WITH meses AS (
       SELECT generate_series(date_trunc('month', now()) - interval '11 months',
                              date_trunc('month', now()), interval '1 month') AS mes)
     SELECT to_char(m.mes, 'YYYY-MM') AS mes,
            COALESCE(sum(f.total), 0)::bigint AS facturado
       FROM meses m
       LEFT JOIN facturas f ON date_trunc('month', f.emitida_en) = m.mes AND f.cuenta_id = $1
      GROUP BY m.mes ORDER BY m.mes`,
    [id],
  );

  return {
    ...cuenta,
    contactos, oportunidades, cotizaciones, facturas, contratos, tickets,
    actividades, notas, archivos, cronologia, insights,
    facturacion: { ...resumenFacturacion, serie: serieFacturacion },
    productos,
    mapaPoder: mapaDePoder(contactos),
  };
}

/**
 * Mapa de poder: quién decide, quién empuja y quién frena. Un CRM que solo lista
 * contactos deja al vendedor adivinando por dónde entrar.
 */
function mapaDePoder(contactos) {
  const porRol = { decisor: [], campeon: [], influenciador: [], usuario: [], bloqueador: [] };
  for (const c of contactos) {
    if (c.rol_compra && porRol[c.rol_compra]) porRol[c.rol_compra].push(c);
  }
  return {
    ...porRol,
    completo: porRol.decisor.length > 0,
    advertencia: porRol.decisor.length === 0
      ? 'Ningún contacto está marcado como decisor: negociar sin acceso a quien autoriza alarga el ciclo.'
      : porRol.bloqueador.length > 0
        ? 'Hay un bloqueador identificado. Conviene entender su objeción antes de escalar.'
        : null,
  };
}

const ACTUALIZABLES = [
  'nombre', 'nombre_comercial', 'rfc', 'industria', 'tamano', 'sitio_web', 'telefono', 'email',
  'calle', 'ciudad', 'estado', 'pais', 'codigo_postal', 'tipo', 'propietario_id',
  'dias_credito', 'origen', 'etiquetas', 'notas', 'cliente_desde',
];

export async function crear(datos, usuario) {
  const cuenta = await uno(
    `INSERT INTO cuentas (nombre, nombre_comercial, rfc, industria, tamano, sitio_web, telefono,
                          email, calle, ciudad, estado, codigo_postal, tipo, propietario_id,
                          dias_credito, origen, etiquetas, notas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13,'prospecto'),
             COALESCE($14::int,$18::int),COALESCE($15,0),$16,COALESCE($17::text[],'{}'),$19)
     RETURNING *`,
    [
      datos.nombre, datos.nombre_comercial ?? null, datos.rfc ?? null, datos.industria ?? null,
      datos.tamano ?? null, datos.sitio_web ?? null, datos.telefono ?? null, datos.email ?? null,
      datos.calle ?? null, datos.ciudad ?? null, datos.estado ?? null, datos.codigo_postal ?? null,
      datos.tipo ?? null, datos.propietario_id ?? null, datos.dias_credito ?? null,
      datos.origen ?? null, datos.etiquetas ?? null, usuario.id, datos.notas ?? null,
    ],
  );
  await bitacora.registrar({
    entidad_tipo: 'cuenta', entidad_id: cuenta.id, cuenta_id: cuenta.id, tipo: 'creado',
    titulo: 'Cuenta creada', detalle: `Alta de ${cuenta.nombre}.`, usuario_id: usuario.id,
  });
  return cuenta;
}

export async function actualizar(id, datos, usuario) {
  const previo = await uno('SELECT * FROM cuentas WHERE id = $1', [id]);
  if (!previo) throw noEncontrado('cliente');
  const consulta = armarUpdate('cuentas', id, datos, ACTUALIZABLES);
  if (!consulta) return previo;
  const cuenta = await uno(consulta.sql, consulta.valores);

  if (datos.tipo && datos.tipo !== previo.tipo) {
    await bitacora.registrar({
      entidad_tipo: 'cuenta', entidad_id: id, cuenta_id: id, tipo: 'estado',
      titulo: `Cuenta ${previo.tipo} → ${datos.tipo}`, usuario_id: usuario.id,
    });
  }
  return cuenta;
}

export async function eliminar(id) {
  const borrado = await uno('DELETE FROM cuentas WHERE id = $1 RETURNING id', [id]);
  if (!borrado) throw noEncontrado('cliente');
}

// ---------------------------------------------------------------- contactos

export const contactos = (cuentaId) =>
  consultar('SELECT * FROM contactos WHERE cuenta_id = $1 ORDER BY es_principal DESC, nombre', [cuentaId]);

export async function crearContacto(cuentaId, datos, usuario) {
  return tx(async (t) => {
    // Solo puede haber un contacto principal por cuenta.
    if (datos.es_principal) {
      await t.consultar('UPDATE contactos SET es_principal = false WHERE cuenta_id = $1', [cuentaId]);
    }
    const contacto = await t.uno(
      `INSERT INTO contactos (cuenta_id, nombre, puesto, email, telefono, whatsapp, linkedin,
                              es_principal, rol_compra, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,false),$9,$10) RETURNING *`,
      [
        cuentaId, datos.nombre, datos.puesto ?? null, datos.email ?? null, datos.telefono ?? null,
        datos.whatsapp ?? null, datos.linkedin ?? null, datos.es_principal ?? null,
        datos.rol_compra ?? null, datos.notas ?? null,
      ],
    );
    await bitacora.registrar({
      entidad_tipo: 'cuenta', entidad_id: cuentaId, cuenta_id: cuentaId, tipo: 'contacto',
      titulo: `Contacto agregado: ${contacto.nombre}`,
      detalle: contacto.puesto, usuario_id: usuario.id,
    }, t);
    return contacto;
  });
}

const CONTACTO_ACTUALIZABLE = ['nombre', 'puesto', 'email', 'telefono', 'whatsapp', 'linkedin', 'rol_compra', 'notas', 'es_principal'];

export async function actualizarContacto(id, datos) {
  return tx(async (t) => {
    const previo = await t.uno('SELECT * FROM contactos WHERE id = $1', [id]);
    if (!previo) throw noEncontrado('contacto');
    if (datos.es_principal) {
      await t.consultar(
        'UPDATE contactos SET es_principal = false WHERE cuenta_id = $1 AND id <> $2',
        [previo.cuenta_id, id],
      );
    }
    const columnas = Object.keys(datos).filter((k) => CONTACTO_ACTUALIZABLE.includes(k) && datos[k] !== undefined);
    if (!columnas.length) return previo;
    const asignaciones = columnas.map((k, i) => `${k} = $${i + 1}`);
    return t.uno(
      `UPDATE contactos SET ${asignaciones.join(', ')} WHERE id = $${columnas.length + 1} RETURNING *`,
      [...columnas.map((k) => datos[k]), id],
    );
  });
}

export async function eliminarContacto(id) {
  const borrado = await uno('DELETE FROM contactos WHERE id = $1 RETURNING id', [id]);
  if (!borrado) throw noEncontrado('contacto');
}

// ------------------------------------------------------------------- notas

export async function crearNota(datos, usuario) {
  const nota = await uno(
    `INSERT INTO notas (cuerpo, usuario_id, cuenta_id, lead_id, oportunidad_id, contacto_id, fijada)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,false)) RETURNING *`,
    [
      datos.cuerpo, usuario.id, datos.cuenta_id ?? null, datos.lead_id ?? null,
      datos.oportunidad_id ?? null, datos.contacto_id ?? null, datos.fijada ?? null,
    ],
  );
  const entidad = datos.oportunidad_id ? 'oportunidad' : datos.lead_id ? 'lead' : 'cuenta';
  const entidadId = datos.oportunidad_id ?? datos.lead_id ?? datos.cuenta_id;
  if (entidadId) {
    await bitacora.registrar({
      entidad_tipo: entidad, entidad_id: entidadId, cuenta_id: datos.cuenta_id ?? null,
      tipo: 'nota', titulo: 'Nota agregada',
      detalle: datos.cuerpo.slice(0, 240), usuario_id: usuario.id,
    });
  }
  return { ...nota, usuario_nombre: usuario.nombre };
}

export async function eliminarNota(id) {
  const borrado = await uno('DELETE FROM notas WHERE id = $1 RETURNING id', [id]);
  if (!borrado) throw noEncontrado('nota');
}

// ---------------------------------------------------------------- análisis

/** Análisis de IA de la cuenta, calculado al momento con el motor. */
export async function analisisIA(id) {
  const cuenta = await uno('SELECT * FROM cuentas WHERE id = $1', [id]);
  if (!cuenta) throw noEncontrado('cliente');

  const [ctx, catalogo, skus, pipeline] = await Promise.all([
    uno(`SELECT
           COALESCE((SELECT sum(total) FROM facturas WHERE cuenta_id = $1
                      AND emitida_en > CURRENT_DATE - 90), 0)::bigint AS fact_90,
           COALESCE((SELECT sum(total) FROM facturas WHERE cuenta_id = $1
                      AND emitida_en BETWEEN CURRENT_DATE - 180 AND CURRENT_DATE - 90), 0)::bigint AS fact_prev,
           (SELECT count(*)::int FROM facturas WHERE cuenta_id = $1 AND estado = 'vencida') AS vencidas,
           (SELECT count(*)::int FROM tickets WHERE cuenta_id = $1
             AND sentimiento IN ('negativo','frustrado')
             AND creado_en > now() - interval '120 days') AS tickets_neg,
           (SELECT avg(csat) FROM tickets WHERE cuenta_id = $1 AND csat IS NOT NULL) AS csat,
           (SELECT count(*)::int FROM oportunidades WHERE cuenta_id = $1 AND estado = 'abierta') AS ops,
           (SELECT min(termina_en) FROM contratos WHERE cuenta_id = $1
             AND estado IN ('vigente','por_vencer')) AS contrato_vence,
           (SELECT bool_or(renovacion_auto) FROM contratos WHERE cuenta_id = $1
             AND estado IN ('vigente','por_vencer')) AS renov`, [id]),
    consultar('SELECT id, sku, nombre, precio_base, volumen_mensual FROM productos WHERE activo'),
    consultar(`SELECT DISTINCT p.sku FROM oportunidades o
                 JOIN oportunidad_productos op ON op.oportunidad_id = o.id
                 JOIN productos p ON p.id = op.producto_id
                WHERE o.cuenta_id = $1 AND o.estado = 'ganada'`, [id]),
    consultar(`SELECT DISTINCT p.sku FROM oportunidades o
                 JOIN oportunidad_productos op ON op.oportunidad_id = o.id
                 JOIN productos p ON p.id = op.producto_id
                WHERE o.cuenta_id = $1 AND o.estado = 'abierta'`, [id]),
  ]);

  const contexto = {
    facturasRecientes: Number(ctx.fact_90),
    facturasPrevias: Number(ctx.fact_prev),
    ticketsNegativos: ctx.tickets_neg,
    csatPromedio: ctx.csat != null ? Number(ctx.csat) : null,
    facturasVencidas: ctx.vencidas,
    contratoPorVencer: ctx.contrato_vence
      ? Math.round((new Date(ctx.contrato_vence) - Date.now()) / 86_400_000) : null,
    oportunidadesAbiertas: ctx.ops,
  };

  const churn = motor.riesgoChurn({ ...cuenta, renovacion_auto: ctx.renov }, contexto);
  const cruzada = motor.ventaCruzada(cuenta, {
    skusComprados: skus.map((s) => s.sku),
    catalogo,
    oportunidadesAbiertas: [{ skus: pipeline.map((s) => s.sku) }],
  });

  return {
    churn,
    salud: motor.saludCuenta({ ...cuenta, renovacion_auto: ctx.renov }, contexto),
    ventaCruzada: cruzada,
  };
}

export async function facetas() {
  const [industrias, etiquetas, estados] = await Promise.all([
    consultar(`SELECT industria AS valor, count(*)::int AS total FROM cuentas
                WHERE industria IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`),
    consultar(`SELECT DISTINCT unnest(etiquetas) AS valor FROM cuentas ORDER BY 1`),
    consultar(`SELECT estado AS valor, count(*)::int AS total FROM cuentas
                WHERE estado IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`),
  ]);
  return { industrias, etiquetas: etiquetas.map((e) => e.valor), estados };
}
