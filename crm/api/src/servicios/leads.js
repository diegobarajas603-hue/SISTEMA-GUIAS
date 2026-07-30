import { consultar, uno, valor, tx, armarUpdate, pool } from '../db/pool.js';
import { noEncontrado, peticionInvalida, conflicto } from '../lib/errores.js';
import motor from '../ia/motor.js';
import * as bitacora from './bitacora.js';
import { dispararEvento } from '../motor/ejecutor.js';

const SELECT_LEAD = `
  SELECT l.*, u.nombre AS propietario_nombre, u.avatar_tono AS propietario_tono,
         ca.nombre AS campana_nombre, cu.nombre_comercial AS cuenta_nombre,
         (SELECT count(*)::int FROM senales s WHERE s.lead_id = l.id) AS total_senales,
         (SELECT count(*)::int FROM actividades a WHERE a.lead_id = l.id AND a.estado = 'pendiente') AS pendientes
    FROM leads l
    LEFT JOIN usuarios u ON u.id = l.propietario_id
    LEFT JOIN campanas ca ON ca.id = l.campana_id
    LEFT JOIN cuentas cu ON cu.id = l.cuenta_id`;

const ORDENABLES = ['score', 'creado_en', 'valor_estimado', 'nombre', 'empresa', 'ultimo_contacto_en', 'prioridad'];

/**
 * Listado con filtros inteligentes. Todos los filtros son opcionales y se
 * combinan; el SQL se mantiene en una sola consulta con condiciones
 * `($n IS NULL OR …)` para que el plan de ejecución quede estable y no haya que
 * construir cadenas.
 */
export async function listar(filtros = {}, usuario) {
  const {
    etapa, temperatura, propietario, origen, industria, busqueda,
    scoreMin, scoreMax, etiquetas, soloMios, sinContactar, limite = 100, desplazamiento = 0,
    orden = { columna: 'score', direccion: 'DESC' },
  } = filtros;

  const columna = ORDENABLES.includes(orden.columna) ? orden.columna : 'score';
  const direccion = orden.direccion === 'ASC' ? 'ASC' : 'DESC';

  const params = [
    etapa ?? null,                                    // $1
    temperatura ?? null,                              // $2
    soloMios ? usuario.id : (propietario ?? null),    // $3
    origen ?? null,                                   // $4
    industria ?? null,                                // $5
    busqueda ? `%${busqueda.toLowerCase()}%` : null,  // $6
    scoreMin ?? null,                                 // $7
    scoreMax ?? null,                                 // $8
    etiquetas?.length ? etiquetas : null,             // $9
    sinContactar ? true : false,                      // $10
    limite,                                           // $11
    desplazamiento,                                   // $12
  ];

  const donde = `
    WHERE ($1::text IS NULL OR l.etapa = $1)
      AND ($2::text IS NULL OR l.temperatura = $2)
      AND ($3::int IS NULL OR l.propietario_id = $3)
      AND ($4::text IS NULL OR l.origen = $4)
      AND ($5::text IS NULL OR l.industria = $5)
      AND ($6::text IS NULL OR lower(l.nombre) LIKE $6 OR lower(l.empresa) LIKE $6
           OR lower(COALESCE(l.email,'')) LIKE $6)
      AND ($7::int IS NULL OR l.score >= $7)
      AND ($8::int IS NULL OR l.score <= $8)
      AND ($9::text[] IS NULL OR l.etiquetas && $9)
      AND ($10 = false OR l.ultimo_contacto_en IS NULL)`;

  const [filas, total] = await Promise.all([
    consultar(`${SELECT_LEAD} ${donde} ORDER BY l.${columna} ${direccion} NULLS LAST, l.id DESC
               LIMIT $11 OFFSET $12`, params),
    valor(`SELECT count(*)::int FROM leads l ${donde}`, params.slice(0, 10)),
  ]);

  return { filas, total, limite, desplazamiento };
}

/** Conteos y montos por etapa: alimenta los encabezados del kanban. */
export const resumenPorEtapa = (usuario, soloMios = false) =>
  consultar(
    `SELECT etapa, count(*)::int AS total, COALESCE(sum(valor_estimado), 0)::bigint AS valor,
            round(avg(score))::int AS score_medio
       FROM leads
      WHERE ($1::int IS NULL OR propietario_id = $1)
      GROUP BY etapa`,
    [soloMios ? usuario.id : null],
  );

