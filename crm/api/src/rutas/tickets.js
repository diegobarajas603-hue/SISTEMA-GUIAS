import { Router } from 'express';
import * as tk from '../servicios/tickets.js';
import { asincrono } from '../lib/errores.js';
import { texto, entero, unoDe, listaTexto, booleano, paginacion } from '../lib/validar.js';

const r = Router();

const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];
const ESTADOS = ['nuevo', 'abierto', 'pendiente', 'resuelto', 'cerrado'];
const CANALES = ['correo', 'whatsapp', 'chat', 'telefono', 'portal', 'presencial'];

r.get('/', asincrono(async (req, res) => {
  const { limite, desplazamiento, pagina } = paginacion(req.query, { limitePorDefecto: 80 });
  const resultado = await tk.listar({
    estado: unoDe(req.query.estado, 'estado', ESTADOS),
    prioridad: unoDe(req.query.prioridad, 'prioridad', PRIORIDADES),
    canal: unoDe(req.query.canal, 'canal', CANALES),
    categoria: texto(req.query.categoria, 'categoria', { max: 80 }),
    cuenta: entero(req.query.cuenta, 'cuenta'),
    asignado: entero(req.query.asignado, 'asignado'),
    busqueda: texto(req.query.q, 'q', { max: 80 }),
    soloMios: booleano(req.query.mios),
    abiertos: booleano(req.query.abiertos),
    slaVencido: booleano(req.query.sla_vencido),
    limite, desplazamiento,
  }, req.usuario);
  res.json({ ...resultado, pagina });
}));

r.get('/metricas', asincrono(async (_req, res) => res.json(await tk.metricas())));
r.get('/facetas', asincrono(async (_req, res) => res.json(await tk.facetas())));

// La base de conocimiento va antes de /:id para que «conocimiento» no se lea como id.
r.get('/conocimiento', asincrono(async (req, res) => {
  res.json(await tk.listarKB(texto(req.query.q, 'q', { max: 100 })));
}));

r.get('/conocimiento/:articuloId', asincrono(async (req, res) => {
  res.json(await tk.verArticulo(entero(req.params.articuloId, 'articuloId', { requerido: true })));
}));

r.post('/conocimiento', asincrono(async (req, res) => {
  res.status(201).json(await tk.crearArticulo({
    titulo: texto(req.body?.titulo, 'titulo', { requerido: true, max: 200 }),
    categoria: texto(req.body?.categoria, 'categoria', { max: 80 }),
    cuerpo: texto(req.body?.cuerpo, 'cuerpo', { requerido: true, max: 20_000 }),
    etiquetas: listaTexto(req.body?.etiquetas, 'etiquetas'),
  }, req.usuario));
}));

r.get('/:id', asincrono(async (req, res) => {
  res.json(await tk.porId(entero(req.params.id, 'id', { requerido: true })));
}));

r.post('/', asincrono(async (req, res) => {
  res.status(201).json(await tk.crear({
    asunto: texto(req.body?.asunto, 'asunto', { requerido: true, max: 200 }),
    descripcion: texto(req.body?.descripcion, 'descripcion', { max: 8000 }),
    cuenta_id: entero(req.body?.cuenta_id, 'cuenta_id'),
    contacto_id: entero(req.body?.contacto_id, 'contacto_id'),
    canal: unoDe(req.body?.canal, 'canal', CANALES),
    categoria: texto(req.body?.categoria, 'categoria', { max: 80 }),
    prioridad: unoDe(req.body?.prioridad, 'prioridad', PRIORIDADES),
    asignado_id: entero(req.body?.asignado_id, 'asignado_id'),
    guia_relacionada: texto(req.body?.guia_relacionada, 'guia_relacionada', { max: 40 }),
    etiquetas: listaTexto(req.body?.etiquetas, 'etiquetas'),
  }, req.usuario));
}));

r.put('/:id', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  res.json(await tk.actualizar(id, {
    asunto: texto(req.body?.asunto, 'asunto', { max: 200 }),
    prioridad: unoDe(req.body?.prioridad, 'prioridad', PRIORIDADES),
    categoria: texto(req.body?.categoria, 'categoria', { max: 80 }),
    asignado_id: entero(req.body?.asignado_id, 'asignado_id'),
    sentimiento: unoDe(req.body?.sentimiento, 'sentimiento', ['positivo', 'neutral', 'negativo', 'frustrado']),
    etiquetas: listaTexto(req.body?.etiquetas, 'etiquetas'),
    guia_relacionada: texto(req.body?.guia_relacionada, 'guia_relacionada', { max: 40 }),
  }, req.usuario));
}));

r.put('/:id/estado', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const estado = unoDe(req.body?.estado, 'estado', ESTADOS, { requerido: true });
  res.json(await tk.cambiarEstado(id, estado, req.usuario, {
    csat: entero(req.body?.csat, 'csat', { min: 1, max: 5 }),
  }));
}));

r.post('/:id/mensajes', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  res.status(201).json(await tk.responder(id, {
    cuerpo: texto(req.body?.cuerpo, 'cuerpo', { requerido: true, max: 12_000 }),
    autor_tipo: unoDe(req.body?.autor_tipo, 'autor_tipo', ['agente', 'cliente', 'ia']) ?? 'agente',
    interno: booleano(req.body?.interno) ?? false,
  }, req.usuario));
}));

/** Borrador de respuesta con la base de conocimiento. No envía nada. */
r.post('/:id/sugerir', asincrono(async (req, res) => {
  res.json(await tk.sugerirRespuesta(entero(req.params.id, 'id', { requerido: true })));
}));

export default r;
