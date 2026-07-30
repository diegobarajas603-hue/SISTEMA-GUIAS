import { Router } from 'express';
import * as aut from '../servicios/automatizaciones.js';
import { asincrono } from '../lib/errores.js';
import { texto, entero, unoDe, booleano } from '../lib/validar.js';
import { exigirRol } from '../middleware/sesion.js';

const r = Router();

const EVENTOS = ['lead.creado', 'oportunidad.etapa', 'oportunidad.ganada', 'ticket.creado',
  'cron.diario', 'cron.semanal'];

r.get('/', asincrono(async (_req, res) => res.json(await aut.listar())));

/** Catálogo de nodos: la paleta del editor visual se construye con esto. */
r.get('/catalogo', (_req, res) => res.json(aut.CATALOGO_NODOS));

r.get('/metricas', asincrono(async (_req, res) => res.json(await aut.metricas())));

r.get('/ejecuciones', asincrono(async (req, res) => {
  res.json(await aut.ejecucionesRecientes(entero(req.query.limite, 'limite', { min: 1, max: 100 }) ?? 40));
}));

r.get('/:id', asincrono(async (req, res) => {
  res.json(await aut.porId(entero(req.params.id, 'id', { requerido: true })));
}));

/** Valida un grafo sin guardarlo: el editor lo llama mientras se dibuja. */
r.post('/validar', (req, res) => {
  res.json(aut.validarGrafo(req.body?.nodos ?? [], req.body?.aristas ?? []));
});

r.post('/', exigirRol('gerente'), asincrono(async (req, res) => {
  res.status(201).json(await aut.crear({
    nombre: texto(req.body?.nombre, 'nombre', { requerido: true, max: 160 }),
    descripcion: texto(req.body?.descripcion, 'descripcion', { max: 2000 }),
    activa: booleano(req.body?.activa),
    evento: unoDe(req.body?.evento, 'evento', EVENTOS),
    nodos: req.body?.nodos ?? [],
    aristas: req.body?.aristas ?? [],
  }, req.usuario));
}));

r.put('/:id', exigirRol('gerente'), asincrono(async (req, res) => {
  res.json(await aut.actualizar(entero(req.params.id, 'id', { requerido: true }), {
    nombre: texto(req.body?.nombre, 'nombre', { max: 160 }),
    descripcion: texto(req.body?.descripcion, 'descripcion', { max: 2000 }),
    activa: booleano(req.body?.activa),
    evento: unoDe(req.body?.evento, 'evento', EVENTOS),
    nodos: req.body?.nodos,
    aristas: req.body?.aristas,
  }));
}));

r.put('/:id/activa', exigirRol('gerente'), asincrono(async (req, res) => {
  const activa = booleano(req.body?.activa);
  res.json(await aut.alternar(entero(req.params.id, 'id', { requerido: true }), activa ?? false));
}));

/**
 * Ejecución manual. `simulacion=1` recorre el grafo sin escribir nada, que es lo que
 * uno quiere antes de activar un flujo que va a tocar cientos de registros.
 */
r.post('/:id/ejecutar', exigirRol('gerente'), asincrono(async (req, res) => {
  res.json(await aut.ejecutarAhora(entero(req.params.id, 'id', { requerido: true }), {
    entidad_tipo: unoDe(req.body?.entidad_tipo, 'entidad_tipo', ['lead', 'oportunidad', 'cuenta', 'ticket']),
    entidad_id: entero(req.body?.entidad_id, 'entidad_id'),
    simulacion: booleano(req.body?.simulacion) ?? false,
  }));
}));

r.delete('/:id', exigirRol('gerente'), asincrono(async (req, res) => {
  await aut.eliminar(entero(req.params.id, 'id', { requerido: true }));
  res.json({ ok: true });
}));

export default r;
