/* ============================================================================
   FLETES TAURO — COTIZACION 2026 (formato premium, una hoja)
   Genera el .docx. Ejecutar:  node cotizacion.js
   ==========================================================================*/
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, AlignmentType, VerticalAlign,
  TableLayoutType, Header, Footer, LineRuleType,
} = require('docx');

const ASSETS = path.join(__dirname, 'assets');
const logo   = fs.readFileSync(path.join(ASSETS, 'logo.png'));
const logoSm = fs.readFileSync(path.join(ASSETS, 'logo-sm.png'));

/* ---------- Paleta ----------
   Ninguna tinta saturada: el grafito sustituye al negro puro, el vino sustituye
   al rojo de marca y los grises van hacia el calido. El unico rojo saturado de
   la hoja es el del propio logotipo, que asi queda como el acento de la pagina.
   Contraste sobre blanco: cuerpo 8.2:1 · rotulo 5.1:1 · vino 7.6:1.
   Texto blanco: sobre grafito 13.5:1 · sobre vino oscuro 10.1:1. */
const INK     = '23272B';   // grafito — titulos y valores
const CUERPO  = '4F545A';   // texto corrido
const MUTED   = '767369';   // rotulos en versalitas
const HINT    = '95908A';   // lo que hay que llenar
const FILETE  = 'D9D3C9';   // pelo calido
const FILETE2 = 'EBE7E0';   // pelo tenue
const BANDA   = 'F5F3EF';   // banda de papel calido
const VINO    = '8A3B33';   // acento
const VINO_D  = '6E2E28';   // banda del total
const GRAFITO = '2B2F34';   // banda del encabezado de tabla
const W       = 'FFFFFF';

const SERIF = 'Cambria';
const SANS  = 'Calibri';

/* ---------- Medidas ---------- */
const ANCHO = 9504;               // ancho util en DXA (Carta con margenes de 0.95")
const NADA  = BorderStyle.NONE;
const b = (color, size, style = BorderStyle.SINGLE) => ({ style, size, color });
const sinBordes = {
  top: { style: NADA }, bottom: { style: NADA }, left: { style: NADA },
  right: { style: NADA }, insideHorizontal: { style: NADA }, insideVertical: { style: NADA },
};

/* ---------- Atomos de texto ---------- */
const txt = (text, o = {}) => new TextRun({
  text, font: o.font || SANS, size: o.size || 19, bold: o.bold || false,
  color: o.color || CUERPO, characterSpacing: o.ls,
});

/** Rotulo en versalitas espaciadas: la palanca que hace que se vea caro. */
const rotulo = (text, o = {}) => txt(text, {
  size: o.size || 13, bold: true, color: o.color || MUTED, ls: o.ls || 70, font: SANS,
});

const p = (children, o = {}) => new Paragraph({
  children: Array.isArray(children) ? children : [children],
  alignment: o.align,
  spacing: {
    before: o.before || 0, after: o.after === undefined ? 0 : o.after,
    line: o.line, lineRule: o.line ? LineRuleType.AUTO : undefined,
  },
  border: o.border,
  indent: o.indent,
  keepNext: o.keep,
  keepLines: o.keep,
});

const vacio = (alto = 2, o = {}) => p(txt('', { size: alto }), { after: 0, keep: o.keep });

const celda = (children, o = {}) => new TableCell({
  width: { size: o.w, type: WidthType.DXA },
  children: Array.isArray(children) ? children : [children],
  shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
  borders: o.borders,
  margins: o.margins || { top: 60, bottom: 60, left: 0, right: 160 },
  verticalAlign: o.valign,
  columnSpan: o.span,
});

const tabla = (rows, o = {}) => new Table({
  rows,
  columnWidths: o.cols,
  width: { size: ANCHO, type: WidthType.DXA },
  layout: TableLayoutType.FIXED,
  borders: o.borders || sinBordes,
});

/* ---------- Bloques de composicion ---------- */

