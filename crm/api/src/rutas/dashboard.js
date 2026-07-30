import { Router } from 'express';
import * as dashboard from '../servicios/dashboard.js';
import * as bitacora from '../servicios/bitacora.js';
import { asincrono } from '../lib/errores.js';
import { unoDe, listaTexto } from '../lib/validar.js';

const r = Router();

/** Todo el dashboard en una sola petición. */
r.get('/', asincrono(async (req, res) => {
  const alcance = unoDe(req.query.alcance, 'alcance', ['auto', 'mio', 'equipo', 'todo']) ?? 'auto';
  res.json(await dashboard.resumen(req.usuario, { alcance }));
}));

r.get('/notificaciones', asincrono(async (req, res) => {
  res.json(await bitacora.notificaciones(req.usuario.id, {
    soloNoLeidas: req.query.no_leidas === '1',
  }));
}));

r.put('/notificaciones/leidas', asincrono(async (req, res) => {
  const ids = listaTexto(req.body?.ids, 'ids')?.map(Number).filter(Number.isInteger) ?? null;
  await bitacora.marcarLeidas(req.usuario.id, ids?.length ? ids : null);
  res.json({ ok: true });
}));

export default r;
