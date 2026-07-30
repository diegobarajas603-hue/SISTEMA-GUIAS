/**
 * Prueba de humo del importador de clientes.
 *
 *   node pruebas/humo-importacion.mjs [http://localhost:4100]
 *
 * Cubre el ciclo completo contra la API real: catálogo, análisis previo,
 * las cuatro estrategias de duplicados, agrupación de contactos, normalización
 * de datos mexicanos y limpieza de lo que crea.
 */

import { clave } from '@aura/compartido';

const BASE = process.argv[2] || 'http://localhost:4100';
const USUARIO = process.env.CRM_DEMO_USER || 'sistemas1@fletestauro.com.mx';
const PASSWORD = process.env.CRM_DEMO_PASSWORD || 'Aura2026!';

let cookie = '';
let ok = 0;
let fallos = 0;
const errores = [];
const creadas = new Set();

const c = {
  verde: (s) => `\x1b[32m${s}\x1b[0m`,
  rojo: (s) => `\x1b[31m${s}\x1b[0m`,
  gris: (s) => `\x1b[90m${s}\x1b[0m`,
  negrita: (s) => `\x1b[1m${s}\x1b[0m`,
};

async function pedir(metodo, ruta, cuerpo = null, { esperado = 200 } = {}) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const tipo = r.headers.get('content-type') ?? '';
  const datos = tipo.includes('json') ? await r.json() : await r.text();
  if (r.status !== esperado) {
    throw new Error(`esperaba ${esperado}, recibí ${r.status}: ${JSON.stringify(datos).slice(0, 300)}`);
  }
  return datos;
}

async function prueba(nombre, fn) {
  try {
    const res = await fn();
    ok += 1;
    console.log(`${c.verde('✓')} ${nombre}${res ? c.gris(` · ${res}`) : ''}`);
  } catch (e) {
    fallos += 1;
    errores.push({ nombre, error: e.message });
    console.log(`${c.rojo('✗')} ${nombre}\n  ${c.rojo(e.message)}`);
  }
}

const seccion = (t) => console.log(`\n${c.negrita(t)}`);

/** Marca única por corrida para poder limpiar sin tocar datos de la semilla. */
const MARCA = `IMP${Date.now().toString(36).toUpperCase()}`;
const nombreDe = (n) => `Importada ${MARCA} ${n}`;

/** Construye un cliente con la forma que manda el asistente. */
const cliente = (n, extra = {}, contactos = []) => ({
  llave: `k${n}`,
  fila: n,
  campos: { nombre: nombreDe(n), ...extra },
  contactos,
});

// ---------------------------------------------------------------------------

console.log(c.negrita(`\nPrueba de humo · Importación de clientes · ${BASE}\n`));

await prueba('POST /auth/login', async () => {
  const d = await pedir('POST', '/api/v1/auth/login', { email: USUARIO, password: PASSWORD });
  return `${d.usuario.nombre} (${d.usuario.rol})`;
});

seccion('Catálogo');

let ejecutivo = null;

await prueba('GET /importacion/campos', async () => {
  const d = await pedir('GET', '/api/v1/importacion/campos');
  if (!Array.isArray(d.campos) || d.campos.length < 20) throw new Error('catálogo de campos incompleto');
  if (!d.campos.some((x) => x.clave === 'nombre' && x.requerido)) throw new Error('«nombre» debería ser obligatorio');
  if (d.estados.length !== 32) throw new Error(`esperaba 32 estados, hay ${d.estados.length}`);
  if (!d.usuarios.length) throw new Error('sin usuarios para asignar');
  ejecutivo = d.usuarios.find((u) => u.rol === 'ejecutivo') ?? d.usuarios[0];
  return `${d.campos.length} campos · ${d.estados.length} estados · ${d.usuarios.length} usuarios`;
});

seccion('Análisis previo');

await prueba('detecta duplicados contra la base existente', async () => {
  const existente = await pedir('GET', '/api/v1/cuentas?limite=1');
  const yaHay = existente.filas[0];
  const d = await pedir('POST', '/api/v1/importacion/analizar', {
    clientes: [cliente(1), { llave: 'dup', fila: 2, campos: { nombre: yaHay.nombre } }],
  });
  if (d.totalDuplicados !== 1) throw new Error(`esperaba 1 duplicado, detectó ${d.totalDuplicados}`);
  if (d.duplicados[0].llave !== 'dup') throw new Error('marcó como duplicado la fila equivocada');
  return `${d.totalDuplicados} duplicado sobre ${d.total} clientes`;
});