/** Filete de firma: un tramo vino y el resto un pelo calido. */
const fileteMarca = (grosor = 16) => tabla([
  new TableRow({
    children: [
      celda(vacio(1), { w: 1160, borders: { ...sinBordes, bottom: b(VINO, grosor) } }),
      celda(vacio(1), { w: ANCHO - 1160, borders: { ...sinBordes, bottom: b(FILETE, 4) } }),
    ],
  }),
], { cols: [1160, ANCHO - 1160] });

/** Encabezado de seccion: numero vino + versalitas espaciadas + filete. */
const seccion = (num, texto) => p([
  txt(num, { font: SERIF, size: 17, bold: true, color: VINO, ls: 10 }),
  txt('     ', { size: 17 }),
  txt(texto.toUpperCase(), { size: 16, bold: true, color: INK, ls: 90 }),
], { before: 140, after: 74, border: { bottom: b(FILETE, 4) }, keep: true });

/** Par rotulo / valor dentro de una celda. */
const campo = (etiqueta, valor, o = {}) => [
  p(rotulo(etiqueta, { size: 12, ls: 70 }), { after: 30 }),
  p(o.hueco
    ? txt(`[ ${valor} ]`, { size: 19, color: HINT })
    : txt(valor, { size: 19, color: INK, font: o.font || SANS }), { after: 0 }),
];

/* ============================================================================
   ENCABEZADO Y PIE
   ==========================================================================*/

/** La hoja 1 lleva el membrete en el cuerpo, asi que su encabezado va limpio. */
const encabezadoPortada = new Header({ children: [p(txt('', { size: 2 }))] });

/** Red de seguridad: si la cotizacion crece y pasa de una hoja, las siguientes
    llevan membrete corrido. */
const encabezadoCorrido = new Header({
  children: [
    tabla([
      new TableRow({
        children: [
          celda(p(new ImageRun({
            type: 'png', data: logoSm, transformation: { width: 82, height: 56 },
          }), { after: 0 }), {
            w: 4752, valign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 90, left: 0, right: 0 },
          }),
          celda(p(rotulo('COTIZACIÓN DE SERVICIO', { size: 12, ls: 80 }), {
            align: AlignmentType.RIGHT, after: 0,
          }), {
            w: 4752, valign: VerticalAlign.BOTTOM,
            margins: { top: 0, bottom: 110, left: 0, right: 0 },
          }),
        ],
      }),
    ], { cols: [4752, 4752], borders: { ...sinBordes, bottom: b(FILETE, 4) } }),
    vacio(18),
  ],
});

const bloqueDireccion = (titulo, lineas) => [
  p(rotulo(titulo, { size: 11, ls: 80, color: VINO }), { after: 45 }),
  ...lineas.map((l) => p(txt(l, { size: 13, color: MUTED }), { after: 0, line: 215 })),
];