export async function porId(id) {
  const lead = await uno(`${SELECT_LEAD} WHERE l.id = $1`, [id]);
  if (!lead) throw noEncontrado('prospecto');

  const [senales, actividades, cronologia, notas] = await Promise.all([
    consultar(`SELECT * FROM senales WHERE lead_id = $1 ORDER BY creado_en DESC LIMIT 50`, [id]),
    consultar(
      `SELECT a.*, u.nombre AS usuario_nombre FROM actividades a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE a.lead_id = $1 ORDER BY a.vence_en DESC NULLS LAST LIMIT 40`, [id]),
    bitacora.deEntidad('lead', id),
    consultar(
      `SELECT n.*, u.nombre AS usuario_nombre FROM notas n
         LEFT JOIN usuarios u ON u.id = n.usuario_id
        WHERE n.lead_id = $1 ORDER BY n.creado_en DESC`, [id]),
  ]);

  // El score se recalcula al abrir la ficha: la recencia cambia con el tiempo, así
  // que un score guardado hace días ya no es el correcto.
  const recalculado = motor.calcularLeadScore(lead, senales);

  return {
    ...lead,
    score: recalculado.score,
    score_motivos: recalculado.motivos,
    temperatura: recalculado.temperatura,
    score_desglose: recalculado.desglose,
    senales, actividades, cronologia, notas,
  };
}

/**
 * ALTA DE PROSPECTO CON PROCESAMIENTO AUTOMÁTICO DE IA
 * ----------------------------------------------------
 * Este es el flujo que define el producto. Todo ocurre en **una transacción**:
 * si algo falla, no queda un lead a medio clasificar.
 *
 *   1. Normaliza y deduplica
 *   2. Clasifica: intención, urgencia, prioridad, servicio de interés
 *   3. Registra las señales de origen
 *   4. Calcula el score con su explicación
 *   5. Asigna ejecutivo por carga y zona
 *   6. Crea la actividad de primer contacto con vencimiento según temperatura
 *   7. Genera el insight de siguiente mejor acción
 *   8. Escribe bitácora y notifica
 *   9. Dispara las automatizaciones suscritas a `lead.creado`
 */
