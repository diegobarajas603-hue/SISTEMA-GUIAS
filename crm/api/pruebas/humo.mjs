/**
 * Prueba de humo del contrato de la API.
 *
 * No sustituye pruebas unitarias: verifica que **todos** los endpoints responden con
 * el código correcto y con la forma esperada, incluidas las escrituras y sus efectos
 * secundarios (que es donde de verdad se rompen las cosas).
 *
 *   node pruebas/humo.mjs [http://localhost:4100]
 */

const BASE = process.argv[2] || 'http://localhost:4100';
const USUARIO = process.env.CRM_DEMO_USER || 'sistemas1@fletestauro.com.mx';
const PASSWORD = process.env.CRM_DEMO_PASSWORD || 'Aura2026!';

let cookie = '';
let ok = 0;
let fallos = 0;
const errores = [];

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
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];

  const tipo = r.headers.get('content-type') ?? '';
  const datos = tipo.includes('json') ? await r.json() : await r.text();

  if (r.status !== esperado) {
    throw new Error(`esperaba ${esperado}, recibí ${r.status}: ${JSON.stringify(datos).slice(0, 240)}`);
  }
  return datos;
}

async function prueba(nombre, fn) {
  try {
    const resultado = await fn();
    ok += 1;
    console.log(`${c.verde('✓')} ${nombre}${resultado ? c.gris(` · ${resultado}`) : ''}`);
  } catch (error) {
    fallos += 1;
    errores.push({ nombre, error: error.message });
    console.log(`${c.rojo('✗')} ${nombre}\n  ${c.rojo(error.message)}`);
  }
}

const seccion = (t) => console.log(`\n${c.negrita(t)}`);

// ---------------------------------------------------------------------------

console.log(c.negrita(`\nPrueba de humo · Aura CRM API · ${BASE}\n`));

seccion('Salud y autenticación');

await prueba('GET /health', async () => {
  const d = await pedir('GET', '/health');
  if (d.estado !== 'ok') throw new Error('estado != ok');
  return `IA generativa: ${d.ia}`;
});

await prueba('GET /api/v1/dashboard sin sesión → 401', () =>
  pedir('GET', '/api/v1/dashboard', null, { esperado: 401 }).then(() => 'rechazado correctamente'));

await prueba('POST /auth/login credenciales malas → 401', () =>
  pedir('POST', '/api/v1/auth/login', { email: USUARIO, password: 'incorrecta' }, { esperado: 401 })
    .then(() => 'rechazado correctamente'));

await prueba('POST /auth/login', async () => {
  const d = await pedir('POST', '/api/v1/auth/login', { email: USUARIO, password: PASSWORD });
  if (!d.usuario?.id) throw new Error('sin usuario en la respuesta');
  if (!cookie) throw new Error('no se recibió cookie de sesión');
  return `${d.usuario.nombre} (${d.usuario.rol})`;
});

await prueba('GET /auth/yo', async () => {
  const d = await pedir('GET', '/api/v1/auth/yo');
  return d.usuario.email;
});

await prueba('GET /auth/usuarios', async () => `${(await pedir('GET', '/api/v1/auth/usuarios')).length} usuarios`);
await prueba('GET /auth/equipos', async () => `${(await pedir('GET', '/api/v1/auth/equipos')).length} equipos`);

seccion('Dashboard');

await prueba('GET /dashboard', async () => {
  const d = await pedir('GET', '/api/v1/dashboard');
  const req = ['ventasMes', 'serie', 'embudo', 'actividadesHoy', 'objetivos', 'ranking',
    'pronostico', 'insights', 'contadores'];
  for (const k of req) if (d[k] === undefined) throw new Error(`falta la clave «${k}»`);
  if (d.embudo.length !== 6) throw new Error(`el embudo debe tener 6 etapas, tiene ${d.embudo.length}`);
  // Verificación real de coherencia: la conversión no puede pasar del 100 %.
  for (const e of d.embudo) {
    if (e.porcentajePaso > 100) throw new Error(`conversión imposible en ${e.titulo}: ${e.porcentajePaso}%`);
  }
  // Y el embudo debe ser monótono decreciente.
  for (let i = 1; i < d.embudo.length; i += 1) {
    if (d.embudo[i].alcanzaron > d.embudo[i - 1].alcanzaron) {
      throw new Error(`embudo no monótono: ${d.embudo[i].titulo} > ${d.embudo[i - 1].titulo}`);
    }
  }
  return `${d.embudo[0].alcanzaron} → ${d.embudo[5].alcanzaron} · pronóstico ${d.pronostico.probabilidadMeta}%`;
});

await prueba('GET /dashboard?alcance=mio', async () => {
  const d = await pedir('GET', '/api/v1/dashboard?alcance=mio');
  return d.alcance;
});

await prueba('GET /dashboard/notificaciones', async () =>
  `${(await pedir('GET', '/api/v1/dashboard/notificaciones')).length} notificaciones`);

seccion('Prospectos');

let leadCreado = null;

await prueba('GET /leads', async () => {
  const d = await pedir('GET', '/api/v1/leads?limite=20');
  if (!Array.isArray(d.filas)) throw new Error('filas no es arreglo');
  return `${d.total} en total`;
});

await prueba('GET /leads con filtros', async () => {
  const d = await pedir('GET', '/api/v1/leads?etapa=lead&score_min=50&orden=score&dir=desc');
  if (d.filas.some((l) => l.etapa !== 'lead')) throw new Error('el filtro de etapa no se respetó');
  if (d.filas.some((l) => l.score < 50)) throw new Error('el filtro de score no se respetó');
  return `${d.filas.length} resultados`;
});

