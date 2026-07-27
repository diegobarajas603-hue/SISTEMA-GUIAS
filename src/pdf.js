'use strict';
// Genera el PDF de una cotizacion con el logotipo de Fletes Tauro:
// encabezado con folio, datos del cliente y del servicio, desglose de
// importes con IVA y retencion, importe con letra, vigencia y condiciones.

const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { dinero, importeConLetra, fechaCorta, fechaLarga, num } = require('./util');

const LOGO = path.join(__dirname, '..', 'public', 'logo-tauro.png');

const ROJO = '#d92027';
const NEGRO = '#141414';
const GRIS = '#5a5a5a';
const GRIS_CLARO = '#f2f2f2';
const LINEA = '#d8d8d8';

const TIPOS_SERVICIO = { sencillo: 'Viaje sencillo', redondo: 'Viaje redondo', dedicado: 'Servicio dedicado' };

// datos: cotizacion + empresa/contacto/vendedor + configuracion de la empresa
function generarPdfCotizacion(datos) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 36, bottom: 60, left: 40, right: 40 } });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const X = 40;                 // margen izquierdo
    const ANCHO = 532;            // ancho util (carta 612 - margenes)
    const DER = X + ANCHO;        // borde derecho

    const dibujarPie = () => {
      const margenAnterior = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - 46;
      doc.rect(0, y, doc.page.width, 4).fill(ROJO);
      doc.rect(0, y + 4, doc.page.width, 42).fill(NEGRO);
      const contacto = [datos.cfg.empresa_telefono, datos.cfg.empresa_email, datos.cfg.empresa_web]
        .filter(Boolean).join('   |   ');
      doc.fillColor('#ffffff').font('Helvetica').fontSize(8)
        .text(contacto || datos.cfg.empresa_nombre, X, y + 13, { width: ANCHO, align: 'center' });
      doc.fillColor('#bbbbbb').fontSize(7)
        .text(datos.cfg.pdf_leyenda || '', X, y + 25, { width: ANCHO, align: 'center' });
      doc.page.margins.bottom = margenAnterior;
      doc.fillColor(NEGRO);
    };
    dibujarPie();
    doc.on('pageAdded', () => {
      const { x, y } = doc;
      dibujarPie();
      doc.x = x;
      doc.y = doc.page.margins.top;
    });

    // ---------- Encabezado ----------
    if (fs.existsSync(LOGO)) doc.image(LOGO, X, 40, { width: 175 });
    const infoEmpresa = [
      datos.cfg.empresa_razon,
      datos.cfg.empresa_rfc ? `RFC: ${datos.cfg.empresa_rfc}` : '',
      datos.cfg.empresa_direccion,
      [datos.cfg.empresa_telefono ? `Tel. ${datos.cfg.empresa_telefono}` : '', datos.cfg.empresa_email].filter(Boolean).join('   '),
    ].filter(Boolean);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NEGRO)
      .text(datos.cfg.empresa_nombre || 'FLETES TAURO', X + 240, 42, { width: ANCHO - 240, align: 'right' });
    doc.font('Helvetica').fontSize(7.5).fillColor(GRIS);
    let yInfo = 56;
    for (const linea of infoEmpresa) {
      doc.text(linea, X + 200, yInfo, { width: ANCHO - 200, align: 'right' });
      yInfo += 10;
    }

    // Banda de titulo
    let y = 96;
    doc.rect(X, y, ANCHO, 26).fill(NEGRO);
    doc.rect(X, y, 6, 26).fill(ROJO);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12)
      .text('COTIZACION DE SERVICIO DE TRANSPORTE', X + 16, y + 7);
    doc.fontSize(11).text(datos.folio, X, y + 7, { width: ANCHO - 12, align: 'right' });
    y += 34;

    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
      .text(`Fecha de emision: ${fechaLarga(datos.fecha_emision)}`, X, y);
    doc.text(`Vigente hasta: ${fechaCorta(datos.vigente_hasta)}`, X, y, { width: ANCHO, align: 'right' });
    y += 20;

    // ---------- Cajas de cliente y servicio ----------
    const clienteFilas = [
      ['Cliente', datos.empresa_nombre],
      ['RFC', datos.empresa_rfc || '-'],
      ['Atencion', datos.contacto_nombre || '-'],
      ['Telefono', datos.contacto_telefono || datos.empresa_telefono || '-'],
      ['Correo', datos.contacto_email || datos.empresa_email || '-'],
      ['Ciudad', [datos.empresa_ciudad, datos.empresa_estado].filter(Boolean).join(', ') || '-'],
    ];
    const servicioFilas = [
      ['Origen', datos.origen],
      ['Destino', datos.destino],
      ['Tipo de servicio', TIPOS_SERVICIO[datos.tipo_servicio] || datos.tipo_servicio],
      ['Tipo de unidad', datos.unidad_texto || '-'],
      ['Mercancia', datos.mercancia || '-'],
      ['Peso estimado', datos.peso_kg ? `${Number(datos.peso_kg).toLocaleString('en-US')} kg` : '-'],
    ];

    const anchoCaja = (ANCHO - 16) / 2;
    const altoCaja = 20 + clienteFilas.length * 14 + 6;
    const dibujarCaja = (x0, titulo, filas) => {
      doc.rect(x0, y, anchoCaja, altoCaja).fill(GRIS_CLARO);
      doc.rect(x0, y, anchoCaja, 16).fill(NEGRO);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text(titulo, x0 + 8, y + 4.5);
      let yf = y + 22;
      for (const [etiqueta, valor] of filas) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS).text(etiqueta.toUpperCase(), x0 + 8, yf, { width: 88 });
        doc.font('Helvetica').fontSize(8.5).fillColor(NEGRO)
          .text(String(valor || '-'), x0 + 98, yf, { width: anchoCaja - 106, height: 12, ellipsis: true });
        yf += 14;
      }
    };
    dibujarCaja(X, 'DATOS DEL CLIENTE', clienteFilas);
    dibujarCaja(X + anchoCaja + 16, 'DATOS DEL SERVICIO', servicioFilas);
    y += altoCaja + 16;

    // ---------- Tabla de conceptos ----------
    const conceptos = [
      [`Flete ${datos.origen} - ${datos.destino}  (${datos.unidad_texto || 'unidad por definir'})`, datos.tarifa],
    ];
    if (num(datos.maniobras) > 0) conceptos.push(['Maniobras de carga y descarga', datos.maniobras]);
    if (num(datos.seguro) > 0) conceptos.push(['Seguro de mercancia', datos.seguro]);
    if (num(datos.otros) > 0) conceptos.push([datos.otros_desc || 'Otros cargos', datos.otros]);

    const colImporte = DER - 110;
    doc.rect(X, y, ANCHO, 18).fill(NEGRO);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
    doc.text('CONCEPTO', X + 8, y + 5);
    doc.text('IMPORTE', colImporte, y + 5, { width: 102, align: 'right' });
    y += 18;
    doc.font('Helvetica').fontSize(9);
    for (let i = 0; i < conceptos.length; i++) {
      const [texto, importe] = conceptos[i];
      if (i % 2 === 1) doc.rect(X, y, ANCHO, 17).fill(GRIS_CLARO);
      doc.fillColor(NEGRO).text(String(texto), X + 8, y + 4.5, { width: colImporte - X - 16, height: 11, ellipsis: true });
      doc.text(dinero(importe, datos.moneda), colImporte, y + 4.5, { width: 102, align: 'right' });
      y += 17;
    }
    doc.moveTo(X, y).lineTo(DER, y).lineWidth(0.7).strokeColor(LINEA).stroke();
    y += 8;

    // ---------- Totales e importe con letra ----------
    const anchoTotales = 220;
    const xTotales = DER - anchoTotales;
    const filaTotal = (etiqueta, valor, opciones = {}) => {
      const alto = opciones.destacada ? 22 : 15;
      if (opciones.destacada) {
        doc.rect(xTotales, y, anchoTotales, alto).fill(NEGRO);
        doc.rect(xTotales, y, 5, alto).fill(ROJO);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10.5);
        doc.text(etiqueta, xTotales + 12, y + 6);
        doc.text(valor, xTotales, y + 6, { width: anchoTotales - 10, align: 'right' });
      } else {
        doc.fillColor(GRIS).font('Helvetica').fontSize(9).text(etiqueta, xTotales + 12, y + 2);
        doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(9)
          .text(valor, xTotales, y + 2, { width: anchoTotales - 10, align: 'right' });
      }
      y += alto;
    };
    const yLetra = y;
    filaTotal('Subtotal', dinero(datos.subtotal, datos.moneda));
    filaTotal(`IVA (${num(datos.iva_pct)}%)`, dinero(datos.iva, datos.moneda));
    if (num(datos.ret_pct) > 0) {
      filaTotal(`Retencion IVA (${num(datos.ret_pct)}%)`, `- ${dinero(datos.retencion, datos.moneda)}`);
    }
    y += 3;
    filaTotal(`TOTAL ${datos.moneda}`, dinero(datos.total, datos.moneda), { destacada: true });

    doc.font('Helvetica-Oblique').fontSize(8).fillColor(GRIS)
      .text(`Importe con letra: ${importeConLetra(datos.total, datos.moneda)}`,
        X, yLetra + 2, { width: ANCHO - anchoTotales - 20 });
    y += 14;

    // ---------- Vigencia y condiciones ----------
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NEGRO)
      .text(`Vigencia: esta cotizacion es valida por ${datos.vigencia_dias} dias naturales, hasta el ${fechaCorta(datos.vigente_hasta)}.`, X, y, { width: ANCHO });
    y = doc.y + 10;

    const condiciones = String(datos.condiciones || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (condiciones.length) {
      doc.rect(X, y, ANCHO, 15).fill(GRIS_CLARO);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(NEGRO).text('CONDICIONES DEL SERVICIO', X + 8, y + 4);
      y += 20;
      doc.font('Helvetica').fontSize(7.5).fillColor(GRIS);
      doc.x = X;
      doc.y = y;
      for (const linea of condiciones) {
        doc.text(`-  ${linea}`, X, doc.y, { width: ANCHO, lineGap: 1.5 });
        doc.y += 2;
      }
      y = doc.y + 8;
    }

    // ---------- Firma del vendedor ----------
    if (y > doc.page.height - 150) { doc.addPage(); y = doc.page.margins.top; }
    doc.moveTo(X, y).lineTo(DER, y).lineWidth(0.7).strokeColor(LINEA).stroke();
    y += 10;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(ROJO).text('ATENTAMENTE', X, y);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NEGRO).text(datos.vendedor_nombre || '', X, y + 12);
    const lineaVendedor = ['Ejecutivo comercial', datos.vendedor_telefono ? `Tel. ${datos.vendedor_telefono}` : '', datos.vendedor_email]
      .filter(Boolean).join('   |   ');
    doc.font('Helvetica').fontSize(8).fillColor(GRIS).text(lineaVendedor, X, y + 26);
    doc.fontSize(7.5).fillColor(GRIS)
      .text('Para confirmar el servicio, responda a este correo o mensaje indicando el folio de la cotizacion.', X, y + 40);

    doc.end();
  });
}

module.exports = { generarPdfCotizacion };
