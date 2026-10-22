const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { pool } = require('./db');
const { PLAZAS, NOMBRES_PLAZA, otraPlaza } = require('./estatus');

// ---------------------------------------------------------------------------
//  Reporte de salidas del dia
//
//  Contesta la pregunta del corte: "a que guias les dimos salida hoy (o ayer),
//  a que hora y quien las escaneo". Se compara contra el manifiesto en papel
//  para encontrar las que faltaron por escanear.
//
//  La fuente es la tabla de EVENTOS, no el estatus actual de la guia: una
//  guia que salio ayer puede estar hoy ya en bodega o entregada, y aun asi
//  debe aparecer en el reporte de ayer. Los escaneos revertidos por un
//  administrador quedan fuera: una salida deshecha no fue una salida.
// ---------------------------------------------------------------------------

// El dia se corta en horario de Mexico, igual que en el resto del sistema:
// la base guarda UTC y sin esta conversion lo escaneado despues de las 18:00
// apareceria como del dia siguiente.
const ZONA = 'America/Mexico_City';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// La fecha de "hoy" en horario de Mexico como AAAA-MM-DD (en-CA da ese formato)
function hoyEnMexico() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function normalizarFecha(fecha) {
  const f = String(fecha || '').trim();
  if (!f) return hoyEnMexico();
  if (!FORMATO_FECHA.test(f)) throw new Error('La fecha no es valida: usa el formato AAAA-MM-DD');
  return f;
}

function normalizarPlaza(plaza) {
  const p = String(plaza || '').trim().toUpperCase();
  if (!p) return null; // sin plaza = las dos
  if (!PLAZAS.includes(p)) throw new Error('Plaza invalida: usa MTY, CDMX o vacia para ambas');
  return p;
}

// Salidas registradas en un dia, opcionalmente de una sola plaza. Cada fila es
// un evento SALIDA vigente (no revertido) con la hora exacta del escaneo y el
// nombre del operador; si la cuenta ya se borro queda al menos su login.
async function salidasDelDia({ fecha, plaza } = {}) {
  const f = normalizarFecha(fecha);
  const p = normalizarPlaza(plaza);

  const params = [f];
  let filtroPlaza = '';
  if (p) {
    params.push(p);
    filtroPlaza = `AND e.plaza = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT e.numero_guia, e.plaza, e.creado_en,
            COALESCE(u.nombre, e.usuario) AS operador,
            g.complemento, g.estatus AS estatus_actual
       FROM eventos e
       LEFT JOIN usuarios u ON u.usuario = e.usuario
       LEFT JOIN guias g ON g.numero_guia = e.numero_guia
      WHERE e.accion = 'SALIDA' AND NOT e.revertido
        AND (e.creado_en AT TIME ZONE '${ZONA}')::date = $1::date
        ${filtroPlaza}
      ORDER BY e.creado_en ASC, e.id ASC`,
    params
  );

  const porPlaza = { MTY: 0, CDMX: 0 };
  for (const r of rows) porPlaza[r.plaza] = (porPlaza[r.plaza] || 0) + 1;

  return { fecha: f, plaza: p, total: rows.length, porPlaza, salidas: rows };
}

// Un rango de fechas largo no tiene sentido en un reporte de corte y solo
// carga la base; un año alcanza para cualquier cierre.
const MAX_DIAS_RANGO = 366;

