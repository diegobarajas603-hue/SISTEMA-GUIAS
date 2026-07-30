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

export const config = {
  entorno: process.env.NODE_ENV || 'development',
  esProduccion: process.env.NODE_ENV === 'production',
  puerto: num(process.env.CRM_PORT, 4100),

  db: {
    url: process.env.CRM_DATABASE_URL || process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/aura_crm',
    maxConexiones: num(process.env.CRM_DB_POOL, 12),
    ssl: bool(process.env.CRM_DB_SSL, false) ? { rejectUnauthorized: false } : false,
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
