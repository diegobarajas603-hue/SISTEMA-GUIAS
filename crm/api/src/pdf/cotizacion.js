import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { CONDICIONES } from '../servicios/cotizaciones.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const LOGO = resolve(aqui, 'activos', 'logo-tauro.png');

/** Colores de la marca, tomados del logotipo. */
const NEGRO = '#0A0A0A';
const ROJO = '#C21112';
const TINTA = '#1C1C1E';
const GRIS = '#6B6F76';
const GRIS_CLARO = '#EEEFF2';
const FONDO = '#F7F8FA';

// Carta con márgenes de 42 pt: cabe cómodo en cualquier impresora.
const MARGEN = 42;
const ANCHO_UTIL = 612 - MARGEN * 2;

const pesos = (centavos) =>
  (Number(centavos ?? 0) / 100).toLocaleString('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
  });

const kg = (n) => `${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const metros = (n) => `${Number(n ?? 0).toFixed(2)} m`;
const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

/**
 * Cotización de flete en PDF, lista para enviarse al cliente sin editar nada.
 *
 * Se dibuja con pdfkit en lugar de convertir HTML porque el contenedor de
 * producción no lleva navegador: un pipeline con Chrome headless costaría cientos
 * de megas y un punto de fallo más, para el mismo resultado.
 *
 * Devuelve un `Readable` que se puede canalizar directo a la respuesta HTTP.
 */
export function generarCotizacionPDF(cot) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
    info: {
      Title: `Cotización ${cot.folio} · Fletes Tauro`,
      Author: 'Fletes Tauro',
      Subject: `Flete ${cot.origen ?? ''} → ${cot.destino ?? ''}`.trim(),
    },
    bufferPages: true,
  });

  encabezado(doc, cot);
  datosCliente(doc, cot);
  datosEnvio(doc, cot);
  tablaMercancia(doc, cot);
  resumen(doc, cot);
  observaciones(doc, cot);
  condiciones(doc, cot);
  pieDePagina(doc, cot);

  doc.end();
  return doc;
}

// ---------------------------------------------------------------------------

function encabezado(doc, cot) {
  const y = MARGEN;

  if (existsSync(LOGO)) {
    doc.image(LOGO, MARGEN, y - 4, { fit: [132, 90], align: 'left' });
  } else {
    doc.font('Helvetica-Bold').fontSize(20).fillColor(NEGRO).text('FLETES', MARGEN, y + 14, { continued: true })
      .fillColor(ROJO).text(' TAURO');
  }

  // 232 pt y 15 pt de cuerpo: «COTIZACIÓN DE FLETE» entra en una sola línea.
  // Con la caja más estrecha el título se partía y caía encima del folio.
  const anchoCaja = 232;
  const x = 612 - MARGEN - anchoCaja;

  doc.font('Helvetica-Bold').fontSize(15).fillColor(NEGRO)
    .text('COTIZACIÓN DE FLETE', x, y + 8, { width: anchoCaja, align: 'right', characterSpacing: -0.2 });

  doc.moveTo(x + anchoCaja - 80, y + 28).lineTo(x + anchoCaja, y + 28)
    .lineWidth(2.5).strokeColor(ROJO).stroke();

  // Etiqueta y valor en dos columnas: el valor necesita sitio para una fecha
  // larga como «30 de agosto de 2026», que antes se partía en dos renglones.
  const anchoEtiqueta = 66;
  const anchoValor = anchoCaja - anchoEtiqueta - 8;
  let fy = y + 40;

  for (const [etiqueta, valor] of [
    ['Folio', cot.folio],
    ['Fecha', fecha(cot.creado_en)],
    ['Vigencia', fecha(cot.valida_hasta)],
  ]) {
    doc.font('Helvetica').fontSize(7.5).fillColor(GRIS)
      .text(etiqueta.toUpperCase(), x, fy + 1.5, { width: anchoEtiqueta, align: 'right', characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TINTA)
      .text(valor, x + anchoEtiqueta + 8, fy, { width: anchoValor, align: 'right', lineBreak: false });
    fy += 15;
  }

  doc.y = Math.max(y + 96, fy + 8);
  doc.moveTo(MARGEN, doc.y).lineTo(612 - MARGEN, doc.y).lineWidth(0.8).strokeColor(GRIS_CLARO).stroke();
  doc.y += 16;
}

/** Bloque de datos del cliente: todo viene de la ficha, nada se recaptura. */
function datosCliente(doc, cot) {
  const inicio = doc.y;
  const anchoCol = (ANCHO_UTIL - 16) / 2;

  rotulo(doc, 'CLIENTE', MARGEN, inicio);

  doc.font('Helvetica-Bold').fontSize(12).fillColor(TINTA)
    .text(cot.cuenta_nombre ?? '—', MARGEN, inicio + 14, { width: anchoCol });

  let y = doc.y + 2;
  const izquierda = [
    cot.cuenta_comercial && cot.cuenta_comercial !== cot.cuenta_nombre ? cot.cuenta_comercial : null,
    cot.rfc ? `RFC ${cot.rfc}` : null,
    direccion(cot),
  ].filter(Boolean);

  doc.font('Helvetica').fontSize(9).fillColor(GRIS);
  for (const linea of izquierda) {
    doc.text(linea, MARGEN, y, { width: anchoCol });
    y = doc.y + 1;
  }

  // Columna derecha: a quién se le manda.
  const xd = MARGEN + anchoCol + 16;
  rotulo(doc, 'ATENCIÓN', xd, inicio);
  let yd = inicio + 14;

  if (cot.contacto_nombre) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TINTA).text(cot.contacto_nombre, xd, yd, { width: anchoCol });
    yd = doc.y + 1;
  }
  doc.font('Helvetica').fontSize(9).fillColor(GRIS);
  for (const linea of [cot.contacto_email ?? cot.cuenta_email, cot.contacto_telefono ?? cot.cuenta_telefono].filter(Boolean)) {
    doc.text(linea, xd, yd, { width: anchoCol });
    yd = doc.y + 1;
  }

  doc.y = Math.max(y, yd) + 14;
}

const direccion = (cot) => {
  const calle = [cot.calle, cot.numero].filter(Boolean).join(' ');
  const zona = [cot.colonia, cot.codigo_postal].filter(Boolean).join(', C.P. ');
  const ciudad = [cot.ciudad, cot.estado].filter(Boolean).join(', ');
  return [calle, zona, ciudad].filter(Boolean).join(' · ') || null;
};

function datosEnvio(doc, cot) {
  const y = doc.y;
  const alto = cot.descripcion_envio ? 66 : 48;

  doc.roundedRect(MARGEN, y, ANCHO_UTIL, alto, 6).fillColor(FONDO).fill();

  const cols = [
    ['ORIGEN', cot.origen ?? '—'],
    ['DESTINO', cot.destino ?? '—'],
    ['TIPO DE MERCANCÍA', cot.tipo_mercancia === 'quimico' ? 'Químico' : 'Carga general'],
  ];
  const ancho = (ANCHO_UTIL - 28) / 3;
  cols.forEach(([etiqueta, valor], i) => {
    const x = MARGEN + 14 + i * ancho;
    doc.font('Helvetica').fontSize(7.5).fillColor(GRIS)
      .text(etiqueta, x, y + 11, { width: ancho - 12, characterSpacing: 0.7 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TINTA)
      .text(valor, x, y + 23, { width: ancho - 12 });
  });

  if (cot.descripcion_envio) {
    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
      .text(cot.descripcion_envio, MARGEN + 14, y + 46, { width: ANCHO_UTIL - 28, height: 14, ellipsis: true });
  }

  doc.y = y + alto + 16;
}

function tablaMercancia(doc, cot) {
  rotulo(doc, 'DETALLE DE LA MERCANCÍA', MARGEN, doc.y);
  let y = doc.y + 16;

  // Anchos fijos: la tabla siempre ocupa el ancho útil completo.
  const cols = [
    { t: 'CANT.', w: 38, a: 'center' },
    { t: 'DESCRIPCIÓN', w: 122, a: 'left' },
    { t: 'LARGO', w: 48, a: 'right' },
    { t: 'ANCHO', w: 48, a: 'right' },
    { t: 'ALTO', w: 48, a: 'right' },
    { t: 'P. REAL', w: 62, a: 'right' },
    { t: 'P. VOLUM.', w: 66, a: 'right' },
    { t: 'P. COBRABLE', w: 96, a: 'right' },
  ];

  // Encabezado en negro: ancla visualmente la tabla.
  doc.rect(MARGEN, y, ANCHO_UTIL, 22).fillColor(NEGRO).fill();
  let x = MARGEN;
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#FFFFFF');
  for (const c of cols) {
    doc.text(c.t, x + 6, y + 8, { width: c.w - 12, align: c.a, characterSpacing: 0.5 });
    x += c.w;
  }
  y += 22;

  doc.font('Helvetica').fontSize(8.5);
  (cot.items ?? []).forEach((it, i) => {
    // 26 pt de alto: deja sitio para la leyenda del renglón sin encimarse con la
    // cifra, que es lo que pasaba con filas de 22.
    const altoFila = 26;

    if (y + altoFila > 700) { doc.addPage(); y = MARGEN; }
    if (i % 2 === 1) doc.rect(MARGEN, y, ANCHO_UTIL, altoFila).fillColor(FONDO).fill();

    const porVolumen = Number(it.peso_volumetrico) > Number(it.peso_real);
    const valores = [
      String(it.cantidad),
      it.descripcion || (it.estibable ? 'Tarima estibable' : 'Tarima no estibable'),
      metros(it.largo), metros(it.ancho), metros(it.alto),
      kg(it.peso_real), kg(it.peso_volumetrico), kg(it.peso_cobrable),
    ];

    x = MARGEN;
    valores.forEach((v, k) => {
      const ultima = k === valores.length - 1;
      doc.font(ultima ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(ultima ? TINTA : GRIS)
        .fontSize(ultima ? 9 : 8.5)
        .text(v, x + 6, y + 6, { width: cols[k].w - 12, align: cols[k].a, ellipsis: true, lineBreak: false });
      x += cols[k].w;
    });

    // Leyendas del renglón, debajo de su columna y nunca encima de una cifra.
    const anchoCobrable = cols[cols.length - 1].w;
    if (porVolumen) {
      doc.font('Helvetica').fontSize(6).fillColor(ROJO)
        .text('por volumen', MARGEN + ANCHO_UTIL - anchoCobrable + 6, y + 16,
          { width: anchoCobrable - 12, align: 'right', lineBreak: false });
    }
    if (!it.estibable) {
      doc.font('Helvetica').fontSize(6).fillColor(GRIS)
        .text('no estibable · se cubica a 1.80 m', MARGEN + cols[0].w + 6, y + 16,
          { width: cols[1].w + 60, lineBreak: false });
    }

    y += altoFila;
    doc.moveTo(MARGEN, y).lineTo(612 - MARGEN, y).lineWidth(0.4).strokeColor(GRIS_CLARO).stroke();
  });

  doc.y = y + 16;
}

/** Totales. El importe final es el elemento con más peso visual de la hoja. */
function resumen(doc, cot) {
  let y = doc.y;
  if (y > 560) { doc.addPage(); y = MARGEN; }

  const anchoCaja = 268;
  const x = 612 - MARGEN - anchoCaja;

  // Desglose de pesos, a la izquierda.
  rotulo(doc, 'RESUMEN DE PESOS', MARGEN, y);
  let yi = y + 16;
  const pesosFilas = [
    ['Peso real total', kg(cot.peso_real_total)],
    ['Peso volumétrico total', kg(cot.peso_volumetrico_total)],
  ];
  for (const [k, v] of pesosFilas) {
    doc.font('Helvetica').fontSize(9).fillColor(GRIS).text(k, MARGEN, yi, { width: 160 });
    doc.font('Helvetica').fontSize(9).fillColor(TINTA).text(v, MARGEN + 160, yi, { width: 80, align: 'right' });
    yi += 15;
  }
  doc.moveTo(MARGEN, yi + 2).lineTo(MARGEN + 240, yi + 2).lineWidth(0.8).strokeColor(GRIS_CLARO).stroke();
  yi += 8;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TINTA).text('Peso total cobrable', MARGEN, yi, { width: 160 });
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ROJO)
    .text(kg(cot.peso_cobrable_total), MARGEN + 160, yi, { width: 80, align: 'right' });

  doc.font('Helvetica').fontSize(7).fillColor(GRIS)
    .text('Se cobra el mayor entre el peso real y el volumétrico de cada renglón.',
      MARGEN, yi + 16, { width: 240 });

  // Bloque del importe, a la derecha.
  const tarifa = Number(cot.tarifa_centavos_kg ?? 160) / 100;
  const altoCaja = 104;

  doc.roundedRect(x, y, anchoCaja, altoCaja, 8).fillColor(NEGRO).fill();
  doc.roundedRect(x, y, 4, altoCaja, 2).fillColor(ROJO).fill();

  doc.font('Helvetica').fontSize(8).fillColor('#B9BDC4')
    .text('TARIFA APLICADA', x + 20, y + 16, { characterSpacing: 0.7 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF')
    .text(`$${tarifa.toFixed(2)} por kilogramo cobrable`, x + 20, y + 28);

  doc.font('Helvetica').fontSize(8).fillColor('#B9BDC4')
    .text('IMPORTE DEL FLETE', x + 20, y + 54, { characterSpacing: 0.7 });
  doc.font('Helvetica-Bold').fontSize(26).fillColor('#FFFFFF')
    .text(pesos(cot.subtotal), x + 20, y + 66, { width: anchoCaja - 40, characterSpacing: -0.6 });

  doc.y = y + altoCaja + 10;

  // IVA y total, debajo del bloque negro.
  const filasFinales = [
    ['Subtotal', pesos(cot.subtotal)],
    ['IVA 16 %', pesos(cot.impuestos)],
    ['Total', pesos(cot.total)],
  ];
  let yf = doc.y;
  for (const [k, v] of filasFinales) {
    const esTotal = k === 'Total';
    doc.font(esTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(esTotal ? 11 : 9)
      .fillColor(esTotal ? TINTA : GRIS)
      .text(k, x + 20, yf, { width: 140 });
    doc.font(esTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(esTotal ? 11 : 9)
      .fillColor(esTotal ? TINTA : GRIS)
      .text(v, x + 20, yf, { width: anchoCaja - 40, align: 'right' });
    yf += esTotal ? 18 : 14;
  }

  doc.y = Math.max(yf, yi + 34) + 14;
}

/**
 * Salta de página solo si el bloque no cabe de verdad.
 *
 * Antes se comparaba `doc.y` contra un número fijo y una cotización normal
 * mandaba las condiciones a una segunda hoja teniendo media página libre.
 */
function asegurarEspacio(doc, alto) {
  const limite = 792 - MARGEN - 22; // 22 pt reservados para el pie
  if (doc.y + alto > limite) doc.addPage();
}

function observaciones(doc, cot) {
  if (!cot.observaciones) return;
  const alto = 20 + Math.ceil(doc.heightOfString(cot.observaciones, { width: ANCHO_UTIL }));
  asegurarEspacio(doc, alto);

  rotulo(doc, 'OBSERVACIONES', MARGEN, doc.y);
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
    .text(cot.observaciones, MARGEN, doc.y + 14, { width: ANCHO_UTIL, lineGap: 1.5 });
  doc.y += 12;
}

/**
 * Condiciones comerciales, a dos columnas.
 *
 * Es letra pequeña que nadie lee de corrido: en una sola columna ocupaba casi
 * cien puntos y empujaba a una segunda hoja una cotización que cabía entera en
 * una. A dos columnas ocupa la mitad y se lee igual.
 */
function condiciones(doc, cot) {
  const lista = (cot.condiciones ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const puntos = lista.length ? lista : CONDICIONES;

  const anchoCol = (ANCHO_UTIL - 18) / 2;
  const anchoTexto = anchoCol - 10;

  doc.font('Helvetica').fontSize(7.2);
  const altos = puntos.map((p) => doc.heightOfString(p, { width: anchoTexto, lineGap: 0.5 }) + 4);

  // Se reparten por altura, no por número, para que las dos columnas terminen
  // más o menos a la misma altura.
  const total = altos.reduce((s, h) => s + h, 0);
  let acumulado = 0;
  let corte = puntos.length;
  for (let i = 0; i < puntos.length; i += 1) {
    acumulado += altos[i];
    if (acumulado >= total / 2) { corte = i + 1; break; }
  }

  const columnas = [puntos.slice(0, corte), puntos.slice(corte)];
  const altoBloque = 16 + Math.max(
    altos.slice(0, corte).reduce((s, h) => s + h, 0),
    altos.slice(corte).reduce((s, h) => s + h, 0),
  );
  asegurarEspacio(doc, altoBloque);

  rotulo(doc, 'CONDICIONES COMERCIALES', MARGEN, doc.y);
  const inicio = doc.y + 14;
  let maximo = inicio;

  columnas.forEach((columna, c) => {
    const x = MARGEN + c * (anchoCol + 18);
    let y = inicio;
    for (const punto of columna) {
      doc.circle(x + 2.2, y + 3.6, 1.3).fillColor(ROJO).fill();
      doc.font('Helvetica').fontSize(7.2).fillColor(GRIS)
        .text(punto, x + 10, y, { width: anchoTexto, lineGap: 0.5 });
      y = doc.y + 4;
    }
    maximo = Math.max(maximo, y);
  });

  doc.y = maximo;
}

/**
 * Pie con numeración, en todas las páginas.
 *
 * El margen inferior se pone a cero mientras se dibuja: pdfkit añade una página
 * automáticamente en cuanto se escribe por debajo del margen, y como el pie va
 * justo ahí, cada línea generaba una hoja en blanco de más.
 */
function pieDePagina(doc, cot) {
  const rango = doc.bufferedPageRange();

  for (let i = 0; i < rango.count; i += 1) {
    doc.switchToPage(rango.start + i);
    const margenPrevio = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = 792 - MARGEN + 4;
    doc.moveTo(MARGEN, y - 10).lineTo(612 - MARGEN, y - 10).lineWidth(0.6).strokeColor(GRIS_CLARO).stroke();

    doc.font('Helvetica-Bold').fontSize(7).fillColor(NEGRO)
      .text('FLETES TAURO', MARGEN, y, { lineBreak: false, continued: true, characterSpacing: 0.5 })
      .font('Helvetica').fillColor(GRIS)
      .text(`   ·   Cotización ${cot.folio}`, { lineBreak: false, characterSpacing: 0 });

    doc.font('Helvetica').fontSize(7).fillColor(GRIS)
      .text(`Página ${i + 1} de ${rango.count}`, MARGEN, y, { width: ANCHO_UTIL, align: 'right', lineBreak: false });

    doc.page.margins.bottom = margenPrevio;
  }
}

/** Rótulo de sección: mayúsculas pequeñas con una barra roja delante. */
function rotulo(doc, texto, x, y) {
  doc.rect(x, y + 2, 2.5, 8).fillColor(ROJO).fill();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NEGRO)
    .text(texto, x + 8, y + 2, { characterSpacing: 0.8 });
  doc.y = y;
}