await prueba('GET /leads/resumen', async () => {
  const d = await pedir('GET', '/api/v1/leads/resumen');
  return d.map((e) => `${e.etapa}:${e.total}`).join(' ');
});

await prueba('GET /leads/facetas', async () => {
  const d = await pedir('GET', '/api/v1/leads/facetas');
  return `${d.origenes.length} orígenes, ${d.industrias.length} industrias`;
});

await prueba('GET /leads/:id con score explicado', async () => {
  const lista = await pedir('GET', '/api/v1/leads?limite=1&orden=score&dir=desc');
  const d = await pedir('GET', `/api/v1/leads/${lista.filas[0].id}`);
  if (!Array.isArray(d.score_motivos)) throw new Error('score_motivos no es arreglo');
  if (d.score > 0 && d.score_motivos.length === 0) throw new Error('score sin explicación');
  return `score ${d.score} con ${d.score_motivos.length} motivos`;
});

await prueba('POST /leads con clasificación automática de IA', async () => {
  const d = await pedir('POST', '/api/v1/leads', {
    nombre: 'Prueba Humo Automatizada',
    empresa: 'Industrias de Prueba S.A. de C.V.',
    email: `humo.${Date.now()}@pruebas.mx`,
    telefono: '81 1234 5678',
    industria: 'Manufactura',
    tamano_empresa: 'grande',
    ciudad: 'Monterrey',
    estado: 'Nuevo León',
    origen: 'sitio_web',
    mensaje: 'Necesitamos cotizar urgente traslados semanales de tarimas de Monterrey a CDMX.',
  }, { esperado: 201 });
  leadCreado = d.id;
  // Comprobaciones del procesamiento automático que promete el producto.
  if (!d.score) throw new Error('no se calculó el score');
  if (d.intencion !== 'compra') throw new Error(`la intención debía ser «compra», fue «${d.intencion}»`);
  if (d.urgencia !== 'inmediata') throw new Error(`la urgencia debía ser «inmediata», fue «${d.urgencia}»`);
  if (!d.propietario_id) throw new Error('no se asignó ejecutivo');
  return `score ${d.score} · ${d.temperatura} · intención ${d.intencion} · urgencia ${d.urgencia}`;
});

await prueba('el alta creó actividad de primer contacto', async () => {
  const d = await pedir('GET', `/api/v1/actividades?lead=${leadCreado}`);
  const ia = d.filas.filter((a) => a.origen === 'ia');
  if (!ia.length) throw new Error('no se generó la actividad automática');
  return `${ia.length} actividad(es) con origen «ia»`;
});

await prueba('POST /leads duplicado → 409', () => {
  // Correo único por corrida: con uno fijo, la segunda ejecución de la suite
  // choca contra el lead que dejó la primera y el 201 inicial se vuelve 409.
  const email = `duplicado.${Date.now().toString(36)}@pruebas.mx`;
  return pedir('POST', '/api/v1/leads', { nombre: 'X', email }, { esperado: 201 })
    .then(() => pedir('POST', '/api/v1/leads', { nombre: 'Y', email }, { esperado: 409 }))
    .then(() => 'deduplicación correcta');
});

await prueba('POST /leads/:id/senales recalcula el score', async () => {
  const antes = await pedir('GET', `/api/v1/leads/${leadCreado}`);
  const d = await pedir('POST', `/api/v1/leads/${leadCreado}/senales`,
    { tipo: 'visita_precios', detalle: 'Página de tarifas' }, { esperado: 201 });
  if (d.score <= antes.score) throw new Error(`el score no subió: ${antes.score} → ${d.score}`);
  return `${antes.score} → ${d.score}`;
});

await prueba('PUT /leads/:id/etapa', async () => {
  const d = await pedir('PUT', `/api/v1/leads/${leadCreado}/etapa`, { etapa: 'contacto' });
  if (d.etapa !== 'contacto') throw new Error('la etapa no cambió');
  if (d.etapa_max !== 'contacto') throw new Error('etapa_max no avanzó');
  return `${d.etapa} · máx ${d.etapa_max}`;
});

await prueba('PUT /leads/:id/etapa inválida → 400', () =>
  pedir('PUT', `/api/v1/leads/${leadCreado}/etapa`, { etapa: 'inventada' }, { esperado: 400 })
    .then(() => 'validado'));

await prueba('POST /leads/:id/convertir crea cuenta + contacto + oportunidad', async () => {
  await pedir('PUT', `/api/v1/leads/${leadCreado}/etapa`, { etapa: 'calificado' });
  const d = await pedir('POST', `/api/v1/leads/${leadCreado}/convertir`,
    { monto: 250_000_00, siguiente_paso: 'Reunión de descubrimiento' }, { esperado: 201 });
  if (!d.cuenta?.id || !d.contacto?.id || !d.oportunidad?.id) throw new Error('faltó crear alguna entidad');
  if (d.lead.oportunidad_id !== d.oportunidad.id) throw new Error('el lead no quedó ligado');
  return `cuenta ${d.cuenta.id}, contacto ${d.contacto.id}, oportunidad ${d.oportunidad.id}`;
});

await prueba('POST /leads/:id/convertir dos veces → 409', () =>
  pedir('POST', `/api/v1/leads/${leadCreado}/convertir`, {}, { esperado: 409 })
    .then(() => 'protegido'));