export async function crear(datos, usuario = null) {
  const resultado = await tx(async (t) => {
    // --- 1. Deduplicación por correo: dos formularios del mismo interesado no
    // deben crear dos prospectos, deben sumar señales al existente.
    if (datos.email) {
      const existente = await t.uno(
        `SELECT id, nombre, etapa FROM leads WHERE lower(email) = lower($1)
          AND etapa NOT IN ('ganado','perdido') LIMIT 1`,
        [datos.email],
      );
      if (existente) {
        await t.consultar(
          `INSERT INTO senales (lead_id, tipo, detalle) VALUES ($1, 'formulario', $2)`,
          [existente.id, 'Nuevo envío de formulario del mismo contacto'],
        );
        await t.consultar(
          `UPDATE leads SET actualizado_en = now(),
                  mensaje = COALESCE($2, mensaje)
             WHERE id = $1`,
          [existente.id, datos.mensaje ?? null],
        );
        throw conflicto(
          `Ya existe un prospecto activo con ese correo: ${existente.nombre}. Se registró la nueva interacción en su ficha.`,
          { lead_id: existente.id },
        );
      }
    }

    // --- 2. Clasificación automática ---
    const clasificado = motor.clasificarLead(datos);

    // --- 5. Asignación de ejecutivo (antes del insert para guardarla de una vez) ---
    let propietarioId = datos.propietario_id ?? null;
    if (!propietarioId) {
      const candidatos = await t.consultar(
        `SELECT u.id, u.nombre, u.rol, u.zona,
                (SELECT count(*)::int FROM leads l
                  WHERE l.propietario_id = u.id AND l.etapa IN ('lead','contacto')) AS carga
           FROM usuarios u
          WHERE u.activo AND u.rol IN ('ejecutivo','gerente')`,
      );
      propietarioId = motor.asignarEjecutivo(datos, candidatos)?.id ?? null;
    }

    const insertado = await t.uno(
      `INSERT INTO leads (nombre, empresa, puesto, email, telefono, whatsapp, origen, campana_id,
                          industria, tamano_empresa, ciudad, estado, intencion, urgencia, prioridad,
                          valor_estimado, propietario_id, etiquetas, necesidad, mensaje, etapa, etapa_max)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'manual'),$8,$9,$10,$11,$12,$13,$14,$15,
               COALESCE($16,0),$17,COALESCE($18::text[],'{}'),$19,$20,'lead','lead')
       RETURNING *`,
      [
        datos.nombre, datos.empresa ?? null, datos.puesto ?? null, datos.email ?? null,
        datos.telefono ?? null, datos.whatsapp ?? null, datos.origen ?? null, datos.campana_id ?? null,
        datos.industria ?? null, datos.tamano_empresa ?? null, datos.ciudad ?? null, datos.estado ?? null,
        clasificado.intencion, clasificado.urgencia, clasificado.prioridad,
        datos.valor_estimado ?? null, propietarioId, datos.etiquetas ?? null,
        clasificado.servicio ?? datos.necesidad ?? null, datos.mensaje ?? null,
      ],
    );

    // --- 3. Señal de origen: el formulario en sí ya es una señal de intención ---
    await t.consultar(
      `INSERT INTO senales (lead_id, tipo, detalle) VALUES ($1, 'formulario', $2)`,
      [insertado.id, `Alta por ${insertado.origen}`],
    );
    const senales = await t.consultar('SELECT * FROM senales WHERE lead_id = $1', [insertado.id]);

    // --- 4. Score explicable ---
    const { score, motivos, temperatura } = motor.calcularLeadScore(insertado, senales);
    const lead = await t.uno(
      `UPDATE leads SET score = $2, score_motivos = $3::jsonb, temperatura = $4
         WHERE id = $1 RETURNING *`,
      [insertado.id, score, JSON.stringify(motivos), temperatura],
    );

    // --- 6. Actividad de primer contacto: cuanto más caliente, menos margen ---
    const horasRespuesta = { ardiente: 1, caliente: 2, tibio: 8, frio: 24 }[temperatura];
    if (propietarioId) {
      await t.consultar(
        `INSERT INTO actividades (tipo, asunto, descripcion, estado, prioridad, usuario_id, lead_id,
                                  vence_en, origen)
         VALUES ('llamada', $1, $2, 'pendiente', $3, $4, $5, now() + ($6 || ' hours')::interval, 'ia')`,
        [
          `Primer contacto · ${lead.nombre}`,
          `Prospecto ${temperatura} (score ${score}/100). ${motivos[0]?.etiqueta ?? ''}`.trim(),
          clasificado.prioridad, propietarioId, lead.id, String(horasRespuesta),
        ],
      );
    }

    // --- 7. Siguiente mejor acción como insight accionable ---
    const [nba] = motor.siguienteMejorAccion({ leads: [lead] });
    if (nba) {
      await t.consultar(
        `INSERT INTO ia_insights (tipo, entidad_tipo, entidad_id, usuario_id, titulo, explicacion,
                                  confianza, impacto, severidad, acciones)
         VALUES ('nba', 'lead', $1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          lead.id, propietarioId, nba.titulo, nba.detalle,
          Math.min(50 + score / 2, 95), lead.valor_estimado,
          score >= 80 ? 'alta' : 'media',
          JSON.stringify([{ titulo: `Registrar ${nba.accion}`, tipo: nba.accion, detalle: nba.detalle }]),
        ],
      );
    }

    // --- 8. Bitácora ---
    await bitacora.registrar({
      entidad_tipo: 'lead', entidad_id: lead.id, tipo: 'creado',
      titulo: 'Prospecto recibido',
      detalle: `Origen ${lead.origen}. Clasificado automáticamente: score ${score}/100 (${temperatura}), intención ${clasificado.intencion}, urgencia ${clasificado.urgencia}.`,
      usuario_id: usuario?.id ?? propietarioId,
      metadata: { score, temperatura, intencion: clasificado.intencion, automatico: true },
    }, t);

    return { lead: { ...lead, score_motivos: motivos }, propietarioId, temperatura, score };
  });

  // Fuera de la transacción: notificación y automatizaciones. Si el envío de una
  // notificación falla, el lead ya quedó guardado — que es lo que importa.
  if (resultado.propietarioId) {
    await bitacora.notificar({
      usuario_id: resultado.propietarioId,
      tipo: 'ia',
      titulo: `Nuevo prospecto ${resultado.temperatura}: ${resultado.lead.nombre}`,
      cuerpo: `Score ${resultado.score}/100. ${resultado.lead.empresa ?? ''}`.trim(),
      enlace: `/prospectos/${resultado.lead.id}`,
    }).catch(() => {});
  }
  dispararEvento('lead.creado', { entidad_tipo: 'lead', entidad_id: resultado.lead.id, datos: resultado.lead })
    .catch((e) => console.error('[automatizaciones] lead.creado:', e.message));

  return resultado.lead;
}

const ACTUALIZABLES = [
  'nombre', 'empresa', 'puesto', 'email', 'telefono', 'whatsapp', 'origen', 'campana_id',
  'industria', 'tamano_empresa', 'ciudad', 'estado', 'intencion', 'urgencia', 'prioridad',
  'valor_estimado', 'propietario_id', 'etiquetas', 'necesidad', 'mensaje', 'motivo_perdida',
  'ultimo_contacto_en',
];

export async function actualizar(id, datos, usuario) {
  const previo = await uno('SELECT * FROM leads WHERE id = $1', [id]);
  if (!previo) throw noEncontrado('prospecto');

  const consulta = armarUpdate('leads', id, datos, ACTUALIZABLES);
  if (!consulta) return previo;
  const lead = await uno(consulta.sql, consulta.valores);

  if (datos.propietario_id && datos.propietario_id !== previo.propietario_id) {
    await bitacora.registrar({
      entidad_tipo: 'lead', entidad_id: id, tipo: 'asignacion',
      titulo: 'Prospecto reasignado', usuario_id: usuario.id,
      metadata: { de: previo.propietario_id, a: datos.propietario_id },
    });
  }
  return lead;
}

/** Cambio de etapa: mantiene `etapa_max`, registra historial y bitácora. */
export async function moverEtapa(id, etapaNueva, usuario, motivoPerdida = null) {
  const ETAPAS = ['lead', 'contacto', 'calificado', 'perdido'];
  if (!ETAPAS.includes(etapaNueva)) {
    throw peticionInvalida(`Etapa inválida para un prospecto. Válidas: ${ETAPAS.join(', ')}.`);
  }

  return tx(async (t) => {
    const previo = await t.uno('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [id]);
    if (!previo) throw noEncontrado('prospecto');
    if (previo.etapa === etapaNueva) return previo;

    const ultimoCambio = await t.uno(
      `SELECT creado_en FROM etapa_historial
        WHERE entidad_tipo = 'lead' AND entidad_id = $1 ORDER BY creado_en DESC LIMIT 1`,
      [id],
    );
    const desde = ultimoCambio?.creado_en ?? previo.creado_en;
    const diasEnAnterior = (Date.now() - new Date(desde).getTime()) / 86_400_000;

    // `etapa_max` nunca retrocede, y 'perdido' no cuenta como avance: el embudo
    // necesita saber hasta dónde llegó de verdad este prospecto.
    const etapaMax = etapaNueva === 'perdido'
      ? previo.etapa_max
      : motor.etapaMayor(previo.etapa_max, etapaNueva);

    const lead = await t.uno(
      `UPDATE leads SET etapa = $2, etapa_max = $3, motivo_perdida = $4,
              ultimo_contacto_en = CASE WHEN $2 <> 'lead' THEN COALESCE(ultimo_contacto_en, now()) ELSE ultimo_contacto_en END,
              actualizado_en = now()
         WHERE id = $1 RETURNING *`,
      [id, etapaNueva, etapaMax, etapaNueva === 'perdido' ? motivoPerdida : null],
    );

    await t.consultar(
      `INSERT INTO etapa_historial (entidad_tipo, entidad_id, etapa_anterior, etapa_nueva,
                                    dias_en_anterior, usuario_id)
       VALUES ('lead', $1, $2, $3, $4, $5)`,
      [id, previo.etapa, etapaNueva, diasEnAnterior.toFixed(2), usuario.id],
    );

    await bitacora.registrar({
      entidad_tipo: 'lead', entidad_id: id, tipo: 'etapa',
      titulo: `Etapa: ${previo.etapa} → ${etapaNueva}`,
      detalle: etapaNueva === 'perdido' && motivoPerdida
        ? `Motivo: ${motivoPerdida}`
        : `Tras ${Math.round(diasEnAnterior)} días en la etapa anterior.`,
      usuario_id: usuario.id,
      metadata: { etapa: etapaNueva, anterior: previo.etapa },
    }, t);

    return lead;
  });
}

/**
 * CONVERSIÓN: prospecto → cuenta + contacto + oportunidad, en dos clics.
 * Arrastra la cronología para que nada se pierda ni haya que recapturar datos.
 */
export async function convertir(id, opciones, usuario) {
  return tx(async (t) => {
    const lead = await t.uno('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [id]);
    if (!lead) throw noEncontrado('prospecto');
    if (lead.cuenta_id && lead.oportunidad_id) {
      throw conflicto('Este prospecto ya fue convertido.', {
        cuenta_id: lead.cuenta_id, oportunidad_id: lead.oportunidad_id,
      });
    }

    // --- Cuenta: reutiliza la existente si el nombre coincide ---
    let cuenta = null;
    if (opciones.cuenta_id) {
      cuenta = await t.uno('SELECT * FROM cuentas WHERE id = $1', [opciones.cuenta_id]);
    } else if (lead.empresa) {
      cuenta = await t.uno('SELECT * FROM cuentas WHERE lower(nombre) = lower($1)', [lead.empresa]);
    }

    if (!cuenta) {
      cuenta = await t.uno(
        `INSERT INTO cuentas (nombre, nombre_comercial, industria, tamano, telefono, email,
                              ciudad, estado, tipo, propietario_id, origen, etiquetas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'prospecto',$9,$10,$11) RETURNING *`,
        [
          lead.empresa || lead.nombre, lead.empresa || null, lead.industria, lead.tamano_empresa,
          lead.telefono, lead.email, lead.ciudad, lead.estado,
          lead.propietario_id, lead.origen, lead.etiquetas,
        ],
      );
      await bitacora.registrar({
        entidad_tipo: 'cuenta', entidad_id: cuenta.id, cuenta_id: cuenta.id, tipo: 'creado',
        titulo: 'Cuenta creada por conversión de prospecto',
        detalle: `Convertida desde el prospecto ${lead.nombre}.`,
        usuario_id: usuario.id, metadata: { lead_id: lead.id },
      }, t);
    }

    // --- Contacto ---
    let contacto = await t.uno(
      'SELECT * FROM contactos WHERE cuenta_id = $1 AND lower(COALESCE(email,\'\')) = lower($2)',
      [cuenta.id, lead.email ?? ''],
    );
    if (!contacto) {
      const primero = await t.valor('SELECT count(*)::int FROM contactos WHERE cuenta_id = $1', [cuenta.id]);
      contacto = await t.uno(
        `INSERT INTO contactos (cuenta_id, nombre, puesto, email, telefono, whatsapp,
                                es_principal, rol_compra)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          cuenta.id, lead.nombre, lead.puesto, lead.email, lead.telefono, lead.whatsapp,
          primero === 0, opciones.rol_compra ?? 'influenciador',
        ],
      );
    }

    // --- Oportunidad ---
    const nombreOp = opciones.nombre
      || `${lead.necesidad || 'Servicio logístico'} · ${cuenta.nombre_comercial || cuenta.nombre}`;
    const monto = opciones.monto ?? lead.valor_estimado ?? 0;
    const oportunidad = await t.uno(
      `INSERT INTO oportunidades (nombre, cuenta_id, contacto_id, propietario_id, lead_id, campana_id,
                                  etapa, etapa_max, estado, monto, probabilidad, cierre_estimado,
                                  origen, tipo, siguiente_paso)
       VALUES ($1,$2,$3,$4,$5,$6,'calificado','calificado','abierta',$7,$8,
               COALESCE($9, CURRENT_DATE + 30), $10, 'nuevo', $11)
       RETURNING *`,
      [
        nombreOp, cuenta.id, contacto.id, lead.propietario_id, lead.id, lead.campana_id,
        monto, motor.PROBABILIDAD_ETAPA.calificado, opciones.cierre_estimado ?? null,
        lead.origen, opciones.siguiente_paso ?? 'Agendar reunión de descubrimiento',
      ],
    );

    await t.consultar(
      `INSERT INTO etapa_historial (entidad_tipo, entidad_id, etapa_anterior, etapa_nueva, usuario_id)
       VALUES ('oportunidad', $1, NULL, 'calificado', $2)`,
      [oportunidad.id, usuario.id],
    );

    // --- El lead queda calificado y ligado a lo que generó ---
    const leadFinal = await t.uno(
      `UPDATE leads SET etapa = 'calificado', etapa_max = 'calificado', cuenta_id = $2,
              oportunidad_id = $3, convertido_en = now(), actualizado_en = now()
         WHERE id = $1 RETURNING *`,
      [id, cuenta.id, oportunidad.id],
    );

    // --- Arrastrar la cronología del prospecto a la cuenta ---
    await t.consultar(
      `UPDATE bitacora SET cuenta_id = $2 WHERE entidad_tipo = 'lead' AND entidad_id = $1`,
      [id, cuenta.id],
    );
    await t.consultar(
      `UPDATE actividades SET cuenta_id = $2, contacto_id = COALESCE(contacto_id, $3),
              oportunidad_id = COALESCE(oportunidad_id, $4)
         WHERE lead_id = $1`,
      [id, cuenta.id, contacto.id, oportunidad.id],
    );
    await t.consultar(
      `UPDATE senales SET cuenta_id = $2, contacto_id = COALESCE(contacto_id, $3) WHERE lead_id = $1`,
      [id, cuenta.id, contacto.id],
    );

    await bitacora.registrar({
      entidad_tipo: 'oportunidad', entidad_id: oportunidad.id, cuenta_id: cuenta.id, tipo: 'creado',
      titulo: 'Oportunidad creada por conversión',
      detalle: `Desde el prospecto ${lead.nombre} (score ${lead.score}/100).`,
      usuario_id: usuario.id, metadata: { lead_id: lead.id, monto },
    }, t);

    return { lead: leadFinal, cuenta, contacto, oportunidad };
  });
}