await prueba('avisa de ejecutivos inexistentes', async () => {
  const d = await pedir('POST', '/api/v1/importacion/analizar', {
    clientes: [cliente(2, { propietario: 'Fulano Que No Existe' })],
  });
  if (!d.ejecutivosDesconocidos.length) throw new Error('no avisó del ejecutivo inexistente');
  return d.ejecutivosDesconocidos[0];
});

await prueba('resuelve al ejecutivo por nombre y por correo', async () => {
  const d = await pedir('POST', '/api/v1/importacion/analizar', {
    clientes: [cliente(3, { propietario: ejecutivo.nombre }), cliente(4, { propietario: ejecutivo.email })],
  });
  if (d.ejecutivosDesconocidos.length) throw new Error(`no debió avisar: ${d.ejecutivosDesconocidos[0]}`);
  return `«${ejecutivo.nombre}» y «${ejecutivo.email}» resueltos`;
});

seccion('Importación');

let impId = null;

await prueba('POST /importacion inicia el registro de auditoría', async () => {
  const d = await pedir('POST', '/api/v1/importacion', {
    archivo: `${MARCA}.xlsx`, tamano_bytes: 4096, estrategia: 'omitir',
    total_filas: 6, total_clientes: 5, mapeo: { 0: 'nombre', 1: 'rfc' },
  }, { esperado: 201 });
  impId = d.id;
  if (d.estado !== 'en_proceso') throw new Error(`estado inicial inesperado: ${d.estado}`);
  return `importación #${d.id} en proceso`;
});

await prueba('crea clientes normalizando datos mexicanos', async () => {
  const d = await pedir('POST', `/api/v1/importacion/${impId}/lote`, {
    clientes: [
      cliente(10, {
        rfc: 'vgu-980417-h21', telefono: '+52 81 8123 4567', codigo_postal: 1000,
        estado: 'N.L.', email: 'CONTACTO@Ejemplo.MX', cliente_desde: '17/04/2019',
        propietario: ejecutivo.nombre, calle: 'Av. Constitución', numero: '1500',
        colonia: 'Centro', ciudad: 'Monterrey', tamano: 'PYME', dias_credito: '30',
      }),
    ],
  });
  const r = d.resultados[0];
  if (r.resultado !== 'creado') throw new Error(`esperaba creado, fue ${r.resultado}: ${r.error ?? ''}`);
  creadas.add(r.cuenta_id);

  const cuenta = await pedir('GET', `/api/v1/cuentas/${r.cuenta_id}`);
  const comprobaciones = [
    ['rfc', cuenta.rfc, 'VGU980417H21'],
    ['telefono', cuenta.telefono, '81 8123 4567'],
    ['codigo_postal', cuenta.codigo_postal, '01000'],
    ['estado', cuenta.estado, 'Nuevo León'],
    ['email', cuenta.email, 'contacto@ejemplo.mx'],
    ['tamano', cuenta.tamano, 'pequena'],
    ['colonia', cuenta.colonia, 'Centro'],
    ['numero', cuenta.numero, '1500'],
    ['pais', cuenta.pais, 'México'],
    ['tipo', cuenta.tipo, 'cliente'],
    ['dias_credito', cuenta.dias_credito, 30],
    ['propietario_id', cuenta.propietario_id, ejecutivo.id],
  ];
  for (const [campo, real, esperado] of comprobaciones) {
    if (real !== esperado) throw new Error(`${campo}: esperaba «${esperado}», llegó «${real}»`);
  }
  if (!String(cuenta.cliente_desde).startsWith('2019-04-17')) {
    throw new Error(`cliente_desde: llegó «${cuenta.cliente_desde}»`);
  }
  return 'RFC, teléfono, CP con ceros, estado, tamaño y fecha dd/mm normalizados';
});

await prueba('un cliente con varios contactos no se duplica', async () => {
  const d = await pedir('POST', `/api/v1/importacion/${impId}/lote`, {
    clientes: [{
      llave: 'multi', fila: 20, campos: { nombre: nombreDe('MultiContacto'), rfc: 'MCO010101AB1' },
      contactos: [
        { contacto_nombre: 'Ana Ruiz', contacto_puesto: 'Compras', contacto_email: 'ana@x.mx' },
        { contacto_nombre: 'Luis Paz', contacto_puesto: 'Logística', contacto_telefono: '8112345678' },
        { contacto_nombre: 'Ana Ruiz', contacto_email: 'ana@x.mx' },
      ],
    }],
  });
  const r = d.resultados[0];
  if (r.resultado !== 'creado') throw new Error(`esperaba creado, fue ${r.resultado}`);
  creadas.add(r.cuenta_id);
  if (d.conteo.contactos !== 2) throw new Error(`esperaba 2 contactos únicos, creó ${d.conteo.contactos}`);

  const ficha = await pedir('GET', `/api/v1/cuentas/${r.cuenta_id}`);
  if (ficha.contactos.length !== 2) throw new Error(`la cuenta quedó con ${ficha.contactos.length} contactos`);
  if (!ficha.contactos.some((x) => x.es_principal)) throw new Error('ninguno quedó como principal');
  return '3 filas de contacto → 1 cuenta con 2 contactos, uno principal';
});

