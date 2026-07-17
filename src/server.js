require('dotenv').config();
const express = require('express');
const path = require('path');
const { init } = require('./db');
const guias = require('./guias');
const auth = require('./auth');
const { mensajeEstatus } = require('./estatus');
const { extraerNumeroGuia, enviarMensaje } = require('./whatsapp');

const app = express();
// Detras del proxy del hosting (Railway): req.ip debe ser la IP real del
// cliente, no la del proxy (la usa el limite de intentos de login)
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// La raiz del sitio es la pagina publica de rastreo para clientes; el panel
// interno (protegido con login) vive en /panel.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'rastreo.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'panel.html')));
// Compatibilidad con la ruta anterior del panel
app.get('/index.html', (req, res) => res.redirect('/panel'));

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const { requireAuth, requireAdmin } = auth;

// Envuelve rutas async para que un fallo inesperado (p. ej. la base de datos
// caida un instante) responda un error 500 en lugar de tumbar el proceso.
const seguro = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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

app.post('/api/auth/logout', requireAuth, seguro(async (req, res) => {
  const token = auth.extraerToken(req);
  if (token) await auth.logout(token);
  res.json({ ok: true });
}));

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

app.get('/api/usuarios', requireAuth, requireAdmin, seguro(async (req, res) => {
  res.json(await auth.listarUsuarios());
}));

