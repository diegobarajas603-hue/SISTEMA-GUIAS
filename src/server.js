require('dotenv').config();
const express = require('express');
const path = require('path');
const { init } = require('./db');
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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---------- API de escaneo (usada por la pistola / panel web) ----------

// Escaneo inteligente: solo se indica en que plaza estas (MTY o CDMX) y el
// sistema decide si el escaneo es una salida o una llegada.
app.post('/api/guias/escanear', requireAppToken, async (req, res) => {
  const { numeroGuia, plaza } = req.body;
  if (!numeroGuia || !plaza) return res.status(400).json({ error: 'numeroGuia y plaza son requeridos' });
  try {
    const resultado = await guias.escanearGuia(numeroGuia.trim().toUpperCase(), plaza.trim().toUpperCase());
    res.json(resultado);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/guias/resumen', requireAppToken, async (req, res) => {
  res.json(await guias.resumen());
});

app.get('/api/guias/:numeroGuia', requireAppToken, async (req, res) => {
  const numeroGuia = req.params.numeroGuia.trim().toUpperCase();
  const guia = await guias.obtenerGuia(numeroGuia);
  if (!guia) return res.status(404).json({ error: 'Guia no encontrada' });
  const historial = await guias.obtenerHistorial(numeroGuia);
  res.json({ ...guia, mensaje: mensajeEstatus(numeroGuia, guia.estatus), historial });
});

app.get('/api/guias', requireAppToken, async (req, res) => {
  const { buscar, estatus } = req.query;
  res.json(await guias.listarGuias({ buscar, estatus }));
});

// ---------- API publica de rastreo (sin token, para clientes) ----------

// Solo permite consultar una guia por su numero exacto; nunca expone la lista
// completa ni las operaciones de escaneo. CORS abierto para poder llamarla
// desde la pagina web de la empresa.
app.get('/api/publico/guias/:numeroGuia', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const numeroGuia = req.params.numeroGuia.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,40}$/.test(numeroGuia)) {
    return res.status(400).json({ error: 'Numero de guia invalido' });
  }
  const guia = await guias.obtenerGuia(numeroGuia);
  if (!guia) return res.status(404).json({ error: 'No encontramos esa guia. Verifica el numero e intenta de nuevo.' });
  const historial = (await guias.obtenerHistorial(numeroGuia))
    .filter((ev) => ev.accion !== 'ESCANEO_REPETIDO')
    .map(({ accion, descripcion, creado_en }) => ({ accion, descripcion, creado_en }));
  res.json({
    numeroGuia: guia.numero_guia,
    estatus: guia.estatus,
    mensaje: mensajeEstatus(guia.numero_guia, guia.estatus),
    actualizado_en: guia.actualizado_en,
    historial,
  });
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

    const guia = await guias.obtenerGuia(numeroGuia);
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
init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Sistema de guias escuchando en http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('Error inicializando la base de datos:', e);
    process.exit(1);
  });
