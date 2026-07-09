require('dotenv').config();
const express = require('express');
const path = require('path');
const { init } = require('./db');
const guias = require('./guias');
const auth = require('./auth');
const { mensajeEstatus } = require('./estatus');
const { extraerNumeroGuia, enviarMensaje } = require('./whatsapp');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const { requireAuth, requireAdmin } = auth;

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---------- Autenticacion (login del panel) ----------

app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) return res.status(400).json({ error: 'usuario y password son requeridos' });
  try {
    const sesion = await auth.login(String(usuario).trim(), String(password), req.ip);
    res.json(sesion);
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const token = auth.extraerToken(req);
  if (token) await auth.logout(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ usuario: req.usuario });
});

// Solo los administradores pueden cambiar su propia contraseña; las de los
// operadores las restablece un administrador desde la gestion de usuarios.
app.post('/api/auth/password', requireAuth, requireAdmin, async (req, res) => {
  const { actual, nueva } = req.body || {};
  try {
    if (!req.usuario.id) throw new Error('No disponible para el token de integracion');
    await auth.cambiarPassword(req.usuario.id, String(actual || ''), String(nueva || ''), auth.extraerToken(req));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- Gestion de usuarios (solo administradores) ----------

app.get('/api/usuarios', requireAuth, requireAdmin, async (req, res) => {
  res.json(await auth.listarUsuarios());
});

app.post('/api/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const { usuario, nombre, password, rol } = req.body || {};
  try {
    res.status(201).json(await auth.crearUsuario({ usuario, nombre, password, rol: rol || 'operador' }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await auth.eliminarUsuario(Number(req.params.id), req.usuario);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/usuarios/:id/password', requireAuth, requireAdmin, async (req, res) => {
  try {
    await auth.resetPassword(Number(req.params.id), String(req.body?.nueva || ''));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- API de escaneo (usada por la pistola / panel web) ----------

// Escaneo inteligente: se indica en que plaza estas (MTY o CDMX) y el modo de
// operacion (bodega, domicilio u ocurre); el sistema decide que significa el
// escaneo segun el estado actual de la guia.
app.post('/api/guias/escanear', requireAuth, async (req, res) => {
  const { numeroGuia, plaza, modo } = req.body;
  if (!numeroGuia || !plaza) return res.status(400).json({ error: 'numeroGuia y plaza son requeridos' });
  try {
    const resultado = await guias.escanearGuia(
      numeroGuia.trim().toUpperCase(),
      plaza.trim().toUpperCase(),
      (modo || 'bodega').trim().toLowerCase()
    );
    res.json(resultado);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Revertir el ultimo escaneo de una guia (solo administradores)
app.post('/api/guias/:numeroGuia/revertir', requireAuth, requireAdmin, async (req, res) => {
  try {
    const resultado = await guias.revertirUltimoEscaneo(
      req.params.numeroGuia.trim().toUpperCase(),
      req.usuario.usuario
    );
    res.json(resultado);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/guias/resumen', requireAuth, async (req, res) => {
  res.json(await guias.resumen());
});

app.get('/api/eventos', requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  res.json(await guias.listarEventos({ limit }));
});

app.get('/api/guias/:numeroGuia', requireAuth, async (req, res) => {
  const numeroGuia = req.params.numeroGuia.trim().toUpperCase();
  const guia = await guias.obtenerGuia(numeroGuia);
  if (!guia) return res.status(404).json({ error: 'Guia no encontrada' });
  const historial = await guias.obtenerHistorial(numeroGuia);
  res.json({ ...guia, mensaje: mensajeEstatus(numeroGuia, guia.estatus), historial });
});

app.get('/api/guias', requireAuth, async (req, res) => {
  const { buscar, estatus, plaza } = req.query;
  res.json(await guias.listarGuias({ buscar, estatus, plaza: plaza && plaza.toUpperCase() }));
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
  // Los escaneos repetidos, las correcciones internas y los escaneos que
  // fueron revertidos no se muestran al cliente
  const historial = (await guias.obtenerHistorial(numeroGuia))
    .filter((ev) => ev.accion !== 'ESCANEO_REPETIDO' && ev.accion !== 'CORRECCION' && !ev.revertido)
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
  .then(() => auth.initAuth())
  .then(() => guias.marcarRevertidosHistoricos())
  .then(() => guias.marcarDuplicadosHistoricos())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Sistema de guias escuchando en http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('Error inicializando la base de datos:', e);
    process.exit(1);
  });