seccion('Clientes');

let cuentaId = null;

await prueba('GET /cuentas', async () => {
  const d = await pedir('GET', '/api/v1/cuentas?limite=10');
  cuentaId = d.filas[0].id;
  return `${d.total} cuentas`;
});

await prueba('GET /cuentas ordenado por riesgo', async () => {
  const d = await pedir('GET', '/api/v1/cuentas?tipo=cliente&orden=riesgo_churn&dir=desc&limite=5');
  return `mayor riesgo: ${d.filas[0].riesgo_churn}/100`;
});

await prueba('GET /cuentas/:id ficha 360 completa', async () => {
  const d = await pedir('GET', `/api/v1/cuentas/${cuentaId}`);
  const req = ['contactos', 'oportunidades', 'cotizaciones', 'facturas', 'contratos', 'tickets',
    'actividades', 'notas', 'archivos', 'cronologia', 'insights', 'facturacion', 'productos', 'mapaPoder'];
  for (const k of req) if (d[k] === undefined) throw new Error(`falta «${k}» en la ficha 360`);
  if (!Array.isArray(d.facturacion.serie) || d.facturacion.serie.length !== 12) {
    throw new Error('la serie de facturación debe traer 12 meses');
  }
  return `${d.contactos.length} contactos, ${d.cronologia.length} eventos de cronología`;
});

await prueba('GET /cuentas/:id/ia', async () => {
  const d = await pedir('GET', `/api/v1/cuentas/${cuentaId}/ia`);
  if (d.churn?.riesgo === undefined) throw new Error('sin cálculo de churn');
  if (!Array.isArray(d.churn.motivos)) throw new Error('churn sin motivos');
  return `riesgo ${d.churn.riesgo} (${d.churn.nivel}), ${d.ventaCruzada.length} sugerencia(s)`;
});

await prueba('POST /cuentas + contacto + nota', async () => {
  const cuenta = await pedir('POST', '/api/v1/cuentas', {
    nombre: `Cuenta de Prueba ${Date.now()} S.A. de C.V.`,
    industria: 'Manufactura', tamano: 'mediana', ciudad: 'Apodaca', estado: 'Nuevo León',
  }, { esperado: 201 });
  const contacto = await pedir('POST', `/api/v1/cuentas/${cuenta.id}/contactos`, {
    nombre: 'Contacto de Prueba', puesto: 'Gerente de Logística',
    email: 'contacto.prueba@pruebas.mx', es_principal: true, rol_compra: 'decisor',
  }, { esperado: 201 });
  await pedir('POST', '/api/v1/cuentas/notas', {
    cuerpo: 'Nota creada por la prueba de humo.', cuenta_id: cuenta.id,
  }, { esperado: 201 });
  return `cuenta ${cuenta.id}, contacto ${contacto.id}`;
});

await prueba('GET /cuentas/facetas', async () => {
  const d = await pedir('GET', '/api/v1/cuentas/facetas');
  return `${d.industrias.length} industrias`;
});

seccion('Oportunidades');

let opId = null;

await prueba('GET /oportunidades', async () => {
  const d = await pedir('GET', '/api/v1/oportunidades?limite=20');
  opId = d.filas[0].id;
  return `${d.total} abiertas`;
});

await prueba('GET /oportunidades/resumen por etapa', async () => {
  const d = await pedir('GET', '/api/v1/oportunidades/resumen');
  return d.map((e) => `${e.etapa}:${e.total}`).join(' ');
});

await prueba('GET /oportunidades/pronostico', async () => {
  const d = await pedir('GET', '/api/v1/oportunidades/pronostico');
  if (d.proyeccion === undefined) throw new Error('sin proyección');
  if (d.rango.bajo > d.rango.alto) throw new Error('rango invertido');
  if (d.rango.bajo > d.proyeccion || d.proyeccion > d.rango.alto) {
    throw new Error('la proyección cae fuera de su propio rango');
  }
  return `proyección ${Math.round(d.proyeccion / 100)} MXN, ${d.probabilidadMeta}% de alcanzar la meta`;
});

await prueba('GET /oportunidades/estancadas', async () =>
  `${(await pedir('GET', '/api/v1/oportunidades/estancadas?dias=14')).length} estancadas`);

await prueba('GET /oportunidades/:id con análisis de IA', async () => {
  const d = await pedir('GET', `/api/v1/oportunidades/${opId}`);
  if (!d.analisis) throw new Error('sin análisis');
  if (d.analisis.probabilidad < 0 || d.analisis.probabilidad > 100) throw new Error('probabilidad fuera de rango');
  if (!Array.isArray(d.analisis.factores)) throw new Error('sin factores explicativos');
  return `IA ${d.analisis.probabilidad}% vs vendedor ${d.probabilidad}% · ${d.analisis.riesgos.length} riesgos`;
});

await prueba('PUT /oportunidades/:id/etapa registra historial', async () => {
  const antes = await pedir('GET', `/api/v1/oportunidades/${opId}`);
  const nueva = antes.etapa === 'negociacion' ? 'propuesta' : 'negociacion';
  await pedir('PUT', `/api/v1/oportunidades/${opId}/etapa`, { etapa: nueva });
  const despues = await pedir('GET', `/api/v1/oportunidades/${opId}`);
  if (despues.etapa !== nueva) throw new Error('la etapa no cambió');
  if (despues.historial.length <= antes.historial.length) throw new Error('no se registró el historial');
  return `${antes.etapa} → ${nueva}, ${despues.historial.length} eventos de historial`;
});

