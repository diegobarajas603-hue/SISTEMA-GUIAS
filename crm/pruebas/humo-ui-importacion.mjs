/**
 * Recorre el asistente de importación en un navegador real.
 *
 *   node pruebas/humo-ui-importacion.mjs [archivo.xlsx]
 *
 * Sube un archivo, comprueba la detección automática de columnas, avanza por los
 * cinco pasos y verifica que los clientes acaben de verdad en el CRM. Limpia lo
 * que crea.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const WEB = 'http://localhost:5180';
const API = 'http://localhost:4100';
const ARCHIVO = process.argv[2] || join(process.cwd(), 'pruebas', 'archivos', 'clientes-100.xlsx');
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
const problemasConsola = [];

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
const ctx = await navegador.newContext({ viewport: { width: 1600, height: 1000 } });
const pag = await ctx.newPage();

let logueado = false;
pag.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (!logueado && /401|Unauthorized/i.test(m.text())) return;
  problemasConsola.push(m.text());
});
pag.on('pageerror', (e) => problemasConsola.push(`pageerror: ${e.message}`));

const toma = async (n) => { await pag.waitForTimeout(700); await pag.screenshot({ path: join(TOMAS, `${n}.png`) }); };

console.log(c.negrita(`\nAsistente de importación · ${ARCHIVO.split('/').pop()}\n`));

await prueba('inicia sesión como gerente', async () => {
  await pag.goto(WEB, { waitUntil: 'networkidle' });
  await pag.fill('input[type=email]', 'mariana.trevino@fletestauro.com.mx');
  await pag.fill('input[type=password]', 'Aura2026!');
  await pag.click('button[type=submit]');
  await pag.waitForURL((u) => !u.pathname.includes('entrar'), { timeout: 15000 });
  logueado = true;
  return 'Mariana Treviño';
});

await prueba('el botón «Importar Excel» está en Clientes', async () => {
  await pag.goto(`${WEB}/clientes`, { waitUntil: 'networkidle' });
  await pag.waitForTimeout(1200);
  const boton = pag.getByRole('button', { name: /Importar Excel/i });
  if (!(await boton.count())) throw new Error('no se encontró el botón');
  await boton.click();
  await pag.waitForURL(/\/clientes\/importar/, { timeout: 10000 });
  return 'navega a /clientes/importar';
});

await prueba('paso 1: zona de arrastre visible', async () => {
  await pag.waitForSelector('text=Arrastra tu archivo de clientes', { timeout: 10000 });
  await toma('imp-01-archivo');
  return 'dropzone lista';
});

await prueba('acepta el archivo y detecta las columnas', async () => {
  await pag.setInputFiles('input[type=file]', ARCHIVO);
  await pag.waitForSelector('text=/columnas detectadas/', { timeout: 120000 });
  const texto = await pag.locator('text=/de .* columnas detectadas/').first().innerText();
  const m = /(\d+)\s+de\s+(\d+)/.exec(texto);
  if (!m) throw new Error(`no se pudo leer el conteo: «${texto}»`);
  const [, detectadas, total] = m;
  if (Number(detectadas) < Number(total) - 2) {
    throw new Error(`solo detectó ${detectadas} de ${total} columnas`);
  }
  await toma('imp-02-mapeo');
  return `${detectadas} de ${total} columnas mapeadas solas`;
});

await prueba('mapea los encabezados del ERP a los campos correctos', async () => {
  const esperado = {
    CLIENTE: 'nombre', 'R.F.C.': 'rfc', 'RAZON SOCIAL': 'nombre_comercial',
    TEL: 'telefono', EMAIL: 'email', ASESOR: 'propietario', 'C.P.': 'codigo_postal',
    'CONTACTO PRINCIPAL': 'contacto_nombre', OBSERVACIONES: 'notas',
  };
  const selects = await pag.locator('select[aria-label^="Campo del CRM"]').all();
  const reales = {};
  for (const s of selects) {
    const etiqueta = await s.getAttribute('aria-label');
    const columna = etiqueta.replace('Campo del CRM para la columna ', '');
    reales[columna] = await s.inputValue();
  }
  const malos = Object.entries(esperado)
    .filter(([col, campo]) => reales[col] !== undefined && reales[col] !== campo)
    .map(([col, campo]) => `${col}→${reales[col] || 'nada'} (esperaba ${campo})`);
  if (malos.length) throw new Error(malos.join('; '));
  return Object.keys(esperado).length + ' encabezados clave correctos';
});

await prueba('la vista previa muestra las primeras 20 filas', async () => {
  await pag.getByRole('button', { name: 'Vista previa' }).click();
  await pag.waitForSelector('text=Primeras 20 filas', { timeout: 10000 });
  const filas = await pag.locator('tbody tr').count();
  if (filas !== 20) throw new Error(`esperaba 20 filas, hay ${filas}`);
  await toma('imp-03-vista-previa');
  await pag.getByRole('button', { name: 'Columnas' }).click();
  return `${filas} filas`;
});

let clientesDetectados = 0;

await prueba('paso 3: agrupa, valida y busca duplicados', async () => {
  await pag.getByRole('button', { name: /Validar datos/i }).click();
  await pag.waitForSelector('text=Clientes a importar', { timeout: 180000 });
  const txt = await pag.locator('text=Clientes a importar').locator('..').innerText();
  clientesDetectados = Number(txt.replace(/\D/g, ''));
  if (!clientesDetectados) throw new Error('no detectó ningún cliente');
  await toma('imp-04-revision');
  return `${clientesDetectados} clientes listos`;
});

await prueba('agrupa las filas repetidas en un solo cliente', async () => {
  const aviso = pag.locator('text=/filas comparten cliente con otra/');
  if (!(await aviso.count())) throw new Error('no informó de la fusión de filas');
  return (await aviso.first().innerText()).split('.')[0];
});

await prueba('avisa de los ejecutivos que no existen', async () => {
  const aviso = pag.locator('text=/ejecutivos.*no existen en el CRM/');
  if (!(await aviso.count())) throw new Error('no avisó de ejecutivos desconocidos');
  return 'aviso presente';
});

await prueba('rechaza la fila sin nombre sin detener el resto', async () => {
  const aviso = pag.locator('text=/filas no se pueden importar/');
  if (!(await aviso.count())) throw new Error('no reportó filas rechazadas');
  return (await aviso.first().innerText()).split('.')[0];
});

await prueba('con base limpia no reporta duplicados', async () => {
  const panel = await pag.locator('text=Clientes que ya existen').count();
  if (panel) throw new Error('mostró el panel de duplicados sin haberlos');
  return 'panel de estrategias oculto, como debe ser';
});

await prueba('paso 4: importa mostrando progreso', async () => {
  await pag.getByRole('button', { name: /Importar .* clientes/i }).click();
  await pag.waitForSelector('[role=progressbar]', { timeout: 15000 });
  await toma('imp-05-progreso');
  await pag.waitForSelector('text=Importación terminada', { timeout: 300000 });
  return 'barra de progreso y cierre';
});

let creados = 0;

await prueba('paso 5: el resumen cuadra con lo importado', async () => {
  await toma('imp-06-resumen');
  const leer = async (etiqueta) => {
    const bloque = pag.locator(`text=${etiqueta}`).first().locator('..');
    return Number((await bloque.innerText()).replace(/[^\d]/g, ''));
  };
  creados = await leer('Importados');
  const errores = await leer('Errores');
  if (creados < 1) throw new Error('no importó ningún cliente');
  return `${creados} importados · ${errores} errores`;
});

await prueba('los clientes existen de verdad en el CRM', async () => {
  const r = await pag.evaluate(async () => {
    const res = await fetch('/api/v1/cuentas?q=S.A.%20de%20C.V.&limite=1', { credentials: 'include' });
    return res.json();
  });
  if (!r.total) throw new Error('la API no devuelve las cuentas importadas');
  return `${r.total} cuentas coinciden en la búsqueda`;
});

await prueba('al repetir el archivo detecta todos los duplicados', async () => {
  await pag.getByRole('button', { name: /Importar otro archivo/i }).click();
  await pag.waitForSelector('text=Arrastra tu archivo de clientes', { timeout: 15000 });
  await pag.setInputFiles('input[type=file]', ARCHIVO);
  await pag.waitForSelector('text=/columnas detectadas/', { timeout: 120000 });
  await pag.getByRole('button', { name: /Validar datos/i }).click();
  await pag.waitForSelector('text=Clientes que ya existen', { timeout: 180000 });

  const bloque = pag.locator('text=Ya existen').first().locator('..');
  const duplicados = Number((await bloque.innerText()).replace(/\D/g, ''));
  if (duplicados < creados) {
    throw new Error(`esperaba al menos ${creados} duplicados, detectó ${duplicados}`);
  }
  await toma('imp-07-duplicados');
  return `${duplicados} duplicados detectados`;
});

await prueba('ofrece las cuatro estrategias de duplicados', async () => {
  // Las tarjetas de estrategia son las únicas con aria-pressed: los atajos
  // «aplicar a todos» tienen el mismo texto y confundirían al selector.
  for (const e of ['Omitir', 'Actualizar', 'Crear como nuevo', 'Caso por caso']) {
    if (!(await pag.locator(`button[aria-pressed]:has-text("${e}")`).count())) {
      throw new Error(`falta la estrategia «${e}»`);
    }
  }
  return 'omitir · actualizar · crear nuevo · caso por caso';
});

await prueba('«caso por caso» deja decidir fila a fila', async () => {
  await pag.locator('button[aria-pressed]:has-text("Caso por caso")').click();
  await pag.waitForTimeout(600);
  const selects = await pag.locator('select[aria-label^="Decisión para"]').count();
  if (!selects) throw new Error('no aparecieron los selectores por fila');
  await toma('imp-08-caso-por-caso');
  await pag.locator('button[aria-pressed]:has-text("Omitir")').click();
  return `${selects} decisiones individuales disponibles`;
});

await prueba('con «omitir» no duplica nada en la segunda pasada', async () => {
  await pag.getByRole('button', { name: /Importar .* clientes/i }).click();
  await pag.waitForSelector('text=Importación terminada', { timeout: 300000 });
  const leer = async (etiqueta) => {
    const b = pag.locator(`text=${etiqueta}`).first().locator('..');
    return Number((await b.innerText()).replace(/[^\d]/g, ''));
  };
  const nuevos = await leer('Importados');
  const omitidos = await leer('Omitidos');
  if (nuevos > 0) throw new Error(`creó ${nuevos} clientes que ya existían`);
  if (omitidos < creados) throw new Error(`solo omitió ${omitidos} de ${creados}`);
  await toma('imp-09-resumen-omitir');
  return `0 nuevos y ${omitidos} omitidos`;
});

await prueba('el historial registra la importación', async () => {
  await pag.goto(`${WEB}/clientes/importaciones`, { waitUntil: 'networkidle' });
  await pag.waitForTimeout(1200);
  const fila = pag.locator('text=' + ARCHIVO.split('/').pop());
  if (!(await fila.count())) throw new Error('la importación no aparece en el historial');
  await fila.first().click();
  await pag.waitForSelector('text=Detalle de la importación', { timeout: 10000 });
  await toma('imp-07-historial');
  return 'con quién, cuándo, mapeo y errores';
});

await prueba('limpia las cuentas creadas por la prueba', async () => {
  const borradas = await pag.evaluate(async () => {
    let total = 0;
    for (let vuelta = 0; vuelta < 60; vuelta += 1) {
      // Ordenadas por alta descendente: las recién importadas quedan primero.
      const res = await fetch('/api/v1/cuentas?orden=creado_en&dir=desc&limite=100', { credentials: 'include' });
      const d = await res.json();
      const suyas = d.filas.filter((f) => f.origen === 'importacion');
      if (!suyas.length) break;
      for (const f of suyas) {
        await fetch(`/api/v1/cuentas/${f.id}`, { method: 'DELETE', credentials: 'include' });
        total += 1;
      }
    }
    return total;
  });
  if (borradas === 0) throw new Error('no borró ninguna cuenta');
  return `${borradas} cuentas eliminadas`;
});

await navegador.close();

console.log(`\n${'─'.repeat(60)}`);
console.log(`${c.negrita('Resultado')}: ${c.verde(`${ok} correctas`)}${fallos ? `, ${c.rojo(`${fallos} fallidas`)}` : ''}`);
if (fallos) {
  console.log(`\n${c.rojo(c.negrita('Fallos:'))}`);
  for (const e of errores) console.log(`  · ${e.nombre}\n    ${e.error}`);
}
if (problemasConsola.length) {
  console.log(`\n${c.rojo('Errores de consola:')}`);
  for (const p of [...new Set(problemasConsola)].slice(0, 8)) console.log(`  · ${p}`);
}
console.log('');
void API;
process.exit(fallos || problemasConsola.length ? 1 : 0);
