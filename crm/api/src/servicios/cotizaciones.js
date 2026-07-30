import { consultar, uno, valor, tx, armarUpdate } from '../db/pool.js';
import { noEncontrado, peticionInvalida } from '../lib/errores.js';
import * as bitacora from './bitacora.js';

const IVA = 0.16;

const SELECT_COT = `
  SELECT q.*, c.nombre AS cuenta_nombre, c.nombre_comercial AS cuenta_comercial, c.rfc,
         ct.nombre AS contacto_nombre, ct.email AS contacto_email,
         u.nombre AS propietario_nombre, u.avatar_tono AS propietario_tono,
         o.nombre AS oportunidad_nombre, o.etapa AS oportunidad_etapa,
         (q.valida_hasta < CURRENT_DATE AND q.estado IN ('enviada','vista')) AS caducada
    FROM cotizaciones q
    JOIN cuentas c ON c.id = q.cuenta_id
    LEFT JOIN contactos ct ON ct.id = q.contacto_id
    LEFT JOIN usuarios u ON u.id = q.propietario_id
    LEFT JOIN oportunidades o ON o.id = q.oportunidad_id`;

export async function listar(filtros = {}, usuario) {
  const {
    estado, cuenta, propietario, busqueda, soloMios, sinRespuesta,
    limite = 60, desplazamiento = 0,
  } = filtros;

  const params = [
    estado ?? null, cuenta ?? null, soloMios ? usuario.id : (propietario ?? null),
    busqueda ? `%${busqueda.toLowerCase()}%` : null, sinRespuesta ? true : false,
    limite, desplazamiento,
  ];
  const donde = `
    WHERE ($1::text IS NULL OR q.estado = $1)
      AND ($2::int IS NULL OR q.cuenta_id = $2)
      AND ($3::int IS NULL OR q.propietario_id = $3)
      AND ($4::text IS NULL OR lower(q.folio) LIKE $4 OR lower(c.nombre) LIKE $4)
      AND ($5 = false OR (q.estado IN ('enviada','vista') AND q.enviada_en < now() - interval '3 days'))`;

  const [filas, total, resumen] = await Promise.all([
    consultar(`${SELECT_COT} ${donde} ORDER BY q.creado_en DESC LIMIT $6 OFFSET $7`, params),
    valor(`SELECT count(*)::int FROM cotizaciones q JOIN cuentas c ON c.id = q.cuenta_id ${donde}`,
      params.slice(0, 5)),
    consultar(
      `SELECT estado, count(*)::int AS total, COALESCE(sum(total),0)::bigint AS monto
         FROM cotizaciones GROUP BY estado`),
  ]);
  return { filas, total, resumen, limite, desplazamiento };
}

export async function porId(id) {
  const cot = await uno(`${SELECT_COT} WHERE q.id = $1`, [id]);
  if (!cot) throw noEncontrado('cotización');
  const items = await consultar(
    `SELECT i.*, p.sku, p.unidad, p.categoria FROM cotizacion_items i
       LEFT JOIN productos p ON p.id = i.producto_id
      WHERE i.cotizacion_id = $1 ORDER BY i.orden, i.id`, [id]);
  return { ...cot, items };
}

/**
 * Calcula los totales desde las líneas. Es la única función que decide importes:
 * ni el cliente ni la interfaz mandan totales, se derivan siempre aquí. Todo en
 * centavos enteros, así que no hay derivas de redondeo.
 */
export function calcularTotales(items) {
  let subtotal = 0;
  let descuento = 0;
  const calculados = items.map((it, i) => {
    const cantidad = Number(it.cantidad ?? 1);
    const precio = Math.round(Number(it.precio_unitario ?? 0));
    const pct = Math.min(Math.max(Number(it.descuento_pct ?? 0), 0), 100);
    const bruto = Math.round(cantidad * precio);
    const dto = Math.round(bruto * (pct / 100));
    const importe = bruto - dto;
    subtotal += importe;
    descuento += dto;
    return {
      producto_id: it.producto_id ?? null,
      descripcion: it.descripcion,
      cantidad, precio_unitario: precio, descuento_pct: pct, importe,
      orden: it.orden ?? i,
    };
  });
  const impuestos = Math.round(subtotal * IVA);
  return { items: calculados, subtotal, descuento, impuestos, total: subtotal + impuestos };
}

async function siguienteFolio(t) {
  // El folio se deriva del máximo existente, no de un contador aparte, para que no
  // se pueda desincronizar.
  const ultimo = await t.valor(
    `SELECT COALESCE(max(NULLIF(regexp_replace(folio, '\\D', '', 'g'), '')::int), 0) FROM cotizaciones`,
  );
  return `COT-${String(Number(ultimo) + 1).padStart(5, '0')}`;
}