await prueba('PUT /oportunidades/:id/etapa perdido sin motivo → 400', () =>
  pedir('PUT', `/api/v1/oportunidades/${opId}/etapa`, { etapa: 'perdido' }, { esperado: 400 })
    .then(() => 'exige motivo de pérdida'));

await prueba('GET /oportunidades/motivos-perdida', async () =>
  `${(await pedir('GET', '/api/v1/oportunidades/motivos-perdida')).length} motivos`);

seccion('Cotizaciones');

let cotId = null;

await prueba('GET /cotizaciones', async () => {
  const d = await pedir('GET', '/api/v1/cotizaciones?limite=10');
  return `${d.total} cotizaciones`;
});

await prueba('POST /cotizaciones/calcular · cubicaje y peso cobrable', async () => {
  const d = await pedir('POST', '/api/v1/cotizaciones/calcular', {
    tipo_mercancia: 'general',
    items: [
      // 2 × 1.2 × 1.0 × 1.5 × 500 = 1 800 kg volumétrico contra 800 real
      { cantidad: 2, peso_real: 800, largo: 1.2, ancho: 1.0, alto: 1.5, estibable: true },
      // No estibable: se cubica a 1.80 m aunque mida 0.5 → 1 080 kg contra 380 real
      { cantidad: 1, peso_real: 380, largo: 1.2, ancho: 1.0, alto: 0.5, estibable: false },
    ],
  });
  if (d.peso_real_total !== 1180) throw new Error(`peso real ${d.peso_real_total}, esperaba 1180`);
  if (d.peso_volumetrico_total !== 2880) throw new Error(`volumétrico ${d.peso_volumetrico_total}, esperaba 2880`);
  if (d.peso_cobrable_total !== 2880) throw new Error(`cobrable ${d.peso_cobrable_total}, esperaba 2880`);
  // 2 880 kg × $1.60 = $4 608.00
  if (d.subtotal !== 460_800) throw new Error(`importe ${d.subtotal}, esperaba 460800`);
  if (d.impuestos !== 73_728) throw new Error(`IVA ${d.impuestos}, esperaba 73728`);
  return `cobrable ${d.peso_cobrable_total} kg · $${(d.subtotal / 100).toLocaleString('es-MX')} + IVA`;
});

await prueba('la tarifa de químico es mayor que la de carga general', async () => {
  const items = [{ cantidad: 1, peso_real: 100, largo: 1.2, ancho: 1.0, alto: 1.0, estibable: true }];
  const g = await pedir('POST', '/api/v1/cotizaciones/calcular', { items, tipo_mercancia: 'general' });
  const q = await pedir('POST', '/api/v1/cotizaciones/calcular', { items, tipo_mercancia: 'quimico' });
  if (g.tarifa_centavos_kg !== 160 || q.tarifa_centavos_kg !== 180) {
    throw new Error(`tarifas ${g.tarifa_centavos_kg} y ${q.tarifa_centavos_kg}`);
  }
  if (q.subtotal <= g.subtotal) throw new Error('el químico no salió más caro');
  return `$${(g.subtotal / 100)} vs $${(q.subtotal / 100)}`;
});

await prueba('POST /cotizaciones', async () => {
  const d = await pedir('POST', '/api/v1/cotizaciones', {
    cuenta_id: cuentaId,
    origen: 'Monterrey, N.L.',
    destino: 'Ciudad de México, CDMX',
    descripcion_envio: 'Tarimas de refacciones metálicas',
    items: [
      { descripcion: 'Tarima estándar', cantidad: 4, peso_real: 1600, largo: 1.2, ancho: 1.0, alto: 1.4, estibable: true },
      { descripcion: 'Bulto sobredimensionado', cantidad: 1, peso_real: 500, largo: 2.0, ancho: 1.2, alto: 0.6, estibable: false },
    ],
  }, { esperado: 201 });
  cotId = d.id;
  if (!d.folio?.startsWith('COT-')) throw new Error(`folio con formato raro: ${d.folio}`);
  return `${d.folio} por ${d.total} centavos`;
});

await prueba('PUT /cotizaciones/:id/estado respeta la máquina de estados', async () => {
  // borrador → aceptada debe rechazarse
  await pedir('PUT', `/api/v1/cotizaciones/${cotId}/estado`, { estado: 'aceptada' }, { esperado: 400 });
  await pedir('PUT', `/api/v1/cotizaciones/${cotId}/estado`, { estado: 'enviada' });
  const d = await pedir('PUT', `/api/v1/cotizaciones/${cotId}/estado`, { estado: 'vista' });
  return `transición controlada, estado final «${d.estado}»`;
});

await prueba('GET /cotizaciones/embudo', async () => {
  const d = await pedir('GET', '/api/v1/cotizaciones/embudo');
  return `${d.enviadas} enviadas → ${d.vistas} vistas → ${d.aceptadas} aceptadas`;
});

seccion('Actividades y agenda');

let actId = null;

await prueba('GET /actividades', async () => `${(await pedir('GET', '/api/v1/actividades?limite=20')).total} actividades`);
await prueba('GET /actividades/hoy', async () => {
  const d = await pedir('GET', '/api/v1/actividades/hoy');
  return `${d.total} hoy, ${d.completadas} completadas`;
});

await prueba('GET /actividades/agenda', async () => {
  const d = await pedir('GET', '/api/v1/actividades/agenda');
  if (!Array.isArray(d.eventos) || !Array.isArray(d.porDia)) throw new Error('forma inesperada');
  return `${d.eventos.length} eventos en ${d.porDia.length} días`;
});

