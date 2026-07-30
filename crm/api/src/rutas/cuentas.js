import { Router } from 'express';
import * as cuentas from '../servicios/cuentas.js';
import { asincrono } from '../lib/errores.js';
import { texto, entero, unoDe, correo, listaTexto, booleano, paginacion, orden } from '../lib/validar.js';

const r = Router();

const TIPOS = ['prospecto', 'cliente', 'inactivo', 'perdido'];
const TAMANOS = ['micro', 'pequena', 'mediana', 'grande', 'corporativo'];
const ROLES_COMPRA = ['decisor', 'influenciador', 'usuario', 'bloqueador', 'campeon'];

r.get('/', asincrono(async (req, res) => {
  const { limite, desplazamiento, pagina } = paginacion(req.query, { limitePorDefecto: 60 });
  const resultado = await cuentas.listar({
    tipo: unoDe(req.query.tipo, 'tipo', TIPOS),
    industria: texto(req.query.industria, 'industria', { max: 60 }),
    tamano: unoDe(req.query.tamano, 'tamano', TAMANOS),
    estado: texto(req.query.estado, 'estado', { max: 60 }),
    propietario: entero(req.query.propietario, 'propietario'),
    busqueda: texto(req.query.q, 'q', { max: 80 }),
    riesgoMin: entero(req.query.riesgo_min, 'riesgo_min', { min: 0, max: 100 }),
    etiquetas: listaTexto(req.query.etiquetas, 'etiquetas'),
    soloMios: booleano(req.query.mios),
    inactivas: booleano(req.query.inactivas),
    orden: orden(req.query, ['nombre', 'ingresos_ano', 'valor_vida', 'riesgo_churn', 'salud', 'creado_en', 'ultima_actividad_en'], 'ingresos_ano'),
    limite, desplazamiento,
  }, req.usuario);
  res.json({ ...resultado, pagina });
}));

r.get('/facetas', asincrono(async (_req, res) => res.json(await cuentas.facetas())));

/** Ficha 360: todo el cliente en una respuesta. */
r.get('/:id', asincrono(async (req, res) => {
  res.json(await cuentas.ficha360(entero(req.params.id, 'id', { requerido: true })));
}));

r.get('/:id/ia', asincrono(async (req, res) => {
  res.json(await cuentas.analisisIA(entero(req.params.id, 'id', { requerido: true })));
}));

r.post('/', asincrono(async (req, res) => {
  const datos = {
    nombre: texto(req.body?.nombre, 'nombre', { requerido: true, max: 200 }),
    nombre_comercial: texto(req.body?.nombre_comercial, 'nombre_comercial', { max: 160 }),
    rfc: texto(req.body?.rfc, 'rfc', { max: 20 }),
    industria: texto(req.body?.industria, 'industria', { max: 60 }),
    tamano: unoDe(req.body?.tamano, 'tamano', TAMANOS),
    sitio_web: texto(req.body?.sitio_web, 'sitio_web', { max: 200 }),
    telefono: texto(req.body?.telefono, 'telefono', { max: 40 }),
    email: correo(req.body?.email, 'email'),
    calle: texto(req.body?.calle, 'calle', { max: 200 }),
    ciudad: texto(req.body?.ciudad, 'ciudad', { max: 80 }),
    estado: texto(req.body?.estado, 'estado', { max: 80 }),
    codigo_postal: texto(req.body?.codigo_postal, 'codigo_postal', { max: 10 }),
    tipo: unoDe(req.body?.tipo, 'tipo', TIPOS),
    propietario_id: entero(req.body?.propietario_id, 'propietario_id'),
    dias_credito: entero(req.body?.dias_credito, 'dias_credito', { min: 0, max: 180 }),
    origen: texto(req.body?.origen, 'origen', { max: 60 }),
    etiquetas: listaTexto(req.body?.etiquetas, 'etiquetas'),
    notas: texto(req.body?.notas, 'notas', { max: 4000 }),
  };
  res.status(201).json(await cuentas.crear(datos, req.usuario));
}));