app.post('/api/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const { usuario, nombre, password, rol, plaza } = req.body || {};
  try {
    res.status(201).json(await auth.crearUsuario({ usuario, nombre, password, rol: rol || 'operador', plaza }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/usuarios/:id/plaza', requireAuth, requireAdmin, async (req, res) => {
  try {
    await auth.actualizarPlaza(Number(req.params.id), (req.body || {}).plaza);
    res.json({ ok: true });
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
  const { numeroGuia, plaza, modo } = req.body || {};
  if (!numeroGuia || !plaza) return res.status(400).json({ error: 'numeroGuia y plaza son requeridos' });
  // Si el usuario tiene plaza asignada, solo puede escanear en esa plaza
  if (req.usuario.plaza && String(plaza).trim().toUpperCase() !== req.usuario.plaza) {
    return res.status(403).json({ error: `Tu usuario solo puede escanear en ${req.usuario.plaza}` });
  }
  try {
    const resultado = await guias.escanearGuia(
      String(numeroGuia).trim().toUpperCase(),
      String(plaza).trim().toUpperCase(),
      String(modo || 'bodega').trim().toLowerCase()
    );
    res.json(resultado);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Borrar TODAS las guias para dejar el sistema como nuevo (solo administradores).
// Requiere enviar { confirmar: "BORRAR" } para evitar borrados accidentales.
app.post('/api/guias/borrar-todas', requireAuth, requireAdmin, async (req, res) => {
  if ((req.body || {}).confirmar !== 'BORRAR') {
    return res.status(400).json({ error: 'Confirmacion invalida' });
  }
  try {
    const eliminadas = await guias.borrarTodas();
    console.log(`[guias] ${req.usuario.usuario} borro todas las guias (${eliminadas})`);
    res.json({ ok: true, eliminadas });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Revertir el ultimo escaneo de una guia (solo administradores). Acepta una
// resolucion opcional de que paso con la guia (p. ej. entrega no pagada):
//  { resolucion: 'cancelada', numero: 'AN...' }  -> la guia se cancelo y toma
//    el numero de la nueva guia, conservando todo su historial.
//  { resolucion: 'complemento', numero: 'AN...' } -> se emitio un complemento;
//    la guia conserva ambos numeros y los dos sirven para rastrear.
app.post('/api/guias/:numeroGuia/revertir', requireAuth, requireAdmin, async (req, res) => {
  const { resolucion, numero } = req.body || {};
  let r = null;
  if (resolucion === 'cancelada' || resolucion === 'complemento') {
    r = { tipo: resolucion, numero };
  } else if (resolucion) {
    return res.status(400).json({ error: 'Resolucion invalida: usa "cancelada" o "complemento"' });
  }
  try {
    const resultado = await guias.revertirUltimoEscaneo(
      req.params.numeroGuia.trim().toUpperCase(),
      req.usuario.usuario,
      r
    );
    res.json(resultado);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/guias/resumen', requireAuth, seguro(async (req, res) => {
  res.json(await guias.resumen());
}));

// Actividad por dia (guias enviadas y entregas) para las graficas del dashboard
app.get('/api/guias/estadisticas', requireAuth, seguro(async (req, res) => {
  res.json(await guias.estadisticas(req.query.dias));
}));

app.get('/api/eventos', requireAuth, seguro(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  res.json(await guias.listarEventos({ limit }));
}));

app.get('/api/guias/:numeroGuia', requireAuth, seguro(async (req, res) => {
  const numeroGuia = req.params.numeroGuia.trim().toUpperCase();
  // Busca tambien por el numero de complemento
  const guia = await guias.buscarGuia(numeroGuia);
  if (!guia) return res.status(404).json({ error: 'Guia no encontrada' });
  const historial = await guias.obtenerHistorial(guia.numero_guia);
  res.json({ ...guia, mensaje: mensajeEstatus(guia.numero_guia, guia.estatus), historial });
}));

app.get('/api/guias', requireAuth, seguro(async (req, res) => {
  const { buscar, estatus, plaza } = req.query;
  res.json(await guias.listarGuias({ buscar, estatus, plaza: plaza && plaza.toUpperCase() }));
}));

// ---------- API publica de rastreo (sin token, para clientes) ----------

// Solo permite consultar una guia por su numero exacto; nunca expone la lista
// completa ni las operaciones de escaneo. CORS abierto para poder llamarla
// desde la pagina web de la empresa.
const ACCIONES_INTERNAS = ['ESCANEO_REPETIDO', 'CORRECCION', 'CAMBIO_NUMERO', 'COMPLEMENTO'];

app.get('/api/publico/guias/:numeroGuia', seguro(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const numeroGuia = req.params.numeroGuia.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,40}$/.test(numeroGuia)) {
    return res.status(400).json({ error: 'Numero de guia invalido' });
  }
  // Busca tambien por el numero de complemento: ambos numeros rastrean la guia
  const guia = await guias.buscarGuia(numeroGuia);
  if (!guia) return res.status(404).json({ error: 'No encontramos esa guia. Verifica el numero e intenta de nuevo.' });
  // Los escaneos repetidos, las anotaciones internas (correcciones, cambios de
  // numero, complementos) y los escaneos revertidos no se muestran al cliente
  const historial = (await guias.obtenerHistorial(guia.numero_guia))
    .filter((ev) => !ACCIONES_INTERNAS.includes(ev.accion) && !ev.revertido)
    .map(({ accion, descripcion, creado_en }) => ({ accion, descripcion, creado_en }));
  res.json({
    numeroGuia: guia.numero_guia,
    complemento: guia.complemento || null,
    estatus: guia.estatus,
    mensaje: mensajeEstatus(guia.numero_guia, guia.estatus),
    actualizado_en: guia.actualizado_en,
    historial,
  });
}));

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

    // Busca tambien por el numero de complemento
    const guia = await guias.buscarGuia(numeroGuia);
    if (!guia) {
      await enviarMensaje(de, `No encontramos la guia ${numeroGuia}. Verifica el numero e intenta de nuevo.`);
      return;
    }

    await enviarMensaje(de, mensajeEstatus(guia.numero_guia, guia.estatus));
  } catch (e) {
    console.error('Error procesando webhook de WhatsApp:', e);
  }
});

// Manejador final de errores: responde JSON claro y el servidor sigue vivo
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la peticion no es JSON valido' });
  }
  console.error('Error no controlado:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Error interno del servidor. Intenta de nuevo en un momento.' });
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
