require('dotenv').config();
const express = require('express');
const path = require('path');
const guias = require('./guias');
const { mensajeEstatus } = require('./estatus');
const { extraerNumeroGuia, enviarMensaje } = require('./whatsapp');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const APP_TOKEN = process.env.APP_TOKEN || '';
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';

function requireAppToken(req, res, next) {
  if (!APP_TOKEN) return next();
  const header = req.headers['x-app-token'] || req.query.token;
  if (header !== APP_TOKEN) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ---------- API de escaneo (usada por la pistola / panel web) ----------

app.post('/api/guias/ingreso', requireAppToken, (req, res) => {
  const { numeroGuia, origen } = req.body;
  if (!numeroGuia || !origen) return res.status(400).json({ error: 'numeroGuia y origen son requeridos' });
  try {
    const guia = guias.ingresarGuia(numeroGuia.trim().toUpperCase(), origen.toUpperCase());
    res.json(guia);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/guias/salida', requireAppToken, (req, res) => {
  const { numeroGuia } = req.body;
  if (!numeroGuia) return res.status(400).json({ error: 'numeroGuia es requerido' });
  try {
    const guia = guias.marcarSalida(numeroGuia.trim().toUpperCase());
    res.json(guia);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/guias/llegada', requireAppToken, (req, res) => {
  const { numeroGuia } = req.body;
  if (!numeroGuia) return res.status(400).json({ error: 'numeroGuia es requerido' });
  try {
    const guia = guias.marcarLlegada(numeroGuia.trim().toUpperCase());
    res.json(guia);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/guias/:numeroGuia', requireAppToken, (req, res) => {
  const numeroGuia = req.params.numeroGuia.trim().toUpperCase();
  const guia = guias.obtenerGuia(numeroGuia);
  if (!guia) return res.status(404).json({ error: 'Guia no encontrada' });
  const historial = guias.obtenerHistorial(numeroGuia);
  res.json({ ...guia, mensaje: mensajeEstatus(numeroGuia, guia.estatus), historial });
});

app.get('/api/guias', requireAppToken, (req, res) => {
  res.json(guias.listarGuias());
});

// ---------- Webhook de WhatsApp Business Cloud API (Meta) ----------

// Verificacion del webhook (Meta hace un GET al configurar la URL)
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Recepcion de mensajes entrantes
app.post('/webhook/whatsapp', async (req, res) => {
  res.sendStatus(200); // Meta requiere respuesta rapida

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const mensaje = change?.value?.messages?.[0];
    if (!mensaje) return;

    const de = mensaje.from;
    const texto = mensaje.text?.body;
    const numeroGuia = extraerNumeroGuia(texto);

    if (!numeroGuia) {
      await enviarMensaje(de, 'Hola, por favor envia tu numero de guia para consultar su estatus.');
      return;
    }

    const guia = guias.obtenerGuia(numeroGuia);
    if (!guia) {
      await enviarMensaje(de, `No encontramos la guia ${numeroGuia}. Verifica el numero e intenta de nuevo.`);
      return;
    }

    await enviarMensaje(de, mensajeEstatus(numeroGuia, guia.estatus));
  } catch (e) {
    console.error('Error procesando webhook de WhatsApp:', e);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sistema de guias escuchando en http://localhost:${PORT}`);
});