export async function crear(datos, usuario) {
  if (!datos.items?.length) throw peticionInvalida('La cotización necesita al menos un concepto.');

  return tx(async (t) => {
    const totales = calcularTotales(datos.items);
    const folio = await siguienteFolio(t);

    const cot = await t.uno(
      `INSERT INTO cotizaciones (folio, oportunidad_id, cuenta_id, contacto_id, propietario_id,
                                 estado, subtotal, descuento, impuestos, total, condiciones, notas,
                                 valida_hasta)
       VALUES ($1,$2,$3,$4,COALESCE($5::int,$13::int),'borrador',$6,$7,$8,$9,$10,$11,
               COALESCE($12, CURRENT_DATE + 30)) RETURNING *`,
      [
        folio, datos.oportunidad_id ?? null, datos.cuenta_id, datos.contacto_id ?? null,
        datos.propietario_id ?? null, totales.subtotal, totales.descuento, totales.impuestos,
        totales.total, datos.condiciones ?? condicionesPorDefecto(), datos.notas ?? null,
        datos.valida_hasta ?? null, usuario.id,
      ],
    );

    for (const it of totales.items) {
      await t.consultar(
        `INSERT INTO cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad,
                                       precio_unitario, descuento_pct, importe, orden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [cot.id, it.producto_id, it.descripcion, it.cantidad, it.precio_unitario,
          it.descuento_pct, it.importe, it.orden],
      );
    }

    await bitacora.registrar({
      entidad_tipo: 'cotizacion', entidad_id: cot.id, cuenta_id: cot.cuenta_id, tipo: 'cotizacion',
      titulo: `Cotización ${folio} creada`,
      detalle: `Total ${(cot.total / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.`,
      usuario_id: usuario.id, metadata: { folio, total: cot.total },
    }, t);

    return cot;
  });
}

const condicionesPorDefecto = () =>
  'Tarifas vigentes 30 días naturales. No incluye maniobras especiales, estadías ni almacenaje '
  + 'adicional. Sujeto a disponibilidad de unidad en la fecha solicitada. Precios en pesos '
  + 'mexicanos más IVA.';

export async function actualizar(id, datos, usuario) {
  const previo = await uno('SELECT * FROM cotizaciones WHERE id = $1', [id]);
  if (!previo) throw noEncontrado('cotización');
  if (['aceptada', 'rechazada'].includes(previo.estado)) {
    throw peticionInvalida('Una cotización ya resuelta no se puede modificar. Genera una nueva versión.');
  }

  return tx(async (t) => {
    if (datos.items) {
      const totales = calcularTotales(datos.items);
      await t.consultar('DELETE FROM cotizacion_items WHERE cotizacion_id = $1', [id]);
      for (const it of totales.items) {
        await t.consultar(
          `INSERT INTO cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad,
                                         precio_unitario, descuento_pct, importe, orden)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, it.producto_id, it.descripcion, it.cantidad, it.precio_unitario,
            it.descuento_pct, it.importe, it.orden],
        );
      }
      await t.consultar(
        `UPDATE cotizaciones SET subtotal = $2, descuento = $3, impuestos = $4, total = $5 WHERE id = $1`,
        [id, totales.subtotal, totales.descuento, totales.impuestos, totales.total],
      );
    }

    const columnas = ['contacto_id', 'condiciones', 'notas', 'valida_hasta', 'oportunidad_id'];
    const cambios = columnas.filter((k) => datos[k] !== undefined);
    if (cambios.length) {
      const asignaciones = cambios.map((k, i) => `${k} = $${i + 1}`);
      await t.consultar(
        `UPDATE cotizaciones SET ${asignaciones.join(', ')} WHERE id = $${cambios.length + 1}`,
        [...cambios.map((k) => datos[k]), id],
      );
    }
    void usuario;
    return t.uno('SELECT * FROM cotizaciones WHERE id = $1', [id]);
  });
}

const TRANSICIONES = {
  borrador: ['enviada'],
  enviada: ['vista', 'aceptada', 'rechazada', 'vencida'],
  vista: ['aceptada', 'rechazada', 'vencida'],
  vencida: ['enviada'],
  aceptada: [],
  rechazada: [],
};

/**
 * Cambio de estado con máquina de estados explícita: una cotización no puede pasar
 * de borrador a aceptada sin haberse enviado. Aceptarla mueve la oportunidad a
 * negociación, que es lo que el vendedor espera que pase solo.
 */