await prueba('estrategia «omitir» respeta el cliente existente', async () => {
  const d = await pedir('POST', `/api/v1/importacion/${impId}/lote`, {
    estrategia: 'omitir',
    clientes: [cliente(10, { rfc: 'VGU980417H21', ciudad: 'Guadalajara' })],
  });
  if (d.resultados[0].resultado !== 'omitido') throw new Error(`fue ${d.resultados[0].resultado}`);
  const cuenta = await pedir('GET', `/api/v1/cuentas/${d.resultados[0].cuenta_id}`);
  if (cuenta.ciudad !== 'Monterrey') throw new Error(`la ciudad cambió a «${cuenta.ciudad}»`);
  return 'no tocó el registro existente';
});

await prueba('estrategia «actualizar» fusiona sin borrar lo que no viene', async () => {
  const d = await pedir('POST', `/api/v1/importacion/${impId}/lote`, {
    estrategia: 'actualizar',
    clientes: [{ llave: 'upd', fila: 30, campos: { nombre: nombreDe(10), rfc: 'VGU980417H21', ciudad: 'Saltillo' } }],
  });
  if (d.resultados[0].resultado !== 'actualizado') throw new Error(`fue ${d.resultados[0].resultado}`);
  const cuenta = await pedir('GET', `/api/v1/cuentas/${d.resultados[0].cuenta_id}`);
  if (cuenta.ciudad !== 'Saltillo') throw new Error('no aplicó la ciudad nueva');
  if (cuenta.colonia !== 'Centro') throw new Error('borró la colonia que no venía en el archivo');
  if (cuenta.telefono !== '81 8123 4567') throw new Error('borró el teléfono que no venía en el archivo');
  return 'actualizó ciudad y conservó colonia y teléfono';
});

await prueba('estrategia «crear_nuevo» genera un registro aparte', async () => {
  const d = await pedir('POST', `/api/v1/importacion/${impId}/lote`, {
    estrategia: 'crear_nuevo',
    clientes: [{ llave: 'new', fila: 40, campos: { nombre: nombreDe(10), rfc: 'VGU980417H21' } }],
  });
  const r = d.resultados[0];
  if (r.resultado !== 'creado') throw new Error(`fue ${r.resultado}`);
  creadas.add(r.cuenta_id);
  return `creó la cuenta #${r.cuenta_id} pese al RFC repetido`;
});

await prueba('«caso_por_caso» respeta la decisión de cada fila', async () => {
  const d = await pedir('POST', `/api/v1/importacion/${impId}/lote`, {
    estrategia: 'caso_por_caso',
    clientes: [
      { llave: 'cpc1', fila: 50, campos: { nombre: nombreDe(10), rfc: 'VGU980417H21' }, decision: 'omitir' },
      { llave: 'cpc2', fila: 51, campos: { nombre: nombreDe(10), rfc: 'VGU980417H21', origen: 'feria' }, decision: 'actualizar' },
    ],
  });
  const [a, b] = d.resultados;
  if (a.resultado !== 'omitido') throw new Error(`la primera fue ${a.resultado}`);
  if (b.resultado !== 'actualizado') throw new Error(`la segunda fue ${b.resultado}`);
  return 'una omitida y otra actualizada en el mismo lote';
});

await prueba('una fila inválida no detiene a las demás', async () => {
  const d = await pedir('POST', `/api/v1/importacion/${impId}/lote`, {
    estrategia: 'crear_nuevo',
    clientes: [
      { llave: 'malo', fila: 60, campos: { nombre: '   ' } },
      cliente(70),
      { llave: 'malo2', fila: 62, campos: { rfc: 'ABC010101XYZ' } },
      cliente(71),
    ],
  });
  if (d.conteo.fallidos !== 2) throw new Error(`esperaba 2 fallidas, hubo ${d.conteo.fallidos}`);
  if (d.conteo.creados !== 2) throw new Error(`esperaba 2 creadas, hubo ${d.conteo.creados}`);
  for (const r of d.resultados) if (r.cuenta_id) creadas.add(r.cuenta_id);
  const conError = d.resultados.filter((r) => r.resultado === 'error');
  if (!conError.every((r) => r.error && r.fila)) throw new Error('los errores no traen fila y motivo');
  return '2 rechazadas con motivo, 2 importadas';
});

