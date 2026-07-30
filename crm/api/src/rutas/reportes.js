import { Router } from 'express';
import * as rep from '../servicios/reportes.js';
import { asincrono } from '../lib/errores.js';
import { entero, unoDe, texto } from '../lib/validar.js';

const r = Router();

const alcanceDe = (req) => unoDe(req.query.alcance, 'alcance', ['auto', 'mio', 'todo']) ?? 'auto';
const mesesDe = (req, porDefecto = 12) =>
  entero(req.query.meses, 'meses', { min: 1, max: 36 }) ?? porDefecto;

/** Todo el tablero de reportes en una petición. */
r.get('/', asincrono(async (req, res) => {
  const alcance = alcanceDe(req);
  const meses = mesesDe(req);
  const [kpis, ingresos, embudo, vendedores, velocidad, industrias, productos, perdidas, competencia, calor] =
    await Promise.all([
      rep.kpis(req.usuario, { alcance }),
      rep.ingresos(req.usuario, { meses, alcance }),
      rep.embudo(req.usuario, { alcance, meses }),
      rep.porVendedor(req.usuario, { meses: 3 }),
      rep.velocidad(),
      rep.porIndustria(),
      rep.porProducto(),
      rep.perdidas(),
      rep.competencia(),
      rep.mapaCalorActividad(req.usuario, { alcance, meses: 3 }),
    ]);
  res.json({
    kpis, ingresos, embudo, vendedores, velocidad, industrias, productos,
    perdidas, competencia, mapaCalor: calor,
  });
}));

r.get('/kpis', asincrono(async (req, res) => res.json(await rep.kpis(req.usuario, { alcance: alcanceDe(req) }))));

r.get('/ingresos', asincrono(async (req, res) => {
  res.json(await rep.ingresos(req.usuario, { meses: mesesDe(req), alcance: alcanceDe(req) }));
}));

r.get('/embudo', asincrono(async (req, res) => {
  res.json(await rep.embudo(req.usuario, { alcance: alcanceDe(req), meses: mesesDe(req) }));
}));

r.get('/vendedores', asincrono(async (req, res) => {
  res.json(await rep.porVendedor(req.usuario, { meses: mesesDe(req, 3) }));
}));

r.get('/velocidad', asincrono(async (_req, res) => res.json(await rep.velocidad())));
r.get('/industrias', asincrono(async (_req, res) => res.json(await rep.porIndustria())));
r.get('/productos', asincrono(async (_req, res) => res.json(await rep.porProducto())));
r.get('/cartera', asincrono(async (_req, res) => res.json(await rep.cartera())));
r.get('/perdidas', asincrono(async (_req, res) => res.json(await rep.perdidas())));
r.get('/competencia', asincrono(async (_req, res) => res.json(await rep.competencia())));

r.get('/mapa-calor', asincrono(async (req, res) => {
  res.json(await rep.mapaCalorActividad(req.usuario, { alcance: alcanceDe(req), meses: mesesDe(req, 3) }));
}));

/** Exportación CSV con lista blanca de reportes. */
r.get('/exportar/:reporte', asincrono(async (req, res) => {
  const reporte = texto(req.params.reporte, 'reporte', { requerido: true, max: 40 });
  const csv = await rep.exportarCSV(reporte, req.usuario, {
    meses: mesesDe(req), alcance: alcanceDe(req),
  });
  const fecha = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="aura-${reporte}-${fecha}.csv"`);
  res.send(csv);
}));

export default r;
