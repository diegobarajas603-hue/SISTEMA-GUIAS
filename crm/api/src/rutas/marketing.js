import { Router } from 'express';
import * as mk from '../servicios/marketing.js';
import { asincrono } from '../lib/errores.js';
import { texto, entero, unoDe, booleano } from '../lib/validar.js';
import { exigirRol } from '../middleware/sesion.js';

const r = Router();

const TIPOS = ['email', 'social', 'paid', 'evento', 'webinar', 'referido', 'contenido', 'telemarketing'];
const ESTADOS = ['borrador', 'programada', 'activa', 'pausada', 'finalizada'];

r.get('/', asincrono(async (_req, res) => res.json(await mk.panorama())));

r.get('/campanas', asincrono(async (req, res) => {
  res.json(await mk.listarCampanas({
    estado: unoDe(req.query.estado, 'estado', ESTADOS),
    tipo: unoDe(req.query.tipo, 'tipo', TIPOS),
    busqueda: texto(req.query.q, 'q', { max: 80 }),
  }));
}));

r.get('/campanas/:id', asincrono(async (req, res) => {
  res.json(await mk.campanaPorId(entero(req.params.id, 'id', { requerido: true })));
}));

const camposCampana = (body) => ({
  nombre: texto(body?.nombre, 'nombre', { max: 200 }),
  tipo: unoDe(body?.tipo, 'tipo', TIPOS),
  estado: unoDe(body?.estado, 'estado', ESTADOS),
  canal: texto(body?.canal, 'canal', { max: 80 }),
  presupuesto: entero(body?.presupuesto, 'presupuesto', { min: 0 }),
  costo: entero(body?.costo, 'costo', { min: 0 }),
  meta_leads: entero(body?.meta_leads, 'meta_leads', { min: 0 }),
  inicia_en: texto(body?.inicia_en, 'inicia_en', { max: 20 }),
  termina_en: texto(body?.termina_en, 'termina_en', { max: 20 }),
  utm_source: texto(body?.utm_source, 'utm_source', { max: 80 }),
  utm_medium: texto(body?.utm_medium, 'utm_medium', { max: 80 }),
  utm_campaign: texto(body?.utm_campaign, 'utm_campaign', { max: 120 }),
  responsable_id: entero(body?.responsable_id, 'responsable_id'),
  descripcion: texto(body?.descripcion, 'descripcion', { max: 4000 }),
});

r.post('/campanas', exigirRol('marketing', 'gerente'), asincrono(async (req, res) => {
  const datos = camposCampana(req.body);
  texto(req.body?.nombre, 'nombre', { requerido: true, max: 200 });
  res.status(201).json(await mk.crearCampana(datos, req.usuario));
}));

r.put('/campanas/:id', exigirRol('marketing', 'gerente'), asincrono(async (req, res) => {
  res.json(await mk.actualizarCampana(entero(req.params.id, 'id', { requerido: true }), camposCampana(req.body)));
}));

r.delete('/campanas/:id', exigirRol('marketing', 'gerente'), asincrono(async (req, res) => {
  await mk.eliminarCampana(entero(req.params.id, 'id', { requerido: true }));
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------- segmentos

r.get('/segmentos', asincrono(async (_req, res) => res.json(await mk.listarSegmentos())));

r.get('/segmentos/:id', asincrono(async (req, res) => {
  res.json(await mk.evaluarSegmento(
    entero(req.params.id, 'id', { requerido: true }),
    { limite: entero(req.query.limite, 'limite', { min: 1, max: 200 }) ?? 50 },
  ));
}));

r.post('/segmentos', asincrono(async (req, res) => {
  res.status(201).json(await mk.crearSegmento({
    nombre: texto(req.body?.nombre, 'nombre', { requerido: true, max: 120 }),
    descripcion: texto(req.body?.descripcion, 'descripcion', { max: 500 }),
    entidad: unoDe(req.body?.entidad, 'entidad', ['lead', 'cuenta', 'contacto']),
    definicion: req.body?.definicion ?? { reglas: [] },
    dinamico: booleano(req.body?.dinamico),
  }));
}));

r.delete('/segmentos/:id', asincrono(async (req, res) => {
  await mk.eliminarSegmento(entero(req.params.id, 'id', { requerido: true }));
  res.json({ ok: true });
}));

// ------------------------------------------------------------------------ envíos

r.get('/envios', asincrono(async (req, res) => {
  res.json(await mk.listarEnvios(entero(req.query.campana, 'campana')));
}));

r.post('/envios', exigirRol('marketing', 'gerente'), asincrono(async (req, res) => {
  res.status(201).json(await mk.crearEnvio({
    campana_id: entero(req.body?.campana_id, 'campana_id'),
    nombre: texto(req.body?.nombre, 'nombre', { requerido: true, max: 200 }),
    asunto: texto(req.body?.asunto, 'asunto', { requerido: true, max: 200 }),
    plantilla: texto(req.body?.plantilla, 'plantilla', { max: 120 }),
    segmento_id: entero(req.body?.segmento_id, 'segmento_id'),
  }));
}));

r.get('/landings', asincrono(async (_req, res) => res.json(await mk.listarLandings())));

export default r;
