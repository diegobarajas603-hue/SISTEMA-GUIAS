/**
 * Mide el importador con un archivo grande.
 *
 *   node pruebas/rendimiento-importacion.mjs [archivo.xlsx]
 *
 * Además de cronometrar cada fase, comprueba que el hilo principal **siga
 * respondiendo**: sondea la interfaz mientras trabaja y registra la pausa más
 * larga. Si el parseo se hiciera fuera del worker, aquí se vería.
 */

import { chromium } from 'playwright';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const WEB = 'http://localhost:5180';
const ARCHIVO = process.argv[2] || join(process.cwd(), 'pruebas', 'archivos', 'clientes-50000.xlsx');

const c = {
  verde: (s) => `\x1b[32m${s}\x1b[0m`,
  rojo: (s) => `\x1b[31m${s}\x1b[0m`,
  gris: (s) => `\x1b[90m${s}\x1b[0m`,
  negrita: (s) => `\x1b[1m${s}\x1b[0m`,
};

const seg = (ms) => `${(ms / 1000).toFixed(1)} s`;
const peso = statSync(ARCHIVO).size;

console.log(c.negrita(`\nRendimiento · ${ARCHIVO.split('/').pop()} (${(peso / 1024 / 1024).toFixed(1)} MB)\n`));

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pag = await (await navegador.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();

const fallos = [];
pag.on('pageerror', (e) => fallos.push(e.message));

await pag.goto(WEB, { waitUntil: 'networkidle' });
await pag.fill('input[type=email]', 'mariana.trevino@fletestauro.com.mx');
await pag.fill('input[type=password]', 'Aura2026!');
await pag.click('button[type=submit]');
await pag.waitForURL((u) => !u.pathname.includes('entrar'), { timeout: 15000 });

// «networkidle» no llega: React Query mantiene consultas vivas de fondo.
await pag.goto(`${WEB}/clientes/importar`, { waitUntil: 'domcontentloaded' });
await pag.waitForSelector('text=Arrastra tu archivo de clientes', { timeout: 60000 });

/**
 * Sonda de fluidez: pide un fotograma cada 100 ms y anota el hueco mayor.
 * Un salto grande significaría que algo bloqueó el hilo principal.
 */
async function vigilar(fn) {
  await pag.evaluate(() => {
    const w = window;
    w.__pausaMax = 0;
    w.__ultimo = performance.now();
    const tic = () => {
      const ahora = performance.now();
      w.__pausaMax = Math.max(w.__pausaMax, ahora - w.__ultimo);
      w.__ultimo = ahora;
      w.__id = requestAnimationFrame(tic);
    };
    w.__id = requestAnimationFrame(tic);
  });
  const t0 = Date.now();
  await fn();
  const ms = Date.now() - t0;
  const pausa = await pag.evaluate(() => {
    cancelAnimationFrame(window.__id);
    return Math.round(window.__pausaMax);
  });
  return { ms, pausa };
}

const lectura = await vigilar(async () => {
  await pag.setInputFiles('input[type=file]', ARCHIVO);
  await pag.waitForSelector('text=/columnas detectadas/', { timeout: 600000 });
});
console.log(`${c.verde('✓')} Lectura y detección de columnas  ${seg(lectura.ms).padStart(9)}  ${c.gris(`pausa máx. ${lectura.pausa} ms`)}`);

const validacion = await vigilar(async () => {
  await pag.getByRole('button', { name: /Validar datos/i }).click();
  await pag.waitForSelector('text=Clientes a importar', { timeout: 900000 });
});
const clientes = Number(
  (await pag.locator('text=Clientes a importar').locator('..').innerText()).replace(/\D/g, ''),
);
console.log(`${c.verde('✓')} Agrupación y validación          ${seg(validacion.ms).padStart(9)}  ${c.gris(`pausa máx. ${validacion.pausa} ms · ${clientes.toLocaleString('es-MX')} clientes`)}`);

const escritura = await vigilar(async () => {
  await pag.getByRole('button', { name: /Importar .* clientes/i }).click();
  await pag.waitForSelector('text=Importación terminada', { timeout: 3_600_000 });
});
const importados = Number(
  (await pag.locator('text=Importados').first().locator('..').innerText()).replace(/\D/g, ''),
);
const porSegundo = Math.round(importados / (escritura.ms / 1000));
console.log(`${c.verde('✓')} Escritura en la base             ${seg(escritura.ms).padStart(9)}  ${c.gris(`pausa máx. ${escritura.pausa} ms · ${porSegundo} clientes/s`)}`);

const total = lectura.ms + validacion.ms + escritura.ms;
const pausaMax = Math.max(lectura.pausa, validacion.pausa, escritura.pausa);

console.log(`\n  ${c.negrita('Total')}: ${seg(total)} para ${importados.toLocaleString('es-MX')} clientes`);
console.log(`  ${c.negrita('Pausa máxima del hilo principal')}: ${pausaMax} ms`);

// Limpieza.
const borradas = await pag.evaluate(async () => {
  let n = 0;
  for (let i = 0; i < 700; i += 1) {
    const r = await fetch('/api/v1/cuentas?orden=creado_en&dir=desc&limite=100', { credentials: 'include' });
    const d = await r.json();
    const suyas = d.filas.filter((f) => f.origen === 'importacion');
    if (!suyas.length) break;
    await Promise.all(suyas.map((f) => fetch(`/api/v1/cuentas/${f.id}`, { method: 'DELETE', credentials: 'include' })));
    n += suyas.length;
  }
  return n;
});
console.log(`  ${c.gris(`Limpieza: ${borradas.toLocaleString('es-MX')} cuentas eliminadas`)}`);

await navegador.close();

// Un bloqueo de más de 1 s haría sentir la interfaz congelada.
const limitePausa = 1000;
let salida = 0;
if (pausaMax > limitePausa) {
  console.log(`\n${c.rojo(`✗ El hilo principal se bloqueó ${pausaMax} ms (límite ${limitePausa} ms)`)}`);
  salida = 1;
}
if (fallos.length) {
  console.log(`\n${c.rojo('✗ Errores en página:')} ${fallos.slice(0, 3).join(' · ')}`);
  salida = 1;
}
if (!salida) console.log(`\n${c.verde('✓ La interfaz no se bloqueó en ningún momento.')}`);
console.log('');
process.exit(salida);
