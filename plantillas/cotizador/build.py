# -*- coding: utf-8 -*-
"""Generador de la plantilla de cotizaciones de Fletes Tauro.

Produce:
  * PLANTILLA_COTIZACION_FLETES_TAURO.docm  (plantilla con macro)
  * PLANTILLA_COTIZACION_FLETES_TAURO.docx  (misma plantilla sin macro)
  * EJEMPLO_1/2/3.docx                      (cotizaciones ya generadas)

Uso:  python3 build.py [directorio_salida]
"""
import os
import struct
import sys
import zipfile

import ooxml as O
import tarifas as T
import textos as X
from ooxml import (BG, BG_WARM, CHAMPAGNE, FONT, FONT_LIGHT, FONT_SEMI, GRAPHITE,
                   GRAY_SOFT, GRAY_TXT, LINE, LINE_SOFT, NAVY, NAVY_DARK, PETROL,
                   WHITE, border, cell, para, row, run, table)

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")

CONTENT_W = 10080          # ancho util de la pagina en twips
MODE_TPL = "plantilla"
MODE_DOC = "documento"

NS = (
    'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
    'xmlns:o="urn:schemas-microsoft-com:office:office" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
    'xmlns:v="urn:schemas-microsoft-com:vml" '
    'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" '
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:w10="urn:schemas-microsoft-com:office:word" '
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
    'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" '
    'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" '
    'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" '
    'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" '
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
    'mc:Ignorable="w14 w15 wp14"'
)

XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'


# ==========================================================================
# Empaquetado OPC
# ==========================================================================
class Package(object):
    def __init__(self):
        self.parts = {}
        self.rels = {}
        self._rid = {}

    def add(self, path, data):
        if isinstance(data, str):
            data = data.encode("utf-8")
        self.parts[path] = data

    def rel(self, source, rtype, target, mode=None):
        lst = self.rels.setdefault(source, [])
        n = self._rid.get(source, 0) + 1
        self._rid[source] = n
        rid = "rId%d" % n
        lst.append((rid, rtype, target, mode))
        return rid

    def _rels_xml(self, source):
        items = "".join(
            '<Relationship Id="%s" Type="%s" Target="%s"%s/>'
            % (rid, rtype, target, ' TargetMode="%s"' % mode if mode else "")
            for rid, rtype, target, mode in self.rels[source])
        return (XML_DECL + '<Relationships xmlns="http://schemas.openxmlformats'
                '.org/package/2006/relationships">%s</Relationships>' % items)

    def save(self, path, content_types):
        self.add("[Content_Types].xml", content_types)
        for source in list(self.rels):
            if source == "":
                rels_path = "_rels/.rels"
            else:
                d, f = os.path.split(source)
                rels_path = "%s/_rels/%s.rels" % (d, f)
            self.add(rels_path, self._rels_xml(source))
        if os.path.exists(path):
            os.remove(path)
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            order = ["[Content_Types].xml", "_rels/.rels"]
            for p in order:
                z.writestr(p, self.parts[p])
            for p, data in self.parts.items():
                if p not in order:
                    z.writestr(p, data)


REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
REL_MS = "http://schemas.microsoft.com/office/2006/relationships/"


def png_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
    return struct.unpack(">II", head[16:24])


def emu_for(path, width_in):
    w, h = png_size(path)
    cx = int(width_in * O.EMU_PER_INCH)
    cy = int(cx * h / float(w))
    return cx, cy


# ==========================================================================
# Piezas visuales reutilizables
# ==========================================================================
def rule(accent_w=1500, accent=CHAMPAGNE, rest=LINE, sz_accent=12, sz_rest=4,
         before=0, after=0, total=CONTENT_W):
    """Filete con un tramo de acento champagne y el resto en gris tenue."""
    return table(
        [row([
            cell(para(run("", sz=2), before=before, after=after), accent_w,
                 bd=dict(bottom=border(sz_accent, accent))),
            cell(para(run("", sz=2), before=before, after=after), total - accent_w,
                 bd=dict(bottom=border(sz_rest, rest))),
        ], height=1)],
        [accent_w, total - accent_w])


def section_label(text, before=340, after=160):
    """Etiqueta de seccion: tick champagne + versalitas navy + filete."""
    return para(
        run(text, font=FONT_SEMI, sz=17, color=NAVY, caps=True, spacing=60, b=True),
        before=before, after=after, ind_left=190, keep_next=True,
        pbd=dict(left=border(16, CHAMPAGNE, space=7),
                 bottom=border(4, LINE, space=7)))


def label_value(label, value_xml, width, fill=None, bd=None, align=None,
                margins=(120, 160, 120, 160), keep=False):
    content = (
        para(run(label, font=FONT, sz=14, color=GRAY_SOFT, caps=True, spacing=50),
             after=30, jc=align, keep_next=keep)
        + para(value_xml, jc=align, keep_next=keep))
    return cell(content, width, fill=fill, bd=bd, valign="top", margins=margins)


def fld(mode, tag, value, kind="text", items=None, **kw):
    """Devuelve un control de contenido (plantilla) o texto plano (documento)."""
    if mode == MODE_TPL:
        if kind == "drop":
            return O.sdt_dropdown(tag, value, items, **kw)
        return O.sdt_text(tag, value, **kw)
    return run(value, **kw)


VAL = dict(font=FONT_SEMI, sz=20, color=NAVY, b=True)
VAL_SM = dict(font=FONT, sz=19, color=GRAPHITE)
BODY = dict(font=FONT, sz=20, color=GRAPHITE)


