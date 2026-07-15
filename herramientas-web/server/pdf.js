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

/* ============ SALIDA DE ALMACÉN (hoja de salida formal) ============ */
function salidaAlmacen(res, s) {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 34, bottom: 46, left: 34, right: 34 } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(s.folio || 'salida').replace(/[^A-Za-z0-9_-]/g, '_')}.pdf"`);
  doc.pipe(res);

  const NAVY = '#1e293b';
  const ROJO = '#dc2626';
  const BORDE = '#475569';
  const RENGLON = '#cbd5e1';

  /* ----- encabezado: logo + recuadro de folio ----- */
  const logo = logoPath();
  if (logo) doc.image(logo, 34, 28, { width: 168 });
  doc.font('Helvetica').fontSize(8).fillColor(GRIS).text('FLETES TAURO S.A. DE C.V.', 34, 66);

  doc.rect(430, 26, 148, 48).lineWidth(1.2).strokeColor(BORDE).stroke();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRIS)
    .text('FOLIO No.', 430, 34, { width: 148, align: 'center', characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(17).fillColor(ROJO)
    .text(s.folio || '—', 430, 47, { width: 148, align: 'center' });

  /* ----- banda de título ----- */
  doc.rect(34, 88, 544, 30).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#fff')
    .text('HOJA DE SALIDA DE ALMACÉN', 34, 97, { width: 544, align: 'center', characterSpacing: 2 });

  /* ----- cuadrícula de datos ----- */
  const celda = (x, y, w, h, titulo, valor) => {
    doc.rect(x, y, w, h).lineWidth(0.8).strokeColor(BORDE).stroke();
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(GRIS).text(titulo, x + 8, y + 6, { characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
      .text(valor || '', x + 8, y + 17, { width: w - 16, height: h - 20, ellipsis: true });
  };

  const [yy, mm, dd] = String(s.fecha || '').split('-');
  const fecha = yy ? `${dd} / ${mm} / ${yy}` : '';
  const hora = String(s.hora || '').slice(0, 5);

  celda(34, 118, 128, 38, 'FECHA DE SALIDA', fecha);
  celda(162, 118, 88, 38, 'HORA', hora);
  celda(250, 118, 328, 38, 'RECIBE (NOMBRE)', s.nombre);
  celda(34, 156, 244, 38, 'PROVEEDOR', s.proveedor);
  celda(278, 156, 300, 38, 'DEPARTAMENTO QUE USARÁ LA HERRAMIENTA', s.departamento);

  /* ----- descripción del material (área con renglones) ----- */
  doc.rect(34, 206, 544, 22).fillAndStroke('#e2e8f0', BORDE);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY)
    .text('DESCRIPCIÓN DEL MATERIAL / HERRAMIENTA QUE SALE', 34, 212, { width: 544, align: 'center', characterSpacing: 1 });

  const yCuerpo = 228;
  const renglones = 14;         // renglones de 24pt, como formato impreso
  const altoCuerpo = renglones * 24 + 10;
  doc.rect(34, yCuerpo, 544, altoCuerpo).lineWidth(0.8).strokeColor(BORDE).stroke();
  for (let i = 0; i < renglones; i++) {
    const ry = yCuerpo + 23 + i * 24;
    doc.moveTo(46, ry).lineTo(566, ry).lineWidth(0.5).strokeColor(RENGLON).stroke();
  }
  doc.font('Helvetica').fontSize(11).fillColor('#000')
    .text(String(s.observaciones || ''), 46, yCuerpo + 12, { width: 520, height: renglones * 24 - 12, lineGap: 11.4, ellipsis: true });

  /* ----- nota ----- */
  const yNota = yCuerpo + altoCuerpo + 10;
  doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(GRIS)
    .text('Este documento ampara la salida del material arriba descrito. Consérvese para cualquier aclaración.', 34, yNota, { width: 544, align: 'center' });

  /* ----- franja de firmas ----- */
  const yFirmas = 632, hFirmas = 74;
  const firma = (x, w, titulo, sub) => {
    doc.rect(x, yFirmas, w, hFirmas).lineWidth(0.8).strokeColor(BORDE).stroke();
    doc.moveTo(x + 18, yFirmas + 44).lineTo(x + w - 18, yFirmas + 44).lineWidth(0.8).strokeColor('#111').stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(titulo, x, yFirmas + 50, { width: w, align: 'center', characterSpacing: 0.5 });
    doc.font('Helvetica').fontSize(7.2).fillColor(GRIS).text(sub || '', x + 6, yFirmas + 61, { width: w - 12, align: 'center', height: 9, ellipsis: true });
  };
  firma(34, 181, 'ENTREGÓ', 'Almacén');
  firma(215, 181, 'AUTORIZÓ', 'Jefe de área');
  firma(396, 182, 'RECIBIÓ', s.nombre || 'Nombre y firma');

  /* ----- pie de página ----- */
  doc.page.margins.bottom = 0; // evitar salto de página al escribir el pie
  doc.moveTo(34, 748).lineTo(578, 748).lineWidth(0.5).strokeColor('#94a3b8').stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(GRIS);
  doc.text('FLETES TAURO S.A. DE C.V. · Control de herramientas y almacén', 34, 755, { width: 340, lineBreak: false });
  doc.text(`Generado el ${fechaMx()} · Folio ${s.folio || ''}`, 300, 755, { width: 278, align: 'right', lineBreak: false });

  doc.end();
}

module.exports = { responsiva, salidaAlmacen };
