#!/usr/bin/env node
/**
 * ============================================================================
 *  PRUEBAS DEL ESCANEO INTELIGENTE            npm run prueba:escaneo
 * ============================================================================
 *
 *  El prefijo del numero de guia es la direccion del viaje: una AN sale de MTY
 *  y va hacia CDMX, una BN sale de CDMX y va hacia MTY. De ahi sale la regla
 *  que estas pruebas cuidan:
 *
 *      en la plaza de la que sale, un escaneo solo puede ser SALIDA;
 *      en la plaza a la que llega, solo puede ser LLEGADA o entrega.
 *
 *  Romper esa regla no da error: deja la guia en un estatus imposible
 *  (una AN "en bodega MTY") y, peor, se traga la salida que el operador quiso
 *  registrar, que es como se descubrio — guias que "no se dieron de alta".
 *
 *  Necesita un PostgreSQL. Crea su propia base y la destruye al terminar; no
 *  toca la de desarrollo ni la de produccion.
 *
 *  Se conecta con DATABASE_URL si esta definida (solo toma el servidor, no la
 *  base) o, si no, con las variables PG* de siempre:
 *
 *      npm run prueba:escaneo
 *      PGHOST=/tmp PGPORT=5433 PGUSER=postgres npm run prueba:escaneo
 */

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(aqui, '..');

const BASE = 'guias_prueba_escaneo';

// Del entorno solo se toma a que servidor conectarse; la base la pone la
// prueba. Asi un DATABASE_URL apuntando a produccion no puede acabar
// borrandola: nunca se usa su nombre de base.
const require0 = createRequire(resolve(RAIZ, 'src/'));
const { parse: parseConexion } = require0('pg-connection-string');
const SERVIDOR = process.env.DATABASE_URL
  ? (({ database, ...resto }) => resto)(parseConexion(process.env.DATABASE_URL))
  : {};
const conexion = (base) => ({ ...SERVIDOR, database: base });

const c = {
  verde: (t) => `\x1b[32m${t}\x1b[0m`,
  rojo: (t) => `\x1b[31m${t}\x1b[0m`,
  gris: (t) => `\x1b[90m${t}\x1b[0m`,
};

let pasadas = 0;
let fallidas = 0;

function comprobar(descripcion, condicion, detalle) {
  if (condicion) {
    pasadas++;
    console.log(`  ${c.verde('✓')} ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  ${c.rojo('✗')} ${descripcion}`);
    if (detalle) console.log(`    ${c.gris(detalle)}`);
  }
}

// --- Base de pruebas -------------------------------------------------------

async function conAdmin(sentencia) {
  const cliente = new pg.Client(conexion('postgres'));
  await cliente.connect();
  await cliente.query(sentencia);
  await cliente.end();
}

await conAdmin(`DROP DATABASE IF EXISTS ${BASE}`);
await conAdmin(`CREATE DATABASE ${BASE}`);

// db.js arma su pool con DATABASE_URL; se le da la base de la prueba y las
// variables PG* cubren el resto (servidor, usuario, puerto).
delete process.env.DATABASE_URL;
for (const [clave, valor] of Object.entries({ PGHOST: SERVIDOR.host, PGPORT: SERVIDOR.port, PGUSER: SERVIDOR.user, PGPASSWORD: SERVIDOR.password })) {
  if (valor) process.env[clave] = String(valor);
}
process.env.PGDATABASE = BASE;

const require = createRequire(resolve(RAIZ, 'src/'));
const { pool, init } = require(resolve(RAIZ, 'src/db.js'));
const guias = require(resolve(RAIZ, 'src/guias.js'));

await init();

// --- Utilerias -------------------------------------------------------------

let n = 0;
const nuevoNumero = (prefijo) => `${prefijo}${String(++n).padStart(6, '0')}`;

async function fijarEstatus(numeroGuia, estatus) {
  await pool.query('UPDATE guias SET estatus = $1 WHERE numero_guia = $2', [estatus, numeroGuia]);
}