# ==========================================================================
# Encabezado y pie de la seccion de cotizacion
# ==========================================================================
def header_cotizacion(rid_logo, cx, cy):
    left = cell(para(O.image_run(rid_logo, cx, cy, "Fletes Tauro"), after=0),
                4200, valign="center", margins=(0, 0, 0, 0))
    right = cell(
        para(run("Monterrey · Ciudad de México", font=FONT, sz=14,
                 color=GRAY_SOFT, caps=True, spacing=60), jc="right", after=40)
        + para(run(X.WEB, font=FONT_SEMI, sz=18, color=NAVY, b=True),
               jc="right"),
        CONTENT_W - 4200, valign="center", margins=(0, 0, 0, 0))
    tbl = table([row([left, right], height=940)], [4200, CONTENT_W - 4200])
    return tbl + rule(before=60) + para(run("", sz=8), after=0)


def footer_cotizacion(rid_grupo, cx, cy, campo_total="NUMPAGES"):
    """Pie tipo papeleria: filete, datos corporativos y folio de pagina."""
    top = table(
        [row([
            cell(para(run("", sz=2)), 1500, bd=dict(top=border(12, CHAMPAGNE))),
            cell(para(run("", sz=2)), CONTENT_W - 1500,
                 bd=dict(top=border(4, LINE))),
        ], height=1)],
        [1500, CONTENT_W - 1500])

    def direccion(info, lineas):
        return (para(run(info["titulo"], font=FONT_SEMI, sz=13, color=NAVY,
                         caps=True, spacing=70, b=True), before=70, after=25)
                + "".join(para(run(l, font=FONT, sz=12, color=GRAY_TXT), after=6)
                          for l in lineas))

    g = [2100, 3990, CONTENT_W - 2100 - 3990]
    c1 = cell(
        para(run("Una empresa de", font=FONT, sz=12, color=GRAY_SOFT, caps=True,
                 spacing=50), before=90, after=50)
        + para(O.image_run(rid_grupo, cx, cy, "Grupo Tauro")),
        g[0], valign="top", margins=(0, 0, 0, 160))
    c2 = cell(direccion(X.MATRIZ, [
        "Carretera a Laredo Km. 16.5 No. 16501 · Col. Moisés Sáenz",
        "Apodaca, N.L., C.P. 66613 · Tel.: (81) 1958-0740"]),
        g[1], valign="top", margins=(0, 0, 0, 200),
        bd=dict(left=border(4, LINE)))
    c3 = cell(direccion(X.MEXICO, [
        "Álamo No. 28 / Av. Ceylán Esq. Encino · Col. Tabla Honda",
        "Tlalnepantla, Edo. de México · Tel.: (55) 5308-7500"]),
        g[2], valign="top", margins=(0, 0, 0, 200),
        bd=dict(left=border(4, LINE)))
    datos = table([row([c1, c2, c3])], g)

    izq = cell(
        para(run("FLETES TAURO", font=FONT_SEMI, sz=13, color=NAVY, caps=True,
                 spacing=50, b=True)
             + run("   ·   ", font=FONT, sz=13, color=LINE)
             + run(X.WEB, font=FONT, sz=13, color=GRAY_SOFT), before=110),
        6600, valign="center", margins=(0, 0, 0, 0),
        bd=dict(top=border(4, LINE_SOFT)))
    der = cell(
        para(run("Página ", font=FONT, sz=13, color=GRAY_SOFT)
             + O.field("PAGE", "1", font=FONT, sz=13, color=NAVY, b=True)
             + run(" de ", font=FONT, sz=13, color=GRAY_SOFT)
             + O.field(campo_total, "1", font=FONT, sz=13, color=NAVY, b=True),
             jc="right", before=110),
        CONTENT_W - 6600, valign="center", margins=(0, 0, 0, 0),
        bd=dict(top=border(4, LINE_SOFT)))
    return top + datos + table([row([izq, der], height=1)],
                               [6600, CONTENT_W - 6600])


def header_interno(titulo):
    return table(
        [row([
            cell(para(run(titulo, font=FONT_SEMI, sz=14, color=CHAMPAGNE,
                          caps=True, spacing=80, b=True), before=40, after=40),
                 CONTENT_W, bd=dict(bottom=border(4, LINE)),
                 margins=(0, 0, 60, 0)),
        ], height=1)],
        [CONTENT_W]) + para(run("", sz=8))


def footer_interno():
    return para(
        run("Documento de trabajo interno · Fletes Tauro", font=FONT, sz=13,
            color=GRAY_SOFT) + run("        ", font=FONT, sz=13)
        + O.field("PAGE", "1", font=FONT, sz=13, color=GRAY_SOFT),
        jc="right", pbd=dict(top=border(4, LINE_SOFT, space=6)), before=60)


# ==========================================================================
# SECCION 2 - LA COTIZACION (lo que ve el cliente)
# ==========================================================================
def barra_titulo():
    return table(
        [row([cell(
            para(run("COTIZACIÓN", font=FONT_LIGHT, sz=40, color=WHITE,
                     spacing=120), after=0),
            CONTENT_W, fill=NAVY, valign="center",
            margins=(170, 300, 170, 300))], height=760)],
        [CONTENT_W])


def bloque_servicio(mode, d):
    p = []
    p.append(para(run(X.SALUDO, font=FONT_SEMI, sz=20, color=NAVY, b=True),
                  after=140))
    p.append(para(run(X.INTRO_1, **BODY), after=120, line=258))
    # El parrafo con las cifras de la mercancia conserva la redaccion original.
    a, rest = X.INTRO_2.split("{tarimas}")
    b, rest = rest.split("{largo}")
    c, rest = rest.split("{ancho}")
    e, f = rest.split("{alto}")
    g, h = f.split("{peso}")
    strong = dict(font=FONT_SEMI, sz=20, color=NAVY, b=True)
    p.append(para(
        run(a, **BODY) + fld(mode, "merc_tarimas", d["tarimas"], **strong)
        + run(b, **BODY) + fld(mode, "merc_largo", d["largo"], **strong)
        + run(c, **BODY) + fld(mode, "merc_ancho", d["ancho"], **strong)
        + run(e, **BODY) + fld(mode, "merc_alto", d["alto"], **strong)
        + run(g, **BODY) + fld(mode, "merc_peso", d["peso"], **strong)
        + run(h, **BODY), after=120, line=258, jc="both"))
    p.append(para(run(X.INTRO_3, **BODY), after=0, line=258, jc="both"))
    return "".join(p)