await prueba('POST /actividades', async () => {
  const d = await pedir('POST', '/api/v1/actividades', {
    tipo: 'llamada', asunto: 'Llamada de prueba de humo', cuenta_id: cuentaId,
    prioridad: 2, vence_en: new Date(Date.now() + 86_400_000).toISOString(),
  }, { esperado: 201 });
  actId = d.id;
  return `actividad ${d.id}`;
});

await prueba('PUT /actividades/:id/completar actualiza la cuenta', async () => {
  const d = await pedir('PUT', `/api/v1/actividades/${actId}/completar`,
    { resultado: 'Contacto establecido', duracion_min: 15 });
  if (d.estado !== 'completada') throw new Error('no se marcó completada');
  const cuenta = await pedir('GET', `/api/v1/cuentas/${cuentaId}`);
  const hoy = new Date().toISOString().slice(0, 10);
  if (!String(cuenta.ultima_actividad_en).startsWith(hoy)) {
    throw new Error('no se refrescó ultima_actividad_en de la cuenta');
  }
  return 'completada y cuenta actualizada';
});

await prueba('DELETE /actividades/:id', async () => {
  await pedir('DELETE', `/api/v1/actividades/${actId}`);
  await pedir('GET', `/api/v1/actividades/${actId}`, null, { esperado: 404 });
  return 'eliminada';
});

seccion('Soporte');

let tkId = null;

await prueba('GET /tickets', async () => `${(await pedir('GET', '/api/v1/tickets?limite=20')).total} tickets`);

await prueba('GET /tickets/metricas', async () => {
  const d = await pedir('GET', '/api/v1/tickets/metricas');
  if (d.abiertos === undefined) throw new Error('sin métrica de abiertos');
  return `${d.abiertos} abiertos, SLA ${d.cumplimiento_sla}%, CSAT ${d.csat}`;
});

await prueba('GET /tickets/conocimiento', async () =>
  `${(await pedir('GET', '/api/v1/tickets/conocimiento')).length} artículos`);

await prueba('GET /tickets/conocimiento con búsqueda', async () =>
  `${(await pedir('GET', '/api/v1/tickets/conocimiento?q=rastreo')).length} resultados`);

await prueba('POST /tickets calcula SLA por prioridad', async () => {
  const d = await pedir('POST', '/api/v1/tickets', {
    asunto: 'Ticket de prueba de humo', descripcion: '¿Dónde va mi guía AN123456?',
    cuenta_id: cuentaId, canal: 'whatsapp', categoria: 'Estatus de embarque', prioridad: 'urgente',
  }, { esperado: 201 });
  tkId = d.id;
  if (d.sla_horas !== 4) throw new Error(`SLA urgente debe ser 4 h, es ${d.sla_horas}`);
  if (!d.asignado_id) throw new Error('no se asignó agente');
  return `${d.folio} · SLA ${d.sla_horas} h`;
});

await prueba('POST /tickets/:id/sugerir usa la base de conocimiento', async () => {
  const d = await pedir('POST', `/api/v1/tickets/${tkId}/sugerir`);
  if (!d.disponible) return `sin artículo aplicable: ${d.motivo?.slice(0, 60)}`;
  if (!d.fuente?.titulo) throw new Error('sugerencia sin fuente citada');
  return `borrador desde «${d.fuente.titulo}»`;
});

await prueba('POST /tickets/:id/mensajes sella primera respuesta', async () => {
  await pedir('POST', `/api/v1/tickets/${tkId}/mensajes`,
    { cuerpo: 'Respuesta de prueba de humo.' }, { esperado: 201 });
  const d = await pedir('GET', `/api/v1/tickets/${tkId}`);
  if (!d.primera_respuesta_en) throw new Error('no se selló primera_respuesta_en');
  if (d.estado !== 'abierto') throw new Error(`el estado debía pasar a abierto, es ${d.estado}`);
  return `estado ${d.estado}, ${d.mensajes.length} mensajes`;
});

await prueba('PUT /tickets/:id/estado resuelto con CSAT', async () => {
  const d = await pedir('PUT', `/api/v1/tickets/${tkId}/estado`, { estado: 'resuelto', csat: 5 });
  if (!d.resuelto_en) throw new Error('sin fecha de resolución');
  return `resuelto, CSAT ${d.csat}`;
});

seccion('Marketing');

await prueba('GET /marketing panorama', async () => {
  const d = await pedir('GET', '/api/v1/marketing');
  for (const k of ['resumen', 'porTipo', 'porOrigen', 'serieLeads', 'mejoresCampanas']) {
    if (d[k] === undefined) throw new Error(`falta «${k}»`);
  }
  return `${d.porTipo.length} tipos de campaña, ${d.porOrigen.length} orígenes`;
});

await prueba('GET /marketing/campanas con ROI calculado', async () => {
  const d = await pedir('GET', '/api/v1/marketing/campanas');
  const conRoi = d.filter((c) => c.roi !== null);
  return `${d.length} campañas, ${conRoi.length} con ROI calculable`;
});

await prueba('GET /marketing/campanas/:id detalle', async () => {
  const lista = await pedir('GET', '/api/v1/marketing/campanas');
  const d = await pedir('GET', `/api/v1/marketing/campanas/${lista[0].id}`);
  if (!Array.isArray(d.embudo)) throw new Error('sin embudo de campaña');
  return `${d.nombre}: ${d.leads} leads → ${d.ganadas} ganadas`;
});

