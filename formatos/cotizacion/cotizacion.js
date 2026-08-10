/* ============================================================================
   FLETES TAURO — COTIZACION 2026 (formato premium)
   Genera el .docx. Ejecutar:  node cotizacion.js
   ==========================================================================*/
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, AlignmentType, VerticalAlign, HeightRule,
  TableLayoutType, Header, Footer, PageNumber, LineRuleType,
} = require('docx');

const ASSETS = path.join(__dirname, 'assets');
const logo   = fs.readFileSync(path.join(ASSETS, 'logo.png'));
const logoSm = fs.readFileSync(path.join(ASSETS, 'logo-sm.png'));

/* ---------- Paleta: negro tinta, rojo de marca, grises calidos ---------- */
const INK   = '0E0F11';   // tinta principal
const INK2  = '42464B';   // cuerpo de texto
const MUTED = '7C818A';   // rotulos y metadatos
const HINT  = 'A9A29A';   // texto por llenar
const RULE  = 'D6D3CE';   // filete calido
const SOFT  = 'E9E6E1';   // filete tenue
const BAND  = 'F7F6F3';   // banda de papel
const RED   = 'C21112';   // rojo de marca
const W     = 'FFFFFF';

const SERIF = 'Cambria';
const SANS  = 'Calibri';

/* ---------- Medidas ---------- */
const ANCHO = 9072;               // ancho util en DXA (Carta con margenes de 1.1")
const NADA  = BorderStyle.NONE;
const b = (color, size, style = BorderStyle.SINGLE) => ({ style, size, color });
const sinBordes = {
  top: { style: NADA }, bottom: { style: NADA }, left: { style: NADA },
  right: { style: NADA }, insideHorizontal: { style: NADA }, insideVertical: { style: NADA },
};

/* ---------- Atomos de texto ---------- */
const txt = (text, o = {}) => new TextRun({
  text, font: o.font || SANS, size: o.size || 21, bold: o.bold || false,
  italics: o.italics || false, color: o.color || INK2, characterSpacing: o.ls,
});

/** Rotulo en versalitas espaciadas: la palanca que hace que se vea caro. */
const rotulo = (text, o = {}) => txt(text, {
  size: o.size || 14, bold: true, color: o.color || MUTED, ls: o.ls || 60, font: SANS,
});

const p = (children, o = {}) => new Paragraph({
  children: Array.isArray(children) ? children : [children],
  alignment: o.align,
  spacing: {
    before: o.before || 0, after: o.after === undefined ? 0 : o.after,
    line: o.line, lineRule: o.line ? LineRuleType.AUTO : undefined,
  },
  border: o.border,
  keepNext: o.keep,
  keepLines: o.keep,
  pageBreakBefore: o.saltoPagina,
});

const vacio = (alto = 2, o = {}) => p(txt('', { size: alto }), { after: 0, keep: o.keep });

/** Celda con los valores por defecto del documento. */
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

/** Filete de firma: un tramo rojo grueso y el resto un pelo calido. */
const fileteMarca = (grosor = 20) => tabla([
  new TableRow({
    children: [
      celda(vacio(1), { w: 1240, borders: { ...sinBordes, bottom: b(RED, grosor) } }),
      celda(vacio(1), { w: ANCHO - 1240, borders: { ...sinBordes, bottom: b(RULE, 4) } }),
    ],
  }),
], { cols: [1240, ANCHO - 1240] });

/** Encabezado de seccion: numero rojo + versalitas espaciadas + filete. */
const seccion = (num, texto, o = {}) => p([
  txt(num, { font: SERIF, size: 19, bold: true, color: RED, ls: 10 }),
  txt('     ', { size: 19 }),
  txt(texto.toUpperCase(), { size: 18, bold: true, color: INK, ls: 90 }),
], {
  before: o.saltoPagina ? 0 : 270, after: 110, border: { bottom: b(RULE, 4) },
  keep: true, saltoPagina: o.saltoPagina,
});

