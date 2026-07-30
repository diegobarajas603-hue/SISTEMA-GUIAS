import { Router } from 'express';
import * as cot from '../servicios/cotizaciones.js';
import { asincrono, peticionInvalida } from '../lib/errores.js';
import { texto, entero, unoDe, booleano, paginacion } from '../lib/validar.js';

const r = Router();

const ESTADOS = ['borrador', 'enviada', 'vista', 'aceptada', 'rechazada', 'vencida'];

const leerItems = (body, { requerido = false } = {}) => {
  if (!Array.isArray(body?.items)) {
    if (requerido) throw peticionInvalida('La cotización necesita al menos un concepto.');
    return undefined;
  }
  return body.items.map((it, i) => ({
    producto_id: entero(it.producto_id, 'producto_id'),
    descripcion: texto(it.descripcion, 'descripcion', { requerido: true, max: 300 }),
    cantidad: Number(it.cantidad ?? 1),
    precio_unitario: entero(it.precio_unitario, 'precio_unitario', { min: 0 }) ?? 0,
    descuento_pct: entero(it.descuento_pct, 'descuento_pct', { min: 0, max: 100 }) ?? 0,
    orden: entero(it.orden, 'orden', { min: 0 }) ?? i,
  }));
};

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
r.post('/calcular', asincrono(async (req, res) => {
  res.json(cot.calcularTotales(leerItems(req.body, { requerido: true })));
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
