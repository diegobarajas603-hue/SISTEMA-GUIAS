import { Router } from 'express';
import * as imp from '../servicios/importacion.js';
import { asincrono } from '../lib/errores.js';
import { entero, texto } from '../lib/validar.js';
import { limitar, exigirRol } from '../middleware/sesion.js';

const r = Router();

// Importar es una escritura masiva: se reserva a quien puede administrar cartera.
r.use(exigirRol('gerente'));

/** Campos destino, estados y ejecutivos: con esto el asistente se construye solo. */
r.get('/campos', asincrono(async (_req, res) => res.json(await imp.catalogo())));

/**
 * Diagnóstico previo. No escribe nada: dice qué ya existe y qué ejecutivos no se
 * reconocen para que el usuario elija estrategia antes de tocar la base.
 */
r.post('/analizar', asincrono(async (req, res) => {
  res.json(await imp.analizar(req.body?.clientes ?? [], req.usuario));
}));

r.post('/', asincrono(async (req, res) => {
  const importacion = await imp.iniciar({
    archivo: texto(req.body?.archivo, 'archivo', { max: 260 }),
    tamano_bytes: entero(req.body?.tamano_bytes, 'tamano_bytes', { min: 0, max: 2 ** 40 }),
    estrategia: req.body?.estrategia,
    total_filas: entero(req.body?.total_filas, 'total_filas', { min: 0, max: 5_000_000 }),
    total_clientes: entero(req.body?.total_clientes, 'total_clientes', { min: 0, max: 5_000_000 }),
    mapeo: req.body?.mapeo,
  }, req.usuario);
  res.status(201).json(importacion);
}));

// El lote es lo único que se llama en bucle; su límite es más alto a propósito.
r.post('/:id/lote', limitar({ maximo: 600, ventanaMs: 60_000, clave: 'importacion-lote' }),
  asincrono(async (req, res) => {
    res.json(await imp.procesarLote(
      entero(req.params.id, 'id', { requerido: true }),
      req.body?.clientes ?? [],
      { estrategia: req.body?.estrategia },
      req.usuario,
    ));
  }));

r.post('/:id/finalizar', asincrono(async (req, res) => {
  res.json(await imp.finalizar(
    entero(req.params.id, 'id', { requerido: true }), req.body, req.usuario,
  ));
}));

r.get('/', asincrono(async (req, res) => {
  res.json(await imp.historial({ limite: entero(req.query.limite ?? 30, 'limite', { min: 1, max: 100 }) }));
}));

r.get('/:id', asincrono(async (req, res) => {
  res.json(await imp.porId(entero(req.params.id, 'id', { requerido: true })));
}));

export default r;
