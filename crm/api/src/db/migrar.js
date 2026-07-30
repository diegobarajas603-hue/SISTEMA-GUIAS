import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool, cerrar } from './pool.js';
import { config } from '../config.js';

const aqui = dirname(fileURLToPath(import.meta.url));

const TABLAS = [
  'ia_mensajes', 'ia_conversaciones', 'ia_insights', 'notificaciones', 'bitacora',
  'automatizacion_ejecuciones', 'automatizaciones', 'landing_pages', 'segmentos',
  'envios_email', 'campanas', 'articulos_kb', 'ticket_mensajes', 'tickets',
  'facturas', 'contratos', 'archivos', 'notas', 'actividades', 'cotizacion_items',
  'cotizaciones', 'etapa_historial', 'oportunidad_productos', 'oportunidades',
  'productos', 'senales', 'leads', 'contactos', 'cuentas', 'metas', 'sesiones',
  'usuarios', 'equipos', 'importaciones', 'sistema_ajustes',
];

/** Aplica el esquema. Es idempotente, así que se puede llamar en cada arranque. */
export async function migrar({ reiniciar = false, silencioso = false } = {}) {
  const log = silencioso ? () => {} : (...args) => console.log(...args);

  if (reiniciar) {
    log('[db] eliminando tablas existentes…');
    await pool.query(`DROP TABLE IF EXISTS ${TABLAS.join(', ')} CASCADE`);
  }

  const sql = await readFile(resolve(aqui, 'esquema.sql'), 'utf8');
  await pool.query(sql);

  const { rows } = await pool.query(
    `SELECT count(*)::int AS tablas FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  log(`[db] esquema aplicado · ${rows[0].tablas} tablas`);
  return rows[0].tablas;
}

const ejecutadoDirecto = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());

if (ejecutadoDirecto) {
  const reiniciar = process.argv.includes('--reiniciar');
  console.log(`[db] conectando a ${config.db.url.replace(/:[^:@/]*@/, ':***@')}`);
  migrar({ reiniciar })
    .then(() => cerrar())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[db] falló la migración:', error.message);
      process.exit(1);
    });
}
