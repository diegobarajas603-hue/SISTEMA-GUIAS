/* ============================================================================
   FLETES TAURO — COTIZACION 2026 (formato premium, una hoja)

   El contenido es exactamente el del documento original: los cuatro parrafos,
   la tabla de tres conceptos y las seis consideraciones. No se agrega ningun
   dato; lo unico que cambia es como esta puesto en la hoja.

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
   Texto blanco sobre grafito: 13.5:1. */
const INK     = '23272B';   // grafito — titulos y conceptos
const CUERPO  = '4F545A';   // texto corrido
const MUTED   = '767369';   // rotulos en versalitas
const FILETE  = 'D9D3C9';   // pelo calido
const FILETE2 = 'EBE7E0';   // pelo tenue
const VINO    = '8A3B33';   // acento
const GRAFITO = '2B2F34';   // banda del encabezado de tabla
const W       = 'FFFFFF';

const SERIF = 'Cambria';
const SANS  = 'Calibri';

/* ---------- Medidas ---------- */
const ANCHO = 9360;               // ancho util en DXA (Carta con margenes de 1")
const NADA  = BorderStyle.NONE;
const b = (color, size, style = BorderStyle.SINGLE) => ({ style, size, color });
const sinBordes = {
  top: { style: NADA }, bottom: { style: NADA }, left: { style: NADA },
  right: { style: NADA }, insideHorizontal: { style: NADA }, insideVertical: { style: NADA },
};

/* ---------- Atomos de texto ---------- */
const txt = (text, o = {}) => new TextRun({
  text, font: o.font || SANS, size: o.size || 21, bold: o.bold || false,
  color: o.color || CUERPO, characterSpacing: o.ls,
});

/** Rotulo en versalitas espaciadas: la palanca que hace que se vea caro. */
const rotulo = (text, o = {}) => txt(text, {
  size: o.size || 14, bold: true, color: o.color || MUTED, ls: o.ls || 70, font: SANS,
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
});

const tabla = (rows, o = {}) => new Table({
  rows,
  columnWidths: o.cols,
  width: { size: ANCHO, type: WidthType.DXA },
  layout: TableLayoutType.FIXED,
  borders: o.borders || sinBordes,
});

/** Filete de firma: un tramo vino y el resto un pelo calido. */
const fileteMarca = (grosor = 16) => tabla([
  new TableRow({
    children: [
      celda(vacio(1), { w: 1140, borders: { ...sinBordes, bottom: b(VINO, grosor) } }),
      celda(vacio(1), { w: ANCHO - 1140, borders: { ...sinBordes, bottom: b(FILETE, 4) } }),
    ],
  }),
], { cols: [1140, ANCHO - 1140] });

/** Parrafo de cuerpo. */
const parrafo = (texto, o = {}) => p(txt(texto, { size: 21 }), {
  after: o.after === undefined ? 230 : o.after,
  line: 305, align: AlignmentType.JUSTIFIED, keep: o.keep,
});

/* ============================================================================
   ENCABEZADO Y PIE
   El membrete de la hoja 1 va en el cuerpo. El logotipo, las direcciones de las
   dos plazas y el sitio web son los mismos de la papeleria original.
   ==========================================================================*/

const encabezadoPortada = new Header({ children: [p(txt('', { size: 2 }))] });

/** Red de seguridad: si la cotizacion creciera y pasara de una hoja, las
    siguientes salen membretadas solas. */
const encabezadoCorrido = new Header({
  children: [
    tabla([
      new TableRow({
        children: [
          celda(p(new ImageRun({
            type: 'png', data: logoSm, transformation: { width: 82, height: 56 },
          }), { after: 0 }), {
            w: 4680, valign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 90, left: 0, right: 0 },
          }),
          celda(p(rotulo('COTIZACIÓN', { size: 12, ls: 80 }), {
            align: AlignmentType.RIGHT, after: 0,
          }), {
            w: 4680, valign: VerticalAlign.BOTTOM,
            margins: { top: 0, bottom: 110, left: 0, right: 0 },
          }),
        ],
      }),
    ], { cols: [4680, 4680], borders: { ...sinBordes, bottom: b(FILETE, 4) } }),
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
          ]), { w: 3460, margins: { top: 0, bottom: 0, left: 0, right: 200 } }),
          celda(bloqueDireccion('MÉXICO', [
            'Álamo No. 28 / Av. Ceylán Esq. Encino, Col. Tabla Honda',
            'Tlalnepantla, Edo. de México  ·  Tel. (55) 5308-7500',
          ]), { w: 3460, margins: { top: 0, bottom: 0, left: 0, right: 200 } }),
          celda(p(txt('www.grupotauro.com.mx', { size: 14, bold: true, color: VINO }), {
            align: AlignmentType.RIGHT, after: 0,
          }), {
            w: 2440, valign: VerticalAlign.BOTTOM,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
          }),
        ],
      }),
    ], { cols: [3460, 3460, 2440] }),
  ],
});

/* ============================================================================
   MEMBRETE
   ==========================================================================*/