/** Par rotulo / valor dentro de una celda. */
const campo = (etiqueta, valor, o = {}) => [
  p(rotulo(etiqueta, { size: 13, ls: 70 }), { after: 40 }),
  p(o.hueco
    ? txt(`[ ${valor} ]`, { size: 21, color: HINT })
    : txt(valor, { size: 21, color: INK, font: o.font || SANS }), { after: 0 }),
];

/* ============================================================================
   ENCABEZADO Y PIE
   ==========================================================================*/

/** Pagina 1: el membrete completo va en el cuerpo, el encabezado va limpio. */
const encabezadoPortada = new Header({ children: [p(txt('', { size: 2 }))] });

/** Paginas 2 en adelante: membrete corrido. */
const encabezadoCorrido = new Header({
  children: [
    tabla([
      new TableRow({
        children: [
          celda(p(new ImageRun({
            type: 'png', data: logoSm, transformation: { width: 86, height: 58 },
          }), { after: 0 }), {
            w: 4536, valign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 90, left: 0, right: 0 },
          }),
          celda(p(rotulo('COTIZACIÓN DE SERVICIO', { size: 13, ls: 80 }), {
            align: AlignmentType.RIGHT, after: 0,
          }), {
            w: 4536, valign: VerticalAlign.BOTTOM,
            margins: { top: 0, bottom: 120, left: 0, right: 0 },
          }),
        ],
      }),
    ], { cols: [4536, 4536], borders: { ...sinBordes, bottom: b(RULE, 4) } }),
    vacio(18),
  ],
});

const bloqueDireccion = (titulo, lineas) => [
  p(rotulo(titulo, { size: 12, ls: 80, color: RED }), { after: 50 }),
  ...lineas.map((l) => p(txt(l, { size: 14, color: MUTED }), { after: 0, line: 220 })),
];

