import { consultar, uno, valor, tx, armarUpdate } from '../db/pool.js';
import { noEncontrado, peticionInvalida } from '../lib/errores.js';
import { calcularCotizacion } from '@aura/compartido';
import * as bitacora from './bitacora.js';

const IVA = 0.16;

const SELECT_COT = `
  SELECT q.*, c.nombre AS cuenta_nombre, c.nombre_comercial AS cuenta_comercial, c.rfc,
         c.telefono AS cuenta_telefono, c.email AS cuenta_email,
         c.calle, c.numero, c.colonia, c.ciudad, c.estado, c.codigo_postal, c.pais,
         ct.nombre AS contacto_nombre, ct.email AS contacto_email, ct.telefono AS contacto_telefono,
         ct.puesto AS contacto_puesto,
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
 * Calcula los totales de una cotización de flete.
 *
 * Es la única función que decide importes: ni la pantalla ni el cliente HTTP
 * mandan totales, se derivan siempre aquí a partir de las medidas. El cubicaje
 * lo resuelve `@aura/compartido`, el mismo módulo que usa el navegador para la
 * vista previa, así que lo que el usuario ve mientras captura y lo que se guarda
 * no pueden separarse.
 */
export function calcularTotales(items, tipoMercancia = 'general') {
  const cubicaje = calcularCotizacion(items, tipoMercancia);

  const calculados = cubicaje.renglones.map((r, i) => ({
    producto_id: items[i]?.producto_id ?? null,
    descripcion: items[i]?.descripcion ?? null,
    cantidad: r.cantidad,
    peso_real: r.peso_real,
    largo: r.largo,
    ancho: r.ancho,
    alto: r.alto,
    estibable: r.estibable,
    peso_volumetrico: r.peso_volumetrico,
    peso_cobrable: r.peso_cobrable,
    // El renglón se cobra por su peso cobrable a la tarifa del envío.
    precio_unitario: cubicaje.tarifa_centavos_kg,
    descuento_pct: 0,
    importe: Math.round(r.peso_cobrable * cubicaje.tarifa_centavos_kg),
    orden: items[i]?.orden ?? i,
  }));

  const subtotal = cubicaje.importe;
  const impuestos = Math.round(subtotal * IVA);

  return {
    items: calculados,
    subtotal,
    descuento: 0,
    impuestos,
    total: subtotal + impuestos,
    tipo_mercancia: cubicaje.tipo_mercancia,
    tarifa_centavos_kg: cubicaje.tarifa_centavos_kg,
    factor_volumetrico: cubicaje.factor_volumetrico,
    peso_real_total: cubicaje.peso_real_total,
    peso_volumetrico_total: cubicaje.peso_volumetrico_total,
    peso_cobrable_total: cubicaje.peso_cobrable_total,
    piezas: cubicaje.piezas,
  };
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
  if (!datos.cuenta_id) throw peticionInvalida('La cotización debe ir ligada a un cliente.');
  if (!datos.items?.length) throw peticionInvalida('Agrega al menos una tarima o bulto.');

  return tx(async (t) => {
    const totales = calcularTotales(datos.items, datos.tipo_mercancia);
    const folio = await siguienteFolio(t);

    const cot = await t.uno(
      `INSERT INTO cotizaciones (folio, oportunidad_id, cuenta_id, contacto_id, propietario_id,
                                 estado, subtotal, descuento, impuestos, total, condiciones, notas,
                                 valida_hasta, origen, destino, descripcion_envio, tipo_mercancia,
                                 tarifa_centavos_kg, factor_volumetrico, peso_real_total,
                                 peso_volumetrico_total, peso_cobrable_total, observaciones)
       VALUES ($1,$2,$3,$4,COALESCE($5::int,$13::int),'borrador',$6,$7,$8,$9,$10,$11,
               COALESCE($12, CURRENT_DATE + 30),$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [
        folio, datos.oportunidad_id ?? null, datos.cuenta_id, datos.contacto_id ?? null,
        datos.propietario_id ?? null, totales.subtotal, totales.descuento, totales.impuestos,
        totales.total, datos.condiciones ?? condicionesPorDefecto(), datos.notas ?? null,
        datos.valida_hasta ?? null, usuario.id,
        datos.origen ?? null, datos.destino ?? null, datos.descripcion_envio ?? null,
        totales.tipo_mercancia, totales.tarifa_centavos_kg, totales.factor_volumetrico,
        totales.peso_real_total, totales.peso_volumetrico_total, totales.peso_cobrable_total,
        datos.observaciones ?? null,
      ],
    );

    await insertarRenglones(t, cot.id, totales.items);

    await bitacora.registrar({
      entidad_tipo: 'cotizacion', entidad_id: cot.id, cuenta_id: cot.cuenta_id, tipo: 'cotizacion',
      titulo: `Cotización ${folio} creada`,
      detalle: `${totales.peso_cobrable_total} kg cobrables · ${(cot.total / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.`,
      usuario_id: usuario.id, metadata: { folio, total: cot.total, peso: totales.peso_cobrable_total },
    }, t);

    return cot;
  });
}