def tabla_conceptos(conceptos, total, show_iva=False, mode=MODE_DOC):
    """conceptos: lista de (etiqueta, importe)."""
    grid = [7080, CONTENT_W - 7080]
    rows = [row([
        cell(para(run("Concepto", font=FONT_SEMI, sz=17, color=WHITE, caps=True,
                      spacing=70, b=True)), grid[0], fill=NAVY,
             margins=(140, 220, 140, 220)),
        cell(para(run("Costo", font=FONT_SEMI, sz=17, color=WHITE, caps=True,
                      spacing=70, b=True), jc="right"), grid[1], fill=NAVY,
             margins=(120, 220, 120, 220)),
    ], height=540, header=True)]

    for i, (etiqueta, importe) in enumerate(conceptos):
        fill = WHITE if i % 2 == 0 else BG
        rows.append(row([
            cell(para(run(etiqueta, font=FONT, sz=20, color=GRAPHITE)), grid[0],
                 fill=fill, bd=dict(bottom=border(4, LINE_SOFT)),
                 margins=(130, 220, 130, 220)),
            cell(para(run(T.money(importe), font=FONT_SEMI, sz=20, color=NAVY,
                          b=True), jc="right"), grid[1], fill=fill,
                 bd=dict(bottom=border(4, LINE_SOFT)),
                 margins=(110, 220, 110, 220)),
        ], height=480))

    if show_iva:
        subtotal = total
        iva = round(subtotal * 0.16, 2)
        for etiqueta, valor, bold in (("Subtotal", subtotal, False),
                                      ("IVA 16%", iva, False)):
            rows.append(row([
                cell(para(run(etiqueta, font=FONT, sz=18, color=GRAY_TXT,
                              caps=True, spacing=40), jc="right"), grid[0],
                     bd=dict(bottom=border(4, LINE_SOFT)),
                     margins=(110, 220, 110, 220)),
                cell(para(run(T.money(valor), font=FONT_SEMI, sz=19,
                              color=GRAPHITE, b=True), jc="right"), grid[1],
                     bd=dict(bottom=border(4, LINE_SOFT)),
                     margins=(110, 220, 110, 220)),
            ], height=480))
        total = round(subtotal + iva, 2)

    rows.append(row([
        cell(para(run("Total", font=FONT_SEMI, sz=22, color=WHITE, caps=True,
                      spacing=90, b=True)), grid[0], fill=NAVY,
             bd=dict(top=border(12, CHAMPAGNE)), margins=(150, 220, 150, 220)),
        cell(para(run(T.money(total), font=FONT_SEMI, sz=28, color=WHITE, b=True),
                  jc="right"), grid[1], fill=NAVY,
             bd=dict(top=border(12, CHAMPAGNE)), margins=(150, 220, 150, 220)),
    ], height=700))
    return table(rows, grid, caption="tblConceptos")


def bloque_consideraciones():
    out = []
    for texto in X.CONSIDERACIONES:
        out.append(para(run(texto, font=FONT, sz=16, color=GRAPHITE),
                        num=(1, 0), after=60, line=232, ind_left=420,
                        ind_hanging=420, contextual=True, jc="both"))
    return "".join(out)


def seccion_cotizacion(mode, d):
    """Una sola hoja con el contenido literal del formato de Fletes Tauro."""
    conceptos = d["conceptos"]
    total = round(sum(c[1] for c in conceptos), 2)
    out = []
    out.append(barra_titulo())
    out.append(para(run("", sz=6), after=0))
    out.append(bloque_servicio(mode, d))
    out.append(section_label("Propuesta económica", before=280, after=130))
    out.append(tabla_conceptos(conceptos, total, d.get("iva", False)))
    out.append(section_label("Consideraciones importantes", before=280,
                             after=130))
    out.append(bloque_consideraciones())
    return "".join(out)


# ==========================================================================
# SECCION 1 - PANEL DE COTIZACION
# ==========================================================================
PASOS = [
    "Captura las cifras de la mercancía —tarimas, medidas y peso— "
    "directamente en el párrafo de la cotización. Los campos sombreados son "
    "controles de Word: haz clic y escribe.",
    "En la tabla CONCEPTOS A INCLUIR marca la casilla ☒ de cada concepto que "
    "deba aparecer en la cotización y elige su modalidad y su tabulador en las "
    "listas desplegables.",
    "Presiona Ctrl + Shift + G (o Vista ▸ Macros ▸ GenerarCotizacion) para "
    "calcular los importes y armar la tabla que verá el cliente.",
    "Presiona Ctrl + Shift + P (o ejecuta ExportarCotizacionPDF) para obtener "
    "el documento limpio: se eliminan este panel y los tabuladores, y se guarda "
    "el PDF listo para enviar.",
]


def caja_instrucciones():
    contenido = [para(run("Cómo se usa esta plantilla", font=FONT_SEMI, sz=19,
                          color=NAVY, b=True), after=120)]
    for i, paso in enumerate(PASOS, 1):
        contenido.append(para(
            run("%d." % i, font=FONT_SEMI, sz=18, color=CHAMPAGNE, b=True)
            + run("   ", font=FONT, sz=18)
            + run(paso, font=FONT, sz=18, color=GRAPHITE),
            after=75, line=248, ind_left=340, ind_hanging=340))
    contenido.append(para(
        run("Si Word bloquea las macros: cierra el archivo, clic derecho ▸ "
            "Propiedades ▸ marca «Desbloquear» y vuelve a abrirlo.",
            font=FONT, sz=16, color=GRAY_TXT, i=True),
        before=60, ind_left=340))
    return table(
        [row([cell("".join(contenido), CONTENT_W, fill=BG_WARM,
                   valign="top", margins=(200, 280, 200, 280),
                   bd=dict(left=border(18, CHAMPAGNE)))])],
        [CONTENT_W])