// Deja una guia registrada (con su salida) y despues en el estatus pedido, tal
// como quedaria tras el recorrido normal.
async function guiaEn(prefijo, plazaSalida, estatus) {
  const numeroGuia = nuevoNumero(prefijo);
  await guias.escanearGuia(numeroGuia, plazaSalida, 'bodega', 'prueba');
  await fijarEstatus(numeroGuia, estatus);
  return numeroGuia;
}

async function escanear(numeroGuia, plaza, modo = 'bodega') {
  try {
    return await guias.escanearGuia(numeroGuia, plaza, modo, 'prueba');
  } catch (e) {
    return { tipo: 'error', mensaje: e.message };
  }
}

const estatusDe = async (numeroGuia) =>
  (await pool.query('SELECT estatus FROM guias WHERE numero_guia = $1', [numeroGuia])).rows[0]?.estatus;

// --- 1. Una AN escaneada en MTY siempre es salida --------------------------

console.log('\n1. Una AN escaneada en MTY siempre es SALIDA (de MTY sale, a MTY no llega)');
{
  const guia = nuevoNumero('AN');
  const r = await escanear(guia, 'MTY');
  comprobar('guia nueva -> salida', r.tipo === 'salida', r.mensaje);
  comprobar('queda EN_TRANSITO_A_CDMX', (await estatusDe(guia)) === 'EN_TRANSITO_A_CDMX');
}
{
  // El caso reportado: la guia figura ya en bodega CDMX y MTY la vuelve a
  // despachar. Antes se registraba como "Llego a bodega MTY".
  const guia = await guiaEn('AN', 'MTY', 'EN_BODEGA_CDMX');
  const r = await escanear(guia, 'MTY');
  comprobar('figurando EN_BODEGA_CDMX -> salida', r.tipo === 'salida', r.mensaje);
  comprobar('queda EN_TRANSITO_A_CDMX', (await estatusDe(guia)) === 'EN_TRANSITO_A_CDMX');
}
{
  const guia = await guiaEn('AN', 'MTY', 'EN_RUTA_ENTREGA_CDMX');
  const r = await escanear(guia, 'MTY');
  comprobar('figurando EN_RUTA_ENTREGA_CDMX -> salida', r.tipo === 'salida', r.mensaje);
}
{
  const guia = await guiaEn('AN', 'MTY', 'ENTREGADO_CDMX');
  const r = await escanear(guia, 'MTY');
  comprobar('ya entregada -> nuevo embarque (salida)', r.tipo === 'salida', r.mensaje);
}
{
  const guia = await guiaEn('AN', 'MTY', 'EN_TRANSITO_A_CDMX');
  const r = await escanear(guia, 'MTY');
  comprobar('ya despachada -> escaneo repetido, no una segunda salida', r.tipo === 'repetido', r.mensaje);
}

// --- 2. Simetria: una BN escaneada en CDMX siempre es salida ---------------

console.log('\n2. Una BN escaneada en CDMX siempre es SALIDA (el mismo caso, al reves)');
{
  const guia = nuevoNumero('BN');
  const r = await escanear(guia, 'CDMX');
  comprobar('guia nueva -> salida', r.tipo === 'salida', r.mensaje);
  comprobar('queda EN_TRANSITO_A_MTY', (await estatusDe(guia)) === 'EN_TRANSITO_A_MTY');
}
{
  const guia = await guiaEn('BN', 'CDMX', 'EN_BODEGA_MTY');
  const r = await escanear(guia, 'CDMX');
  comprobar('figurando EN_BODEGA_MTY -> salida', r.tipo === 'salida', r.mensaje);
  comprobar('queda EN_TRANSITO_A_MTY', (await estatusDe(guia)) === 'EN_TRANSITO_A_MTY');
}

// --- 3. La llegada legitima sigue funcionando ------------------------------

