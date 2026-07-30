import { Router } from 'express';
import * as leads from '../servicios/leads.js';
import { asincrono } from '../lib/errores.js';
import { texto, entero, unoDe, correo, listaTexto, booleano, paginacion, orden } from '../lib/validar.js';

const r = Router();

const ETAPAS = ['lead', 'contacto', 'calificado', 'perdido'];
const TAMANOS = ['micro', 'pequena', 'mediana', 'grande', 'corporativo'];
const TEMPERATURAS = ['frio', 'tibio', 'caliente', 'ardiente'];

r.get('/', asincrono(async (req, res) => {
  const { limite, desplazamiento, pagina } = paginacion(req.query, { limitePorDefecto: 100, limiteMax: 300 });
  const resultado = await leads.listar({
    etapa: unoDe(req.query.etapa, 'etapa', [...ETAPAS, 'ganado', 'propuesta', 'negociacion']),
    temperatura: unoDe(req.query.temperatura, 'temperatura', TEMPERATURAS),
    propietario: entero(req.query.propietario, 'propietario'),
    origen: texto(req.query.origen, 'origen', { max: 60 }),
    industria: texto(req.query.industria, 'industria', { max: 60 }),
    busqueda: texto(req.query.q, 'q', { max: 80 }),
    scoreMin: entero(req.query.score_min, 'score_min', { min: 0, max: 100 }),
    scoreMax: entero(req.query.score_max, 'score_max', { min: 0, max: 100 }),
    etiquetas: listaTexto(req.query.etiquetas, 'etiquetas'),
    soloMios: booleano(req.query.mios),
    sinContactar: booleano(req.query.sin_contactar),
    orden: orden(req.query, ['score', 'creado_en', 'valor_estimado', 'nombre', 'empresa', 'ultimo_contacto_en', 'prioridad'], 'score'),
    limite, desplazamiento,
  }, req.usuario);
  res.json({ ...resultado, pagina });
}));

r.get('/resumen', asincrono(async (req, res) => {
  res.json(await leads.resumenPorEtapa(req.usuario, booleano(req.query.mios) ?? false));
}));

r.get('/facetas', asincrono(async (_req, res) => res.json(await leads.facetas())));

r.get('/:id', asincrono(async (req, res) => {
  res.json(await leads.porId(entero(req.params.id, 'id', { requerido: true })));
}));

/**
 * Alta de prospecto. Es también el punto de entrada de formularios y webhooks: la
 * clasificación, asignación y creación de tareas ocurren dentro del servicio, así que
 * un lead que entra por aquí queda igual de bien procesado que uno capturado a mano.
 */
r.post('/', asincrono(async (req, res) => {
  const datos = {
    nombre: texto(req.body?.nombre, 'nombre', { requerido: true, max: 120 }),
    empresa: texto(req.body?.empresa, 'empresa', { max: 160 }),
    puesto: texto(req.body?.puesto, 'puesto', { max: 100 }),
    email: correo(req.body?.email, 'email'),
    telefono: texto(req.body?.telefono, 'telefono', { max: 40 }),
    whatsapp: texto(req.body?.whatsapp, 'whatsapp', { max: 40 }),
    origen: texto(req.body?.origen, 'origen', { max: 60 }),
    campana_id: entero(req.body?.campana_id, 'campana_id'),
    industria: texto(req.body?.industria, 'industria', { max: 60 }),
    tamano_empresa: unoDe(req.body?.tamano_empresa, 'tamano_empresa', TAMANOS),
    ciudad: texto(req.body?.ciudad, 'ciudad', { max: 80 }),
    estado: texto(req.body?.estado, 'estado', { max: 80 }),
    valor_estimado: entero(req.body?.valor_estimado, 'valor_estimado', { min: 0 }),
    propietario_id: entero(req.body?.propietario_id, 'propietario_id'),
    etiquetas: listaTexto(req.body?.etiquetas, 'etiquetas'),
    necesidad: texto(req.body?.necesidad, 'necesidad', { max: 200 }),
    mensaje: texto(req.body?.mensaje, 'mensaje', { max: 4000 }),
  };
  res.status(201).json(await leads.crear(datos, req.usuario));
}));

