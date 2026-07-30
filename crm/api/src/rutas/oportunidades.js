import { Router } from 'express';
import * as ops from '../servicios/oportunidades.js';
import { asincrono } from '../lib/errores.js';
import { texto, entero, unoDe, listaTexto, booleano, paginacion, orden } from '../lib/validar.js';

const r = Router();

const ETAPAS = ['calificado', 'propuesta', 'negociacion', 'ganado', 'perdido'];
const TIPOS = ['nuevo', 'renovacion', 'expansion', 'venta_cruzada'];

r.get('/', asincrono(async (req, res) => {
  const { limite, desplazamiento, pagina } = paginacion(req.query, { limitePorDefecto: 200, limiteMax: 400 });
  const resultado = await ops.listar({
    etapa: unoDe(req.query.etapa, 'etapa', ETAPAS),
    estado: unoDe(req.query.estado, 'estado', ['abierta', 'ganada', 'perdida', 'todas']) ?? 'abierta',
    propietario: entero(req.query.propietario, 'propietario'),
    cuenta: entero(req.query.cuenta, 'cuenta'),
    busqueda: texto(req.query.q, 'q', { max: 80 }),
    montoMin: entero(req.query.monto_min, 'monto_min', { min: 0 }),
    etiquetas: listaTexto(req.query.etiquetas, 'etiquetas'),
    soloMios: booleano(req.query.mios),
    estancadas: booleano(req.query.estancadas),
    cierreDesde: texto(req.query.cierre_desde, 'cierre_desde', { max: 20 }),
    cierreHasta: texto(req.query.cierre_hasta, 'cierre_hasta', { max: 20 }),
    orden: orden(req.query, ['monto', 'cierre_estimado', 'creado_en', 'probabilidad', 'ia_probabilidad', 'nombre', 'ultima_actividad_en'], 'monto'),
    limite, desplazamiento,
  }, req.usuario);
  res.json({ ...resultado, pagina });
}));

r.get('/resumen', asincrono(async (req, res) => {
  res.json(await ops.resumenPorEtapa(req.usuario, booleano(req.query.mios) ?? false));
}));

r.get('/pronostico', asincrono(async (req, res) => {
  const alcance = unoDe(req.query.alcance, 'alcance', ['auto', 'mio', 'todo']) ?? 'auto';
  res.json(await ops.pronostico(req.usuario, { alcance }));
}));

r.get('/estancadas', asincrono(async (req, res) => {
  res.json(await ops.estancadas(req.usuario, entero(req.query.dias, 'dias', { min: 1, max: 365 }) ?? 14));
}));

r.get('/motivos-perdida', asincrono(async (_req, res) => res.json(await ops.motivosPerdida())));

r.get('/:id', asincrono(async (req, res) => {
  res.json(await ops.porId(entero(req.params.id, 'id', { requerido: true })));
}));

const leerProductos = (body) => {
  if (!Array.isArray(body?.productos)) return undefined;
  return body.productos.map((p) => ({
    producto_id: entero(p.producto_id, 'producto_id', { requerido: true }),
    cantidad: Number(p.cantidad ?? 1),
    precio_unitario: entero(p.precio_unitario, 'precio_unitario', { min: 0 }) ?? 0,
    descuento_pct: entero(p.descuento_pct, 'descuento_pct', { min: 0, max: 100 }) ?? 0,
  }));
};

r.post('/', asincrono(async (req, res) => {
  const datos = {
    nombre: texto(req.body?.nombre, 'nombre', { requerido: true, max: 200 }),
    cuenta_id: entero(req.body?.cuenta_id, 'cuenta_id', { requerido: true }),
    contacto_id: entero(req.body?.contacto_id, 'contacto_id'),
    propietario_id: entero(req.body?.propietario_id, 'propietario_id'),
    campana_id: entero(req.body?.campana_id, 'campana_id'),
    etapa: unoDe(req.body?.etapa, 'etapa', ['calificado', 'propuesta', 'negociacion']),
    monto: entero(req.body?.monto, 'monto', { min: 0 }),
    cierre_estimado: texto(req.body?.cierre_estimado, 'cierre_estimado', { max: 20 }),
    competidor: texto(req.body?.competidor, 'competidor', { max: 100 }),
    origen: texto(req.body?.origen, 'origen', { max: 60 }),
    tipo: unoDe(req.body?.tipo, 'tipo', TIPOS),
    siguiente_paso: texto(req.body?.siguiente_paso, 'siguiente_paso', { max: 200 }),
    etiquetas: listaTexto(req.body?.etiquetas, 'etiquetas'),
    productos: leerProductos(req.body),
  };
  res.status(201).json(await ops.crear(datos, req.usuario));
}));

r.put('/:id', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const datos = {
    nombre: texto(req.body?.nombre, 'nombre', { max: 200 }),
    contacto_id: entero(req.body?.contacto_id, 'contacto_id'),
    propietario_id: entero(req.body?.propietario_id, 'propietario_id'),
    monto: entero(req.body?.monto, 'monto', { min: 0 }),
    monto_recurrente: entero(req.body?.monto_recurrente, 'monto_recurrente', { min: 0 }),
    probabilidad: entero(req.body?.probabilidad, 'probabilidad', { min: 0, max: 100 }),
    cierre_estimado: texto(req.body?.cierre_estimado, 'cierre_estimado', { max: 20 }),
    competidor: texto(req.body?.competidor, 'competidor', { max: 100 }),
    tipo: unoDe(req.body?.tipo, 'tipo', TIPOS),
    siguiente_paso: texto(req.body?.siguiente_paso, 'siguiente_paso', { max: 200 }),
    etiquetas: listaTexto(req.body?.etiquetas, 'etiquetas'),
    campana_id: entero(req.body?.campana_id, 'campana_id'),
    productos: leerProductos(req.body),
  };
  res.json(await ops.actualizar(id, datos, req.usuario));
}));

/** Arrastrar en el tablero llega aquí. Es la escritura más frecuente del CRM. */
r.put('/:id/etapa', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const etapa = unoDe(req.body?.etapa, 'etapa', ETAPAS, { requerido: true });
  res.json(await ops.moverEtapa(id, etapa, req.usuario, {
    motivo_perdida: texto(req.body?.motivo_perdida, 'motivo_perdida', { max: 200 }),
  }));
}));

r.post('/:id/recalcular', asincrono(async (req, res) => {
  res.json(await ops.recalcularUna(entero(req.params.id, 'id', { requerido: true })));
}));

r.delete('/:id', asincrono(async (req, res) => {
  await ops.eliminar(entero(req.params.id, 'id', { requerido: true }));
  res.json({ ok: true });
}));

export default r;
