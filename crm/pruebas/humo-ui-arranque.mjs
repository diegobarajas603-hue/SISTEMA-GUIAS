/**
 * Recorre el arranque en limpio: entrar con el administrador creado por variable,
 * dar de alta equipo y personas, cargar el catálogo de servicios y comprobar que
 * el CRM queda operable. Es el camino que sigue quien estrena el sistema.
 *
 *   node pruebas/humo-ui-arranque.mjs
 *
 * Necesita una base recién vaciada y la API arrancada con CRM_ADMIN_EMAIL.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const WEB = 'http://localhost:5180';
const ADMIN = process.env.CRM_ADMIN_EMAIL || 'sistemas1@fletestauro.com.mx';
const CLAVE = process.env.CRM_ADMIN_PASSWORD || 'MiClave12345';
const TOMAS = process.env.AURA_TOMAS ?? join(process.cwd(), 'pruebas', 'tomas');
mkdirSync(TOMAS, { recursive: true });

const c = {
  verde: (s) => `\x1b[32m${s}\x1b[0m`,
  rojo: (s) => `\x1b[31m${s}\x1b[0m`,
  gris: (s) => `\x1b[90m${s}\x1b[0m`,
  negrita: (s) => `\x1b[1m${s}\x1b[0m`,
};

let ok = 0;
let fallos = 0;
const errores = [];
const consola = [];

async function prueba(nombre, fn) {
  try {
    const r = await fn();
    ok += 1;
    console.log(`${c.verde('✓')} ${nombre}${r ? c.gris(` · ${r}`) : ''}`);
  } catch (e) {
    fallos += 1;
    errores.push({ nombre, error: e.message });
    console.log(`${c.rojo('✗')} ${nombre}\n  ${c.rojo(e.message)}`);
  }
}

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pag = await (await navegador.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();

let dentro = false;
pag.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (!dentro && /401|Unauthorized/i.test(m.text())) return;
  consola.push(m.text());
});
pag.on('pageerror', (e) => consola.push(`pageerror: ${e.message}`));

const toma = async (n) => { await pag.waitForTimeout(700); await pag.screenshot({ path: join(TOMAS, `${n}.png`) }); };
const irAjustes = async (pestana) => {
  await pag.goto(`${WEB}/ajustes`, { waitUntil: 'domcontentloaded' });
  await pag.waitForSelector('text=Ajustes', { timeout: 20000 });
  await pag.getByRole('tab', { name: pestana }).click();
  await pag.waitForTimeout(900);
};

console.log(c.negrita('\nArranque en limpio\n'));

await prueba('entra con el administrador creado por variable', async () => {
  await pag.goto(WEB, { waitUntil: 'domcontentloaded' });
  await pag.fill('input[type=email]', ADMIN);
  await pag.fill('input[type=password]', CLAVE);
  await pag.click('button[type=submit]');
  await pag.waitForURL((u) => !u.pathname.includes('entrar'), { timeout: 20000 });
  dentro = true;
  return ADMIN;
});

await prueba('el sistema arranca vacío, sin datos de demostración', async () => {
  const r = await pag.evaluate(async () => {
    const res = await fetch('/api/v1/cuentas?limite=1', { credentials: 'include' });
    return res.json();
  });
  if (r.total !== 0) throw new Error(`esperaba 0 cuentas, hay ${r.total}`);
  return '0 clientes, como debe ser';
});

await prueba('Ajustes avisa de que estás solo', async () => {
  await irAjustes('Equipo');
  const aviso = pag.locator('text=/Eres la única persona con acceso/');
  if (!(await aviso.count())) throw new Error('no muestra el aviso de equipo vacío');
  await toma('cero-01-equipo-vacio');
  return 'con explicación de por qué importa';
});

await prueba('crea un equipo', async () => {
  await pag.getByRole('button', { name: /^Nuevo$/ }).click();
  await pag.waitForSelector('text=Nuevo equipo', { timeout: 10000 });
  await pag.locator('input').first().fill('Equipo Monterrey');
  await pag.locator('select').first().selectOption('MTY');
  await pag.getByRole('button', { name: /^Crear$/ }).click();
  await pag.waitForTimeout(1400);
  if (!(await pag.locator('text=Equipo Monterrey').count())) throw new Error('el equipo no aparece en la lista');
  return 'Equipo Monterrey · MTY';
});

let claveNueva = '';

await prueba('da de alta a una persona con contraseña generada', async () => {
  await pag.getByRole('button', { name: /Nueva persona/i }).click();
  await pag.waitForSelector('text=Contraseña inicial', { timeout: 10000 });

  claveNueva = await pag.locator('code').first().innerText();
  if (claveNueva.length < 8) throw new Error(`la contraseña generada es débil: «${claveNueva}»`);

  await pag.getByLabel(/Nombre completo/i).fill('Ana Ruiz Cantú');
  await pag.getByLabel(/^Correo/i).fill('ana.ruiz@fletestauro.com.mx');
  await pag.getByLabel(/Puesto/i).fill('Ejecutiva Comercial');
  await pag.getByLabel(/Meta mensual/i).fill('450000');
  await toma('cero-02-nueva-persona');
  await pag.getByRole('button', { name: /Dar de alta/i }).click();
  await pag.waitForTimeout(1600);

  if (!(await pag.locator('text=Ana Ruiz Cantú').count())) throw new Error('la persona no aparece en la tabla');
  return `${claveNueva} · meta $450,000`;
});

await prueba('la persona nueva puede entrar de verdad', async () => {
  const r = await pag.evaluate(async ([email, pass]) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    return { estado: res.status, datos: await res.json() };
  }, ['ana.ruiz@fletestauro.com.mx', claveNueva]);
  if (r.estado !== 200) throw new Error(`el login devolvió ${r.estado}`);
  return `${r.datos.usuario.nombre} · ${r.datos.usuario.rol}`;
});

// El login anterior cambió la cookie del navegador; se vuelve a entrar como admin.
await prueba('vuelve a entrar como administrador', async () => {
  await pag.evaluate(async ([email, pass]) => {
    await fetch('/api/v1/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
  }, [ADMIN, CLAVE]);
  return 'sesión restaurada';
});

await prueba('el catálogo de servicios avisa de que está vacío', async () => {
  await irAjustes('Servicios');
  if (!(await pag.locator('text=Tu catálogo está vacío').count())) {
    throw new Error('no muestra el estado vacío');
  }
  await toma('cero-03-catalogo-vacio');
  return 'con explicación de por qué hace falta';
});

await prueba('agrega un servicio y calcula el margen solo', async () => {
  await pag.getByRole('button', { name: /Agregar el primero/i }).click();
  await pag.waitForSelector('text=Nuevo servicio', { timeout: 10000 });
  await pag.getByLabel(/^Clave/i).fill('FT-LTL');
  await pag.getByLabel(/Nombre del servicio/i).fill('Consolidado LTL MTY–CDMX');
  await pag.getByLabel(/Categoría/i).fill('Transporte terrestre');
  await pag.getByLabel(/Precio por unidad/i).fill('980');
  await pag.getByLabel(/Costo por unidad/i).fill('640');
  await pag.waitForTimeout(500);

  const margen = await pag.locator('text=/Margen resultante/').locator('..').innerText();
  if (!margen.includes('35%')) throw new Error(`el margen calculado es incorrecto: «${margen}»`);
  await toma('cero-04-nuevo-servicio');

  await pag.getByRole('button', { name: /^Agregar$/ }).click();
  await pag.waitForTimeout(1600);
  if (!(await pag.locator('text=FT-LTL').count())) throw new Error('el servicio no aparece en la tabla');
  return 'margen 35% calculado en vivo';
});

await prueba('el servicio queda disponible para cotizar', async () => {
  const r = await pag.evaluate(async () => {
    const res = await fetch('/api/v1/catalogo/productos', { credentials: 'include' });
    return res.json();
  });
  if (!r.length) throw new Error('el catálogo sigue vacío para las cotizaciones');
  if (r[0].precio_base !== 98000) throw new Error(`el precio se guardó como ${r[0].precio_base} centavos`);
  await toma('cero-05-catalogo-listo');
  return `${r.length} servicio a ${r[0].precio_base / 100} pesos por ${r[0].unidad}`;
});

await prueba('ya se puede importar la cartera de clientes', async () => {
  await pag.goto(`${WEB}/clientes/importar`, { waitUntil: 'domcontentloaded' });
  await pag.waitForSelector('text=Arrastra tu archivo de clientes', { timeout: 20000 });
  return 'el asistente está accesible';
});

await navegador.close();

console.log(`\n${'─'.repeat(60)}`);
console.log(`${c.negrita('Resultado')}: ${c.verde(`${ok} correctas`)}${fallos ? `, ${c.rojo(`${fallos} fallidas`)}` : ''}`);
if (fallos) {
  console.log(`\n${c.rojo(c.negrita('Fallos:'))}`);
  for (const e of errores) console.log(`  · ${e.nombre}\n    ${e.error}`);
}
if (consola.length) {
  console.log(`\n${c.rojo('Errores de consola:')}`);
  for (const p of [...new Set(consola)].slice(0, 6)) console.log(`  · ${p}`);
}
console.log('');
process.exit(fallos || consola.length ? 1 : 0);