await prueba('los avisos de normalización llegan por fila', async () => {
  const d = await pedir('POST', `/api/v1/importacion/${impId}/lote`, {
    estrategia: 'crear_nuevo',
    clientes: [cliente(80, { email: 'no-es-correo', telefono: '123', estado: 'Narnia' })],
  });
  const r = d.resultados[0];
  creadas.add(r.cuenta_id);
  if (!r.avisos || r.avisos.length < 3) throw new Error(`esperaba 3 avisos, llegaron ${r.avisos?.length ?? 0}`);
  const cuenta = await pedir('GET', `/api/v1/cuentas/${r.cuenta_id}`);
  if (cuenta.email !== null) throw new Error('guardó un correo inválido');
  return `${r.avisos.length} avisos y el correo inválido se descartó`;
});

seccion('Cierre y auditoría');

await prueba('POST /importacion/:id/finalizar cierra el registro', async () => {
  const d = await pedir('POST', `/api/v1/importacion/${impId}/finalizar`, { estado: 'completada' });
  if (d.estado !== 'completada') throw new Error(`estado ${d.estado}`);
  if (!d.terminado_en) throw new Error('sin fecha de término');
  if (d.creados < 1) throw new Error('el contador de creados quedó en cero');
  return `${d.creados} creados · ${d.actualizados} actualizados · ${d.omitidos} omitidos · ${d.fallidos} con error · ${d.duracion_ms} ms`;
});

await prueba('el historial guarda los errores para auditoría', async () => {
  const d = await pedir('GET', `/api/v1/importacion/${impId}`);
  if (!Array.isArray(d.errores) || d.errores.length < 2) throw new Error('no guardó los errores');
  if (!d.errores[0].error) throw new Error('los errores guardados no traen motivo');
  return `${d.errores.length} errores guardados con fila y motivo`;
});

await prueba('GET /importacion lista el historial', async () => {
  const d = await pedir('GET', '/api/v1/importacion?limite=5');
  const mia = d.find((x) => x.id === impId);
  if (!mia) throw new Error('la importación no aparece en el historial');
  if (!mia.usuario_nombre) throw new Error('no registra quién importó');
  return `${d.length} importaciones · la mía por ${mia.usuario_nombre}`;
});

seccion('Límites y permisos');

await prueba('rechaza lotes por encima del máximo', () =>
  pedir('POST', `/api/v1/importacion/${impId}/lote`,
    { clientes: Array.from({ length: 501 }, (_, i) => cliente(i)) },
    { esperado: 400 }).then(() => 'tope de 500 clientes por lote aplicado'));

await prueba('un ejecutivo no puede importar', async () => {
  const previa = cookie;
  await pedir('POST', '/api/v1/auth/login', { email: ejecutivo.email, password: PASSWORD });
  await pedir('GET', '/api/v1/importacion/campos', null, { esperado: 403 });
  cookie = previa;
  return 'restringido a gerencia';
});

seccion('Limpieza');

await prueba('elimina las cuentas creadas por la prueba', async () => {
  const restantes = await pedir('GET', `/api/v1/cuentas?q=${encodeURIComponent(MARCA)}&limite=100`);
  for (const f of restantes.filas) creadas.add(f.id);
  for (const id of creadas) await pedir('DELETE', `/api/v1/cuentas/${id}`);
  const quedan = await pedir('GET', `/api/v1/cuentas?q=${encodeURIComponent(MARCA)}&limite=100`);
  if (quedan.total !== 0) throw new Error(`quedaron ${quedan.total} cuentas sin borrar`);
  return `${creadas.size} cuentas eliminadas`;
});

// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(64)}`);
console.log(`${c.negrita('Resultado')}: ${c.verde(`${ok} correctas`)}${fallos ? `, ${c.rojo(`${fallos} fallidas`)}` : ''}`);
if (fallos) {
  console.log(`\n${c.rojo(c.negrita('Fallos:'))}`);
  for (const e of errores) console.log(`  · ${e.nombre}\n    ${e.error}`);
}
console.log('');
void clave;
process.exit(fallos ? 1 : 0);