def panel_conceptos(mode, seleccion=None):
    grid = [620, 2460, 2600, 2800, CONTENT_W - 620 - 2460 - 2600 - 2800]
    heads = ["✓", "Concepto", "Modalidad / Ruta",
             "Tabulador / Zona / Servicio", "Importe"]
    rows = [row([
        cell(para(run(h, font=FONT_SEMI, sz=15, color=WHITE, caps=True,
                      spacing=50, b=True),
                  jc="center" if i == 0 else ("right" if i == 4 else None)),
             grid[i], fill=NAVY, margins=(110, 150, 110, 150))
        for i, h in enumerate(heads)], height=500, header=True)]

    seleccion = seleccion or {}
    for clave, etiqueta, opciones_mod, opciones_tab in T.CONCEPTOS:
        sel = seleccion.get(clave, {})
        marcado = sel.get("check", False)
        mod = sel.get("modalidad", opciones_mod[0])
        tab = sel.get("opcion", opciones_tab[0])
        imp = sel.get("importe", "")
        fill = BG if marcado else WHITE
        bd = dict(bottom=border(4, LINE_SOFT), right=border(4, LINE_SOFT))
        bd_last = dict(bottom=border(4, LINE_SOFT))
        rows.append(row([
            cell(para(O.sdt_checkbox("chk_%s" % clave, marcado)
                      if mode == MODE_TPL
                      else run("☒" if marcado else "☐", font="MS Gothic",
                               sz=24, color=NAVY), jc="center"),
                 grid[0], fill=fill, bd=bd, margins=(100, 60, 100, 60)),
            cell(para(fld(mode, "lbl_%s" % clave, etiqueta, font=FONT_SEMI,
                          sz=18, color=NAVY, b=True)),
                 grid[1], fill=fill, bd=bd, margins=(100, 150, 100, 150)),
            cell(para(fld(mode, "mod_%s" % clave, mod, kind="drop",
                          items=opciones_mod, font=FONT, sz=17,
                          color=GRAPHITE)),
                 grid[2], fill=fill, bd=bd, margins=(100, 150, 100, 150)),
            cell(para(fld(mode, "tab_%s" % clave, tab, kind="drop",
                          items=opciones_tab, font=FONT, sz=17,
                          color=GRAPHITE)),
                 grid[3], fill=fill, bd=bd, margins=(100, 150, 100, 150)),
            cell(para(fld(mode, "imp_%s" % clave, imp, font=FONT_SEMI, sz=18,
                          color=NAVY, b=True), jc="right"),
                 grid[4], fill=fill, bd=bd_last, margins=(70, 150, 70, 150)),
        ], height=450))
    return table(rows, grid, caption="panelConceptos")


def panel_opciones(mode, d):
    grid = [3400, 2400, CONTENT_W - 3400 - 2400]
    bd = dict(bottom=border(4, LINE_SOFT), right=border(4, LINE_SOFT))
    filas = [
        ("Mostrar desglose de IVA", "opt_iva", "Sí" if d.get("iva") else "No",
         ["No", "Sí"],
         "Agrega Subtotal e IVA 16% antes del Total."),
        ("Valor declarado", "merc_valor", d["valor"], None,
         "Sólo se usa para calcular el seguro."),
    ]
    rows = [row([
        cell(para(run(h, font=FONT_SEMI, sz=15, color=WHITE, caps=True,
                      spacing=50, b=True)), grid[i], fill=NAVY,
             margins=(120, 150, 120, 150))
        for i, h in enumerate(["Opción", "Valor", "Descripción"])],
        height=420, header=True)]
    for etiqueta, tag, val, items, ayuda in filas:
        rows.append(row([
            cell(para(run(etiqueta, font=FONT_SEMI, sz=18, color=NAVY, b=True)),
                 grid[0], bd=bd, margins=(110, 150, 110, 150)),
            cell(para(fld(mode, tag, val, kind="drop" if items else "text",
                          items=items, font=FONT, sz=17, color=GRAPHITE)),
                 grid[1], bd=bd, margins=(110, 150, 110, 150)),
            cell(para(run(ayuda, font=FONT, sz=16, color=GRAY_TXT)),
                 grid[2], bd=dict(bottom=border(4, LINE_SOFT)),
                 margins=(80, 150, 80, 150)),
        ], height=420))
    return table(rows, grid, caption="panelOpciones")


def seccion_panel(mode, d):
    out = []
    out.append(para(run("Panel de cotización", font=FONT_LIGHT, sz=36,
                        color=NAVY, spacing=20), after=50))
    out.append(para(run("Uso interno · esta sección no se envía al cliente",
                        font=FONT_SEMI, sz=16, color=CHAMPAGNE, caps=True,
                        spacing=80, b=True), after=170))
    out.append(rule(before=0, after=0))
    out.append(para(run("", sz=10), after=90))
    out.append(caja_instrucciones())

    out.append(section_label("Conceptos a incluir", before=280,
                             after=130))
    out.append(para(run("Marca únicamente los conceptos que deben aparecer en "
                        "la cotización. Las filas no marcadas se omiten por "
                        "completo de la tabla final.", font=FONT, sz=17,
                        color=GRAY_TXT), after=130))
    out.append(panel_conceptos(mode, d.get("seleccion")))
    out.append(para(run("Para agregar un concepto: copia una fila, cámbiale el "
                        "nombre y elige «Importe manual» en Modalidad.",
                        font=FONT, sz=16, color=GRAY_TXT, i=True), before=100))

    out.append(section_label("Opciones del documento", before=160,
                             after=100))
    out.append(panel_opciones(mode, d))
    return "".join(out)