await prueba('GET /marketing/segmentos', async () =>
  `${(await pedir('GET', '/api/v1/marketing/segmentos')).length} segmentos`);

await prueba('GET /marketing/segmentos/:id evalúa reglas', async () => {
  const lista = await pedir('GET', '/api/v1/marketing/segmentos');
  const d = await pedir('GET', `/api/v1/marketing/segmentos/${lista[0].id}`);
  return `«${d.segmento.nombre}»: ${d.total} registros`;
});

await prueba('POST /marketing/segmentos con campo no permitido → 400', () =>
  pedir('POST', '/api/v1/marketing/segmentos', {
    nombre: 'Inyección', entidad: 'lead',
    definicion: { reglas: [{ campo: 'password_hash', op: '=', valor: 'x' }] },
  }, { esperado: 400 }).then(() => 'lista blanca aplicada'));

await prueba('GET /marketing/landings', async () =>
  `${(await pedir('GET', '/api/v1/marketing/landings')).length} landings`);

seccion('Reportes');

await prueba('GET /reportes completo', async () => {
  const d = await pedir('GET', '/api/v1/reportes');
  const req = ['kpis', 'ingresos', 'embudo', 'vendedores', 'velocidad', 'industrias',
    'productos', 'perdidas', 'competencia', 'mapaCalor'];
  for (const k of req) if (d[k] === undefined) throw new Error(`falta «${k}»`);
  if (d.ingresos.length !== 12) throw new Error(`esperaba 12 meses, recibí ${d.ingresos.length}`);
  return `${d.ingresos.length} meses, ${d.vendedores.length} vendedores, conversión ${d.kpis.conversion}%`;
});

await prueba('GET /reportes/cartera', async () => {
  const d = await pedir('GET', '/api/v1/reportes/cartera');
  if (d.concentracion?.porcentaje === undefined) throw new Error('sin concentración');
  return `top 5 concentra ${d.concentracion.porcentaje}% de los ingresos`;
});

await prueba('GET /reportes/exportar/ingresos → CSV', async () => {
  const r = await fetch(`${BASE}/api/v1/reportes/exportar/ingresos`, { headers: { cookie } });
  if (!r.ok) throw new Error(`estado ${r.status}`);
  const tipo = r.headers.get('content-type');
  if (!tipo?.includes('csv')) throw new Error(`content-type inesperado: ${tipo}`);
  const csv = await r.text();
  const lineas = csv.trim().split('\n');
  if (lineas.length < 2) throw new Error('CSV sin filas');
  return `${lineas.length - 1} filas`;
});

await prueba('GET /reportes/exportar/inexistente → 400', () =>
  pedir('GET', '/api/v1/reportes/exportar/inventado', null, { esperado: 400 })
    .then(() => 'lista blanca aplicada'));

seccion('Automatizaciones');

let autId = null;

await prueba('GET /automatizaciones', async () => {
  const d = await pedir('GET', '/api/v1/automatizaciones');
  autId = d.find((a) => a.activa)?.id ?? d[0].id;
  return `${d.length} flujos, ${d.filter((a) => a.activa).length} activos`;
});

await prueba('GET /automatizaciones/catalogo', async () => {
  const d = await pedir('GET', '/api/v1/automatizaciones/catalogo');
  if (!d.some((n) => n.tipo === 'disparador')) throw new Error('sin nodo disparador en el catálogo');
  return `${d.length} tipos de nodo`;
});

await prueba('GET /automatizaciones/metricas', async () => {
  const d = await pedir('GET', '/api/v1/automatizaciones/metricas');
  return `${d.activas} activas, ${d.tareas_generadas} tareas generadas en 30 d`;
});

await prueba('POST /automatizaciones/validar detecta grafo inválido', async () => {
  const d = await pedir('POST', '/api/v1/automatizaciones/validar', {
    nodos: [{ id: 'a', tipo: 'inventado', titulo: 'X' }], aristas: [],
  });
  if (d.valido) throw new Error('debió marcarlo inválido');
  if (!d.errores.length) throw new Error('sin errores reportados');
  return `${d.errores.length} error(es) detectado(s)`;
});

await prueba('POST /automatizaciones/validar detecta nodos huérfanos', async () => {
  const d = await pedir('POST', '/api/v1/automatizaciones/validar', {
    nodos: [
      { id: 'n1', tipo: 'disparador', titulo: 'Inicio', config: { evento: 'lead.creado' } },
      { id: 'n2', tipo: 'notificar', titulo: 'Huérfano' },
    ],
    aristas: [],
  });
  if (!d.valido) throw new Error('debía ser válido pero con advertencia');
  if (!d.advertencias.length) throw new Error('no advirtió del nodo huérfano');
  return d.advertencias[0].slice(0, 70);
});

await prueba('POST /automatizaciones crea flujo', async () => {
  const d = await pedir('POST', '/api/v1/automatizaciones', {
    nombre: `Flujo de prueba ${Date.now()}`,
    descripcion: 'Creado por la prueba de humo.',
    activa: false,
    nodos: [
      { id: 'n1', tipo: 'disparador', titulo: 'Entra un prospecto', x: 60, y: 100, config: { evento: 'lead.creado' } },
      { id: 'n2', tipo: 'ia_calificar', titulo: 'Calificar con IA', x: 300, y: 100, config: {} },
      { id: 'n3', tipo: 'condicion', titulo: '¿Score ≥ 70?', x: 540, y: 100, config: { campo: 'score', op: '>=', valor: 70 } },
      { id: 'n4', tipo: 'crear_actividad', titulo: 'Llamar hoy', x: 790, y: 100, config: { tipo: 'llamada', vence_horas: 4, prioridad: 1 } },
    ],
    aristas: [{ desde: 'n1', hasta: 'n2' }, { desde: 'n2', hasta: 'n3' }, { desde: 'n3', hasta: 'n4', etiqueta: 'sí' }],
  }, { esperado: 201 });
  return `flujo ${d.id}`;
});

