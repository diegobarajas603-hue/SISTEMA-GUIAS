import { Router } from 'express';
import * as cat from '../servicios/catalogo.js';
import { asincrono } from '../lib/errores.js';
import { texto, entero, booleano } from '../lib/validar.js';
import { exigirRol } from '../middleware/sesion.js';

const r = Router();

/** Búsqueda global de la paleta ⌘K. */
r.get('/buscar', asincrono(async (req, res) => {
  res.json(await cat.buscar(
    texto(req.query.q, 'q', { max: 80 }) ?? '',
    { limite: entero(req.query.limite, 'limite', { min: 1, max: 50 }) ?? 24 },
  ));
}));

r.get('/productos', asincrono(async (req, res) => {
  res.json(await cat.productos({ soloActivos: booleano(req.query.todos) !== true }));
}));

r.post('/productos', exigirRol('gerente'), asincrono(async (req, res) => {
  res.status(201).json(await cat.crearProducto({
    sku: texto(req.body?.sku, 'sku', { requerido: true, max: 30 }),
    nombre: texto(req.body?.nombre, 'nombre', { requerido: true, max: 160 }),
    descripcion: texto(req.body?.descripcion, 'descripcion', { max: 2000 }),
    categoria: texto(req.body?.categoria, 'categoria', { max: 80 }),
    unidad: texto(req.body?.unidad, 'unidad', { max: 40 }),
    precio_base: entero(req.body?.precio_base, 'precio_base', { min: 0 }),
    costo_base: entero(req.body?.costo_base, 'costo_base', { min: 0 }),
    margen_meta: entero(req.body?.margen_meta, 'margen_meta', { min: 0, max: 100 }),
    volumen_mensual: entero(req.body?.volumen_mensual, 'volumen_mensual', { min: 1, max: 100_000 }),
    recurrente: booleano(req.body?.recurrente),
  }));
}));

r.put('/productos/:id', exigirRol('gerente'), asincrono(async (req, res) => {
  res.json(await cat.actualizarProducto(entero(req.params.id, 'id', { requerido: true }), {
    nombre: texto(req.body?.nombre, 'nombre', { max: 160 }),
    descripcion: texto(req.body?.descripcion, 'descripcion', { max: 2000 }),
    categoria: texto(req.body?.categoria, 'categoria', { max: 80 }),
    unidad: texto(req.body?.unidad, 'unidad', { max: 40 }),
    precio_base: entero(req.body?.precio_base, 'precio_base', { min: 0 }),
    costo_base: entero(req.body?.costo_base, 'costo_base', { min: 0 }),
    margen_meta: entero(req.body?.margen_meta, 'margen_meta', { min: 0, max: 100 }),
    volumen_mensual: entero(req.body?.volumen_mensual, 'volumen_mensual', { min: 1, max: 100_000 }),
    recurrente: booleano(req.body?.recurrente),
    activo: booleano(req.body?.activo),
  }));
}));

export default r;
