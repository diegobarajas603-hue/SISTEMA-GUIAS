import { Router } from 'express';
import * as cot from '../servicios/cotizaciones.js';
import { generarCotizacionPDF } from '../pdf/cotizacion.js';
import { asincrono, peticionInvalida } from '../lib/errores.js';
import { texto, entero, unoDe, booleano, paginacion } from '../lib/validar.js';

const r = Router();

const ESTADOS = ['borrador', 'enviada', 'vista', 'aceptada', 'rechazada', 'vencida'];

const TIPOS_MERCANCIA = ['general', 'quimico'];

/** Medida en metros o kilos: se acepta con coma o punto decimal. */
const medida = (valor, campo, max) => {
  if (valor === undefined || valor === null || valor === '') return 0;
  const n = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw peticionInvalida(`«${campo}» debe ser un número positivo.`);
  if (n > max) throw peticionInvalida(`«${campo}» no puede pasar de ${max}.`);
  return n;
};

/**
 * Renglones de mercancía. Los importes NO se leen del cliente: se derivan del
 * cubicaje en el servicio, así que aquí solo entran medidas.
 */
const leerItems = (body, { requerido = false } = {}) => {
  if (!Array.isArray(body?.items)) {
    if (requerido) throw peticionInvalida('Agrega al menos una tarima o bulto.');
    return undefined;
  }
  if (body.items.length > 100) throw peticionInvalida('Máximo 100 renglones por cotización.');

  return body.items.map((it, i) => ({
    producto_id: entero(it.producto_id, 'producto_id'),
    descripcion: texto(it.descripcion, 'descripcion', { max: 300 }) ?? null,
    cantidad: entero(it.cantidad ?? 1, 'cantidad', { min: 1, max: 9999 }) ?? 1,
    peso_real: medida(it.peso_real, 'peso real', 100_000),
    largo: medida(it.largo, 'largo', 30),
    ancho: medida(it.ancho, 'ancho', 30),
    alto: medida(it.alto, 'alto', 30),
    estibable: booleano(it.estibable) ?? false,
    orden: entero(it.orden, 'orden', { min: 0 }) ?? i,
  }));
};

/** Campos del envío, comunes al alta y a la edición. */
const leerEnvio = (body) => ({
  origen: texto(body?.origen, 'origen', { max: 160 }),
  destino: texto(body?.destino, 'destino', { max: 160 }),
  descripcion_envio: texto(body?.descripcion_envio, 'descripcion_envio', { max: 1000 }),
  observaciones: texto(body?.observaciones, 'observaciones', { max: 2000 }),
  tipo_mercancia: unoDe(body?.tipo_mercancia, 'tipo_mercancia', TIPOS_MERCANCIA),
});

r.get('/', asincrono(async (req, res) => {
  const { limite, desplazamiento, pagina } = paginacion(req.query, { limitePorDefecto: 60 });
  const resultado = await cot.listar({
    estado: unoDe(req.query.estado, 'estado', ESTADOS),
    cuenta: entero(req.query.cuenta, 'cuenta'),
    propietario: entero(req.query.propietario, 'propietario'),
    busqueda: texto(req.query.q, 'q', { max: 80 }),
    soloMios: booleano(req.query.mios),
    sinRespuesta: booleano(req.query.sin_respuesta),
    limite, desplazamiento,
  }, req.usuario);
  res.json({ ...resultado, pagina });
}));

r.get('/embudo', asincrono(async (_req, res) => res.json(await cot.embudo())));

r.get('/:id', asincrono(async (req, res) => {
  res.json(await cot.porId(entero(req.params.id, 'id', { requerido: true })));
}));

/** Vista previa de totales sin guardar: el cotizador la usa mientras se escribe. */
/**
 * PDF de la cotización. Los datos del cliente salen de su ficha, no de la
 * petición: el documento siempre refleja lo que hay en la base.
 */
r.get('/:id/pdf', asincrono(async (req, res) => {
  const cotizacion = await cot.porId(entero(req.params.id, 'id', { requerido: true }));
  const nombre = `Cotizacion-${cotizacion.folio}-Fletes-Tauro.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  // `inline` para que se pueda revisar en el navegador antes de mandarla.
  res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
  generarCotizacionPDF(cotizacion).pipe(res);
}));

r.post('/calcular', asincrono(async (req, res) => {
  const tipo = unoDe(req.body?.tipo_mercancia, 'tipo_mercancia', TIPOS_MERCANCIA) ?? 'general';
  res.json(cot.calcularTotales(leerItems(req.body, { requerido: true }), tipo));
}));

r.post('/', asincrono(async (req, res) => {
  const datos = {
    cuenta_id: entero(req.body?.cuenta_id, 'cuenta_id', { requerido: true }),
    oportunidad_id: entero(req.body?.oportunidad_id, 'oportunidad_id'),
    contacto_id: entero(req.body?.contacto_id, 'contacto_id'),
    propietario_id: entero(req.body?.propietario_id, 'propietario_id'),
    condiciones: texto(req.body?.condiciones, 'condiciones', { max: 3000 }),
    notas: texto(req.body?.notas, 'notas', { max: 2000 }),
    valida_hasta: texto(req.body?.valida_hasta, 'valida_hasta', { max: 20 }),
    ...leerEnvio(req.body),
    items: leerItems(req.body, { requerido: true }),
  };
  res.status(201).json(await cot.crear(datos, req.usuario));
}));

r.put('/:id', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  res.json(await cot.actualizar(id, {
    contacto_id: entero(req.body?.contacto_id, 'contacto_id'),
    oportunidad_id: entero(req.body?.oportunidad_id, 'oportunidad_id'),
    condiciones: texto(req.body?.condiciones, 'condiciones', { max: 3000 }),
    notas: texto(req.body?.notas, 'notas', { max: 2000 }),
    valida_hasta: texto(req.body?.valida_hasta, 'valida_hasta', { max: 20 }),
    ...leerEnvio(req.body),
    items: leerItems(req.body),
  }, req.usuario));
}));

r.put('/:id/estado', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const estado = unoDe(req.body?.estado, 'estado', ESTADOS, { requerido: true });
  res.json(await cot.cambiarEstado(id, estado, req.usuario));
}));

r.post('/caducar-vencidas', asincrono(async (_req, res) => {
  res.json({ caducadas: await cot.caducarVencidas() });
}));

r.delete('/:id', asincrono(async (req, res) => {
  await cot.eliminar(entero(req.params.id, 'id', { requerido: true }));
  res.json({ ok: true });
}));

export default r;