console.log('\n3. La llegada sin escaneo de salida en la otra plaza sigue funcionando');
{
  // Una BN viaja CDMX -> MTY: escaneada en MTY si es una llegada.
  const guia = await guiaEn('BN', 'CDMX', 'EN_BODEGA_CDMX');
  const r = await escanear(guia, 'MTY');
  comprobar('BN en MTY figurando EN_BODEGA_CDMX -> llegada', r.tipo === 'llegada', r.mensaje);
  comprobar('queda EN_BODEGA_MTY', (await estatusDe(guia)) === 'EN_BODEGA_MTY');
}
{
  const guia = await guiaEn('AN', 'MTY', 'EN_BODEGA_MTY');
  const r = await escanear(guia, 'CDMX');
  comprobar('AN en CDMX figurando EN_BODEGA_MTY -> llegada', r.tipo === 'llegada', r.mensaje);
  comprobar('queda EN_BODEGA_CDMX', (await estatusDe(guia)) === 'EN_BODEGA_CDMX');
}
{
  const guia = await guiaEn('AN', 'MTY', 'EN_TRANSITO_A_CDMX');
  const r = await escanear(guia, 'CDMX');
  comprobar('AN en transito escaneada en CDMX -> llegada', r.tipo === 'llegada', r.mensaje);
}
{
  // Guias anteriores a la regla de prefijos: se siguen tratando como antes.
  const guia = 'VIEJA-0001';
  await pool.query(
    `INSERT INTO guias (numero_guia, origen, destino, estatus, creado_en, actualizado_en, estatus_desde)
     VALUES ($1, 'CDMX', 'MTY', 'EN_BODEGA_CDMX', now(), now(), now())`,
    [guia]
  );
  const r = await escanear(guia, 'MTY');
  comprobar('guia antigua sin prefijo -> llegada, como antes', r.tipo === 'llegada', r.mensaje);
}

// --- 4. El prefijo equivocado se sigue rechazando --------------------------

console.log('\n4. El prefijo equivocado se sigue rechazando');
{
  const guia = nuevoNumero('BN');
  const r = await escanear(guia, 'MTY');
  comprobar('BN nueva en MTY -> error', r.tipo === 'error', r.mensaje);
  comprobar('no se registro nada', (await estatusDe(guia)) === undefined);
}
{
  const guia = nuevoNumero('AN');
  const r = await escanear(guia, 'CDMX');
  comprobar('AN nueva en CDMX -> error', r.tipo === 'error', r.mensaje);
}

// --- 5. El invariante, sobre todo lo escaneado -----------------------------

console.log('\n5. Invariante: ninguna guia acaba en un estatus imposible para su prefijo');
{
  // Una AN nunca puede estar "en" MTY (bodega, reparto o entregada): de MTY
  // sale. Lo unico valido con _MTY para una AN seria ir en transito hacia
  // alla, que la regla de prefijos tampoco permite.
  const { rows: an } = await pool.query(
    `SELECT numero_guia, estatus FROM guias WHERE numero_guia LIKE 'AN%' AND estatus LIKE '%_MTY'`
  );
  comprobar('ninguna AN quedo en un estatus _MTY', an.length === 0, an.map((g) => `${g.numero_guia}: ${g.estatus}`).join(', '));

  const { rows: bn } = await pool.query(
    `SELECT numero_guia, estatus FROM guias WHERE numero_guia LIKE 'BN%' AND estatus LIKE '%_CDMX'`
  );
  comprobar('ninguna BN quedo en un estatus _CDMX', bn.length === 0, bn.map((g) => `${g.numero_guia}: ${g.estatus}`).join(', '));
}

// --- Cierre ----------------------------------------------------------------

await pool.end();
await conAdmin(`DROP DATABASE IF EXISTS ${BASE}`);

console.log(`\n${pasadas} pasaron, ${fallidas} fallaron\n`);
process.exit(fallidas ? 1 : 0);