export async function cambiarEstado(id, estadoNuevo, usuario) {
  return tx(async (t) => {
    const cot = await t.uno('SELECT * FROM cotizaciones WHERE id = $1 FOR UPDATE', [id]);
    if (!cot) throw noEncontrado('cotización');

    const permitidas = TRANSICIONES[cot.estado] ?? [];
    if (!permitidas.includes(estadoNuevo)) {
      throw peticionInvalida(
        `No se puede pasar de «${cot.estado}» a «${estadoNuevo}». Transiciones válidas: ${permitidas.join(', ') || 'ninguna'}.`,
      );
    }

    const actualizada = await t.uno(
      `UPDATE cotizaciones
          SET estado = $2,
              enviada_en = CASE WHEN $2 = 'enviada' THEN now() ELSE enviada_en END,
              vista_en = CASE WHEN $2 = 'vista' THEN COALESCE(vista_en, now()) ELSE vista_en END,
              resuelta_en = CASE WHEN $2 IN ('aceptada','rechazada') THEN now() ELSE resuelta_en END
        WHERE id = $1 RETURNING *`,
      [id, estadoNuevo],
    );

    // Aceptar la cotización empuja la oportunidad a negociación si venía antes.
    if (estadoNuevo === 'aceptada' && cot.oportunidad_id) {
      await t.consultar(
        `UPDATE oportunidades
            SET etapa = 'negociacion', etapa_max = 'negociacion', probabilidad = 68,
                ultima_actividad_en = now()
          WHERE id = $1 AND estado = 'abierta'
            AND aura_nivel_etapa(etapa) < aura_nivel_etapa('negociacion')`,
        [cot.oportunidad_id],
      );
    }

    const titulos = {
      enviada: `Cotización ${cot.folio} enviada`,
      vista: `El cliente abrió la cotización ${cot.folio}`,
      aceptada: `✅ Cotización ${cot.folio} aceptada`,
      rechazada: `Cotización ${cot.folio} rechazada`,
      vencida: `Cotización ${cot.folio} vencida`,
    };
    await bitacora.registrar({
      entidad_tipo: 'cotizacion', entidad_id: id, cuenta_id: cot.cuenta_id,
      tipo: estadoNuevo === 'vista' ? 'cotizacion_vista' : 'cotizacion',
      titulo: titulos[estadoNuevo],
      detalle: estadoNuevo === 'vista'
        ? 'Señal de compra: el documento fue abierto por el cliente.'
        : `Total ${(cot.total / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.`,
      usuario_id: usuario.id, metadata: { folio: cot.folio, estado: estadoNuevo },
    }, t);

    return actualizada;
  });
}

export async function eliminar(id) {
  const cot = await uno('SELECT estado FROM cotizaciones WHERE id = $1', [id]);
  if (!cot) throw noEncontrado('cotización');
  if (cot.estado !== 'borrador') {
    throw peticionInvalida('Solo se pueden eliminar cotizaciones en borrador.');
  }
  await uno('DELETE FROM cotizaciones WHERE id = $1 RETURNING id', [id]);
}

/**
 * Marca como vencidas las cotizaciones cuya validez pasó. Lo llama el programador
 * y también se puede forzar desde la interfaz.
 */
export async function caducarVencidas() {
  const filas = await consultar(
    `UPDATE cotizaciones SET estado = 'vencida'
      WHERE estado IN ('enviada','vista') AND valida_hasta < CURRENT_DATE
      RETURNING id, folio, cuenta_id`,
  );
  for (const f of filas) {
    await bitacora.registrar({
      entidad_tipo: 'cotizacion', entidad_id: f.id, cuenta_id: f.cuenta_id, tipo: 'cotizacion',
      titulo: `Cotización ${f.folio} vencida`,
      detalle: 'Pasó su fecha de validez sin respuesta del cliente.',
    });
  }
  return filas.length;
}

/** Embudo de cotizaciones: enviadas → vistas → aceptadas, con importes. */
export const embudo = () =>
  uno(
    `SELECT
       count(*) FILTER (WHERE enviada_en IS NOT NULL)::int AS enviadas,
       count(*) FILTER (WHERE vista_en IS NOT NULL)::int AS vistas,
       count(*) FILTER (WHERE estado = 'aceptada')::int AS aceptadas,
       count(*) FILTER (WHERE estado = 'rechazada')::int AS rechazadas,
       COALESCE(sum(total) FILTER (WHERE estado = 'aceptada'), 0)::bigint AS monto_aceptado,
       COALESCE(sum(total) FILTER (WHERE estado IN ('enviada','vista')), 0)::bigint AS monto_en_juego,
       round(avg(EXTRACT(epoch FROM resuelta_en - enviada_en) / 86400)
         FILTER (WHERE resuelta_en IS NOT NULL))::int AS dias_promedio_respuesta
     FROM cotizaciones WHERE creado_en > now() - interval '12 months'`,
  );