await prueba('POST /automatizaciones/:id/ejecutar en simulación no escribe', async () => {
  const d = await pedir('POST', `/api/v1/automatizaciones/${autId}/ejecutar`, { simulacion: true });
  if (!d.simulacion) throw new Error('no vino marcado como simulación');
  if (!d.pasos.length) throw new Error('simulación sin pasos');
  return `${d.pasos.length} pasos simulados`;
});

await prueba('POST /automatizaciones/:id/ejecutar de verdad', async () => {
  const d = await pedir('POST', `/api/v1/automatizaciones/${autId}/ejecutar`, {});
  if (!d.id) throw new Error('sin registro de ejecución');
  if (!['ok', 'esperando', 'omitida', 'parcial'].includes(d.estado)) {
    throw new Error(`estado inesperado: ${d.estado} (${d.error})`);
  }
  return `estado ${d.estado}, ${(d.pasos ?? []).length} pasos, ${d.duracion_ms} ms`;
});

await prueba('GET /automatizaciones/ejecuciones', async () =>
  `${(await pedir('GET', '/api/v1/automatizaciones/ejecuciones?limite=10')).length} ejecuciones`);

// La suite se corre contra la base de demostración, así que recoge lo que ensucia:
// sin esto cada corrida deja un «Flujo de prueba» más en la lista del usuario.
await prueba('DELETE /automatizaciones limpia los flujos de prueba', async () => {
  const flujos = await pedir('GET', '/api/v1/automatizaciones');
  const basura = flujos.filter((f) => f.nombre.startsWith('Flujo de prueba '));
  for (const f of basura) await pedir('DELETE', `/api/v1/automatizaciones/${f.id}`);
  const quedan = (await pedir('GET', '/api/v1/automatizaciones'))
    .filter((f) => f.nombre.startsWith('Flujo de prueba ')).length;
  if (quedan) throw new Error(`quedaron ${quedan} flujos de prueba sin borrar`);
  return `${basura.length} flujo(s) de prueba eliminados`;
});

seccion('Catálogo y búsqueda global');

await prueba('GET /catalogo/productos', async () => {
  const d = await pedir('GET', '/api/v1/catalogo/productos');
  if (d.length < 10) throw new Error(`esperaba al menos 10 servicios, hay ${d.length}`);
  return `${d.length} servicios`;
});

await prueba('GET /catalogo/buscar', async () => {
  const d = await pedir('GET', '/api/v1/catalogo/buscar?q=aceros');
  if (!Array.isArray(d.resultados)) throw new Error('sin arreglo de resultados');
  return `${d.total} resultados en ${Object.keys(d.porTipo ?? {}).length} categorías`;
});

await prueba('GET /catalogo/buscar término corto → vacío', async () => {
  const d = await pedir('GET', '/api/v1/catalogo/buscar?q=a');
  if (d.total !== 0) throw new Error('debía ignorar términos de una letra');
  return 'ignorado correctamente';
});

seccion('Inteligencia artificial');

await prueba('GET /ia/estado', async () => {
  const d = await pedir('GET', '/api/v1/ia/estado');
  if (d.motor_determinista !== true) throw new Error('el motor determinista debe estar siempre activo');
  return `generativa: ${d.generativa}, modelo: ${d.modelo ?? 'n/a'}`;
});

await prueba('GET /ia/modelo expone pesos auditables', async () => {
  const d = await pedir('GET', '/api/v1/ia/modelo');
  const suma = Object.values(d.lead_score.pesos).reduce((a, b) => a + b, 0);
  if (suma !== 100) throw new Error(`los pesos del score deben sumar 100, suman ${suma}`);
  return `pesos suman ${suma}, ${d.etapas_embudo.length} etapas`;
});

await prueba('GET /ia/score/:leadId explica el score', async () => {
  const lista = await pedir('GET', '/api/v1/leads?limite=1&orden=score&dir=desc');
  const d = await pedir('GET', `/api/v1/ia/score/${lista.filas[0].id}`);
  const suma = Object.values(d.desglose).reduce((a, b) => a + b, 0);
  if (Math.abs(suma - d.score) > 1) throw new Error(`el desglose (${suma}) no cuadra con el score (${d.score})`);
  return `score ${d.score} = ${Object.entries(d.desglose).map(([k, v]) => `${k} ${v}`).join(' + ')}`;
});

await prueba('GET /ia/insights', async () => {
  const d = await pedir('GET', '/api/v1/ia/insights');
  const sinExplicacion = d.filter((i) => !i.explicacion);
  if (sinExplicacion.length) throw new Error(`${sinExplicacion.length} insights sin explicación`);
  return `${d.length} insights, todos con explicación`;
});

await prueba('GET /ia/siguiente-accion', async () => {
  const d = await pedir('GET', '/api/v1/ia/siguiente-accion');
  return `${d.total} acciones priorizadas`;
});