const pie = () => new Footer({
  children: [
    fileteMarca(10),
    vacio(6),
    tabla([
      new TableRow({
        children: [
          celda(bloqueDireccion('MATRIZ', [
            'Carretera a Laredo Km. 16.5 No. 16501, Col. Moisés Sáenz',
            'Apodaca, N.L., C.P. 66613  ·  Tel. (81) 1958-0740',
          ]), { w: 3500, margins: { top: 0, bottom: 0, left: 0, right: 200 } }),
          celda(bloqueDireccion('CIUDAD DE MÉXICO', [
            'Álamo No. 28 / Av. Ceylán Esq. Encino, Col. Tabla Honda',
            'Tlalnepantla, Edo. de México  ·  Tel. (55) 5308-7500',
          ]), { w: 3500, margins: { top: 0, bottom: 0, left: 0, right: 200 } }),
          celda([
            p(rotulo('SITIO', { size: 11, ls: 80, color: MUTED }), {
              align: AlignmentType.RIGHT, after: 45,
            }),
            p(txt('www.grupotauro.com.mx', { size: 14, bold: true, color: VINO }), {
              align: AlignmentType.RIGHT, after: 0,
            }),
          ], { w: 2504, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
        ],
      }),
    ], { cols: [3500, 3500, 2504] }),
  ],
});

/* ============================================================================
   MEMBRETE Y DATOS
   ==========================================================================*/

const membrete = tabla([
  new TableRow({
    children: [
      celda(p(new ImageRun({
        type: 'png', data: logo, transformation: { width: 118, height: 80 },
      }), { after: 0 }), { w: 4400, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
      celda([
        p(txt('COTIZACIÓN', { font: SERIF, size: 36, color: INK, ls: 110 }), {
          align: AlignmentType.RIGHT, after: 70,
        }),
        p(rotulo('DE SERVICIO DE TRANSPORTE', { size: 12, ls: 90 }), {
          align: AlignmentType.RIGHT, after: 0,
        }),
      ], {
        w: ANCHO - 4400, valign: VerticalAlign.BOTTOM,
        margins: { top: 0, bottom: 30, left: 0, right: 0 },
      }),
    ],
  }),
], { cols: [4400, ANCHO - 4400] });

/* Los nueve datos del embarque en una reticula de tres por tres. */
const COL = ANCHO / 3;
const margenDato = (der) => ({ top: 56, bottom: 56, left: 0, right: der });

const filaDatos = (a, bb, c) => new TableRow({
  cantSplit: true,
  children: [
    celda(campo(...a), { w: COL, margins: margenDato(240) }),
    celda(campo(...bb), { w: COL, margins: margenDato(240) }),
    celda(campo(...c), { w: COL, margins: margenDato(0) }),
  ],
});

const datos = tabla([
  filaDatos(
    ['FOLIO', 'COT-2026-0001', { font: SERIF }],
    ['FECHA', '10 de agosto de 2026'],
    ['VIGENCIA', '15 días naturales'],
  ),
  filaDatos(
    ['CLIENTE', 'Razón social', { hueco: true }],
    ['ATENCIÓN', 'Nombre y puesto', { hueco: true }],
    ['CORREO Y TELÉFONO', 'correo · teléfono', { hueco: true }],
  ),
  filaDatos(
    ['ORIGEN', 'Monterrey, Nuevo León'],
    ['DESTINO', 'Ciudad de México'],
    ['MODALIDAD', 'Carga consolidada por tarima'],
  ),
], {
  cols: [COL, COL, COL],
  borders: {
    ...sinBordes, top: b(FILETE2, 4), bottom: b(FILETE2, 4), insideHorizontal: b(FILETE2, 4),
  },
});

/* ============================================================================
   01 · MERCANCIA
   ==========================================================================*/

const entrada = p([
  txt('A quien corresponda: ', { font: SERIF, size: 19, color: INK }),
  txt('agradecemos la oportunidad de cotizar el siguiente embarque:'),
], { after: 105, line: 258, align: AlignmentType.JUSTIFIED, keep: true });

const especificacion = (etiqueta, valor) => celda([
  p(rotulo(etiqueta, { size: 11, ls: 70 }), { after: 45, keep: true }),
  p(txt(valor, { font: SERIF, size: 20, color: INK }), { after: 0, keep: true }),
], { w: ANCHO / 4, fill: BANDA, margins: { top: 100, bottom: 100, left: 190, right: 130 } });

const fichaMercancia = tabla([
  new TableRow({
    cantSplit: true,
    children: [
      especificacion('PIEZAS', '2 tarimas'),
      especificacion('DIMENSIONES', '1.20 × 1.00 × 1.50 m'),
      especificacion('PESO APROX.', '2,000 kg'),
      especificacion('VOLUMEN', '3.60 m³'),
    ],
  }),
], {
  cols: [ANCHO / 4, ANCHO / 4, ANCHO / 4, ANCHO / 4],
  borders: { ...sinBordes, top: b(FILETE, 4), bottom: b(FILETE, 4), insideVertical: b(W, 8) },
});

/* ============================================================================
   02 · PROPUESTA ECONOMICA
   Todas las filas menos la ultima llevan keepNext para que la tabla no se
   parta si la cotizacion crece y pasa de una hoja.
   ==========================================================================*/

const COL_A = 6100;
const COL_B = ANCHO - COL_A;

const filaConcepto = (concepto, detalle, importe) => new TableRow({
  cantSplit: true,
  children: [
    celda([
      p(txt(concepto, { size: 20, color: INK }), { after: 30, keep: true }),
      p(txt(detalle, { size: 14, color: MUTED }), { after: 0, keep: true }),
    ], {
      w: COL_A, valign: VerticalAlign.CENTER,
      margins: { top: 72, bottom: 72, left: 190, right: 150 },
      borders: { ...sinBordes, bottom: b(FILETE2, 4) },
    }),
    celda(p(txt(importe, { font: SERIF, size: 21, color: INK }), {
      align: AlignmentType.RIGHT, after: 0, keep: true,
    }), {
      w: COL_B, valign: VerticalAlign.CENTER,
      margins: { top: 72, bottom: 72, left: 150, right: 190 },
      borders: { ...sinBordes, bottom: b(FILETE2, 4) },
    }),
  ],
});

const filaSuma = (etiqueta, importe, o = {}) => new TableRow({
  cantSplit: true,
  children: [
    celda(p(rotulo(etiqueta, { size: 13, ls: 80, color: o.color || MUTED }), {
      align: AlignmentType.RIGHT, after: 0, keep: o.keep,
    }), {
      w: COL_A, valign: VerticalAlign.CENTER, fill: o.fill,
      margins: { top: 66, bottom: 66, left: 190, right: 150 },
      borders: o.top ? { ...sinBordes, top: b(FILETE, 4) } : sinBordes,
    }),
    celda(p(txt(importe, {
      font: SERIF, size: o.size || 20, color: o.color || INK, bold: o.bold,
    }), { align: AlignmentType.RIGHT, after: 0, keep: o.keep }), {
      w: COL_B, valign: VerticalAlign.CENTER, fill: o.fill,
      margins: { top: 66, bottom: 66, left: 150, right: 190 },
      borders: o.top ? { ...sinBordes, top: b(FILETE, 4) } : sinBordes,
    }),
  ],
});

const propuesta = tabla([
  new TableRow({
    cantSplit: true,
    children: [
      celda(p(rotulo('CONCEPTO', { size: 13, ls: 100, color: W }), { after: 0, keep: true }), {
        w: COL_A, fill: GRAFITO, valign: VerticalAlign.CENTER,
        margins: { top: 88, bottom: 88, left: 190, right: 150 },
      }),
      celda(p(rotulo('COSTO', { size: 13, ls: 100, color: W }), {
        align: AlignmentType.RIGHT, after: 0, keep: true,
      }), {
        w: COL_B, fill: GRAFITO, valign: VerticalAlign.CENTER,
        margins: { top: 88, bottom: 88, left: 150, right: 190 },
      }),
    ],
  }),
  filaConcepto('Recolección', 'Unidad tipo rabón en la plaza de origen', '$ 0.00'),
  filaConcepto('Flete', 'Monterrey – Ciudad de México, tráiler con caja seca de 48 o 53 pies', '$ 0.00'),
  filaConcepto('Servicio de entrega', 'Unidad tipo rabón en la plaza de destino', '$ 0.00'),
  filaSuma('SUBTOTAL', '$ 0.00', { top: true, keep: true }),
  filaSuma('IVA 16 %', '$ 0.00', { keep: true }),
  filaSuma('TOTAL', '$ 0.00', { fill: VINO_D, color: W, size: 25, bold: true }),
], { cols: [COL_A, COL_B] });

/* ============================================================================
   03 · CONSIDERACIONES Y ACEPTACION
   La letra chica va a dos columnas: a 7.5 pt una linea de 6.6" seria una
   medida imposible de leer, y a 3.2" cae en el ancho comodo.
   ==========================================================================*/

const CONSIDERACIONES = [
  'La presente cotización se emite con base en las características de la mercancía proporcionadas por el cliente.',
  'Todos los importes indicados son más IVA.',
  'Los precios están sujetos a validación del peso, dimensiones y condiciones reales de la mercancía al momento de la recolección.',
  'El seguro de mercancía es opcional. En caso de requerir que el embarque viaje asegurado por Fletes Tauro, el costo será de $8.00 por cada millar del valor comercial declarado de la mercancía.',
  'La cotización no incluye servicios adicionales como maniobras, almacenajes, reexpediciones, citas de entrega (las cuales deberán solicitarse con un mínimo de 48 horas de anticipación) ni cualquier otro concepto extraordinario que pudiera generarse durante la operación.',
  'Para las recolecciones y entregas locales se utilizan unidades tipo rabón, mientras que el traslado entre Monterrey y Ciudad de México se realiza en tráiler con caja seca de 48 o 53 pies, de acuerdo con la disponibilidad operativa.',
];

/* El corte 1-4 / 5-6 reparte 466 y 493 caracteres: las dos columnas terminan
   casi a la misma altura. Si se edita el texto, hay que revisar el corte. */
const CORTE = 4;

const consideracion = (texto, i) => p([
  txt(String(i + 1).padStart(2, '0'), { font: SERIF, size: 14, bold: true, color: VINO }),
  txt('\t'),
  txt(texto, { size: 15, color: CUERPO }),
], {
  after: 60, line: 235, align: AlignmentType.JUSTIFIED,
  indent: { left: 330, hanging: 330 },
});

const letraChica = tabla([
  new TableRow({
    cantSplit: true,
    children: [
      celda(CONSIDERACIONES.slice(0, CORTE).map((t, i) => consideracion(t, i)), {
        w: ANCHO / 2, margins: { top: 0, bottom: 0, left: 0, right: 420 },
      }),
      celda(CONSIDERACIONES.slice(CORTE).map((t, i) => consideracion(t, i + CORTE)), {
        w: ANCHO / 2, margins: { top: 0, bottom: 0, left: 0, right: 0 },
      }),
    ],
  }),
], { cols: [ANCHO / 2, ANCHO / 2] });

const firma = (etiqueta, puesto) => celda([
  vacio(30),
  p(txt('', { size: 6 }), { after: 45, before: 55, border: { top: b(FILETE, 6) } }),
  p([
    rotulo(etiqueta, { size: 12, ls: 60, color: INK }),
    txt('   ·   ', { size: 13, color: MUTED }),
    txt(puesto, { size: 14, color: MUTED }),
  ], { after: 0 }),
], { w: 4552, margins: { top: 0, bottom: 0, left: 0, right: 0 } });

const bloqueFirmas = tabla([
  new TableRow({
    cantSplit: true,
    children: [
      firma('POR FLETES TAURO', 'Nombre, firma y puesto'),
      celda(vacio(2), { w: 400, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
      firma('ACEPTACIÓN DEL CLIENTE', 'Nombre, firma y fecha'),
    ],
  }),
], { cols: [4552, 400, 4552] });

/* ============================================================================
   DOCUMENTO
   ==========================================================================*/

const doc = new Document({
  creator: 'Fletes Tauro',
  title: 'Cotización de servicio de transporte',
  description: 'Formato de cotización — Fletes Tauro 2026',
  styles: {
    default: {
      document: {
        run: { font: SANS, size: 19, color: CUERPO },
        paragraph: { spacing: { after: 0 } },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 900, right: 1368, bottom: 1330, left: 1368, header: 480, footer: 420 },
      },
      titlePage: true,
    },
    headers: { first: encabezadoPortada, default: encabezadoCorrido },
    footers: { first: pie(), default: pie() },
    children: [
      membrete,
      vacio(6),
      fileteMarca(),
      vacio(6),
      datos,

      seccion('01', 'Mercancía a transportar'),
      entrada,
      fichaMercancia,

      seccion('02', 'Propuesta económica'),
      vacio(4, { keep: true }),
      propuesta,
      vacio(4),
      p(txt('Importes expresados en pesos mexicanos (M.N.). El IVA se calcula a la tasa vigente del 16 %.', { size: 14, color: MUTED }), { after: 0 }),

      seccion('03', 'Consideraciones y aceptación'),
      vacio(8, { keep: true }),
      letraChica,
      vacio(6),
      p(txt('Para confirmar el servicio, devuelva este documento firmado o envíe su aceptación por correo al ejecutivo de cuenta.', { size: 15, color: CUERPO }), { after: 0, line: 245 }),

      vacio(4),
      bloqueFirmas,
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const salida = path.join(__dirname, 'COTIZACION_FLETES_TAURO_2026.docx');
  fs.writeFileSync(salida, buf);
  console.log('OK ->', salida, (buf.length / 1024).toFixed(0) + ' KB');
});