function normalizarRango(desde, hasta) {
  const d = normalizarFecha(desde);
  const h = hasta ? normalizarFecha(hasta) : d;
  if (d > h) throw new Error('La fecha inicial es posterior a la final');
  const dias = (Date.parse(`${h}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000;
  if (dias >= MAX_DIAS_RANGO) throw new Error('El rango no puede pasar de un año');
  return { desde: d, hasta: h };
}

function contarPorPlaza(filas) {
  const porPlaza = { MTY: 0, CDMX: 0 };
  for (const r of filas) porPlaza[r.plaza] = (porPlaza[r.plaza] || 0) + 1;
  return porPlaza;
}

// El escaneo de entrega deja dicho como se entrego: en ocurre (el cliente
// recoge en bodega) o a domicilio. Las entregas fijadas a mano sin tipo
// quedan sin dato.
function tipoDeEntrega(descripcion) {
  const d = String(descripcion || '').toLowerCase();
  if (d.includes('ocurre')) return 'Ocurre';
  if (d.includes('domicilio')) return 'Domicilio';
  return '';
}

// Entregas registradas en un rango de dias, opcionalmente de una sola plaza.
// Igual que las salidas, sale de EVENTOS: una guia entregada que despues
// volvio a viajar sigue contando como entregada el dia que se entrego.
async function entregasEnRango({ desde, hasta, plaza } = {}) {
  const rango = normalizarRango(desde, hasta);
  const p = normalizarPlaza(plaza);

  const params = [rango.desde, rango.hasta];
  let filtroPlaza = '';
  if (p) {
    params.push(p);
    filtroPlaza = `AND e.plaza = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT e.numero_guia, e.plaza, e.creado_en, e.descripcion,
            COALESCE(u.nombre, e.usuario) AS operador,
            g.complemento
       FROM eventos e
       LEFT JOIN usuarios u ON u.usuario = e.usuario
       LEFT JOIN guias g ON g.numero_guia = e.numero_guia
      WHERE e.accion = 'ENTREGA' AND NOT e.revertido
        AND (e.creado_en AT TIME ZONE '${ZONA}')::date BETWEEN $1::date AND $2::date
        ${filtroPlaza}
      ORDER BY e.creado_en ASC, e.id ASC`,
    params
  );

  const entregas = rows.map(({ descripcion, ...r }) => ({ ...r, tipo: tipoDeEntrega(descripcion) }));
  return { ...rango, plaza: p, total: entregas.length, porPlaza: contarPorPlaza(entregas), entregas };
}

// Dias completos entre la llegada y ahora: 0 es "llego hoy"
function diasDesde(fecha, ahora = Date.now()) {
  return Math.max(0, Math.floor((ahora - new Date(fecha).getTime()) / 86400000));
}

// Lo que hay ahorita en bodega, de una plaza o de las dos. Las que llevan mas
// tiempo van primero: son las que hay que mover. estatus_desde es la hora en
// que la guia entro a la bodega (llegada o regreso de reparto); las guias
// anteriores a esa columna caen en su ultimo movimiento.
async function guiasEnBodega({ plaza } = {}) {
  const p = normalizarPlaza(plaza);
  const estatus = p ? [`EN_BODEGA_${p}`] : PLAZAS.map((x) => `EN_BODEGA_${x}`);

  const { rows } = await pool.query(
    `SELECT numero_guia, complemento, estatus,
            COALESCE(estatus_desde, actualizado_en) AS llegada
       FROM guias
      WHERE estatus = ANY($1::text[])
      ORDER BY COALESCE(estatus_desde, actualizado_en) ASC, numero_guia ASC`,
    [estatus]
  );

  const ahora = Date.now();
  const guias = rows.map(({ estatus: e, ...r }) => ({
    ...r,
    plaza: e.endsWith('_MTY') ? 'MTY' : 'CDMX',
    dias: diasDesde(r.llegada, ahora),
  }));
  return { corte: new Date(ahora).toISOString(), plaza: p, total: guias.length, porPlaza: contarPorPlaza(guias), guias };
}

// ---------------------------------------------------------------------------
//  El PDF
//
//  Se dibuja con pdfkit, igual que las cotizaciones del CRM: el contenedor de
//  produccion no lleva navegador y convertir HTML costaria un Chrome headless
//  entero para el mismo resultado. Colores y margenes tomados del formato
//  oficial de la empresa (azul marino 0F3A5D en encabezados).
// ---------------------------------------------------------------------------

const LOGO = path.resolve(__dirname, 'activos', 'logo-tauro.png');

const AZUL = '#0F3A5D'; // encabezados
const TINTA = '#1C1C1E';
const GRIS = '#6B6F76';
const BORDE = '#D8DEE5';
const FONDO_FILA = '#F5F8FA'; // filas alternas
const FONDO_BANDA = '#E9EEF3'; // banda del resumen

// Carta: 612 x 792 pt, con los margenes del formato oficial
const MARGEN = 46.8;
const ANCHO = 612 - MARGEN * 2; // 518.4
const PIE = 40; // reservado al pie de cada pagina

// Columnas de cada reporte. La primera siempre es el consecutivo; el ancho
// de la ultima es lo que sobra de la hoja.
const COL_NUM = { titulo: '#', ancho: 30, alinear: 'right' };
const COL_SALIDAS = [
  COL_NUM,
  { titulo: 'GUIA', ancho: 190 },
  { titulo: 'HORA DE SALIDA', ancho: 110 },
  { titulo: 'ESCANEÓ', ancho: ANCHO - 30 - 190 - 110 },
];
const COL_ENTREGADAS = [
  COL_NUM,
  { titulo: 'GUIA', ancho: 160 },
  { titulo: 'FECHA Y HORA', ancho: 115 },
  { titulo: 'TIPO', ancho: 75 },
  { titulo: 'ENTREGÓ', ancho: ANCHO - 30 - 160 - 115 - 75 },
];
const COL_BODEGA = [
  COL_NUM,
  { titulo: 'GUIA', ancho: 190 },
  { titulo: 'LLEGÓ A BODEGA', ancho: 150 },
  { titulo: 'DÍAS EN BODEGA', ancho: ANCHO - 30 - 190 - 150 },
];
const ALTO_FILA = 19;

// Una guia que lleva este tiempo en bodega ya cuenta como estancada en el
// resto del sistema; en el PDF se marca para que salte a la vista.
const DIAS_ATENCION = 2;
const AMBAR = '#B4532A';

// Las fuentes estandar del PDF solo saben WinAnsi: lo que se sale de ahi
// (emojis, alfabetos ajenos) pdfkit lo pinta como garabato. Se sustituye lo
// sustituible y lo demas se omite; un hueco se lee mejor que un jeroglifico.
function imprimible(texto) {
  let salida = '';
  for (const ch of String(texto ?? '')) {
    if (ch === '→') { salida += ' a '; continue; }
    const n = ch.charCodeAt(0);
    if (ch === '\n' || (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff)) salida += ch;
  }
  return salida;
}

const fmtHora = new Intl.DateTimeFormat('es-MX', {
  timeZone: ZONA,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const fmtFechaHora = new Intl.DateTimeFormat('es-MX', {
  timeZone: ZONA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// Fecha y hora por separado y en formato fijo, para el Excel
const fmtFechaCsv = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHoraCsv = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function fechaLarga(f, conDia = true) {
  // La fecha AAAA-MM-DD se ancla a mediodia UTC para que el dia no se corra
  // al formatearla en horario de Mexico
  const texto = new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA,
    ...(conDia ? { weekday: 'long' } : {}),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${f}T12:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function textoRango({ desde, hasta }) {
  if (desde === hasta) return fechaLarga(desde);
  return `Del ${fechaLarga(desde, false).toLowerCase()} al ${fechaLarga(hasta, false).toLowerCase()}`;
}

function textoDias(n) {
  if (n === 0) return 'Hoy';
  return `${n} día${n === 1 ? '' : 's'}`;
}

function sufijoPlaza(plaza) {
  return plaza ? '-' + plaza.toLowerCase() : '';
}

function nombreArchivo({ fecha, plaza }) {
  return `salidas-${fecha}${sufijoPlaza(plaza)}.pdf`;
}

function nombreEntregadas({ desde, hasta, plaza }, ext) {
  const rango = desde === hasta ? desde : `${desde}_a_${hasta}`;
  return `entregadas-${rango}${sufijoPlaza(plaza)}.${ext}`;
}

function nombreBodega({ corte, plaza }, ext) {
  return `en-bodega-${fmtFechaCsv.format(new Date(corte))}${sufijoPlaza(plaza)}.${ext}`;
}

function guiaConComplemento(f) {
  return f.complemento ? `${f.numero_guia}  (comp. ${f.complemento})` : f.numero_guia;
}

// ---------------------------------------------------------------------------
//  Los tres reportes en PDF comparten formato: encabezado con logo, banda de
//  totales y una tabla por plaza. Cada uno solo dice sus textos, sus columnas
//  y que va en cada celda.
// ---------------------------------------------------------------------------

function totalesPorPlaza(porPlaza, conPrefijo) {
  return conPrefijo
    ? `Monterrey (AN): ${porPlaza.MTY || 0}      Ciudad de Mexico (BN): ${porPlaza.CDMX || 0}`
    : `Monterrey: ${porPlaza.MTY || 0}      Ciudad de Mexico: ${porPlaza.CDMX || 0}`;
}

// Escribe el PDF del reporte de salidas directamente en el stream de la
// respuesta. Devuelve una promesa que se resuelve cuando el documento termina.
function generarPdfSalidas(datos, generadoPor, stream) {
  const { fecha, plaza, total, porPlaza, salidas } = datos;
  return generarPdf(stream, generadoPor, {
    titulo: 'REPORTE DE SALIDAS',
    subtitulo: 'Guias con salida registrada por escaneo · Fletes Tauro',
    fecha: fechaLarga(fecha),
    alcance: plaza ? `Solo salidas de ${NOMBRES_PLAZA[plaza]}` : 'Salidas de Monterrey y Ciudad de Mexico',
    total: `Total de salidas: ${total}`,
    desglose: plaza ? null : totalesPorPlaza(porPlaza, true),
    vacio: `No se registro ninguna salida${plaza ? ` de ${NOMBRES_PLAZA[plaza]}` : ''} ese dia.`,
    columnas: COL_SALIDAS,
    secciones: secciones(plaza, salidas, (p) =>
      `SALIDAS DE ${NOMBRES_PLAZA[p].toUpperCase()} → ${NOMBRES_PLAZA[otraPlaza(p)].toUpperCase()}`),
    // El numero va en negrita: es la columna que se coteja contra el
    // manifiesto y debe distinguirse de un vistazo.
    celdas: (f) => [
      { texto: guiaConComplemento(f), negrita: true },
      { texto: fmtHora.format(new Date(f.creado_en)) },
      operadorCelda(f.operador),
    ],
  });
}

function generarPdfEntregadas(datos, generadoPor, stream) {
  const { plaza, total, porPlaza, entregas } = datos;
  const unDia = datos.desde === datos.hasta;
  return generarPdf(stream, generadoPor, {
    titulo: 'REPORTE DE ENTREGADAS',
    subtitulo: 'Guias entregadas al cliente · Fletes Tauro',
    fecha: textoRango(datos),
    alcance: plaza ? `Solo entregas en ${NOMBRES_PLAZA[plaza]}` : 'Entregas en Monterrey y Ciudad de Mexico',
    total: `Total de entregadas: ${total}`,
    desglose: plaza ? null : totalesPorPlaza(porPlaza),
    vacio: `No se registro ninguna entrega${plaza ? ` en ${NOMBRES_PLAZA[plaza]}` : ''} ${unDia ? 'ese dia' : 'en esas fechas'}.`,
    columnas: COL_ENTREGADAS,
    secciones: secciones(plaza, entregas, (p) => `ENTREGADAS EN ${NOMBRES_PLAZA[p].toUpperCase()}`),
    celdas: (f) => [
      { texto: guiaConComplemento(f), negrita: true },
      { texto: fmtFechaHora.format(new Date(f.creado_en)) },
      f.tipo ? { texto: f.tipo } : { texto: 'sin dato', gris: true },
      operadorCelda(f.operador),
    ],
  });
}

function generarPdfBodega(datos, generadoPor, stream) {
  const { plaza, total, porPlaza, guias } = datos;
  return generarPdf(stream, generadoPor, {
    titulo: 'GUIAS EN BODEGA',
    subtitulo: 'Lo que esta en bodega al momento del corte · Fletes Tauro',
    fecha: `Corte al ${fmtFechaHora.format(new Date(datos.corte))}`,
    alcance: plaza ? `Solo bodega de ${NOMBRES_PLAZA[plaza]}` : 'Bodegas de Monterrey y Ciudad de Mexico',
    total: `Total en bodega: ${total}`,
    desglose: plaza ? null : totalesPorPlaza(porPlaza),
    vacio: `No hay guias en ${plaza ? `la bodega de ${NOMBRES_PLAZA[plaza]}` : 'bodega'} en este momento.`,
    columnas: COL_BODEGA,
    secciones: secciones(plaza, guias, (p) => `EN BODEGA DE ${NOMBRES_PLAZA[p].toUpperCase()}`),
    celdas: (f) => [
      { texto: guiaConComplemento(f), negrita: true },
      { texto: fmtFechaHora.format(new Date(f.llegada)) },
      f.dias >= DIAS_ATENCION
        ? { texto: textoDias(f.dias), negrita: true, color: AMBAR }
        : { texto: textoDias(f.dias) },
    ],
  });
}

function operadorCelda(operador) {
  return operador ? { texto: operador, chica: true } : { texto: 'sin registrar', chica: true, gris: true };
}

// Una seccion por plaza que tenga filas (o la plaza pedida, aunque este vacia)
function secciones(plaza, filas, titulo) {
  const plazas = plaza ? [plaza] : PLAZAS.filter((p) => filas.some((f) => f.plaza === p));
  return plazas.map((p) => ({ titulo: titulo(p), filas: filas.filter((f) => f.plaza === p) }));
}

function generarPdf(stream, generadoPor, r) {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: PIE, left: MARGEN, right: MARGEN }, bufferPages: true });
  doc.pipe(stream);

  // ---------- Encabezado: logo, titulo y datos del reporte ----------
  if (fs.existsSync(LOGO)) {
    doc.image(LOGO, MARGEN, 42, { fit: [110, 74] });
  }
  doc.font('Helvetica-Bold').fontSize(17).fillColor(AZUL)
    .text(r.titulo, MARGEN + 130, 50, { width: ANCHO - 130, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(GRIS)
    .text(r.subtitulo, MARGEN + 130, doc.y + 2, { width: ANCHO - 130, align: 'right' });

  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(TINTA)
    .text(imprimible(r.fecha), MARGEN + 130, doc.y + 10, { width: ANCHO - 130, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(GRIS)
    .text(imprimible(r.alcance), MARGEN + 130, doc.y + 2, { width: ANCHO - 130, align: 'right' });

  let y = 128;
  doc.moveTo(MARGEN, y).lineTo(MARGEN + ANCHO, y).lineWidth(1).strokeColor(BORDE).stroke();
  y += 12;

  // ---------- Banda de totales ----------
  doc.rect(MARGEN, y, ANCHO, 30).fill(FONDO_BANDA);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(AZUL)
    .text(r.total, MARGEN + 14, y + 9, { lineBreak: false });
  if (r.desglose) {
    doc.font('Helvetica').fontSize(9.5).fillColor(TINTA)
      .text(r.desglose, MARGEN, y + 10.5, { width: ANCHO - 14, align: 'right' });
  }
  y += 30 + 18;

  // ---------- Sin filas: se dice claro y se acaba ----------
  if (!r.secciones.some((s) => s.filas.length)) {
    doc.font('Helvetica').fontSize(10.5).fillColor(GRIS)
      .text(imprimible(r.vacio), MARGEN, y + 8);
    terminar(doc, generadoPor);
    return promesaDeCierre(doc, stream);
  }

  for (const s of r.secciones) {
    y = seccionPlaza(doc, y, s, r.columnas, r.celdas);
  }

  terminar(doc, generadoPor);
  return promesaDeCierre(doc, stream);
}

// Dibuja el titulo de la seccion y su tabla; regresa la Y donde quedo el cursor.
function seccionPlaza(doc, y, seccion, columnas, celdas) {
  const { titulo, filas } = seccion;
  y = saltoSiNoCabe(doc, y, 26 + ALTO_FILA * 2);

  doc.rect(MARGEN, y, ANCHO, 24).fill(AZUL);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF')
    .text(imprimible(titulo), MARGEN + 14, y + 7, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor('#FFFFFF')
    .text(`${filas.length} guia${filas.length === 1 ? '' : 's'}`, MARGEN, y + 7.5, { width: ANCHO - 14, align: 'right' });
  y += 24;

  y = encabezadoTabla(doc, y, columnas);

  for (let i = 0; i < filas.length; i++) {
    if (y + ALTO_FILA > alturaUtil(doc)) {
      doc.addPage();
      y = doc.page.margins.top;
      y = encabezadoTabla(doc, y, columnas);
    }
    if (i % 2 === 1) doc.rect(MARGEN, y, ANCHO, ALTO_FILA).fill(FONDO_FILA);

    const linea = y + 5.5;
    let x = MARGEN;
    doc.font('Helvetica').fontSize(9).fillColor(GRIS)
      .text(String(i + 1), x, linea, { width: columnas[0].ancho - 8, align: 'right', lineBreak: false });
    x += columnas[0].ancho;

    celdas(filas[i]).forEach((c, j) => {
      const col = columnas[j + 1];
      doc.font(c.negrita ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(c.negrita ? 9.5 : c.chica ? 9 : 9.5)
        .fillColor(c.color || (c.gris ? GRIS : TINTA))
        .text(imprimible(c.texto), x + 8, linea, { width: col.ancho - 12, ellipsis: true, lineBreak: false });
      x += col.ancho;
    });

    y += ALTO_FILA;
    doc.moveTo(MARGEN, y).lineTo(MARGEN + ANCHO, y).lineWidth(0.5).strokeColor(BORDE).stroke();
  }

  return y + 22;
}

function encabezadoTabla(doc, y, columnas) {
  doc.rect(MARGEN, y, ANCHO, 18).fill('#F0F3F6');
  let x = MARGEN;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(AZUL);
  for (const c of columnas) {
    const derecha = c.alinear === 'right';
    doc.text(c.titulo, x + (derecha ? 0 : 8), y + 5.5, { width: c.ancho - (derecha ? 8 : 12), align: c.alinear || 'left', lineBreak: false });
    x += c.ancho;
  }
  return y + 18;
}

function alturaUtil(doc) {
  return doc.page.height - doc.page.margins.bottom - 8;
}

function saltoSiNoCabe(doc, y, altoNecesario) {
  if (y + altoNecesario > alturaUtil(doc)) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return y;
}

// Pie en todas las paginas (se escribe al final, cuando ya se sabe cuantas son)
function terminar(doc, generadoPor) {
  const cuando = new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    // El pie vive dentro del margen inferior; si se escribe con el margen
    // puesto, pdfkit cree que el texto se desbordo y agrega paginas en blanco.
    const margenAbajo = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const yPie = doc.page.height - 30;
    doc.font('Helvetica').fontSize(7.5).fillColor(GRIS);
    doc.text('www.rastreofletestauro.com', MARGEN, yPie, { lineBreak: false });
    doc.text(`Pagina ${i + 1} de ${paginas.count}`, MARGEN, yPie, { width: ANCHO, align: 'center', lineBreak: false });
    doc.text(imprimible(`Generado el ${cuando} por ${generadoPor}`), MARGEN, yPie, { width: ANCHO, align: 'right', lineBreak: false });
    doc.page.margins.bottom = margenAbajo;
  }
  doc.end();
}

function promesaDeCierre(doc, stream) {
  return new Promise((resolver, rechazar) => {
    stream.on('finish', resolver);
    stream.on('close', resolver);
    doc.on('error', rechazar);
    stream.on('error', rechazar);
  });
}

// ---------------------------------------------------------------------------
//  Excel (CSV)
//
//  CSV y no .xlsx: lo abre Excel con doble clic y no hace falta otra
//  dependencia. Va con BOM para que Excel lea los acentos como UTF-8, y la
//  fecha y la hora en columnas separadas para poder filtrar por dia.
// ---------------------------------------------------------------------------

function celdaCsv(v) {
  const t = String(v ?? '');
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function aCsv(encabezados, filas) {
  return '\ufeff' + [encabezados, ...filas].map((f) => f.map(celdaCsv).join(',')).join('\r\n') + '\r\n';
}

function csvEntregadas({ entregas }) {
  return aCsv(
    ['Guia', 'Complemento', 'Plaza', 'Fecha', 'Hora', 'Tipo de entrega', 'Entrego'],
    entregas.map((f) => {
      const d = new Date(f.creado_en);
      return [f.numero_guia, f.complemento, f.plaza, fmtFechaCsv.format(d), fmtHoraCsv.format(d), f.tipo, f.operador];
    })
  );
}

function csvBodega({ guias }) {
  return aCsv(
    ['Guia', 'Complemento', 'Plaza', 'Fecha de llegada', 'Hora de llegada', 'Dias en bodega'],
    guias.map((f) => {
      const d = new Date(f.llegada);
      return [f.numero_guia, f.complemento, f.plaza, fmtFechaCsv.format(d), fmtHoraCsv.format(d), f.dias];
    })
  );
}

module.exports = {
  salidasDelDia, generarPdfSalidas, nombreArchivo,
  entregasEnRango, generarPdfEntregadas, csvEntregadas, nombreEntregadas,
  guiasEnBodega, generarPdfBodega, csvBodega, nombreBodega,
};
