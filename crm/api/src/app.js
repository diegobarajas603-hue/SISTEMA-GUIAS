import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { noEncontradoRuta, manejadorErrores } from './middleware/errores.js';
import montarRutas from './rutas/index.js';

const aqui = dirname(fileURLToPath(import.meta.url));

export function crearApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // La importación manda lotes de clientes en el cuerpo, así que necesita más
  // holgura que el resto de la API. Va primero y solo para esa ruta: el parser
  // general de abajo ve el cuerpo ya leído y no vuelve a tocarlo, de modo que
  // el límite estricto sigue vigente para todos los demás endpoints.
  app.use('/api/v1/importacion', express.json({ limit: '12mb' }));
  app.use(express.json({ limit: '1mb' }));

  // Cabeceras de seguridad. Sin CDNs externos, así que la CSP puede ser estricta;
  // 'unsafe-inline' en estilos es necesario para los estilos calculados en línea
  // de las gráficas (anchos de barra, trazos animados).
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (config.esProduccion) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
        "font-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
      );
    }
    next();
  });

  app.get('/health', (_req, res) => res.json({ estado: 'ok', ia: config.ia.habilitada }));

  montarRutas(app);

  // La SPA compilada se sirve desde el mismo origen en producción: sin CORS, sin
  // segundo servidor. En desarrollo esto no existe y Vite hace de proxy.
  const dist = resolve(aqui, '..', '..', 'web', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1y', index: false }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }

  app.use('/api', noEncontradoRuta);
  app.use(manejadorErrores);

  return app;
}

export default crearApp;