# ==========================================================================
# SECCION 3 - TABULADORES Y TARIFAS
# ==========================================================================
def tabla_tarifas(caption, titulo, heads, filas, grid, aligns=None,
                  nota=None):
    aligns = aligns or [None] * len(heads)
    rows = [row([
        cell(para(run(h, font=FONT_SEMI, sz=15, color=WHITE, caps=True,
                      spacing=50, b=True), jc=aligns[i]),
             grid[i], fill=NAVY, margins=(120, 160, 120, 160))
        for i, h in enumerate(heads)], height=520, header=True)]
    for j, fila in enumerate(filas):
        fill = WHITE if j % 2 == 0 else BG
        cells = []
        for i, v in enumerate(fila):
            es_ultimo = i == len(fila) - 1
            bd = dict(bottom=border(4, LINE_SOFT),
                      right=None if es_ultimo else border(4, LINE_SOFT))
            negrita = aligns[i] == "right"
            cells.append(cell(
                para(run(v, font=FONT_SEMI if negrita else FONT, sz=18,
                         color=NAVY if negrita else GRAPHITE, b=negrita),
                     jc=aligns[i]),
                grid[i], fill=fill, bd=bd, margins=(110, 160, 110, 160)))
        rows.append(row(cells, height=480))
    out = section_label(titulo) + table(rows, grid, caption=caption)
    if nota:
        out += para(run(nota, font=FONT, sz=16, color=GRAY_TXT, i=True),
                    before=120)
    return out


def seccion_tabuladores():
    out = []
    out.append(para(run("Tabuladores y tarifas", font=FONT_LIGHT, sz=40,
                        color=NAVY, spacing=20), after=60))
    out.append(para(run("Uso interno · configuración de precios", font=FONT_SEMI,
                        sz=16, color=CHAMPAGNE, caps=True, spacing=80, b=True),
                    after=200))
    out.append(rule(before=0, after=0))
    out.append(para(run("", sz=12), after=120))
    out.append(table(
        [row([cell(
            para(run("Para actualizar precios sólo edita la columna TARIFA de "
                     "estas tablas. No cambies los encabezados ni el orden de "
                     "las columnas: el macro lee estas tablas por su título "
                     "interno. Puedes agregar o quitar filas libremente.",
                     font=FONT, sz=18, color=GRAPHITE), line=260),
            CONTENT_W, fill=BG_WARM, valign="top", margins=(220, 300, 220, 300),
            bd=dict(left=border(18, CHAMPAGNE)))])],
        [CONTENT_W]))

    money = lambda v: T.money(v)
    w = CONTENT_W

    out.append(tabla_tarifas(
        "tabRecoleccion", "Tabulador de recolección · dentro de zona",
        ["Rango de peso", "Peso máximo (kg)", "Tarifa"],
        [(r, "{:,}".format(m), money(t)) for r, m, t in T.TAB_RECOLECCION],
        [4600, 2600, w - 4600 - 2600], [None, "center", "right"],
        nota="Cuando la modalidad es «Dentro de zona» y el tabulador es "
             "«Automático por peso», el macro elige el primer renglón cuyo peso "
             "máximo sea igual o mayor al peso capturado en la cotización."))

    out.append(tabla_tarifas(
        "tabEntrega", "Tabulador de entrega · dentro de zona",
        ["Rango de peso", "Peso máximo (kg)", "Tarifa"],
        [(r, "{:,}".format(m), money(t)) for r, m, t in T.TAB_ENTREGA],
        [4600, 2600, w - 4600 - 2600], [None, "center", "right"]))

    out.append(tabla_tarifas(
        "tabZonas", "Zonas foráneas · recolección y entrega fuera de zona",
        ["Zona", "Cobertura", "Tarifa recolección", "Tarifa entrega"],
        [(z, c, money(tr), money(te)) for z, c, tr, te in T.TAB_ZONAS],
        [1500, 4180, 2200, w - 1500 - 4180 - 2200],
        [None, None, "right", "right"]))

    out.append(tabla_tarifas(
        "tabFletes", "Fletes Monterrey – Ciudad de México",
        ["Ruta", "Servicio", "Tarifa"],
        [(r, s, money(t)) for r, s, t in T.TAB_FLETES],
        [3600, 4180, w - 3600 - 4180], [None, None, "right"]))

    out.append(tabla_tarifas(
        "tabManiobras", "Maniobras de carga y descarga",
        ["Concepto", "Tarifa"],
        [(c, money(t)) for c, t in T.TAB_MANIOBRAS],
        [7180, w - 7180], [None, "right"]))

    out.append(tabla_tarifas(
        "tabSeguro", "Seguro de la mercancía",
        ["Concepto", "Base de cálculo", "Tarifa"],
        [(c, b, money(t)) for c, b, t in T.TAB_SEGURO],
        [3600, 4180, w - 3600 - 4180], [None, None, "right"],
        nota="«Cobertura estándar» se calcula dividiendo el valor declarado "
             "entre 1,000 y multiplicando por la tarifa, conforme a la "
             "consideración 4 de la cotización."))

    out.append(tabla_tarifas(
        "tabCita", "Cita para entrega",
        ["Concepto", "Tarifa"],
        [(c, money(t)) for c, t in T.TAB_CITA],
        [7180, w - 7180], [None, "right"]))
    return "".join(out)


