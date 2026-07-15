const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('./db');

const AZUL = '#1d4ed8';
const GRIS = '#6b7280';

function logoPath() {
  const enUploads = path.join(UPLOADS_DIR, 'logo-tauro.jpg');
  if (fs.existsSync(enUploads)) return enUploads;
  const local = path.join(__dirname, 'assets', 'logo-tauro.jpg');
  if (fs.existsSync(local)) return local;
  return null;
}

function fechaMx(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ============ RESPONSIVA DE HERRAMIENTAS ============ */
const LINEA = '#d1d5db';
const ZEBRA = '#f8fafc';
const AZUL_SUAVE = '#eff6ff';

function responsiva(res, emp, tools, subtitulo) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 34, bottom: 46, left: 34, right: 34 },
    bufferPages: true
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="responsiva.pdf"');
  doc.pipe(res);

  /* ----- encabezado ----- */
  const logo = logoPath();
  if (logo) doc.image(logo, 34, 26, { width: 180 });
  doc.font('Helvetica').fontSize(9).fillColor(GRIS).text('GENERADO', 380, 32, { width: 198, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(fechaMx(), 380, 44, { width: 198, align: 'right' });

  /* ----- banner de título ----- */
  doc.rect(34, 92, 544, 64).fill(AZUL);
  doc.font('Helvetica-Bold').fontSize(19).fillColor('#fff')
    .text('RESPONSIVA DE HERRAMIENTAS', 34, 108, { width: 544, align: 'center' });
  doc.font('Helvetica').fontSize(9.5).fillColor('#bfdbfe')
    .text(subtitulo || 'Todas las herramientas asignadas al colaborador', 34, 132, { width: 544, align: 'center' });

  /* ----- cajas de información ----- */
  const caja = (x, y, w, h, titulo, valor) => {
    doc.roundedRect(x, y, w, h, 6).lineWidth(1).strokeColor(LINEA).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS).text(titulo, x + 14, y + 10);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(valor || '—', x + 14, y + 25, { width: w - 28, height: h - 30, ellipsis: true });
  };
  const totalPiezas = tools.reduce((s, t) => s + (t.cantidad || 1), 0);
  caja(34, 170, 302, 52, 'COLABORADOR', emp.nombre);
  caja(346, 170, 232, 52, 'DEPARTAMENTO', emp.departamento);
  caja(34, 232, 302, 46, 'EMPRESA', 'FLETES TAURO S.A. DE C.V.');
  caja(346, 232, 232, 46, 'TOTAL DE PIEZAS', String(totalPiezas));

  /* ----- texto legal ----- */
  doc.font('Helvetica').fontSize(9.5).fillColor('#111').text(
    'Por medio del presente, se hace constar que el colaborador reconoce haber recibido de ' +
    'FLETES TAURO S.A. DE C.V. las herramientas listadas a continuación para el cumplimiento de sus funciones laborales. ' +
    'El colaborador se compromete a hacer un uso adecuado, responsable y exclusivamente laboral de dichas herramientas, ' +
    'a conservarlas en buen estado evitando cualquier deterioro derivado de un manejo inadecuado o negligente, y a ' +
    'devolverlas en las condiciones en que fueron entregadas —considerando el desgaste natural por uso— cuando le sean ' +
    'requeridas o al término de la relación laboral.',
    34, 292, { align: 'justify', width: 544 }
  );

  /* ----- tabla de herramientas ----- */
  // columnas: # (30) | herramienta (250) | categoría (116) | cant (48) | fecha (100)
  const LIMITE = 686; // borde inferior útil para filas
  const encabezadoTabla = (y) => {
    doc.rect(34, y, 544, 24).fill(AZUL);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#fff');
    doc.text('No.', 34, y + 7, { width: 30, align: 'center' });
    doc.text('HERRAMIENTA', 72, y + 7, { width: 234 });
    doc.text('CATEGORÍA', 320, y + 7, { width: 104 });
    doc.text('CANT.', 430, y + 7, { width: 48, align: 'center' });
    doc.text('ASIGNADA EL', 478, y + 7, { width: 96, align: 'center' });
    return y + 24;
  };

  let y = encabezadoTabla(doc.y + 14);

  if (!tools.length) {
    doc.rect(34, y, 544, 26).fill(ZEBRA);
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(GRIS)
      .text('— Sin herramientas asignadas —', 34, y + 8, { width: 544, align: 'center' });
    y += 26;
  }

  tools.forEach((t, i) => {
    doc.font('Helvetica-Bold').fontSize(10);
    const hNom = doc.heightOfString(t.nombre || '', { width: 234 });
    doc.font('Helvetica').fontSize(9.5);
    const hCat = doc.heightOfString(t.categoria || '', { width: 104 });
    const alto = Math.max(22, Math.max(hNom, hCat) + 9);

    if (y + alto > LIMITE) {           // nueva página con su encabezado
      doc.addPage();
      y = encabezadoTabla(50);
    }

    if (i % 2 === 0) doc.rect(34, y, 544, alto).fill(ZEBRA);
    doc.font('Helvetica').fontSize(9.5).fillColor(GRIS)
      .text(String(i + 1), 34, y + 6, { width: 30, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
      .text(t.nombre || '', 72, y + 6, { width: 234 });
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151')
      .text(t.categoria || 'sin categoría', 320, y + 6, { width: 104 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
      .text(String(t.cantidad || 1), 430, y + 6, { width: 48, align: 'center' });
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151')
      .text(t.fecha || '', 478, y + 6, { width: 96, align: 'center' });
    y += alto;
  });

  if (tools.length) {                   // fila de total
    if (y + 24 > LIMITE) { doc.addPage(); y = 50; }
    doc.rect(34, y, 544, 24).fill(AZUL_SUAVE);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(AZUL);
    doc.text('TOTAL DE PIEZAS', 72, y + 7, { width: 340 });
    doc.text(String(totalPiezas), 430, y + 7, { width: 48, align: 'center' });
    y += 24;
  }
  doc.moveTo(34, y).lineTo(578, y).lineWidth(0.8).strokeColor(LINEA).stroke();

  /* ----- firmas ----- */
  if (y + 130 > 710) { doc.addPage(); y = 90; }
  const yFirma = Math.max(y + 76, 0);
  doc.font('Helvetica').fontSize(10).fillColor('#000');
  doc.moveTo(60, yFirma).lineTo(280, yFirma).lineWidth(1).strokeColor('#111').stroke();
  doc.moveTo(332, yFirma).lineTo(552, yFirma).strokeColor('#111').stroke();
  doc.font('Helvetica-Bold').fontSize(9.5)
    .text('ENTREGÓ', 60, yFirma + 7, { width: 220, align: 'center' });
  doc.text('RECIBÍ DE CONFORMIDAD', 332, yFirma + 7, { width: 220, align: 'center' });
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
    .text('Almacén · Fletes Tauro', 60, yFirma + 20, { width: 220, align: 'center' });
  doc.text(emp.nombre || 'Colaborador', 332, yFirma + 20, { width: 220, align: 'center' });

  /* ----- pie de página con numeración ----- */
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    const mb = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;      // evitar salto de página al escribir el pie
    doc.moveTo(34, 750).lineTo(578, 750).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
    doc.font('Helvetica').fontSize(8).fillColor(GRIS);
    doc.text('FLETES TAURO S.A. DE C.V. · Control de herramientas', 34, 757, { width: 320, lineBreak: false });
    doc.text(`Página ${i - rango.start + 1} de ${rango.count}`, 380, 757, { width: 198, align: 'right', lineBreak: false });
    doc.page.margins.bottom = mb;
  }

  doc.end();
}

/* ============ SALIDA DE ALMACÉN ============ */
function salidaAlmacen(res, s) {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 34, bottom: 46, left: 34, right: 34 } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(s.folio || 'salida').replace(/[^A-Za-z0-9_-]/g, '_')}.pdf"`);
  doc.pipe(res);

  /* ----- encabezado ----- */
  const logo = logoPath();
  if (logo) doc.image(logo, 34, 26, { width: 180 });
  doc.font('Helvetica').fontSize(9).fillColor(GRIS).text('GENERADO', 380, 32, { width: 198, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(fechaMx(), 380, 44, { width: 198, align: 'right' });

  /* ----- banner: título + folio ----- */
  doc.rect(34, 92, 544, 74).fill(AZUL);
  doc.font('Helvetica').fontSize(10).fillColor('#bfdbfe')
    .text('SALIDA DE ALMACÉN  ·  FOLIO', 34, 106, { width: 544, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(26).fillColor('#fff')
    .text(s.folio || '', 34, 124, { width: 544, align: 'center' });

  /* ----- cajas de información ----- */
  const caja = (x, y, w, h, titulo, valor) => {
    doc.roundedRect(x, y, w, h, 6).lineWidth(1).strokeColor(LINEA).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS).text(titulo, x + 14, y + 10);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(valor || '—', x + 14, y + 25, { width: w - 28, height: h - 30, ellipsis: true });
  };

  const [yy, mm, dd] = String(s.fecha || '').split('-');
  const registrada = yy
    ? `${dd}/${mm}/${yy} ${String(s.hora || '').slice(0, 5)}`.trim()
    : (s.created_at ? fechaMx(new Date(s.created_at)) : fechaMx());

  doc.font('Helvetica-Bold').fontSize(14).fillColor(AZUL).text('INFORMACIÓN GENERAL', 34, 186);
  caja(34, 212, 262, 52, 'RECIBE', s.nombre);
  caja(316, 212, 262, 52, 'PROVEEDOR', s.proveedor);
  caja(34, 274, 262, 52, 'FECHA Y HORA DE REGISTRO', registrada);
  caja(316, 274, 262, 52, 'DEPARTAMENTO QUE USARÁ LA HERRAMIENTA', s.departamento);

  /* ----- observaciones ----- */
  doc.font('Helvetica-Bold').fontSize(14).fillColor(AZUL).text('OBSERVACIONES / MATERIAL QUE SALE', 34, 356);
  doc.roundedRect(34, 380, 544, 230, 6).lineWidth(1).strokeColor(LINEA).stroke();
  doc.font('Helvetica').fontSize(11.5).fillColor('#000')
    .text(String(s.observaciones || ''), 52, 398, { width: 508, height: 196, align: 'left' });

  /* ----- firmas ----- */
  const yFirma = 668;
  doc.moveTo(60, yFirma).lineTo(280, yFirma).lineWidth(1).strokeColor('#111').stroke();
  doc.moveTo(332, yFirma).lineTo(552, yFirma).strokeColor('#111').stroke();
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000')
    .text('ENTREGÓ / AUTORIZÓ', 60, yFirma + 7, { width: 220, align: 'center' });
  doc.text('RECIBÍ DE CONFORMIDAD', 332, yFirma + 7, { width: 220, align: 'center' });
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
    .text('Almacén · Fletes Tauro', 60, yFirma + 20, { width: 220, align: 'center' });
  doc.text(s.nombre || 'Recibe', 332, yFirma + 20, { width: 220, align: 'center' });

  /* ----- pie de página ----- */
  doc.page.margins.bottom = 0; // evitar salto de página al escribir el pie
  doc.moveTo(34, 750).lineTo(578, 750).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
  doc.font('Helvetica').fontSize(8).fillColor(GRIS);
  doc.text('FLETES TAURO S.A. DE C.V. · Control de herramientas', 34, 757, { width: 320, lineBreak: false });
  doc.text(`Salida de almacén · ${s.folio || ''}`, 380, 757, { width: 198, align: 'right', lineBreak: false });

  doc.end();
}

module.exports = { responsiva, salidaAlmacen };