// Las diez preguntas del pliego, una por una.
const PREGUNTAS = [
  '¿Cuáles son mis oportunidades más cercanas a cerrar?',
  '¿Qué clientes llevan más de 20 días sin seguimiento?',
  '¿Qué vendedor tiene mejor conversión?',
  'Resume la actividad de hoy',
  '¿Voy a alcanzar mi meta del mes?',
  '¿Qué oportunidades están en riesgo?',
  '¿Qué debo hacer primero hoy?',
  '¿A quién le puedo vender un servicio adicional?',
  '¿Dónde se pierde más gente en el embudo?',
  '¿Cómo va el soporte?',
];

let conversacionId = null;
for (const [i, pregunta] of PREGUNTAS.entries()) {
  await prueba(`copiloto ${i + 1}/10: «${pregunta}»`, async () => {
    const d = await pedir('POST', '/api/v1/ia/preguntar', {
      pregunta, conversacion_id: conversacionId, contexto: { ruta: '/' },
    });
    conversacionId = d.conversacion_id;
    if (!d.texto || d.texto.length < 20) throw new Error(`respuesta demasiado corta: «${d.texto}»`);
    if (!d.herramientas?.length) throw new Error('no usó ninguna herramienta del CRM');
    return `${d.herramientas.map((h) => h.nombre).join(', ')} · ${d.texto.length} caracteres`;
  });
}

await prueba('copiloto con contexto de cuenta', async () => {
  const d = await pedir('POST', '/api/v1/ia/preguntar', {
    pregunta: '¿Qué debo hacer con este cliente?',
    contexto: { ruta: '/clientes', entidad_tipo: 'cuenta', entidad_id: cuentaId },
  });
  if (!d.texto.length) throw new Error('sin respuesta');
  return `${d.herramientas.map((h) => h.nombre).join(', ')} · ${d.texto.length} caracteres`;
});

await prueba('GET /ia/sugerencias contextuales', async () => {
  const d = await pedir('GET', '/api/v1/ia/sugerencias?ruta=/oportunidades');
  if (!Array.isArray(d) || !d.length) throw new Error('sin sugerencias');
  return `${d.length} sugerencias`;
});

await prueba('GET /ia/conversaciones', async () =>
  `${(await pedir('GET', '/api/v1/ia/conversaciones')).length} conversaciones`);

await prueba('POST /ia/redactar-correo', async () => {
  const d = await pedir('POST', '/api/v1/ia/redactar-correo', { tipo: 'seguimiento', cuenta_id: cuentaId });
  if (!d.asunto || !d.cuerpo) throw new Error('correo incompleto');
  if (!d.revisar) throw new Error('debe marcarse para revisión');
  return `«${d.asunto}» · ${d.generado_por} · ${d.cuerpo.length} caracteres`;
});

await prueba('POST /ia/generar-propuesta', async () => {
  const d = await pedir('POST', '/api/v1/ia/generar-propuesta', { oportunidad_id: opId });
  if (!d.secciones?.length) throw new Error('propuesta sin secciones');
  const totales = d.secciones.find((s) => s.totales);
  if (!totales) throw new Error('propuesta sin totales');
  return `${d.secciones.length} secciones · total ${totales.totales.total}`;
});

await prueba('POST /ia/analizar-conversacion', async () => {
  const d = await pedir('POST', '/api/v1/ia/analizar-conversacion', {
    texto: 'Buenas tardes. Revisamos su cotización y nos parece caro comparado con nuestro '
      + 'proveedor actual. Necesitamos el servicio para la próxima semana, es urgente. '
      + '¿Pueden mejorar el precio del consolidado?',
  });
  if (!d.resumen) throw new Error('sin resumen');
  if (!Array.isArray(d.objeciones)) throw new Error('sin objeciones');
  return `sentimiento ${d.sentimiento}, intención ${d.intencion_de_compra}, objeciones: ${d.objeciones.join('/') || 'ninguna'}`;
});

seccion('Seguridad');

await prueba('ordenamiento con columna inventada no rompe', async () => {
  const d = await pedir('GET', '/api/v1/leads?orden=password_hash;DROP+TABLE+leads&limite=5');
  if (!Array.isArray(d.filas)) throw new Error('respuesta inesperada');
  return 'lista blanca de ordenamiento aplicada';
});

await prueba('las tablas siguen existiendo tras el intento de inyección', async () => {
  const d = await pedir('GET', '/api/v1/leads?limite=1');
  if (!d.total) throw new Error('¡la tabla leads está vacía!');
  return `${d.total} leads intactos`;
});

await prueba('parámetro no numérico en id → 400', () =>
  pedir('GET', '/api/v1/leads/abc', null, { esperado: 400 }).then(() => 'validado'));

await prueba('ruta inexistente → 404', () =>
  pedir('GET', '/api/v1/inventado', null, { esperado: 404 }).then(() => 'manejado'));

await prueba('POST /auth/logout invalida la sesión', async () => {
  await pedir('POST', '/api/v1/auth/logout');
  await pedir('GET', '/api/v1/auth/yo', null, { esperado: 401 });
  return 'sesión cerrada';
});

// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(64)}`);
console.log(`${c.negrita('Resultado')}: ${c.verde(`${ok} correctas`)}${fallos ? `, ${c.rojo(`${fallos} fallidas`)}` : ''}`);
if (fallos) {
  console.log(`\n${c.rojo(c.negrita('Fallos:'))}`);
  for (const e of errores) console.log(`  · ${e.nombre}\n    ${e.error}`);
}
console.log('');
process.exit(fallos ? 1 : 0);
