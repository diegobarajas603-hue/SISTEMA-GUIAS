import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5180';
const TOMAS = process.env.AURA_TOMAS ?? new URL('./tomas', import.meta.url).pathname;
const errores = [];
mkdirSync(TOMAS, { recursive: true });

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await navegador.newContext({ viewport: { width: 1600, height: 1000 } });
const pag = await ctx.newPage();

// El 401 de /auth/yo antes de iniciar sesión es el comportamiento correcto:
// la app pregunta si hay sesión y el servidor contesta que no.
let logueado = false;
pag.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (!logueado && /401|Unauthorized/i.test(m.text())) return;
  errores.push(`[console] ${m.text()}`);
});
pag.on('pageerror', (e) => errores.push(`[pageerror] ${e.message}`));

async function toma(nombre) {
  await pag.waitForTimeout(1600);
  const m = await pag.evaluate(() => {
    const d = document.documentElement;
    const main = document.querySelector('#contenido-scroll');
    return {
      hDoc: d.scrollWidth > d.clientWidth,
      vMain: main ? main.scrollHeight - main.clientHeight : 0,
    };
  });
  if (m.hDoc) errores.push(`[layout] ${nombre}: scroll horizontal en el documento`);
  await pag.screenshot({ path: `${TOMAS}/${nombre}.png`, fullPage: false });
  console.log(`  ✓ ${nombre}${m.vMain > 4 ? ` (scroll vertical ${m.vMain}px)` : ''}`);
}

console.log('Login');
await pag.goto(BASE, { waitUntil: 'networkidle' });
await pag.fill('input[type=email]', 'mariana.trevino@fletestauro.com.mx');
await pag.fill('input[type=password]', 'Aura2026!');
await pag.click('button[type=submit]');
await pag.waitForURL((u) => !u.pathname.includes('entrar'), { timeout: 15000 });
logueado = true;
await pag.waitForTimeout(2000);
await toma('01-dashboard');

const rutas = [
  ['prospectos', '/prospectos'],
  ['clientes', '/clientes'],
  ['oportunidades', '/oportunidades'],
  ['cotizaciones', '/cotizaciones'],
  ['marketing', '/marketing'],
  ['soporte', '/soporte'],
  ['agenda', '/agenda'],
  ['reportes', '/reportes'],
  ['automatizaciones', '/automatizaciones'],
  ['copiloto', '/ia'],
  ['ajustes', '/ajustes'],
];

let n = 2;
for (const [nombre, ruta] of rutas) {
  console.log(`Ruta ${ruta}`);
  await pag.goto(BASE + ruta, { waitUntil: 'networkidle' });
  await pag.waitForTimeout(1400);
  await toma(`${String(n).padStart(2, '0')}-${nombre}`);
  n++;
}

// Editor de flujo: entra al primero de la lista
console.log('Editor de flujo');
await pag.goto(BASE + '/automatizaciones', { waitUntil: 'networkidle' });
await pag.waitForTimeout(1200);
const enlace = pag.locator('a[href^="/automatizaciones/"]').first();
if (await enlace.count()) {
  await enlace.click();
  await pag.waitForTimeout(2200);
  await toma(`${String(n).padStart(2, '0')}-editor-flujo`);
  n++;
  // Selecciona un nodo del lienzo para abrir el panel de configuración
  const nodos = pag.locator('div[style*="width: 216px"]');
  const total = await nodos.count();
  console.log(`  nodos en el lienzo: ${total}`);
  if (total > 1) {
    await nodos.nth(1).click();
    await pag.waitForTimeout(900);
    await toma(`${String(n).padStart(2, '0')}-editor-nodo-seleccionado`);
    n++;
  }
  // Abre la bandeja de validación
  await pag.getByRole('button', { name: /Validar/i }).click();
  await pag.waitForTimeout(1600);
  await toma(`${String(n).padStart(2, '0')}-editor-validacion`);
  n++;
  // Simula
  await pag.getByRole('button', { name: /Simular/i }).click();
  await pag.waitForTimeout(1800);
  await toma(`${String(n).padStart(2, '0')}-editor-simulacion`);
  n++;
} else {
  errores.push('no se encontró ningún flujo en la lista');
}

// Modo oscuro
console.log('Modo oscuro');
await pag.goto(BASE + '/ajustes', { waitUntil: 'networkidle' });
await pag.waitForTimeout(1000);
await pag.getByRole('tab', { name: 'Apariencia' }).click();
await pag.waitForTimeout(600);
await pag.getByText('Oscuro', { exact: true }).click();
await pag.waitForTimeout(900);
await toma(`${String(n).padStart(2, '0')}-ajustes-oscuro`); n++;
await pag.goto(BASE + '/', { waitUntil: 'networkidle' });
await pag.waitForTimeout(2000);
await toma(`${String(n).padStart(2, '0')}-dashboard-oscuro`); n++;
await pag.goto(BASE + '/automatizaciones', { waitUntil: 'networkidle' });
await pag.waitForTimeout(1400);
const e2 = pag.locator('a[href^="/automatizaciones/"]').first();
if (await e2.count()) { await e2.click(); await pag.waitForTimeout(2200); await toma(`${String(n).padStart(2, '0')}-editor-oscuro`); n++; }

await navegador.close();

console.log('\n' + '─'.repeat(50));
if (errores.length) {
  console.log(`ERRORES DE NAVEGADOR (${errores.length}):`);
  for (const e of [...new Set(errores)]) console.log('  · ' + e);
  process.exit(1);
}
console.log('Sin errores de consola.');
