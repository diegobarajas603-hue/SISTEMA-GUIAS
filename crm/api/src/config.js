import { config as cargarEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
// El .env vive en la raíz de crm/ para compartirse entre api y web.
cargarEnv({ path: resolve(aqui, '..', '..', '.env') });
cargarEnv();

const num = (valor, porDefecto) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
};

const bool = (valor, porDefecto) =>
  valor === undefined ? porDefecto : ['1', 'true', 'si', 'yes'].includes(String(valor).toLowerCase());

const URL_BD = process.env.CRM_DATABASE_URL
  || process.env.DATABASE_URL
  || 'postgres://postgres@localhost:5432/aura_crm';

/**
 * ¿Hace falta TLS para hablar con esta base?
 *
 * Un Postgres gestionado (Railway, Neon, Supabase, RDS) lo exige; uno local o el
 * de la red interna del proveedor no. Acertar por omisión evita el clásico
 * despliegue que falla con «connection terminated unexpectedly» sin más pistas.
 * `CRM_DB_SSL` sigue mandando cuando se define a mano.
 */
function requiereTLS(url) {
  if (process.env.CRM_DB_SSL !== undefined) return bool(process.env.CRM_DB_SSL, false);
  try {
    const host = new URL(url).hostname;
    const local = ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host);
    // Las redes internas de los proveedores van sin cifrar y sin certificado.
    const interno = host.endsWith('.internal') || host.endsWith('.local');
    return !local && !interno;
  } catch {
    return false;
  }
}

export const config = {
  entorno: process.env.NODE_ENV || 'development',
  esProduccion: process.env.NODE_ENV === 'production',
  // PORT lo inyecta la plataforma (Railway, Render, Fly) y tiene que ganar, o el
  // chequeo de salud nunca encuentra el proceso escuchando.
  puerto: num(process.env.PORT ?? process.env.CRM_PORT, 4100),

  db: {
    url: URL_BD,
    maxConexiones: num(process.env.CRM_DB_POOL, 12),
    ssl: requiereTLS(URL_BD) ? { rejectUnauthorized: false } : false,
  },

  sesion: {
    cookie: 'aura_sesion',
    horas: num(process.env.CRM_SESSION_HOURS, 12),
    // Sin HTTPS la cookie Secure jamás se envía; en producción se asume TLS.
    segura: bool(process.env.CRM_COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  },

  auth: {
    intentosMax: num(process.env.CRM_MAX_INTENTOS, 10),
    bloqueoMinutos: num(process.env.CRM_BLOQUEO_MINUTOS, 15),
  },

  ia: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    modelo: process.env.CRM_IA_MODELO || 'claude-sonnet-5',
    maxTokens: num(process.env.CRM_IA_MAX_TOKENS, 1600),
    // Sin llave el producto funciona igual: el motor determinista cubre todo y la
    // prosa sale de plantillas. La IA generativa es una mejora, no un requisito.
    get habilitada() {
      return Boolean(this.apiKey);
    },
  },

  semilla: {
    // PRNG con semilla fija: la base generada es reproducible entre ejecuciones.
    semilla: num(process.env.CRM_SEED, 20260729),
    passwordDemo: process.env.CRM_DEMO_PASSWORD || 'Aura2026!',
  },
};

export default config;