# ==========================================================================
# Partes auxiliares del paquete
# ==========================================================================
def styles_xml():
    return XML_DECL + (
        '<w:styles %s>'
        '<w:docDefaults><w:rPrDefault><w:rPr>'
        '<w:rFonts w:ascii="%s" w:hAnsi="%s" w:eastAsia="%s" w:cs="%s"/>'
        '<w:color w:val="%s"/><w:sz w:val="20"/><w:szCs w:val="20"/>'
        '<w:lang w:val="es-MX" w:eastAsia="es-MX" w:bidi="ar-SA"/>'
        '</w:rPr></w:rPrDefault>'
        '<w:pPrDefault><w:pPr>'
        '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>'
        '</w:pPr></w:pPrDefault></w:docDefaults>'
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'
        '<w:name w:val="Normal"/><w:qFormat/></w:style>'
        '<w:style w:type="character" w:default="1" w:styleId="Fuentedeprrafopredeter">'
        '<w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/>'
        '<w:semiHidden/><w:unhideWhenUsed/></w:style>'
        '<w:style w:type="table" w:default="1" w:styleId="Tablanormal">'
        '<w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/>'
        '<w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>'
        '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>'
        '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>'
        '</w:tblCellMar></w:tblPr></w:style>'
        '<w:style w:type="numbering" w:default="1" w:styleId="Sinlista">'
        '<w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/>'
        '<w:unhideWhenUsed/></w:style>'
        '</w:styles>' % (NS, FONT, FONT, FONT, FONT, GRAPHITE))


def numbering_xml():
    lvls = ['<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/>'
            '<w:lvlText w:val="%%1."/><w:lvlJc w:val="left"/>'
            '<w:pPr><w:ind w:left="420" w:hanging="420"/></w:pPr>'
            '<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/><w:b/>'
            '<w:color w:val="%s"/><w:sz w:val="18"/></w:rPr></w:lvl>'
            % (FONT_SEMI, FONT_SEMI, FONT_SEMI, CHAMPAGNE)]
    for i in range(1, 9):
        lvls.append('<w:lvl w:ilvl="%d"><w:start w:val="1"/>'
                    '<w:numFmt w:val="decimal"/><w:lvlText w:val="%%%d."/>'
                    '<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="%d" '
                    'w:hanging="420"/></w:pPr></w:lvl>'
                    % (i, i + 1, 420 * (i + 1)))
    return XML_DECL + (
        '<w:numbering %s>'
        '<w:abstractNum w:abstractNumId="0">'
        '<w:multiLevelType w:val="multilevel"/>%s</w:abstractNum>'
        '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
        '</w:numbering>' % (NS, "".join(lvls)))


def settings_xml(with_vba=False):
    attached = ""
    return XML_DECL + (
        '<w:settings %s>'
        '<w:zoom w:percent="100"/>'
        '<w:defaultTabStop w:val="708"/>'
        '<w:characterSpacingControl w:val="doNotCompress"/>'
        '%s'
        '<w:compat>'
        '<w:compatSetting w:name="compatibilityMode" '
        'w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>'
        '</w:compat>'
        '<w:themeFontLang w:val="es-MX"/>'
        '</w:settings>' % (NS, attached))


def core_xml(titulo):
    return XML_DECL + (
        '<cp:coreProperties '
        'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" '
        'xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:dcmitype="http://purl.org/dc/dcmitype/" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        '<dc:title>%s</dc:title>'
        '<dc:creator>Fletes Tauro</dc:creator>'
        '<cp:lastModifiedBy>Fletes Tauro</cp:lastModifiedBy>'
        '<cp:category>Cotizaciones</cp:category>'
        '</cp:coreProperties>' % O.esc(titulo))


def app_xml():
    return XML_DECL + (
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/'
        '2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/'
        'officeDocument/2006/docPropsVTypes">'
        '<Application>Microsoft Office Word</Application>'
        '<Company>Fletes Tauro</Company></Properties>')


def content_types(with_vba=False, media=("png",), partes=()):
    defaults = ['<Default Extension="rels" ContentType="application/vnd.'
                'openxmlformats-package.relationships+xml"/>',
                '<Default Extension="xml" ContentType="application/xml"/>']
    for ext in media:
        defaults.append('<Default Extension="%s" ContentType="image/%s"/>'
                        % (ext, ext))
    if with_vba:
        defaults.append('<Default Extension="bin" ContentType="application/'
                        'vnd.ms-office.vbaProject"/>')
    doc_ct = ("application/vnd.ms-word.document.macroEnabled.main+xml"
              if with_vba else
              "application/vnd.openxmlformats-officedocument."
              "wordprocessingml.document.main+xml")
    overrides = [
        '<Override PartName="/word/document.xml" ContentType="%s"/>' % doc_ct,
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.'
        'openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
        '<Override PartName="/word/settings.xml" ContentType="application/vnd.'
        'openxmlformats-officedocument.wordprocessingml.settings+xml"/>',
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.'
        'openxmlformats-officedocument.wordprocessingml.numbering+xml"/>',
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.'
        'openxmlformats-package.core-properties+xml"/>',
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.'
        'openxmlformats-officedocument.extended-properties+xml"/>',
    ]
    for p in partes:
        if p.startswith("word/header"):
            overrides.append('<Override PartName="/%s" ContentType="application/'
                             'vnd.openxmlformats-officedocument.'
                             'wordprocessingml.header+xml"/>' % p)
        elif p.startswith("word/footer"):
            overrides.append('<Override PartName="/%s" ContentType="application/'
                             'vnd.openxmlformats-officedocument.'
                             'wordprocessingml.footer+xml"/>' % p)
    return (XML_DECL + '<Types xmlns="http://schemas.openxmlformats.org/'
            'package/2006/content-types">%s%s</Types>'
            % ("".join(defaults), "".join(overrides)))


# ==========================================================================
# Construccion de documentos completos
# ==========================================================================
def _add_common(pkg):
    """Agrega estilos, numeracion, ajustes y propiedades."""
    pkg.add("word/styles.xml", styles_xml())
    pkg.add("word/numbering.xml", numbering_xml())
    pkg.add("word/settings.xml", settings_xml())
    pkg.add("docProps/app.xml", app_xml())


