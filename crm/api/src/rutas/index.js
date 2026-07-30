import { exigirSesion } from '../middleware/sesion.js';
import auth from './auth.js';
import dashboard from './dashboard.js';
import leads from './leads.js';
import cuentas from './cuentas.js';
import oportunidades from './oportunidades.js';
import cotizaciones from './cotizaciones.js';
import actividades from './actividades.js';
import tickets from './tickets.js';
import marketing from './marketing.js';
import reportes from './reportes.js';
import automatizaciones from './automatizaciones.js';
import ia from './ia.js';
import catalogo from './catalogo.js';

const BASE = '/api/v1';

/**
 * Un router por dominio. `/auth` es el único público (el login); todo lo demás
 * exige sesión, y eso se declara aquí una sola vez en lugar de repetirlo en cada
 * archivo de rutas.
 */
export default function montarRutas(app) {
  app.use(`${BASE}/auth`, auth);

  const protegidos = {
    dashboard, leads, cuentas, oportunidades, cotizaciones, actividades,
    tickets, marketing, reportes, automatizaciones, ia, catalogo,
  };

  for (const [nombre, router] of Object.entries(protegidos)) {
    app.use(`${BASE}/${nombre}`, exigirSesion, router);
  }
}