const membrete = tabla([
  new TableRow({
    children: [
      celda(p(new ImageRun({
        type: 'png', data: logo, transformation: { width: 132, height: 89 },
      }), { after: 0 }), { w: 4600, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
      celda(p(txt('COTIZACIÓN', { font: SERIF, size: 38, color: INK, ls: 120 }), {
        align: AlignmentType.RIGHT, after: 0,
      }), {
        w: ANCHO - 4600, valign: VerticalAlign.BOTTOM,
        margins: { top: 0, bottom: 60, left: 0, right: 0 },
      }),
    ],
  }),
], { cols: [4600, ANCHO - 4600] });

/* ============================================================================
   TABLA DE CONCEPTOS
   Los tres conceptos del original, con la columna de costo lista para escribir
   el importe. Todas las filas menos la ultima llevan keepNext para que la tabla
   no se parta si el documento creciera.
   ==========================================================================*/

const COL_A = 6560;
const COL_B = ANCHO - COL_A;

const filaConcepto = (concepto, ultima = false) => new TableRow({
  cantSplit: true,
  children: [
    celda(p(txt(concepto, { size: 22, color: INK }), { after: 0, keep: !ultima }), {
      w: COL_A, valign: VerticalAlign.CENTER,
      margins: { top: 195, bottom: 195, left: 200, right: 160 },
      borders: { ...sinBordes, bottom: b(ultima ? FILETE : FILETE2, 4) },
    }),
    celda(p(txt('$', { font: SERIF, size: 22, color: INK }), {
      align: AlignmentType.RIGHT, after: 0, keep: !ultima,
    }), {
      w: COL_B, valign: VerticalAlign.CENTER,
      margins: { top: 195, bottom: 195, left: 160, right: 200 },
      borders: { ...sinBordes, bottom: b(ultima ? FILETE : FILETE2, 4) },
    }),
  ],
});

const conceptos = tabla([
  new TableRow({
    cantSplit: true,
    children: [
      celda(p(rotulo('CONCEPTO', { size: 14, ls: 100, color: W }), { after: 0, keep: true }), {
        w: COL_A, fill: GRAFITO, valign: VerticalAlign.CENTER,
        margins: { top: 130, bottom: 130, left: 200, right: 160 },
      }),
      celda(p(rotulo('COSTO', { size: 14, ls: 100, color: W }), {
        align: AlignmentType.RIGHT, after: 0, keep: true,
      }), {
        w: COL_B, fill: GRAFITO, valign: VerticalAlign.CENTER,
        margins: { top: 130, bottom: 130, left: 160, right: 200 },
      }),
    ],
  }),
  filaConcepto('Recolección'),
  filaConcepto('Flete'),
  filaConcepto('Servicio de entrega', true),
], { cols: [COL_A, COL_B] });

/* ============================================================================
   CONSIDERACIONES IMPORTANTES
   ==========================================================================*/

const CONSIDERACIONES = [
  'La presente cotización se emite con base en las características de la mercancía proporcionadas por el cliente.',
  'Todos los importes indicados son más IVA.',
  'Los precios están sujetos a validación del peso, dimensiones y condiciones reales de la mercancía al momento de la recolección.',
  'El seguro de mercancía es opcional. En caso de requerir que el embarque viaje asegurado por Fletes Tauro, el costo será de $8.00 por cada millar del valor comercial declarado de la mercancía.',
  'La cotización no incluye servicios adicionales como maniobras, almacenajes, reexpediciones, citas de entrega (las cuales deberán solicitarse con un mínimo de 48 horas de anticipación) ni cualquier otro concepto extraordinario que pudiera generarse durante la operación.',
  'Para las recolecciones y entregas locales se utilizan unidades tipo rabón, mientras que el traslado entre Monterrey y Ciudad de México se realiza en tráiler con caja seca de 48 o 53 pies, de acuerdo con la disponibilidad operativa.',
];

/** La viñeta del original pasa a un numeral con sangria francesa: mismo papel
    de marcador de lista, mejor alineacion del bloque. */
const consideracion = (texto, i) => p([
  txt(String(i + 1).padStart(2, '0'), { font: SERIF, size: 17, bold: true, color: VINO }),
  txt('\t'),
  txt(texto, { size: 19, color: CUERPO }),
], {
  after: 185, line: 295, align: AlignmentType.JUSTIFIED,
  indent: { left: 420, hanging: 420 },
});

/* ============================================================================
   DOCUMENTO
   ==========================================================================*/

const doc = new Document({
  creator: 'Fletes Tauro',
  title: 'Cotización',
  description: 'Formato de cotización — Fletes Tauro 2026',
  styles: {
    default: {
      document: {
        run: { font: SANS, size: 21, color: CUERPO },
        paragraph: { spacing: { after: 0 } },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1008, right: 1440, bottom: 1400, left: 1440, header: 500, footer: 440 },
      },
      titlePage: true,
    },
    headers: { first: encabezadoPortada, default: encabezadoCorrido },
    footers: { first: pie(), default: pie() },
    children: [
      membrete,
      vacio(8),
      fileteMarca(),
      vacio(36),

      p(txt('A quien corresponda:', { font: SERIF, size: 23, color: INK }), {
        after: 250, keep: true,
      }),
      parrafo('Agradecemos la oportunidad de cotizar su requerimiento de transporte.'),
      parrafo('Con base en la información proporcionada, la presente cotización considera el traslado de 2 tarimas, con dimensiones de 1.20 m de largo, 1.00 m de ancho y 1.50 m de alto, así como un peso aproximado de 2,000 kg.'),
      parrafo('De acuerdo con las características de la mercancía anteriormente descritas, ponemos a su consideración la siguiente propuesta económica:', { after: 0, keep: true }),

      vacio(28, { keep: true }),
      conceptos,

      p(rotulo('CONSIDERACIONES IMPORTANTES', { size: 16, ls: 90, color: INK }), {
        before: 560, after: 185, border: { bottom: b(FILETE, 4) }, keep: true,
      }),
      vacio(16, { keep: true }),
      ...CONSIDERACIONES.map(consideracion),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const salida = path.join(__dirname, 'COTIZACION_FLETES_TAURO_2026.docx');
  fs.writeFileSync(salida, buf);
  console.log('OK ->', salida, (buf.length / 1024).toFixed(0) + ' KB');
});