r.put('/:id', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const datos = {
    nombre: texto(req.body?.nombre, 'nombre', { max: 200 }),
    nombre_comercial: texto(req.body?.nombre_comercial, 'nombre_comercial', { max: 160 }),
    rfc: texto(req.body?.rfc, 'rfc', { max: 20 }),
    industria: texto(req.body?.industria, 'industria', { max: 60 }),
    tamano: unoDe(req.body?.tamano, 'tamano', TAMANOS),
    sitio_web: texto(req.body?.sitio_web, 'sitio_web', { max: 200 }),
    telefono: texto(req.body?.telefono, 'telefono', { max: 40 }),
    email: correo(req.body?.email, 'email'),
    calle: texto(req.body?.calle, 'calle', { max: 200 }),
    ciudad: texto(req.body?.ciudad, 'ciudad', { max: 80 }),
    estado: texto(req.body?.estado, 'estado', { max: 80 }),
    codigo_postal: texto(req.body?.codigo_postal, 'codigo_postal', { max: 10 }),
    tipo: unoDe(req.body?.tipo, 'tipo', TIPOS),
    propietario_id: entero(req.body?.propietario_id, 'propietario_id'),
    dias_credito: entero(req.body?.dias_credito, 'dias_credito', { min: 0, max: 180 }),
    etiquetas: listaTexto(req.body?.etiquetas, 'etiquetas'),
    notas: texto(req.body?.notas, 'notas', { max: 4000 }),
  };
  res.json(await cuentas.actualizar(id, datos, req.usuario));
}));

r.delete('/:id', asincrono(async (req, res) => {
  await cuentas.eliminar(entero(req.params.id, 'id', { requerido: true }));
  res.json({ ok: true });
}));

// -------------------------------------------------------------------- contactos

r.get('/:id/contactos', asincrono(async (req, res) => {
  res.json(await cuentas.contactos(entero(req.params.id, 'id', { requerido: true })));
}));

r.post('/:id/contactos', asincrono(async (req, res) => {
  const cuentaId = entero(req.params.id, 'id', { requerido: true });
  const datos = {
    nombre: texto(req.body?.nombre, 'nombre', { requerido: true, max: 120 }),
    puesto: texto(req.body?.puesto, 'puesto', { max: 100 }),
    email: correo(req.body?.email, 'email'),
    telefono: texto(req.body?.telefono, 'telefono', { max: 40 }),
    whatsapp: texto(req.body?.whatsapp, 'whatsapp', { max: 40 }),
    linkedin: texto(req.body?.linkedin, 'linkedin', { max: 200 }),
    es_principal: booleano(req.body?.es_principal),
    rol_compra: unoDe(req.body?.rol_compra, 'rol_compra', ROLES_COMPRA),
    notas: texto(req.body?.notas, 'notas', { max: 2000 }),
  };
  res.status(201).json(await cuentas.crearContacto(cuentaId, datos, req.usuario));
}));

r.put('/contactos/:contactoId', asincrono(async (req, res) => {
  const id = entero(req.params.contactoId, 'contactoId', { requerido: true });
  const datos = {
    nombre: texto(req.body?.nombre, 'nombre', { max: 120 }),
    puesto: texto(req.body?.puesto, 'puesto', { max: 100 }),
    email: correo(req.body?.email, 'email'),
    telefono: texto(req.body?.telefono, 'telefono', { max: 40 }),
    whatsapp: texto(req.body?.whatsapp, 'whatsapp', { max: 40 }),
    linkedin: texto(req.body?.linkedin, 'linkedin', { max: 200 }),
    es_principal: booleano(req.body?.es_principal),
    rol_compra: unoDe(req.body?.rol_compra, 'rol_compra', ROLES_COMPRA),
    notas: texto(req.body?.notas, 'notas', { max: 2000 }),
  };
  res.json(await cuentas.actualizarContacto(id, datos));
}));

r.delete('/contactos/:contactoId', asincrono(async (req, res) => {
  await cuentas.eliminarContacto(entero(req.params.contactoId, 'contactoId', { requerido: true }));
  res.json({ ok: true });
}));

// ------------------------------------------------------------------------ notas

r.post('/notas', asincrono(async (req, res) => {
  const datos = {
    cuerpo: texto(req.body?.cuerpo, 'cuerpo', { requerido: true, max: 8000 }),
    cuenta_id: entero(req.body?.cuenta_id, 'cuenta_id'),
    lead_id: entero(req.body?.lead_id, 'lead_id'),
    oportunidad_id: entero(req.body?.oportunidad_id, 'oportunidad_id'),
    contacto_id: entero(req.body?.contacto_id, 'contacto_id'),
    fijada: booleano(req.body?.fijada),
  };
  res.status(201).json(await cuentas.crearNota(datos, req.usuario));
}));

r.delete('/notas/:notaId', asincrono(async (req, res) => {
  await cuentas.eliminarNota(entero(req.params.notaId, 'notaId', { requerido: true }));
  res.json({ ok: true });
}));

export default r;
