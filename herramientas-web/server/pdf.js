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
function responsiva(res, emp, tools, subtitulo) {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 45, bottom: 60, left: 56, right: 56 } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="responsiva.pdf"');
  doc.pipe(res);

  const logo = logoPath();
  if (logo) doc.image(logo, 42, 18, { width: 170 });
  doc.moveTo(42, 62).lineTo(570, 62).lineWidth(2).strokeColor('#111').stroke();

  doc.y = 80;
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#000')
    .text('RESPONSIVA HERRAMIENTAS', { align: 'center' });

  if (subtitulo) {
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(subtitulo, { align: 'center' });
  }

  doc.moveDown(1.2);
  const yDatos = doc.y;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('Nombre:', 56, yDatos);
  doc.font('Helvetica').text(emp.nombre || '', 56, yDatos + 15, { width: 240 });
  doc.font('Helvetica-Bold').text('Departamento:', 320, yDatos);
  doc.font('Helvetica').text(emp.departamento || '', 320, yDatos + 15, { width: 230 });

  doc.y = yDatos + 50;
  doc.x = 56;
  doc.font('Helvetica').fontSize(11).fillColor('#000').text(
    'Por medio del presente, se hace constar que el colaborador reconoce haber recibido de ' +
    'FLETES TAURO S.A. DE C.V. las herramientas asignadas para el cumplimiento de sus funciones laborales.\n\n' +
    'El colaborador se compromete a hacer un uso adecuado, responsable y exclusivamente laboral de dichas ' +
    'herramientas, así como a conservarlas en buen estado, evitando cualquier deterioro derivado de un manejo ' +
    'inadecuado, negligente o distinto a su finalidad.\n\n' +
    'De igual forma, se compromete a realizar la devolución de las herramientas en las condiciones en que fueron ' +
    'entregadas, considerando el desgaste natural por uso, cuando le sean requeridas o al término de la relación laboral.',
    { align: 'justify', width: 500 }
  );

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(12).text('HERRAMIENTAS');
  doc.moveDown(0.5);

  const mitad = Math.ceil(tools.length / 2);
  const col1 = tools.slice(0, mitad);
  const col2 = tools.slice(mitad);
  const yLista = doc.y;
  doc.font('Helvetica').fontSize(11);
  let y1 = yLista;
  for (const t of col1) {
    const etq = t.cantidad > 1 ? `${t.nombre} (x${t.cantidad})` : t.nombre;
    doc.text(`•  ${etq}`, 66, y1, { width: 230 });
    y1 = doc.y + 4;
  }
  let y2 = yLista;
  for (const t of col2) {
    const etq = t.cantidad > 1 ? `${t.nombre} (x${t.cantidad})` : t.nombre;
    doc.text(`•  ${etq}`, 330, y2, { width: 230 });
    y2 = doc.y + 4;
  }
  if (!tools.length) {
    doc.fillColor(GRIS).text('— Sin herramientas asignadas —', 66, yLista);
  }

  // firma siempre al fondo de la página
  doc.font('Helvetica').fontSize(11).fillColor('#000');
  doc.text('_____________________________________', 56, 660, { width: 500, align: 'center' });
  doc.fontSize(10).text('Firma del empleado', 56, 678, { width: 500, align: 'center' });

  doc.end();
}

/* ============ SALIDA DE ALMACÉN ============ */
function salidaAlmacen(res, s) {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 34, bottom: 42, left: 34, right: 34 } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${(s.folio || 'salida').replace(/[^A-Za-z0-9_-]/g, '_')}.pdf"`);
  doc.pipe(res);

  const logo = logoPath();
  if (logo) doc.image(logo, 34, 26, { width: 180 });
  doc.font('Helvetica').fontSize(9).fillColor(GRIS).text('GENERADO', 380, 32, { width: 198, align: 'right' });
  const gen = s.created_at ? fechaMx(new Date(s.created_at)) : fechaMx();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(gen, 380, 44, { width: 198, align: 'right' });

  // banner de folio
  doc.rect(34, 92, 544, 74).fill(AZUL);
  doc.font('Helvetica').fontSize(10).fillColor('#fff').text('F O L I O', 34, 108, { width: 544, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(26).text(s.folio || '', 34, 126, { width: 544, align: 'center' });

  doc.font('Helvetica-Bold').fontSize(14).fillColor(AZUL).text('INFORMACIÓN GENERAL', 34, 196);

  const caja = (x, y, w, h, titulo, valor) => {
    doc.roundedRect(x, y, w, h, 6).lineWidth(1).strokeColor('#d1d5db').stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS).text(titulo, x + 14, y + 12);
    doc.font('Helvetica-Bold').fontSize(12.5).fillColor('#000').text(valor || '', x + 14, y + 28, { width: w - 28 });
  };
  caja(34, 222, 262, 62, 'NOMBRE', s.nombre);
  caja(316, 222, 262, 62, 'PROVEEDOR', s.proveedor);
  caja(34, 294, 544, 50, 'DEPARTAMENTO QUE LO USARÁ', s.departamento_nombre || '—');

  let y = 364;
  if (s.descripcion) {
    doc.font('Helvetica-Bold').fontSize(14).fillColor(AZUL).text('DESCRIPCIÓN', 34, y);
    doc.roundedRect(34, y + 24, 544, 88, 6).lineWidth(1).strokeColor('#d1d5db').stroke();
    doc.font('Helvetica').fontSize(11.5).fillColor('#000')
      .text(String(s.descripcion), 52, y + 40, { width: 508, height: 62, align: 'left' });
    y += 130;
  }

  doc.font('Helvetica-Bold').fontSize(14).fillColor(AZUL).text('OBSERVACIONES', 34, y);
  const obsAlto = s.descripcion ? 104 : 214;
  doc.roundedRect(34, y + 24, 544, obsAlto, 6).lineWidth(1).strokeColor('#d1d5db').stroke();
  doc.font('Helvetica').fontSize(11.5).fillColor('#000')
    .text(String(s.observaciones || ''), 52, y + 40, { width: 508, height: obsAlto - 30, align: 'left' });

  doc.font('Helvetica').fontSize(11).fillColor('#000');
  doc.text('_____________________________________', 34, 640, { width: 544, align: 'center' });
  doc.fontSize(10).fillColor(GRIS).text('Firma y autorización', 34, 658, { width: 544, align: 'center' });

  doc.end();
}

module.exports = { responsiva, salidaAlmacen };