/** Reescribe los renglones de una cotización con su cubicaje ya calculado. */
async function insertarRenglones(t, cotizacionId, items) {
  for (const it of items) {
    await t.consultar(
      `INSERT INTO cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad,
                                     precio_unitario, descuento_pct, importe, orden,
                                     peso_real, largo, ancho, alto, estibable,
                                     peso_volumetrico, peso_cobrable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        cotizacionId, it.producto_id, it.descripcion, it.cantidad, it.precio_unitario,
        it.descuento_pct, it.importe, it.orden, it.peso_real, it.largo, it.ancho,
        it.alto, it.estibable, it.peso_volumetrico, it.peso_cobrable,
      ],
    );
  }
}

/** Condiciones que acompañan a toda cotización de flete, salvo que se sustituyan. */
export const CONDICIONES = [
  'Cotización sujeta a disponibilidad de unidad en la fecha solicitada.',
  'Tarifas sujetas a cambios sin previo aviso.',
  'Vigencia según la fecha indicada en el encabezado de esta cotización.',
  'No incluye maniobras de carga y descarga salvo que se especifique.',
  'La mercancía debe cumplir las restricciones aplicables a su tipo; la carga química requiere hoja de seguridad y embalaje conforme a la NOM correspondiente.',
  'Precios en pesos mexicanos más IVA.',
];

const condicionesPorDefecto = () => CONDICIONES.join('\n');

export async function actualizar(id, datos, usuario) {
  const previo = await uno('SELECT * FROM cotizaciones WHERE id = $1', [id]);
  if (!previo) throw noEncontrado('cotización');
  if (['aceptada', 'rechazada'].includes(previo.estado)) {
    throw peticionInvalida('Una cotización ya resuelta no se puede modificar. Genera una nueva versión.');
  }

  return tx(async (t) => {
    if (datos.items) {
      // El tipo de mercancía cambia la tarifa, así que si no viene en la petición
      // se conserva el que ya tenía la cotización: recalcular con el de por
      // omisión abarataría un envío químico sin que nadie lo pidiera.
      const tipo = datos.tipo_mercancia ?? previo.tipo_mercancia;
      const totales = calcularTotales(datos.items, tipo);

      await t.consultar('DELETE FROM cotizacion_items WHERE cotizacion_id = $1', [id]);
      await insertarRenglones(t, id, totales.items);

      await t.consultar(
        `UPDATE cotizaciones
            SET subtotal = $2, descuento = $3, impuestos = $4, total = $5,
                tipo_mercancia = $6, tarifa_centavos_kg = $7, factor_volumetrico = $8,
                peso_real_total = $9, peso_volumetrico_total = $10, peso_cobrable_total = $11
          WHERE id = $1`,
        [
          id, totales.subtotal, totales.descuento, totales.impuestos, totales.total,
          totales.tipo_mercancia, totales.tarifa_centavos_kg, totales.factor_volumetrico,
          totales.peso_real_total, totales.peso_volumetrico_total, totales.peso_cobrable_total,
        ],
      );
    }

    const columnas = ['contacto_id', 'condiciones', 'notas', 'valida_hasta', 'oportunidad_id',
      'origen', 'destino', 'descripcion_envio', 'observaciones'];
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
