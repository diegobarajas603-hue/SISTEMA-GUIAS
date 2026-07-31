/**
 * Recorre el alta de una cotización de flete en el navegador: elegir cliente de
 * la cartera, capturar el envío y la mercancía, ver el cálculo en vivo y generar
 * el PDF. Limpia lo que crea.
 *
 *   node pruebas/humo-ui-cotizacion.mjs
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const WEB = 'http://localhost:5180';
const TOMAS = process.env.AURA_TOMAS ?? join(process.cwd(), 'pruebas', 'tomas');
mkdirSync(TOMAS, { recursive: true });

const c = {
  verde: (s) => `\x1b[32m${s}\x1b[0m`, rojo: (s) => `\x1b[31m${s}\x1b[0m`,
  gris: (s) => `\x1b[90m${s}\x1b[0m`, negrita: (s) => `\x1b[1m${s}\x1b[0m`,
};

let ok = 0; let fallos = 0;
const errores = []; const consola = [];

async function prueba(nombre, fn) {
  try {
    const r = await fn(); ok += 1;
    console.log(`${c.verde('✓')} ${nombre}${r ? c.gris(` · ${r}`) : ''}`);
  } catch (e) {
    fallos += 1; errores.push({ nombre, error: e.message });
    console.log(`${c.rojo('✗')} ${nombre}\n  ${c.rojo(e.message)}`);
  }
}

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pag = await (await nav.newContext({ viewport: { width: 1600, height: 1050 } })).newPage();

let dentro = false;
pag.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (!dentro && /401|Unauthorized/i.test(m.text())) return;
  consola.push(m.text());
});
pag.on('pageerror', (e) => consola.push(`pageerror: ${e.message}`));

const toma = async (n) => { await pag.waitForTimeout(600); await pag.screenshot({ path: join(TOMAS, `${n}.png`) }); };

console.log(c.negrita('\nCotización de flete\n'));

await prueba('inicia sesión', async () => {
  await pag.goto(WEB, { waitUntil: 'domcontentloaded' });
  await pag.fill('input[type=email]', 'sistemas1@fletestauro.com.mx');
  await pag.fill('input[type=password]', 'Aura2026!');
  await pag.click('button[type=submit]');
  await pag.waitForURL((u) => !u.pathname.includes('entrar'), { timeout: 20000 });
  dentro = true;
  return 'ok';
});

await prueba('«Nueva cotización» abre la pantalla completa', async () => {
  await pag.goto(`${WEB}/cotizaciones`, { waitUntil: 'domcontentloaded' });
  await pag.getByRole('button', { name: /Nueva cotización/i }).first().click();
  await pag.waitForURL(/\/cotizaciones\/nueva/, { timeout: 15000 });
  await pag.waitForSelector('text=Nueva cotización de flete', { timeout: 15000 });
  await toma('cot-01-inicio');
  return 'sin formulario de datos del cliente';
});

let cliente = '';

await prueba('busca y selecciona un cliente de la cartera', async () => {
  await pag.getByLabel('Buscar cliente').fill('S.A.');
  await pag.waitForTimeout(1400);
  const primero = pag.locator('button:has(svg)').filter({ hasText: 'S.A.' }).first();
  cliente = (await primero.innerText()).split('\n')[0];
  await primero.click();
  await pag.waitForTimeout(900);
  if (!(await pag.locator('text=Estos datos se toman de su ficha').count())) {
    throw new Error('no cargó la ficha del cliente');
  }
  await toma('cot-02-cliente');
  return cliente;
});

await prueba('captura el envío', async () => {
  await pag.getByLabel('Origen').fill('Monterrey, N.L.');
  await pag.getByLabel('Destino').fill('Guadalajara, Jal.');
  await pag.getByLabel('Descripción del envío').fill('Tarimas de refacciones metálicas');
  return 'origen, destino y descripción';
});

await prueba('la altura se bloquea si no es estibable', async () => {
  const alto = pag.getByLabel('Alto (m)').first();
  if (!(await alto.isDisabled())) throw new Error('el campo debería estar bloqueado');
  if (await alto.inputValue() !== '1.8') throw new Error(`la altura es ${await alto.inputValue()}, esperaba 1.8`);
  return 'fijo en 1.80 m';
});

await prueba('al marcar estibable se habilita la altura', async () => {
  await pag.getByLabel('Renglón 1 estibable').click();
  await pag.waitForTimeout(400);
  const alto = pag.getByLabel('Alto (m)').first();
  if (await alto.isDisabled()) throw new Error('debería poder capturarse');
  return 'editable';
});

await prueba('calcula el peso volumétrico y el cobrable en vivo', async () => {
  await pag.getByLabel('Cantidad').first().fill('2');
  await pag.getByLabel('Peso real (kg)').first().fill('800');
  await pag.getByLabel('Largo (m)').first().fill('1.2');
  await pag.getByLabel('Ancho (m)').first().fill('1.0');
  await pag.getByLabel('Alto (m)').first().fill('1.5');
  await pag.waitForTimeout(700);

  const linea = await pag.locator('text=/Peso volumétrico/').first().locator('..').innerText();
  if (!linea.includes('1,800.00')) throw new Error(`volumétrico inesperado: ${linea.replace(/\n/g, ' ')}`);
  if (!(await pag.locator('text=por volumen').count())) throw new Error('no señala cuál peso se cobra');
  return '2 × 1.2 × 1.0 × 1.5 × 500 = 1,800 kg';
});

await prueba('la tarifa cambia con el tipo de mercancía', async () => {
  const importe = async () => (await pag.locator('text=Importe del flete').first().locator('..').innerText())
    .replace(/[^\d.]/g, '');
  const general = await importe();
  await pag.getByRole('button', { name: /^Químico/ }).click();
  await pag.waitForTimeout(600);
  const quimico = await importe();
  if (general === quimico) throw new Error('el importe no cambió al elegir químico');
  await toma('cot-03-mercancia');
  return `general ${general} → químico ${quimico}`;
});

let folio = '';

await prueba('crea la cotización', async () => {
  await pag.getByRole('button', { name: /Crear cotización/i }).click();
  await pag.waitForURL(/\/cotizaciones\/\d+$/, { timeout: 20000 });
  await pag.waitForTimeout(1200);
  folio = (await pag.locator('text=/COT-\\d+/').first().innerText()).match(/COT-\d+/)[0];
  await toma('cot-04-detalle');
  return folio;
});

await prueba('el detalle muestra el resumen del flete', async () => {
  for (const t of ['Peso total cobrable', 'Tarifa aplicada', 'Importe del flete']) {
    if (!(await pag.locator(`text=${t}`).count())) throw new Error(`falta «${t}»`);
  }
  return 'pesos, tarifa e importe';
});

await prueba('el PDF se genera y es un PDF de verdad', async () => {
  const r = await pag.evaluate(async () => {
    const m = window.location.pathname.match(/\/cotizaciones\/(\d+)/);
    const res = await fetch(`/api/v1/cotizaciones/${m[1]}/pdf`, { credentials: 'include' });
    const buf = new Uint8Array(await res.arrayBuffer());
    return { estado: res.status, tipo: res.headers.get('content-type'),
      bytes: buf.length, cabecera: String.fromCharCode(...buf.slice(0, 5)) };
  });
  if (r.estado !== 200) throw new Error(`estado ${r.estado}`);
  if (r.cabecera !== '%PDF-') throw new Error(`no es PDF: «${r.cabecera}»`);
  if (r.bytes < 20000) throw new Error(`pesa solo ${r.bytes} bytes`);
  return `${(r.bytes / 1024).toFixed(0)} kB · ${r.tipo}`;
});

await prueba('limpia la cotización de prueba', async () => {
  const n = await pag.evaluate(async () => {
    const m = window.location.pathname.match(/\/cotizaciones\/(\d+)/);
    await fetch(`/api/v1/cotizaciones/${m[1]}`, { method: 'DELETE', credentials: 'include' });
    return m[1];
  });
  return `eliminada #${n}`;
});

await nav.close();

console.log(`\n${'─'.repeat(60)}`);
console.log(`${c.negrita('Resultado')}: ${c.verde(`${ok} correctas`)}${fallos ? `, ${c.rojo(`${fallos} fallidas`)}` : ''}`);
if (fallos) { console.log(`\n${c.rojo('Fallos:')}`); for (const e of errores) console.log(`  · ${e.nombre}\n    ${e.error}`); }
if (consola.length) { console.log(`\n${c.rojo('Consola:')}`); for (const p of [...new Set(consola)].slice(0, 6)) console.log(`  · ${p}`); }
console.log('');
process.exit(fallos || consola.length ? 1 : 0);
