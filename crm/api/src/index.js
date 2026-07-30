import { crearApp } from './app.js';
import { config } from './config.js';
import { migrar } from './db/migrar.js';
import { cerrar } from './db/pool.js';
import { iniciarProgramador } from './motor/programador.js';

const app = crearApp();

// El esquema es idempotente, así que aplicarlo en cada arranque mantiene el
// despliegue al día sin un paso manual de migración. Mismo criterio que el
// sistema de guías existente.
try {
  await migrar({ silencioso: true });
} catch (error) {
  console.error('[api] no se pudo preparar la base de datos:', error.message);
  console.error('[api] revisa CRM_DATABASE_URL en crm/.env');
  process.exit(1);
}

const servidor = app.listen(config.puerto, () => {
  console.log(`\n  Aura CRM · API lista en http://localhost:${config.puerto}`);
  console.log(`  Entorno: ${config.entorno}`);
  console.log(`  IA generativa: ${config.ia.habilitada ? `activa (${config.ia.modelo})` : 'motor determinista (sin ANTHROPIC_API_KEY)'}\n`);
});

// Reanuda esperas de automatizaciones, dispara los flujos con horario y recalcula las
// métricas de IA una vez al día. Se puede apagar con CRM_PROGRAMADOR=0 cuando hay
// varias réplicas y solo una debe llevar el reloj.
if (process.env.CRM_PROGRAMADOR !== '0') iniciarProgramador();

const apagar = async (senal) => {
  console.log(`\n[api] ${senal} recibido, cerrando…`);
  servidor.close(async () => {
    await cerrar().catch(() => {});
    process.exit(0);
  });
  // Si algo se queda colgado, no bloquear el reinicio indefinidamente.
  setTimeout(() => process.exit(1), 8000).unref();
};

process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