const pie = () => new Footer({
  children: [
    fileteMarca(12),
    vacio(6),
    tabla([
      new TableRow({
        children: [
          celda(bloqueDireccion('MATRIZ', [
            'Carretera a Laredo Km. 16.5 No. 16501',
            'Col. Moisés Sáenz, Apodaca, N.L., C.P. 66613',
            'Tel. (81) 1958-0740',
          ]), { w: 3300, margins: { top: 0, bottom: 0, left: 0, right: 200 } }),
          celda(bloqueDireccion('CIUDAD DE MÉXICO', [
            'Álamo No. 28 / Av. Ceylán Esq. Encino',
            'Col. Tabla Honda, Tlalnepantla, Edo. de México',
            'Tel. (55) 5308-7500',
          ]), { w: 3300, margins: { top: 0, bottom: 0, left: 0, right: 200 } }),
          celda([
            p(txt('www.grupotauro.com.mx', { size: 15, bold: true, color: RED }), {
              align: AlignmentType.RIGHT, after: 60,
            }),
            p([
              txt('Página ', { size: 13, color: MUTED }),
              new TextRun({ children: [PageNumber.CURRENT], font: SANS, size: 13, color: MUTED }),
              txt(' de ', { size: 13, color: MUTED }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: SANS, size: 13, color: MUTED }),
            ], { align: AlignmentType.RIGHT, after: 0 }),
          ], { w: 2472, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
        ],
      }),
    ], { cols: [3300, 3300, 2472] }),
  ],
});

/* ============================================================================
   PAGINA 1
   ==========================================================================*/

const membrete = tabla([
  new TableRow({
    children: [
      celda(p(new ImageRun({
        type: 'png', data: logo, transformation: { width: 140, height: 95 },
      }), { after: 0 }), { w: 4200, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
      celda([
        p(txt('COTIZACIÓN', { font: SERIF, size: 44, color: INK, ls: 120 }), {
          align: AlignmentType.RIGHT, after: 80,
        }),
        p(rotulo('DE SERVICIO DE TRANSPORTE', { size: 13, ls: 90 }), {
          align: AlignmentType.RIGHT, after: 0,
        }),
      ], {
        w: ANCHO - 4200, valign: VerticalAlign.BOTTOM,
        margins: { top: 0, bottom: 40, left: 0, right: 0 },
      }),
    ],
  }),
], { cols: [4200, ANCHO - 4200] });

/* Franja de datos: folio/fecha/vigencia arriba y los datos del embarque
   debajo, en una sola retícula de seis columnas para que los filetes corran
   parejos de lado a lado. */
const COL = 1512;
const margenDato = (der) => ({ top: 95, bottom: 95, left: 0, right: der });

const filaDatos = (izq, der) => new TableRow({
  cantSplit: true,
  children: [
    celda(campo(izq[0], izq[1], izq[2]), { w: COL * 3, span: 3, margins: margenDato(280) }),
    celda(campo(der[0], der[1], der[2]), { w: COL * 3, span: 3, margins: margenDato(0) }),
  ],
});

const datos = tabla([
  new TableRow({
    cantSplit: true,
    children: [
      celda(campo('FOLIO', 'COT-2026-0001', { font: SERIF }), { w: COL * 2, span: 2, margins: margenDato(200) }),
      celda(campo('FECHA', '10 de agosto de 2026'), { w: COL * 2, span: 2, margins: margenDato(200) }),
      celda(campo('VIGENCIA', '15 días naturales'), { w: COL * 2, span: 2, margins: margenDato(0) }),
    ],
  }),
  filaDatos(['CLIENTE', 'Razón social del cliente', { hueco: true }], ['ORIGEN', 'Monterrey, Nuevo León']),
  filaDatos(['ATENCIÓN', 'Nombre y puesto del contacto', { hueco: true }], ['DESTINO', 'Ciudad de México']),
  filaDatos(['CORREO Y TELÉFONO', 'correo@empresa.com  ·  (00) 0000-0000', { hueco: true }],
    ['MODALIDAD', 'Carga consolidada por tarima']),
], {
  cols: [COL, COL, COL, COL, COL, COL],
  borders: {
    ...sinBordes, top: b(SOFT, 4), bottom: b(SOFT, 4), insideHorizontal: b(SOFT, 4),
  },
});

const parrafo = (children, o = {}) => p(children, {
  after: o.after === undefined ? 130 : o.after, line: 276,
  align: o.align || AlignmentType.JUSTIFIED, keep: o.keep,
});

const especificacion = (etiqueta, valor) => celda([
  p(rotulo(etiqueta, { size: 12, ls: 70 }), { after: 55, keep: true }),
  p(txt(valor, { font: SERIF, size: 22, color: INK }), { after: 0, keep: true }),
], { w: 2268, fill: BAND, margins: { top: 140, bottom: 140, left: 200, right: 140 } });

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
  cols: [2268, 2268, 2268, 2268],
  borders: { ...sinBordes, top: b(RULE, 4), bottom: b(RULE, 4), insideVertical: b(W, 8) },
});

/* ---------- Tabla de la propuesta economica ----------
   Todas las filas menos la ultima llevan keepNext para que la tabla nunca se
   parta entre dos paginas. */
const COL_A = 5772;
const COL_B = ANCHO - COL_A;

const filaConcepto = (concepto, detalle, importe) => new TableRow({
  cantSplit: true,
  children: [
    celda([
      p(txt(concepto, { size: 22, color: INK }), { after: 40, keep: true }),
      p(txt(detalle, { size: 16, color: MUTED }), { after: 0, keep: true }),
    ], {
      w: COL_A, valign: VerticalAlign.CENTER,
      margins: { top: 95, bottom: 95, left: 200, right: 160 },
      borders: { ...sinBordes, bottom: b(SOFT, 4) },
    }),
    celda(p(txt(importe, { font: SERIF, size: 23, color: INK }), {
      align: AlignmentType.RIGHT, after: 0, keep: true,
    }), {
      w: COL_B, valign: VerticalAlign.CENTER,
      margins: { top: 95, bottom: 95, left: 160, right: 200 },
      borders: { ...sinBordes, bottom: b(SOFT, 4) },
    }),
  ],
});

const filaSuma = (etiqueta, importe, o = {}) => new TableRow({
  cantSplit: true,
  children: [
    celda(p(rotulo(etiqueta, { size: 14, ls: 80, color: o.color || MUTED }), {
      align: AlignmentType.RIGHT, after: 0, keep: o.keep,
    }), {
      w: COL_A, valign: VerticalAlign.CENTER, fill: o.fill,
      margins: { top: 88, bottom: 88, left: 200, right: 160 },
      borders: o.top ? { ...sinBordes, top: b(RULE, 4) } : sinBordes,
    }),
    celda(p(txt(importe, {
      font: SERIF, size: o.size || 22, color: o.color || INK, bold: o.bold,
    }), { align: AlignmentType.RIGHT, after: 0, keep: o.keep }), {
      w: COL_B, valign: VerticalAlign.CENTER, fill: o.fill,
      margins: { top: 88, bottom: 88, left: 160, right: 200 },
      borders: o.top ? { ...sinBordes, top: b(RULE, 4) } : sinBordes,
    }),
  ],
});

const propuesta = tabla([
  new TableRow({
    cantSplit: true,
    children: [
      celda(p(rotulo('CONCEPTO', { size: 14, ls: 100, color: W }), { after: 0, keep: true }), {
        w: COL_A, fill: INK, valign: VerticalAlign.CENTER,
        margins: { top: 105, bottom: 105, left: 200, right: 160 },
      }),
      celda(p(rotulo('COSTO', { size: 14, ls: 100, color: W }), {
        align: AlignmentType.RIGHT, after: 0, keep: true,
      }), {
        w: COL_B, fill: INK, valign: VerticalAlign.CENTER,
        margins: { top: 105, bottom: 105, left: 160, right: 200 },
      }),
    ],
  }),
  filaConcepto('Recolección', 'Unidad tipo rabón en la plaza de origen', '$ 0.00'),
  filaConcepto('Flete', 'Monterrey – Ciudad de México, tráiler con caja seca de 48 o 53 pies', '$ 0.00'),
  filaConcepto('Servicio de entrega', 'Unidad tipo rabón en la plaza de destino', '$ 0.00'),
  filaSuma('SUBTOTAL', '$ 0.00', { top: true, keep: true }),
  filaSuma('IVA 16 %', '$ 0.00', { keep: true }),
  filaSuma('TOTAL', '$ 0.00', { fill: INK, color: W, size: 28, bold: true }),
], { cols: [COL_A, COL_B] });

/* ============================================================================
   PAGINA 2
   ==========================================================================*/

const CONSIDERACIONES = [
  'La presente cotización se emite con base en las características de la mercancía proporcionadas por el cliente.',
  'Todos los importes indicados son más IVA.',
  'Los precios están sujetos a validación del peso, dimensiones y condiciones reales de la mercancía al momento de la recolección.',
  'El seguro de mercancía es opcional. En caso de requerir que el embarque viaje asegurado por Fletes Tauro, el costo será de $8.00 por cada millar del valor comercial declarado de la mercancía.',
  'La cotización no incluye servicios adicionales como maniobras, almacenajes, reexpediciones, citas de entrega (las cuales deberán solicitarse con un mínimo de 48 horas de anticipación) ni cualquier otro concepto extraordinario que pudiera generarse durante la operación.',
  'Para las recolecciones y entregas locales se utilizan unidades tipo rabón, mientras que el traslado entre Monterrey y Ciudad de México se realiza en tráiler con caja seca de 48 o 53 pies, de acuerdo con la disponibilidad operativa.',
];

const listaConsideraciones = tabla(
  CONSIDERACIONES.map((texto, i) => {
    const ultima = i === CONSIDERACIONES.length - 1;
    const borde = ultima ? sinBordes : { ...sinBordes, bottom: b(SOFT, 4) };
    return new TableRow({
      cantSplit: true,
      children: [
        celda(p(txt(String(i + 1).padStart(2, '0'), {
          font: SERIF, size: 20, bold: true, color: RED, ls: 10,
        }), { after: 0 }), {
          w: 700, borders: borde, margins: { top: 172, bottom: 172, left: 0, right: 0 },
        }),
        celda(p(txt(texto, { size: 20, color: INK2 }), {
          after: 0, line: 285, align: AlignmentType.JUSTIFIED,
        }), {
          w: ANCHO - 700, borders: borde, margins: { top: 172, bottom: 172, left: 0, right: 0 },
        }),
      ],
    });
  }),
  { cols: [700, ANCHO - 700] },
);

const firma = (rotuloArriba, puesto) => celda([
  p(rotulo(rotuloArriba, { size: 13, ls: 80 }), { after: 0 }),
  vacio(34), vacio(34), vacio(34),
  p(txt('', { size: 6 }), { after: 60, before: 80, border: { top: b(RULE, 6) } }),
  p(txt(puesto, { size: 16, color: MUTED }), { after: 0 }),
], { w: 4116, margins: { top: 0, bottom: 0, left: 0, right: 0 } });

const bloqueFirmas = tabla([
  new TableRow({
    cantSplit: true,
    children: [
      firma('POR FLETES TAURO', 'Nombre, firma y puesto'),
      celda(vacio(2), { w: 840, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
      firma('ACEPTACIÓN DEL CLIENTE', 'Nombre, firma y fecha'),
    ],
  }),
], { cols: [4116, 840, 4116] });

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
        run: { font: SANS, size: 13, color: MUTED },
        paragraph: { spacing: { after: 0 } },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1152, right: 1584, bottom: 1728, left: 1584, header: 576, footer: 504 },
      },
      titlePage: true,
    },
    headers: { first: encabezadoPortada, default: encabezadoCorrido },
    footers: { first: pie(), default: pie() },
    children: [
      membrete,
      vacio(6),
      fileteMarca(),
      vacio(4),
      datos,

      seccion('01', 'Propuesta de servicio'),
      parrafo(txt('A quien corresponda:', { size: 22, color: INK, font: SERIF }), { after: 110, keep: true }),
      parrafo(txt('Agradecemos la oportunidad de cotizar su requerimiento de transporte. Con base en la información proporcionada, la presente cotización considera el traslado de la mercancía descrita a continuación:'), { after: 0, keep: true }),

      vacio(8, { keep: true }),
      fichaMercancia,

      seccion('02', 'Propuesta económica'),
      vacio(4, { keep: true }),
      propuesta,
      vacio(6),
      p(txt('Importes expresados en pesos mexicanos (M.N.). El IVA se calcula a la tasa vigente del 16 %.', { size: 16, color: MUTED }), { after: 0 }),

      seccion('03', 'Consideraciones importantes', { saltoPagina: true }),
      vacio(8, { keep: true }),
      listaConsideraciones,

      seccion('04', 'Vigencia y aceptación'),
      vacio(8, { keep: true }),
      parrafo(txt('Esta cotización tiene una vigencia de 15 días naturales a partir de la fecha de emisión. Para confirmar el servicio basta con devolver este documento firmado o enviar su aceptación por correo electrónico al ejecutivo de cuenta.')),
      parrafo(txt('Quedamos a sus órdenes para cualquier aclaración y agradecemos la confianza depositada en Fletes Tauro.'), { after: 0 }),

      vacio(46),
      bloqueFirmas,
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const salida = path.join(__dirname, 'COTIZACION_FLETES_TAURO_2026.docx');
  fs.writeFileSync(salida, buf);
  console.log('OK ->', salida, (buf.length / 1024).toFixed(0) + ' KB');
});
