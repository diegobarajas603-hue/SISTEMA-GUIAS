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

const { valor: valorBD, uno: unoBD, consultar: consultarBD } = await import('./db/pool.js');

/**
 * Reinicio en limpio, pensado para hacerse desde el panel del proveedor sin
 * consola: se define `CRM_REINICIAR_BASE` con cualquier palabra y el siguiente
 * arranque vacía la base.
 *
 * La palabra queda registrada en `sistema_ajustes` **después** del borrado, y un
 * arranque posterior con la misma palabra no hace nada. Eso es lo que permite
 * dejar la variable puesta sin miedo: sin esa memoria, cada reinicio del
 * contenedor —un despliegue, un fallo, un escalado— borraría la operación
 * entera. Para volver a vaciar, se cambia la palabra.
 */
const tokenReinicio = process.env.CRM_REINICIAR_BASE?.trim();
if (tokenReinicio) {
  const aplicado = await valorBD(
    "SELECT valor FROM sistema_ajustes WHERE clave = 'reinicio_token'",
  ).catch(() => null);

  if (aplicado === tokenReinicio) {
    console.log(`[api] CRM_REINICIAR_BASE=«${tokenReinicio}» ya se aplicó; no se toca la base.`);
  } else {
    console.warn(`[api] CRM_REINICIAR_BASE=«${tokenReinicio}» · vaciando la base…`);
    await migrar({ reiniciar: true, silencioso: true });
    await consultarBD(
      `INSERT INTO sistema_ajustes (clave, valor) VALUES ('reinicio_token', $1)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()`,
      [tokenReinicio],
    );
    console.warn('[api] base vacía. Puedes dejar la variable puesta: no volverá a borrar.');
  }
}

/**
 * Primer usuario. Sin esto un despliegue nuevo queda inaccesible: no hay nadie
 * en la tabla y la pantalla de acceso no tiene forma de crear al primero.
 *
 * La semilla solo corre con la base vacía porque inserta en lugar de reemplazar:
 * ejecutarla dos veces duplicaría 18 meses de historia.
 */
const usuariosExistentes = await valorBD('SELECT count(*)::int FROM usuarios').catch(() => null);

if (usuariosExistentes === 0) {
  if (process.env.CRM_SEMILLA_INICIAL === '1') {
    console.log('[api] base vacía y CRM_SEMILLA_INICIAL=1 · sembrando datos de demostración…');
    const { sembrar } = await import('./db/semilla.js');
    await sembrar().catch((e) => console.error('[api] la semilla falló:', e.message));
  } else if (process.env.CRM_ADMIN_EMAIL && process.env.CRM_ADMIN_PASSWORD) {
    // Sin esto, un despliegue con datos reales queda inaccesible: no hay usuarios
    // y la pantalla de acceso no tiene forma de crear el primero.
    const { hashPassword } = await import('./lib/cripto.js');
    const admin = await unoBD(
      `INSERT INTO usuarios (email, nombre, password_hash, rol, puesto, avatar_tono)
       VALUES ($1,$2,$3,'admin','Administración',0) RETURNING email`,
      [
        process.env.CRM_ADMIN_EMAIL.toLowerCase(),
        process.env.CRM_ADMIN_NOMBRE || 'Administrador',
        hashPassword(process.env.CRM_ADMIN_PASSWORD),
      ],
    ).catch((e) => { console.error('[api] no se pudo crear el administrador:', e.message); return null; });
    if (admin) console.log(`[api] administrador inicial creado: ${admin.email}`);
  } else {
    console.warn('[api] la base está vacía y no hay usuarios: nadie podrá iniciar sesión.');
    console.warn('[api] define CRM_ADMIN_EMAIL y CRM_ADMIN_PASSWORD, o CRM_SEMILLA_INICIAL=1 para la demostración.');
  }
} else if (process.env.CRM_SEMILLA_INICIAL === '1') {
  console.log(`[api] CRM_SEMILLA_INICIAL=1 ignorado: ya hay ${usuariosExistentes} usuarios.`);
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