def construir(path, d, con_panel, con_vba, titulo):
    pkg = Package()
    pkg.rel("", REL + "officeDocument", "word/document.xml")
    pkg.rel("", "http://schemas.openxmlformats.org/package/2006/relationships/"
            "metadata/core-properties", "docProps/core.xml")
    pkg.rel("", REL + "extended-properties", "docProps/app.xml")

    doc = "word/document.xml"
    pkg.rel(doc, REL + "styles", "styles.xml")
    pkg.rel(doc, REL + "settings", "settings.xml")
    pkg.rel(doc, REL + "numbering", "numbering.xml")

    # Imagenes
    logo_path = os.path.join(ASSETS, "logo_fletes_tauro.png")
    grupo_path = os.path.join(ASSETS, "logo_grupo_tauro.png")
    pkg.add("word/media/logo_fletes_tauro.png", open(logo_path, "rb").read())
    pkg.add("word/media/logo_grupo_tauro.png", open(grupo_path, "rb").read())
    logo_cx, logo_cy = emu_for(logo_path, 1.18)
    grupo_cx, grupo_cy = emu_for(grupo_path, 0.62)

    # Encabezados y pies
    hdr2 = "word/header2.xml"
    rid_logo_hdr = pkg.rel(hdr2, REL + "image", "media/logo_fletes_tauro.png")
    pkg.add(hdr2, XML_DECL + "<w:hdr %s>%s</w:hdr>"
            % (NS, header_cotizacion(rid_logo_hdr, logo_cx, logo_cy)))
    ftr2 = "word/footer2.xml"
    rid_grupo_ftr = pkg.rel(ftr2, REL + "image", "media/logo_grupo_tauro.png")
    pkg.add(ftr2, XML_DECL + "<w:ftr %s>%s</w:ftr>"
            % (NS, footer_cotizacion(rid_grupo_ftr, grupo_cx, grupo_cy,
                              "SECTIONPAGES" if con_panel else "NUMPAGES")))
    pkg.add("word/header1.xml", XML_DECL + "<w:hdr %s>%s</w:hdr>"
            % (NS, header_interno("Panel de cotización · uso interno")))
    pkg.add("word/footer1.xml", XML_DECL + "<w:ftr %s>%s</w:ftr>"
            % (NS, footer_interno()))
    pkg.add("word/header3.xml", XML_DECL + "<w:hdr %s>%s</w:hdr>"
            % (NS, header_interno("Tabuladores y tarifas · uso interno")))
    pkg.add("word/footer3.xml", XML_DECL + "<w:ftr %s>%s</w:ftr>"
            % (NS, footer_interno()))
    rid_h1 = pkg.rel(doc, REL + "header", "header1.xml")
    rid_f1 = pkg.rel(doc, REL + "footer", "footer1.xml")
    rid_h2 = pkg.rel(doc, REL + "header", "header2.xml")
    rid_f2 = pkg.rel(doc, REL + "footer", "footer2.xml")
    rid_h3 = pkg.rel(doc, REL + "header", "header3.xml")
    rid_f3 = pkg.rel(doc, REL + "footer", "footer3.xml")

    mode = MODE_TPL if con_panel else MODE_DOC

    sect_panel = O.sect_pr(top=1500, bottom=1200, left=1080, right=1080,
                           header=620, footer=520, hdr_rid=rid_h1,
                           ftr_rid=rid_f1, page_num_start=1)
    sect_cot = O.sect_pr(top=1820, bottom=1780, left=1080, right=1080,
                         header=520, footer=440, hdr_rid=rid_h2,
                         ftr_rid=rid_f2, page_num_start=1)
    sect_tab = O.sect_pr(top=1500, bottom=1200, left=1080, right=1080,
                         header=620, footer=520, hdr_rid=rid_h3,
                         ftr_rid=rid_f3, page_num_start=1)

    # Las secciones intermedias llevan su sectPr dentro del ultimo parrafo;
    # la ultima seccion lo lleva suelto al final del body.
    body = []
    if con_panel:
        body.append(O.bookmark("PANEL"))
        body.append(seccion_panel(mode, d))
        body.append(O.para_with_sect(sect_panel))

    body.append(O.bookmark("COTIZACION"))
    body.append(seccion_cotizacion(mode, d))

    if con_panel:
        body.append(O.para_with_sect(sect_cot))
        body.append(O.bookmark("TABULADORES"))
        body.append(seccion_tabuladores())
        # Word exige un parrafo despues de una tabla al cerrar el body.
        body.append(para(run("", sz=2)))
        body.append(sect_tab)
    else:
        body.append(para(run("", sz=2)))
        body.append(sect_cot)

    document = (XML_DECL + '<w:document %s><w:body>%s</w:body></w:document>'
                % (NS, "".join(body)))
    pkg.add(doc, document)

    _add_common(pkg)
    pkg.add("docProps/core.xml", core_xml(titulo))

    if con_vba:
        import vbaproject
        pkg.add("word/vbaProject.bin", vbaproject.build())
        pkg.rel(doc, REL_MS + "vbaProject", "vbaProject.bin")

    pkg.save(path, content_types(with_vba=con_vba, partes=sorted(pkg.parts)))
    return path


# ==========================================================================
# Datos de ejemplo
# ==========================================================================
def base_datos():
    return {
        "folio": "FT-2026-0001",
        "fecha": "10 de agosto de 2026",
        "vigencia": "15 días naturales",
        "ejecutivo": "Nombre del ejecutivo",
        "empresa": "Nombre del cliente, S.A. de C.V.",
        "atencion": "Nombre del contacto",
        "contacto": "correo@cliente.com · (81) 0000-0000",
        "origen": "Monterrey, N.L.",
        "destino": "Ciudad de México",
        "descripcion": "Mercancía general paletizada",
        "unidad": X.UNIDADES[3],
        "tarimas": "2",
        "largo": "1.20",
        "ancho": "1.00",
        "alto": "1.50",
        "peso": "2,000",
        "valor": "250,000.00",
        "iva": False,
        "conceptos": [],
        "seleccion": {},
    }


