'use strict';
// Configuracion del sistema: datos de la empresa para el PDF, impuestos y
// condiciones por defecto de cotizacion, correo SMTP y WhatsApp API.

const express = require('express');
const { all, cfg, setCfg } = require('./db');
const { autenticar, requerirRol } = require('./auth');
const { limpiarTexto } = require('./util');
const { enviarCorreo, correoConfigurado } = require('./correo');

// Claves que puede editar el administrador desde el panel
const CLAVES_EDITABLES = [
  'empresa_nombre', 'empresa_razon', 'empresa_rfc', 'empresa_direccion',
  'empresa_telefono', 'empresa_email', 'empresa_web',
  'iva_pct', 'ret_pct', 'vigencia_dias', 'condiciones_default', 'pdf_leyenda',
  'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'correo_de',
  'base_url', 'whatsapp_token', 'whatsapp_phone_id',
];
const CLAVES_SECRETAS = ['smtp_pass', 'whatsapp_token'];

// Subconjunto visible para todo el equipo (lo necesita el asistente de cotizacion)
const CLAVES_PUBLICAS = [
  'empresa_nombre', 'empresa_telefono', 'empresa_email', 'empresa_web',
  'iva_pct', 'ret_pct', 'vigencia_dias', 'condiciones_default',
];

const rutasConfig = express.Router();
rutasConfig.use(autenticar);

rutasConfig.get('/', (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  const claves = esAdmin ? CLAVES_EDITABLES : CLAVES_PUBLICAS;
  const valores = {};
  for (const clave of claves) {
    valores[clave] = CLAVES_SECRETAS.includes(clave) ? '' : cfg(clave);
  }
  if (esAdmin) {
    for (const clave of CLAVES_SECRETAS) valores[`${clave}_definida`] = Boolean(cfg(clave));
  }
  valores.correo_configurado = correoConfigurado();
  valores.whatsapp_api_configurada = Boolean(cfg('whatsapp_token') && cfg('whatsapp_phone_id'));
  valores.base_url_definida = Boolean(cfg('base_url'));
  res.json(valores);
});

rutasConfig.put('/', requerirRol('admin'), (req, res) => {
  for (const clave of CLAVES_EDITABLES) {
    if (req.body[clave] === undefined) continue;
    let valor = limpiarTexto(req.body[clave], 5000);
    if (CLAVES_SECRETAS.includes(clave)) {
      if (valor === '') continue;            // vacio = conservar la actual
      if (valor === '__BORRAR__') valor = ''; // sentinela para borrarla
    }
    setCfg(clave, valor);
  }
  res.json({ ok: true });
});

rutasConfig.post('/probar-correo', requerirRol('admin'), async (req, res) => {
  const para = limpiarTexto(req.body.para, 200) || req.usuario.email;
  if (!para) return res.status(400).json({ error: 'Indica a que correo mandar la prueba.' });
  try {
    await enviarCorreo({
      para,
      asunto: 'Prueba de correo - CRM Fletes Tauro',
      texto: 'Si estas leyendo esto, el correo del CRM de Fletes Tauro quedo bien configurado.',
      html: '<p>Si estas leyendo esto, el correo del CRM de <b>Fletes Tauro</b> quedo bien configurado.</p>',
    });
    res.json({ ok: true, mensaje: `Correo de prueba enviado a ${para}.` });
  } catch (err) {
    res.status(400).json({ error: `No se pudo enviar: ${err.message}` });
  }
});

module.exports = { rutasConfig };