r.put('/:id', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const datos = {
    nombre: texto(req.body?.nombre, 'nombre', { max: 120 }),
    empresa: texto(req.body?.empresa, 'empresa', { max: 160 }),
    puesto: texto(req.body?.puesto, 'puesto', { max: 100 }),
    email: correo(req.body?.email, 'email'),
    telefono: texto(req.body?.telefono, 'telefono', { max: 40 }),
    whatsapp: texto(req.body?.whatsapp, 'whatsapp', { max: 40 }),
    industria: texto(req.body?.industria, 'industria', { max: 60 }),
    tamano_empresa: unoDe(req.body?.tamano_empresa, 'tamano_empresa', TAMANOS),
    ciudad: texto(req.body?.ciudad, 'ciudad', { max: 80 }),
    estado: texto(req.body?.estado, 'estado', { max: 80 }),
    intencion: unoDe(req.body?.intencion, 'intencion', ['exploracion', 'comparacion', 'compra', 'renovacion']),
    urgencia: unoDe(req.body?.urgencia, 'urgencia', ['baja', 'media', 'alta', 'inmediata']),
    prioridad: entero(req.body?.prioridad, 'prioridad', { min: 1, max: 5 }),
    valor_estimado: entero(req.body?.valor_estimado, 'valor_estimado', { min: 0 }),
    propietario_id: entero(req.body?.propietario_id, 'propietario_id'),
    etiquetas: listaTexto(req.body?.etiquetas, 'etiquetas'),
    necesidad: texto(req.body?.necesidad, 'necesidad', { max: 200 }),
  };
  res.json(await leads.actualizar(id, datos, req.usuario));
}));

r.put('/:id/etapa', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const etapa = unoDe(req.body?.etapa, 'etapa', ETAPAS, { requerido: true });
  const motivo = texto(req.body?.motivo_perdida, 'motivo_perdida', { max: 200 });
  res.json(await leads.moverEtapa(id, etapa, req.usuario, motivo));
}));

r.post('/:id/convertir', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const opciones = {
    cuenta_id: entero(req.body?.cuenta_id, 'cuenta_id'),
    nombre: texto(req.body?.nombre, 'nombre', { max: 200 }),
    monto: entero(req.body?.monto, 'monto', { min: 0 }),
    cierre_estimado: texto(req.body?.cierre_estimado, 'cierre_estimado', { max: 30 }),
    siguiente_paso: texto(req.body?.siguiente_paso, 'siguiente_paso', { max: 200 }),
    rol_compra: unoDe(req.body?.rol_compra, 'rol_compra', ['decisor', 'influenciador', 'usuario', 'bloqueador', 'campeon']),
  };
  res.status(201).json(await leads.convertir(id, opciones, req.usuario));
}));

/** Registro de señales de comportamiento. Recalcula el score al instante. */
r.post('/:id/senales', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const tipo = unoDe(req.body?.tipo, 'tipo', [
    'correo_abierto', 'correo_clic', 'correo_respondido', 'visita_web', 'visita_precios',
    'descarga', 'formulario', 'llamada_atendida', 'reunion_aceptada', 'cotizacion_vista',
    'whatsapp_respondido', 'evento_asistido', 'chat_iniciado',
  ], { requerido: true });
  res.status(201).json(await leads.registrarSenal(id, tipo, texto(req.body?.detalle, 'detalle', { max: 200 })));
}));

r.delete('/:id', asincrono(async (req, res) => {
  await leads.eliminar(entero(req.params.id, 'id', { requerido: true }));
  res.json({ ok: true });
}));

export default r;
