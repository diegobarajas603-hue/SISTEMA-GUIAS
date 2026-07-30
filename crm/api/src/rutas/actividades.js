import { Router } from 'express';
import * as act from '../servicios/actividades.js';
import { asincrono } from '../lib/errores.js';
import { texto, entero, unoDe, booleano, fecha, paginacion } from '../lib/validar.js';

const r = Router();

const TIPOS = ['llamada', 'correo', 'reunion', 'whatsapp', 'tarea', 'visita', 'seguimiento', 'demo'];

r.get('/', asincrono(async (req, res) => {
  const { limite, desplazamiento, pagina } = paginacion(req.query, { limitePorDefecto: 200, limiteMax: 500 });
  const resultado = await act.listar({
    tipo: unoDe(req.query.tipo, 'tipo', TIPOS),
    estado: unoDe(req.query.estado, 'estado', ['pendiente', 'completada', 'cancelada']),
    usuarioId: entero(req.query.usuario, 'usuario'),
    cuenta: entero(req.query.cuenta, 'cuenta'),
    oportunidad: entero(req.query.oportunidad, 'oportunidad'),
    lead: entero(req.query.lead, 'lead'),
    desde: fecha(req.query.desde, 'desde'),
    hasta: fecha(req.query.hasta, 'hasta'),
    soloMios: booleano(req.query.mios),
    vencidas: booleano(req.query.vencidas),
    hoy: booleano(req.query.hoy),
    limite, desplazamiento,
  }, req.usuario);
  res.json({ ...resultado, pagina });
}));

/** Agenda del rango con conteo por día, para pintar el calendario de una vez. */
r.get('/agenda', asincrono(async (req, res) => {
  const desde = fecha(req.query.desde, 'desde') ?? new Date(new Date().setDate(1));
  const hasta = fecha(req.query.hasta, 'hasta')
    ?? new Date(new Date(desde).setMonth(new Date(desde).getMonth() + 1));
  res.json(await act.agenda(req.usuario, {
    desde, hasta,
    soloMios: booleano(req.query.mios) ?? true,
    usuarioId: entero(req.query.usuario, 'usuario'),
  }));
}));

r.get('/hoy', asincrono(async (req, res) => res.json(await act.resumenDia(req.usuario))));

r.get('/:id', asincrono(async (req, res) => {
  res.json(await act.porId(entero(req.params.id, 'id', { requerido: true })));
}));

r.post('/', asincrono(async (req, res) => {
  const datos = {
    tipo: unoDe(req.body?.tipo, 'tipo', TIPOS, { requerido: true }),
    asunto: texto(req.body?.asunto, 'asunto', { requerido: true, max: 200 }),
    descripcion: texto(req.body?.descripcion, 'descripcion', { max: 4000 }),
    estado: unoDe(req.body?.estado, 'estado', ['pendiente', 'completada']),
    prioridad: entero(req.body?.prioridad, 'prioridad', { min: 1, max: 5 }),
    usuario_id: entero(req.body?.usuario_id, 'usuario_id'),
    cuenta_id: entero(req.body?.cuenta_id, 'cuenta_id'),
    contacto_id: entero(req.body?.contacto_id, 'contacto_id'),
    lead_id: entero(req.body?.lead_id, 'lead_id'),
    oportunidad_id: entero(req.body?.oportunidad_id, 'oportunidad_id'),
    ticket_id: entero(req.body?.ticket_id, 'ticket_id'),
    inicia_en: fecha(req.body?.inicia_en, 'inicia_en'),
    vence_en: fecha(req.body?.vence_en, 'vence_en'),
    duracion_min: entero(req.body?.duracion_min, 'duracion_min', { min: 0, max: 1440 }),
    ubicacion: texto(req.body?.ubicacion, 'ubicacion', { max: 200 }),
  };
  res.status(201).json(await act.crear(datos, req.usuario));
}));

r.put('/:id', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  res.json(await act.actualizar(id, {
    tipo: unoDe(req.body?.tipo, 'tipo', TIPOS),
    asunto: texto(req.body?.asunto, 'asunto', { max: 200 }),
    descripcion: texto(req.body?.descripcion, 'descripcion', { max: 4000 }),
    prioridad: entero(req.body?.prioridad, 'prioridad', { min: 1, max: 5 }),
    usuario_id: entero(req.body?.usuario_id, 'usuario_id'),
    contacto_id: entero(req.body?.contacto_id, 'contacto_id'),
    inicia_en: fecha(req.body?.inicia_en, 'inicia_en'),
    vence_en: fecha(req.body?.vence_en, 'vence_en'),
    duracion_min: entero(req.body?.duracion_min, 'duracion_min', { min: 0, max: 1440 }),
    ubicacion: texto(req.body?.ubicacion, 'ubicacion', { max: 200 }),
    resultado: texto(req.body?.resultado, 'resultado', { max: 1000 }),
  }));
}));

r.put('/:id/completar', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  res.json(await act.completar(id, {
    resultado: texto(req.body?.resultado, 'resultado', { max: 1000 }),
    duracion_min: entero(req.body?.duracion_min, 'duracion_min', { min: 0, max: 1440 }),
  }, req.usuario));
}));

r.put('/:id/reabrir', asincrono(async (req, res) => {
  res.json(await act.reabrir(entero(req.params.id, 'id', { requerido: true })));
}));

r.delete('/:id', asincrono(async (req, res) => {
  await act.eliminar(entero(req.params.id, 'id', { requerido: true }));
  res.json({ ok: true });
}));

export default r;
