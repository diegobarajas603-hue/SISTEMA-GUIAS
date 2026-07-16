const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR, ahoraMx } = require('./db');

const AZUL = '#1d4ed8';
const GRIS = '#6b7280';

function logoPath() {
  const enUploads = path.join(UPLOADS_DIR, 'logo-tauro.jpg');
  if (fs.existsSync(enUploads)) return enUploads;
  const local = path.join(__dirname, 'assets', 'logo-tauro.jpg');
  if (fs.existsSync(local)) return local;
  return null;
}

// siempre en hora de México, sin importar la zona horaria del servidor
function fechaMx(d = new Date()) {
  return ahoraMx(d).bonita;
}

/* ---------- paleta de los documentos ---------- */
const NAVY = '#1e293b';
const ROJO = '#dc2626';
const BORDE = '#475569';
const RENGLON = '#cbd5e1';

/* ============ RESPONSIVA DE HERRAMIENTAS ============ */

function responsiva(res, emp, tools, subtitulo) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 34, bottom: 46, left: 34, right: 34 },
    bufferPages: true
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="responsiva.pdf"');
  doc.pipe(res);

  const totalPiezas = tools.reduce((s, t) => s + (t.cantidad || 1), 0);

  /* ----- encabezado: logo + recuadro de fecha ----- */
  const logo = logoPath();
  if (logo) doc.image(logo, 34, 28, { width: 168 });
  doc.font('Helvetica').fontSize(8).fillColor(GRIS).text('FLETES TAURO S.A. DE C.V.', 34, 66);

  doc.rect(430, 26, 148, 48).lineWidth(1.2).strokeColor(BORDE).stroke();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRIS)
    .text('FECHA DE EMISIÓN', 430, 34, { width: 148, align: 'center', characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000')
    .text(fechaMx(), 430, 49, { width: 148, align: 'center' });

  /* ----- banda de título ----- */
  doc.rect(34, 88, 544, 30).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#fff')
    .text('RESPONSIVA DE HERRAMIENTAS', 34, 97, { width: 544, align: 'center', characterSpacing: 2 });
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
    .text(subtitulo || 'Todas las herramientas asignadas al colaborador', 34, 124, { width: 544, align: 'center' });

  /* ----- cuadrícula de datos ----- */
  const celda = (x, y, w, h, titulo, valor) => {
    doc.rect(x, y, w, h).lineWidth(0.8).strokeColor(BORDE).stroke();
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(GRIS).text(titulo, x + 8, y + 6, { characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
      .text(valor || '', x + 8, y + 17, { width: w - 16, height: h - 20, ellipsis: true });
  };
  celda(34, 140, 300, 38, 'COLABORADOR', emp.nombre);
  celda(334, 140, 156, 38, 'DEPARTAMENTO', emp.departamento);
  celda(490, 140, 88, 38, 'TOTAL DE PIEZAS', String(totalPiezas));

  /* ----- texto legal ----- */
  doc.font('Helvetica').fontSize(8.8).fillColor('#111').text(
    'Por medio del presente, se hace constar que el colaborador reconoce haber recibido de ' +
    'FLETES TAURO S.A. DE C.V. las herramientas listadas a continuación para el cumplimiento de sus funciones laborales. ' +
    'El colaborador se compromete a hacer un uso adecuado, responsable y exclusivamente laboral de dichas herramientas, ' +
    'a conservarlas en buen estado evitando cualquier deterioro derivado de un manejo inadecuado o negligente, y a ' +
    'devolverlas en las condiciones en que fueron entregadas —considerando el desgaste natural por uso— cuando le sean ' +
    'requeridas o al término de la relación laboral.',
    34, 190, { align: 'justify', width: 544 }
  );

  /* ----- tabla de herramientas (cuadrícula formal) ----- */
  // columnas: # (30) | herramienta (250) | categoría (116) | cant (48) | fecha (100)
  const COLX = [34, 64, 314, 430, 478, 578];
  const LIMITE = 688;
  let segTop; // inicio del segmento de tabla en la página actual

  const encabezadoTabla = (y) => {
    segTop = y;
    doc.rect(34, y, 544, 22).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#fff');
    doc.text('No.', 34, y + 7, { width: 30, align: 'center' });
    doc.text('HERRAMIENTA', 72, y + 7, { width: 234 });
    doc.text('CATEGORÍA', 320, y + 7, { width: 104 });
    doc.text('CANT.', 430, y + 7, { width: 48, align: 'center' });
    doc.text('ASIGNADA EL', 478, y + 7, { width: 96, align: 'center' });
    return y + 22;
  };
  const cerrarTabla = (yFin) => {
    for (let i = 1; i < COLX.length - 1; i++) {
      doc.moveTo(COLX[i], segTop + 22).lineTo(COLX[i], yFin).lineWidth(0.5).strokeColor(BORDE).stroke();
    }
    doc.rect(34, segTop, 544, yFin - segTop).lineWidth(0.8).strokeColor(BORDE).stroke();
  };

  let y = encabezadoTabla(doc.y + 12);

  if (!tools.length) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(GRIS)
      .text('— Sin herramientas asignadas —', 34, y + 8, { width: 544, align: 'center' });
    y += 26;
  }

  tools.forEach((t, i) => {
    doc.font('Helvetica-Bold').fontSize(9.5);
    const hNom = doc.heightOfString(t.nombre || '', { width: 234 });
    doc.font('Helvetica').fontSize(9);
    const hCat = doc.heightOfString(t.categoria || '', { width: 104 });
    const alto = Math.max(21, Math.max(hNom, hCat) + 8);

    if (y + alto > LIMITE) {            // nueva página con su encabezado
      cerrarTabla(y);
      doc.addPage();
      y = encabezadoTabla(50);
    }

    doc.font('Helvetica').fontSize(9).fillColor(GRIS)
      .text(String(i + 1), 34, y + 6, { width: 30, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000')
      .text(t.nombre || '', 72, y + 6, { width: 234 });
    doc.font('Helvetica').fontSize(9).fillColor('#374151')
      .text(t.categoria || 'sin categoría', 320, y + 6, { width: 104 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000')
      .text(String(t.cantidad || 1), 430, y + 6, { width: 48, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#374151')
      .text(t.fecha || '', 478, y + 6, { width: 96, align: 'center' });
    y += alto;
    doc.moveTo(34, y).lineTo(578, y).lineWidth(0.5).strokeColor(RENGLON).stroke();
  });

  if (tools.length) {                    // fila de total
    if (y + 22 > LIMITE) { cerrarTabla(y); doc.addPage(); y = encabezadoTabla(50); }
    doc.rect(34, y, 544, 22).fill('#e2e8f0');
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY);
    doc.text('TOTAL DE PIEZAS', 72, y + 6, { width: 340 });
    doc.text(String(totalPiezas), 430, y + 6, { width: 48, align: 'center' });
    y += 22;
  }
  cerrarTabla(y);

  /* ----- firma del colaborador (centrada) ----- */
  if (y + 110 > 730) { doc.addPage(); y = 62; }
  const yFirmas = y + 28, hFirmas = 74;
  const xF = 156, wF = 300;
  doc.rect(xF, yFirmas, wF, hFirmas).lineWidth(0.8).strokeColor(BORDE).stroke();
  doc.moveTo(xF + 30, yFirmas + 44).lineTo(xF + wF - 30, yFirmas + 44).lineWidth(0.8).strokeColor('#111').stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000')
    .text('RECIBÍ DE CONFORMIDAD', xF, yFirmas + 50, { width: wF, align: 'center', characterSpacing: 0.5 });
  doc.font('Helvetica').fontSize(7.2).fillColor(GRIS)
    .text(emp.nombre || 'Nombre y firma del colaborador', xF + 6, yFirmas + 61, { width: wF - 12, align: 'center', height: 9, ellipsis: true });

  /* ----- pie de página con numeración ----- */
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    const mb = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;      // evitar salto de página al escribir el pie
    doc.moveTo(34, 748).lineTo(578, 748).lineWidth(0.5).strokeColor('#94a3b8').stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(GRIS);
    doc.text('FLETES TAURO S.A. DE C.V. · Control de herramientas y almacén', 34, 755, { width: 340, lineBreak: false });
    doc.text(`Generado el ${fechaMx()} · Página ${i - rango.start + 1} de ${rango.count}`, 280, 755, { width: 298, align: 'right', lineBreak: false });
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
  celda(34, 156, 544, 38, 'DEPARTAMENTO QUE USARÁ LA HERRAMIENTA', s.departamento);

  // sección con renglones, como formato impreso
  const seccion = (yBanda, titulo, renglones, texto) => {
    doc.rect(34, yBanda, 544, 22).fillAndStroke('#e2e8f0', BORDE);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY)
      .text(titulo, 34, yBanda + 6, { width: 544, align: 'center', characterSpacing: 1 });
    const yCuerpo = yBanda + 22;
    const alto = renglones * 24 + 10;
    doc.rect(34, yCuerpo, 544, alto).lineWidth(0.8).strokeColor(BORDE).stroke();
    for (let i = 0; i < renglones; i++) {
      const ry = yCuerpo + 23 + i * 24;
      doc.moveTo(46, ry).lineTo(566, ry).lineWidth(0.5).strokeColor(RENGLON).stroke();
    }
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(String(texto || ''), 46, yCuerpo + 12, { width: 520, height: renglones * 24 - 12, lineGap: 11.4, ellipsis: true });
    return yCuerpo + alto;
  };

  /* ----- trabajo específico en el que se usará ----- */
  const finTrabajo = seccion(204, 'TRABAJO ESPECÍFICO EN EL QUE SE UTILIZARÁ', 3, s.trabajo);

  /* ----- descripción del material ----- */
  const finDesc = seccion(finTrabajo + 12, 'DESCRIPCIÓN DEL MATERIAL / HERRAMIENTA QUE SALE', 9, s.observaciones);

  /* ----- nota ----- */
  doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(GRIS)
    .text('Este documento ampara la salida del material arriba descrito para el trabajo indicado. Consérvese para cualquier aclaración.',
      34, finDesc + 10, { width: 544, align: 'center' });

  /* ----- franja de firmas ----- */
  const yFirmas = 640, hFirmas = 74;
  const firma = (x, w, titulo, sub) => {
    doc.rect(x, yFirmas, w, hFirmas).lineWidth(0.8).strokeColor(BORDE).stroke();
    doc.moveTo(x + 24, yFirmas + 44).lineTo(x + w - 24, yFirmas + 44).lineWidth(0.8).strokeColor('#111').stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text(titulo, x, yFirmas + 50, { width: w, align: 'center', characterSpacing: 0.5 });
    doc.font('Helvetica').fontSize(7.2).fillColor(GRIS).text(sub || '', x + 6, yFirmas + 61, { width: w - 12, align: 'center', height: 9, ellipsis: true });
  };
  firma(34, 272, 'ENTREGÓ', 'Almacén · Fletes Tauro');
  firma(306, 272, 'RECIBIÓ', s.nombre || 'Nombre y firma');

  /* ----- pie de página ----- */
  doc.page.margins.bottom = 0; // evitar salto de página al escribir el pie
  doc.moveTo(34, 748).lineTo(578, 748).lineWidth(0.5).strokeColor('#94a3b8').stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(GRIS);
  doc.text('FLETES TAURO S.A. DE C.V. · Control de herramientas y almacén', 34, 755, { width: 340, lineBreak: false });
  doc.text(`Generado el ${fechaMx()} · Folio ${s.folio || ''}`, 300, 755, { width: 278, align: 'right', lineBreak: false });

  doc.end();
}

module.exports = { responsiva, salidaAlmacen };