export async function registrarSenal(leadId, tipo, detalle = null) {
  const fila = await uno(
    `INSERT INTO senales (lead_id, tipo, detalle) VALUES ($1, $2, $3) RETURNING *`,
    [leadId, tipo, detalle],
  );
  // Al llegar una señal el score cambia: se recalcula al momento, no en un lote
  // nocturno. Un lead que acaba de ver la página de precios debe subir ya.
  const lead = await uno('SELECT * FROM leads WHERE id = $1', [leadId]);
  const senales = await consultar('SELECT * FROM senales WHERE lead_id = $1', [leadId]);
  const { score, motivos, temperatura } = motor.calcularLeadScore(lead, senales);
  await pool.query(
    `UPDATE leads SET score = $2, score_motivos = $3::jsonb, temperatura = $4 WHERE id = $1`,
    [leadId, score, JSON.stringify(motivos), temperatura],
  );
  return { senal: fila, score, temperatura, motivos };
}

export async function eliminar(id) {
  const borrado = await uno('DELETE FROM leads WHERE id = $1 RETURNING id', [id]);
  if (!borrado) throw noEncontrado('prospecto');
}

/** Valores presentes en la base para poblar los desplegables de filtros. */
export async function facetas() {
  const [origenes, industrias, etiquetas, propietarios] = await Promise.all([
    consultar(`SELECT origen AS valor, count(*)::int AS total FROM leads GROUP BY 1 ORDER BY 2 DESC`),
    consultar(`SELECT industria AS valor, count(*)::int AS total FROM leads
                WHERE industria IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`),
    consultar(`SELECT DISTINCT unnest(etiquetas) AS valor FROM leads ORDER BY 1`),
    consultar(`SELECT u.id, u.nombre, u.avatar_tono, count(l.id)::int AS total
                 FROM usuarios u LEFT JOIN leads l ON l.propietario_id = u.id
                WHERE u.activo AND u.rol IN ('ejecutivo','gerente')
                GROUP BY u.id ORDER BY u.nombre`),
  ]);
  return { origenes, industrias, etiquetas: etiquetas.map((e) => e.valor), propietarios };
}
