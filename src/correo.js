'use strict';
// Envio de correos (SMTP con nodemailer). La configuracion se toma del
// panel (Configuracion -> Correo) y, si esta vacia, de las variables de entorno.

const nodemailer = require('nodemailer');
const { cfg } = require('./db');

function configuracionCorreo() {
  return {
    host: cfg('smtp_host'),
    port: Number(cfg('smtp_port', '587')) || 587,
    secure: String(cfg('smtp_secure', 'false')) === 'true',
    user: cfg('smtp_user'),
    pass: cfg('smtp_pass'),
    de: cfg('correo_de') || cfg('smtp_user'),
  };
}

function correoConfigurado() {
  const c = configuracionCorreo();
  return Boolean(c.host && c.user && c.pass);
}

function crearTransporte() {
  const c = configuracionCorreo();
  if (!c.host || !c.user || !c.pass) {
    const err = new Error('El correo no esta configurado. Un administrador debe capturar el servidor SMTP en Configuracion → Correo.');
    err.codigo = 'SIN_SMTP';
    throw err;
  }
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
  });
}

async function enviarCorreo({ para, asunto, html, texto, adjuntos = [] }) {
  const transporte = crearTransporte();
  const c = configuracionCorreo();
  return transporte.sendMail({
    from: c.de,
    to: para,
    subject: asunto,
    text: texto,
    html,
    attachments: adjuntos,
  });
}

module.exports = { enviarCorreo, correoConfigurado, configuracionCorreo };
