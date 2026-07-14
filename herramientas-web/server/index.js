const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { init, UPLOADS_DIR } = require('./db');
const routes = require('./routes');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use('/api', routes);
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));

const DIST = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(DIST));
app.get(/^(?!\/(api|uploads)\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error del servidor: ' + err.message });
});

const PORT = process.env.PORT || 8090;
init()
  .then(() => app.listen(PORT, () => console.log(`Control de Herramientas escuchando en puerto ${PORT}`)))
  .catch(e => { console.error('No se pudo iniciar:', e.message); process.exit(1); });
