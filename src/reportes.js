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

// Columnas de la tabla: numero consecutivo, guia, hora y quien escaneo
const COL = [
  { titulo: '#', ancho: 30, alinear: 'right' },
  { titulo: 'GUIA', ancho: 190, alinear: 'left' },
  { titulo: 'HORA DE SALIDA', ancho: 110, alinear: 'left' },
  { titulo: 'ESCANEÓ', ancho: ANCHO - 30 - 190 - 110, alinear: 'left' },
];
const ALTO_FILA = 19;

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

function fechaLarga(f) {
  // La fecha AAAA-MM-DD se ancla a mediodia UTC para que el dia no se corra
  // al formatearla en horario de Mexico
  const texto = new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${f}T12:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function nombreArchivo({ fecha, plaza }) {
  return `salidas-${fecha}${plaza ? '-' + plaza.toLowerCase() : ''}.pdf`;
}

// Escribe el PDF del reporte directamente en el stream de la respuesta.
// Devuelve una promesa que se resuelve cuando el documento termina.
function generarPdfSalidas(datos, generadoPor, stream) {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: PIE, left: MARGEN, right: MARGEN }, bufferPages: true });
  doc.pipe(stream);

  const { fecha, plaza, total, porPlaza, salidas } = datos;

  // ---------- Encabezado: logo, titulo y datos del reporte ----------
  if (fs.existsSync(LOGO)) {
    doc.image(LOGO, MARGEN, 42, { fit: [110, 74] });
  }
  doc.font('Helvetica-Bold').fontSize(17).fillColor(AZUL)
    .text('REPORTE DE SALIDAS', MARGEN + 130, 50, { width: ANCHO - 130, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(GRIS)
    .text('Guias con salida registrada por escaneo · Fletes Tauro', MARGEN + 130, doc.y + 2, { width: ANCHO - 130, align: 'right' });

  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(TINTA)
    .text(imprimible(fechaLarga(fecha)), MARGEN + 130, doc.y + 10, { width: ANCHO - 130, align: 'right' });
  const etiquetaPlaza = plaza
    ? `Solo salidas de ${NOMBRES_PLAZA[plaza]}`
    : 'Salidas de Monterrey y Ciudad de Mexico';
  doc.font('Helvetica').fontSize(9).fillColor(GRIS)
    .text(imprimible(etiquetaPlaza), MARGEN + 130, doc.y + 2, { width: ANCHO - 130, align: 'right' });

  let y = 128;
  doc.moveTo(MARGEN, y).lineTo(MARGEN + ANCHO, y).lineWidth(1).strokeColor(BORDE).stroke();
  y += 12;

  // ---------- Banda de totales ----------
  doc.rect(MARGEN, y, ANCHO, 30).fill(FONDO_BANDA);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(AZUL)
    .text(`Total de salidas: ${total}`, MARGEN + 14, y + 9, { lineBreak: false });
  if (!plaza) {
    doc.font('Helvetica').fontSize(9.5).fillColor(TINTA)
      .text(`Monterrey (AN): ${porPlaza.MTY || 0}      Ciudad de Mexico (BN): ${porPlaza.CDMX || 0}`,
        MARGEN, y + 10.5, { width: ANCHO - 14, align: 'right' });
  }
  y += 30 + 18;

  // ---------- Sin salidas: se dice claro y se acaba ----------
  if (!total) {
    doc.font('Helvetica').fontSize(10.5).fillColor(GRIS)
      .text(`No se registro ninguna salida${plaza ? ` de ${NOMBRES_PLAZA[plaza]}` : ''} ese dia.`, MARGEN, y + 8);
    terminar(doc, generadoPor);
    return promesaDeCierre(doc, stream);
  }

  // ---------- Una seccion por plaza de salida ----------
  const plazas = plaza ? [plaza] : PLAZAS.filter((p) => salidas.some((s) => s.plaza === p));
  for (const p of plazas) {
    const filas = salidas.filter((s) => s.plaza === p);
    y = seccionPlaza(doc, y, p, filas);
  }

  terminar(doc, generadoPor);
  return promesaDeCierre(doc, stream);
}

// Dibuja el titulo de la plaza y su tabla; regresa la Y donde quedo el cursor.
function seccionPlaza(doc, y, plaza, filas) {
  y = saltoSiNoCabe(doc, y, 26 + ALTO_FILA * 2);

  // Titulo de la seccion: de donde salieron y hacia donde van
  doc.rect(MARGEN, y, ANCHO, 24).fill(AZUL);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF')
    .text(imprimible(`SALIDAS DE ${NOMBRES_PLAZA[plaza].toUpperCase()} → ${NOMBRES_PLAZA[otraPlaza(plaza)].toUpperCase()}`),
      MARGEN + 14, y + 7, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor('#FFFFFF')
    .text(`${filas.length} guia${filas.length === 1 ? '' : 's'}`, MARGEN, y + 7.5, { width: ANCHO - 14, align: 'right' });
  y += 24;

  y = encabezadoTabla(doc, y);

  for (let i = 0; i < filas.length; i++) {
    if (y + ALTO_FILA > alturaUtil(doc)) {
      doc.addPage();
      y = doc.page.margins.top;
      y = encabezadoTabla(doc, y);
    }
    const f = filas[i];
    if (i % 2 === 1) doc.rect(MARGEN, y, ANCHO, ALTO_FILA).fill(FONDO_FILA);

    const linea = y + 5.5;
    let x = MARGEN;
    doc.font('Helvetica').fontSize(9).fillColor(GRIS)
      .text(String(i + 1), x, linea, { width: COL[0].ancho - 8, align: 'right', lineBreak: false });
    x += COL[0].ancho;

    // El numero va en negrita: es la columna que se coteja contra el
    // manifiesto y debe distinguirse de un vistazo.
    const guia = f.complemento
      ? `${f.numero_guia}  (comp. ${f.complemento})`
      : f.numero_guia;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TINTA)
      .text(imprimible(guia), x + 8, linea, { width: COL[1].ancho - 12, ellipsis: true, lineBreak: false });
    x += COL[1].ancho;

    doc.font('Helvetica').fontSize(9.5).fillColor(TINTA)
      .text(fmtHora.format(new Date(f.creado_en)), x + 8, linea, { width: COL[2].ancho - 12, lineBreak: false });
    x += COL[2].ancho;

    doc.font('Helvetica').fontSize(9).fillColor(f.operador ? TINTA : GRIS)
      .text(imprimible(f.operador || 'sin registrar'), x + 8, linea, { width: COL[3].ancho - 12, ellipsis: true, lineBreak: false });

    y += ALTO_FILA;
    doc.moveTo(MARGEN, y).lineTo(MARGEN + ANCHO, y).lineWidth(0.5).strokeColor(BORDE).stroke();
  }

  return y + 22;
}

function encabezadoTabla(doc, y) {
  doc.rect(MARGEN, y, ANCHO, 18).fill('#F0F3F6');
  let x = MARGEN;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(AZUL);
  for (const c of COL) {
    const opciones = { width: c.ancho - (c.alinear === 'right' ? 8 : 12), align: c.alinear, lineBreak: false };
    doc.text(c.titulo, x + (c.alinear === 'right' ? 0 : 8), y + 5.5, opciones);
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

module.exports = { salidasDelDia, generarPdfSalidas, nombreArchivo };