def calcular(seleccion, peso, valor):
    """Aplica los tabuladores y devuelve (conceptos, seleccion_resuelta)."""
    conceptos = []
    resuelta = {}
    for clave, etiqueta, opciones_mod, opciones_tab in T.CONCEPTOS:
        sel = dict(seleccion.get(clave, {}))
        if not sel.get("check"):
            sel.setdefault("modalidad", opciones_mod[0])
            sel.setdefault("opcion", opciones_tab[0])
            sel.setdefault("importe", "")
            resuelta[clave] = sel
            continue
        mod = sel.get("modalidad", opciones_mod[0])
        opc = sel.get("opcion", opciones_tab[0])
        importe, detalle = T.calcular_concepto(
            clave, mod, opc, sel.get("importe_manual"), peso, valor)
        sel["modalidad"] = mod
        sel["opcion"] = opc
        sel["importe"] = T.money(importe)
        sel["detalle"] = detalle
        resuelta[clave] = sel
        conceptos.append((T.etiqueta_cliente(clave, sel.get("etiqueta", etiqueta),
                                             mod), importe))
    return conceptos, resuelta


def num(txt):
    return float(str(txt).replace(",", "").replace("$", "").strip() or 0)


# Los tres ejemplos usan EXACTAMENTE la mercancia del formato original
# (2 tarimas, 1.20 x 1.00 x 1.50 m, 2,000 kg); lo unico que cambia entre ellos
# son los conceptos seleccionados.
EJEMPLOS = [
    {
        "titulo": "EJEMPLO 1 · Recolección + Flete + Entrega",
        "seleccion": {
            "RECOLECCION": {"check": True, "modalidad": T.DENTRO,
                            "opcion": T.AUTO_PESO},
            "FLETE": {"check": True, "modalidad": T.RUTAS[0],
                      "opcion": T.SERVICIOS[0]},
            "ENTREGA": {"check": True, "modalidad": T.DENTRO,
                        "opcion": T.AUTO_PESO},
        },
    },
    {
        "titulo": "EJEMPLO 2 · Recolección + Flete + Maniobras + Seguro",
        "seleccion": {
            "RECOLECCION": {"check": True, "modalidad": T.DENTRO,
                            "opcion": T.AUTO_PESO},
            "MANIOBRAS_CARGA": {"check": True, "modalidad": "Según tabulador",
                                "opcion": "Maniobra estándar (hasta 2 tarimas)"},
            "FLETE": {"check": True, "modalidad": T.RUTAS[0],
                      "opcion": T.SERVICIOS[0]},
            "MANIOBRAS_DESCARGA": {"check": True, "modalidad": "Según tabulador",
                                   "opcion": "Maniobra estándar (hasta 2 tarimas)"},
            "SEGURO": {"check": True, "modalidad": "Sobre valor declarado",
                       "opcion": "Cobertura estándar"},
        },
    },
    {
        "titulo": "EJEMPLO 3 · Recolección + Flete + Entrega + Cita",
        "seleccion": {
            "RECOLECCION": {"check": True, "modalidad": T.DENTRO,
                            "opcion": T.AUTO_PESO},
            "FLETE": {"check": True, "modalidad": T.RUTAS[0],
                      "opcion": T.SERVICIOS[0]},
            "ENTREGA": {"check": True, "modalidad": T.DENTRO,
                        "opcion": T.AUTO_PESO},
            "CITA": {"check": True, "modalidad": "Según tabulador",
                     "opcion": "Cita programada (48 h de anticipación)"},
        },
    },
]


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "salida")
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)

    resumen = []

    # --- Plantilla -------------------------------------------------------
    d = base_datos()
    demo = {
        "RECOLECCION": {"check": True, "modalidad": T.DENTRO,
                        "opcion": T.AUTO_PESO},
        "FLETE": {"check": True, "modalidad": T.RUTAS[0],
                  "opcion": T.SERVICIOS[0]},
        "ENTREGA": {"check": True, "modalidad": T.DENTRO,
                    "opcion": T.AUTO_PESO},
    }
    conceptos, resuelta = calcular(demo, num(d["peso"]), num(d["valor"]))
    d["conceptos"] = conceptos
    d["seleccion"] = resuelta

    p1 = os.path.join(out_dir, "PLANTILLA_COTIZACION_FLETES_TAURO.docm")
    construir(p1, d, con_panel=True, con_vba=True,
              titulo="Plantilla de cotizaciones · Fletes Tauro")
    resumen.append((p1, conceptos))

    p2 = os.path.join(out_dir, "PLANTILLA_COTIZACION_FLETES_TAURO.docx")
    construir(p2, d, con_panel=True, con_vba=False,
              titulo="Plantilla de cotizaciones · Fletes Tauro")
    resumen.append((p2, conceptos))

    # --- Ejemplos --------------------------------------------------------
    for i, ej in enumerate(EJEMPLOS, 1):
        d = base_datos()
        conceptos, resuelta = calcular(ej["seleccion"], num(d["peso"]),
                                       num(d["valor"]))
        d["conceptos"] = conceptos
        d["seleccion"] = resuelta
        path = os.path.join(out_dir, "EJEMPLO_%d_COTIZACION_FLETES_TAURO.docx" % i)
        construir(path, d, con_panel=False, con_vba=False, titulo=ej["titulo"])
        resumen.append((path, conceptos))

    for path, conceptos in resumen:
        total = sum(c[1] for c in conceptos)
        print("%-58s  %2d conceptos   TOTAL %s"
              % (os.path.basename(path), len(conceptos), T.money(total)))


if __name__ == "__main__":
    main()
