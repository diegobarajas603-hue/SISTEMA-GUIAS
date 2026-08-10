# -*- coding: utf-8 -*-
"""Formato de cotización de Fletes Tauro — una hoja, rellenable en Word.

Reconstruye en .docx el formato COTIZACION_FLETES_TAURO_2026 con los cambios
pedidos:

  * fuera el folio (del encabezado y del bloque de datos)
  * fuera las columnas TIPO DE UNIDAD, CANT. y TARIFA UNITARIA
  * fuera SUBTOTAL, I.V.A. 16% y RET. I.V.A. 4%: queda sólo el TOTAL
  * fuera el apartado de firmas (ELABORÓ / ACEPTACIÓN DEL CLIENTE)
  * la página es www.fletestauro.com.mx

Uso:  python3 forma.py [directorio_salida]
"""
import os
import sys

import re

import ooxml as O
from ooxml import border, cell, row, run, table


def para(content="", **kw):
    """Igual que ooxml.para pero con interlineado EXACTO por omisión.

    Word y LibreOffice calculan alturas de línea distintas (Segoe UI pide
    ~1.33 em y DejaVu ~1.17 em). Fijando el interlineado en 1.26 em ambos
    miden lo mismo y el formato cabe en una hoja en los dos.

    Los párrafos que sólo llevan una imagen no se tocan: un interlineado
    exacto recortaría el logotipo.
    """
    if "line" not in kw:
        tam = [int(t) for t in re.findall(r'<w:sz w:val="(\d+)"/>', content)]
        if tam:
            kw["line"] = int(max(tam) * 12.6)
            kw["line_rule"] = "exact"
    return O.para(content, **kw)

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets2")

# --------------------------------------------------------------------------
# Paleta tomada del formato original
# --------------------------------------------------------------------------
ROJO = "C21112"
ROJO_OSC = "A00E0F"
NEGRO = "111111"
NEGRO_SUAVE = "3A3A3A"
GRIS_LAB = "555555"
GRIS_TXT = "6E6E6E"
GRIS_PH = "AFAFAF"
LINEA = "E4E4E4"
LINEA_MED = "C9C9C9"
FONDO_ALT = "FAFAFA"
BLANCO = "FFFFFF"

# Arial: está en cualquier Windows y Mac con Office, y en Linux se sustituye
# por Liberation Sans, que tiene exactamente las mismas métricas. Así lo que
# se mide aquí es lo mismo que verá Word en la máquina del usuario.
FONT = "Arial"
FONT_SEMI = "Arial"

# Caja de la página
MARGEN_X = 936          # 0.65"
MARGEN_TOP = 540
MARGEN_BOT = 1960
W = 12240 - 2 * MARGEN_X    # 10368 twips de ancho útil

DOCPART = "PHFletesTauro"

XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'


# --------------------------------------------------------------------------
# Campos rellenables
# --------------------------------------------------------------------------
def campo(tag, marcador, sz=19, color=NEGRO, font=FONT, b=False,
          color_ph=None):
    """Control de contenido con texto de marcador de posición real de Word.

    El marcador se ve en gris cursiva; al escribir, Word lo sustituye con el
    formato definitivo (el de sdtPr/rPr).
    """
    final = O.rpr(font=font, sz=sz, color=color, b=b)
    props = ('<w:sdtPr>%s<w:alias w:val="%s"/><w:tag w:val="%s"/>'
             '<w:id w:val="%d"/>'
             '<w:placeholder><w:docPart w:val="%s"/></w:placeholder>'
             '<w:showingPlcHdr/><w:text/></w:sdtPr>'
             % (final, O.esc(tag), O.esc(tag), O.next_id(), DOCPART))
    contenido = run(marcador or " ", font=FONT, sz=sz,
                    color=color_ph or GRIS_PH, i=True)
    return "<w:sdt>%s<w:sdtContent>%s</w:sdtContent></w:sdt>" % (props, contenido)


# --------------------------------------------------------------------------
# Piezas
# --------------------------------------------------------------------------
def encabezado(rid_logo, cx, cy):
    izq = cell(para(O.image_run(rid_logo, cx, cy, "Fletes Tauro"), after=0),
               3600, valign="center", margins=(0, 0, 0, 0))
    der = cell(
        para(run("COTIZACIÓN", font=FONT_SEMI, sz=50, color=NEGRO, b=True,
                 spacing=90), jc="right", after=70)
        + para(run("Servicio de autotransporte de carga", font=FONT, sz=16,
                   color=GRIS_TXT, caps=True, spacing=70), jc="right"),
        W - 3600, valign="center", margins=(0, 0, 0, 0))
    return table([row([izq, der], height=800)], [3600, W - 3600])


def doble_filete():
    return (para(run("", sz=2), before=110,
                 pbd=dict(bottom=border(18, ROJO)))
            + para(run("", sz=2), before=60,
                   pbd=dict(bottom=border(6, NEGRO))))


CLIENTE = [
    ("Empresa", "cli_empresa", "Nombre o razón social"),
    ("Atención", "cli_atencion", "Nombre del contacto"),
    ("R.F.C.", "cli_rfc", "XAXX010101000"),
    ("Teléfono", "cli_telefono", "(  )  ____-____"),
    ("Correo", "cli_correo", "correo@empresa.com"),
]

COTIZACION = [
    ("Fecha", "doc_fecha", "DD / MM / AAAA"),
    ("Vigencia", "doc_vigencia", "15 días naturales"),
    ("Ejecutivo", "doc_ejecutivo", "Nombre del asesor"),
    ("Moneda", "doc_moneda", "MXN · Pesos mexicanos"),
]


def paneles():
    g = [1560, 3940, 380, 1560, W - 1560 - 3940 - 380 - 1560]

    def barra(texto, fill, span_desde):
        return cell(
            para(run(texto, font=FONT_SEMI, sz=15, color=BLANCO, caps=True,
                     spacing=60, b=True)),
            g[span_desde] + g[span_desde + 1], fill=fill, span=2,
            margins=(90, 170, 90, 170))

    filas = [row([
        barra("Datos del cliente", NEGRO, 0),
        cell(para(run("", sz=2)), g[2], margins=(0, 0, 0, 0)),
        barra("Datos de la cotización", ROJO, 3),
    ], height=350)]

    for i in range(5):
        cs = []
        for lado, datos, base in ((0, CLIENTE, 0), (1, COTIZACION, 3)):
            if i < len(datos):
                etiqueta, tag, marcador = datos[i]
                cs.append(cell(
                    para(run(etiqueta, font=FONT_SEMI, sz=15, color=GRIS_LAB,
                             caps=True, spacing=50, b=True)),
                    g[base], valign="bottom", margins=(40, 0, 60, 60)))
                cs.append(cell(
                    para(campo(tag, marcador)),
                    g[base + 1], valign="bottom", margins=(40, 60, 60, 60),
                    bd=dict(bottom=border(6, LINEA_MED))))
            else:
                cs.append(cell(para(run("", sz=2)), g[base],
                               margins=(0, 0, 0, 0)))
                cs.append(cell(para(run("", sz=2)), g[base + 1],
                               margins=(0, 0, 0, 0)))
            if lado == 0:
                cs.insert(2, cell(para(run("", sz=2)), g[2],
                                  margins=(0, 0, 0, 0)))
        filas.append(row(cs, height=300))
    return table(filas, g)


def tabla_servicios(n_filas=5):
    g = [720, W - 720 - 2500, 2500]
    enc = row([
        cell(para(run("No.", font=FONT_SEMI, sz=17, color=BLANCO, spacing=60,
                      b=True), jc="center"), g[0], fill=NEGRO,
             margins=(150, 100, 150, 100),
             bd=dict(right=border(6, NEGRO_SUAVE))),
        cell(para(run("Descripción del servicio", font=FONT_SEMI, sz=17,
                      color=BLANCO, caps=True, spacing=70, b=True)), g[1],
             fill=NEGRO, margins=(150, 200, 150, 200),
             bd=dict(left=border(4, NEGRO), right=border(4, NEGRO))),
        cell(para(run("Importe", font=FONT_SEMI, sz=17, color=BLANCO,
                      caps=True, spacing=70, b=True), jc="right"), g[2],
             fill=NEGRO, margins=(150, 200, 150, 200),
             bd=dict(left=border(4, NEGRO))),
    ], height=470, header=True)

    filas = [enc]
    for i in range(1, n_filas + 1):
        fondo = BLANCO if i % 2 else FONDO_ALT
        bd = dict(bottom=border(4, LINEA), left=border(4, fondo),
                  right=border(4, fondo))
        marcador = "Origen  →  Destino" if i == 1 else ""
        importe = "$ 0.00" if i == 1 else ""
        filas.append(row([
            cell(para(run(str(i), font=FONT_SEMI, sz=19, color=GRIS_TXT,
                          b=True), jc="center"), g[0], fill=fondo, bd=bd,
                 margins=(245, 100, 245, 100)),
            cell(para(campo("srv_desc_%d" % i, marcador)), g[1], fill=fondo,
                 bd=bd, margins=(245, 200, 245, 200)),
            cell(para(campo("srv_imp_%d" % i, importe,
                            font=FONT_SEMI, b=True), jc="right"), g[2],
                 fill=fondo, bd=bd, margins=(245, 200, 245, 200)),
        ], height=430))
    return table(filas, g, caption="tblServicios")


def linea_escritura(tag, marcador="", after=120):
    return para(campo(tag, marcador), before=50, after=after,
                pbd=dict(bottom=border(6, LINEA_MED, space=4)))


def totales():
    g = [6000, W - 6000]
    izq = cell(
        para(run("Importe con letra", font=FONT_SEMI, sz=15, color=GRIS_LAB,
                 caps=True, spacing=60, b=True), after=60)
        + linea_escritura("importe_letra", "( Cantidad con letra 00/100 M.N. )")
        + para(run("Observaciones", font=FONT_SEMI, sz=15, color=GRIS_LAB,
                   caps=True, spacing=60, b=True), before=60, after=60)
        + linea_escritura("obs_1")
        + linea_escritura("obs_2"),
        g[0], valign="top", margins=(0, 0, 0, 300))

    barra = table(
        [row([
            cell(para(run("Total", font=FONT_SEMI, sz=22, color=BLANCO,
                          caps=True, spacing=100, b=True)), 1700, fill=ROJO,
                 margins=(170, 220, 170, 120),
                 bd=dict(right=border(4, ROJO))),
            cell(para(campo("total", "$ 0.00", sz=26, color=BLANCO,
                            font=FONT_SEMI, b=True, color_ph="F3C9C9"),
                      jc="right"),
                 g[1] - 1700, fill=ROJO, margins=(170, 120, 170, 220),
                 bd=dict(left=border(4, ROJO))),
        ], height=680)],
        [1700, g[1] - 1700])
    der = cell(barra + para(run("", sz=2), after=0), g[1], valign="bottom",
               margins=(0, 0, 0, 0))
    return table([row([izq, der])], g)


CONDICIONES = [
    ("Vigencia de la cotización: 15 días naturales a partir de la fecha de "
     "emisión.",
     "Maniobras de carga y descarga por cuenta del cliente."),
    ("Tarifas en pesos mexicanos (MXN); no incluyen I.V.A. ni retenciones.",
     "Seguro de mercancía sujeto a cobertura contratada; excedente cotizable."),
    ("Incluye operador, combustible y casetas en la ruta cotizada.",
     "Falso flete: 50% de la tarifa si la cancelación es con menos de 12 horas."),
    ("Tiempo libre de carga y descarga: 6 horas por maniobra.",
     "El cliente proporcionará los datos de la mercancía para la Carta Porte."),
    ("Estadías después del tiempo libre: se cotizan por cada 24 horas o "
     "fracción.",
     "Servicio sujeto a disponibilidad de unidades al confirmar el embarque."),
]


def condiciones():
    barra = table(
        [row([cell(
            para(run("Condiciones comerciales", font=FONT_SEMI, sz=17,
                     color=BLANCO, caps=True, spacing=80, b=True)),
            W, fill=NEGRO, margins=(90, 170, 90, 170))], height=350)],
        [W])
    g = [W // 2, W - W // 2]

    def punto(texto, ancho, ultimo):
        return cell(
            para(run("▪", font=FONT, sz=13, color=ROJO, b=True)
                 + run("  ", font=FONT, sz=13)
                 + run(texto, font=FONT, sz=13, color=GRIS_TXT),
                 ind_left=250, ind_hanging=250, line=220),
            ancho, valign="top",
            margins=(40, 200 if ultimo else 90, 40, 160))

    filas = [row([punto(a, g[0], False), punto(b, g[1], True)], height=250)
             for a, b in CONDICIONES]
    return barra + para(run("", sz=10), after=90) + table(filas, g)


WEB = "www.fletestauro.com.mx"
LEMA = "Soluciones integrales en transporte de carga"

DIRECCIONES = [
    ("Matriz · Apodaca, N.L.",
     ["Carretera a Laredo Km. 16.5 No. 16501, Col. Moisés Sáenz",
      "C.P. 66613, Apodaca, Nuevo León · Tel. (81) 1958-0740"]),
    ("Sucursal · Estado de México",
     ["Álamo No. 28 / Av. Ceylán Esq. Encino, Col. Tabla Honda",
      "Tlalnepantla, Edo. de México · Tel. (55) 5308-7500"]),
    ("Contacto",
     ["ventas@grupotauro.com.mx",
      "Atención 24/7 en ruta"]),
]


def pie(rid_gt, cx, cy):
    """Pie de página: web, lema, folio de página y direcciones."""
    ga = [1400, W - 1400 - 2200, 2200]
    fila_web = table([row([
        cell(para(run("", sz=2)), ga[0], margins=(0, 0, 0, 0)),
        cell(para(run(WEB, font=FONT_SEMI, sz=22, color=ROJO, b=True)
                  + run("   ·   ", font=FONT, sz=13, color=LINEA_MED)
                  + run(LEMA, font=FONT, sz=12, color=GRIS_TXT),
                  jc="center"), ga[1], margins=(0, 0, 0, 0)),
        cell(para(run("Página ", font=FONT, sz=13, color=GRIS_TXT)
                  + O.field("PAGE", "1", font=FONT_SEMI, sz=13, color=NEGRO,
                            b=True)
                  + run(" de ", font=FONT, sz=13, color=GRIS_TXT)
                  + O.field("NUMPAGES", "1", font=FONT_SEMI, sz=13,
                            color=NEGRO, b=True), jc="right"),
             ga[2], valign="bottom", margins=(0, 0, 0, 0)),
    ], height=1)], ga)

    gd = [1400, 3500, 3500, W - 1400 - 3500 - 3500]
    cols = [cell(
        para(run("Una empresa de", font=FONT, sz=12, color=GRIS_TXT,
                 caps=True), after=40)
        + para(O.image_run(rid_gt, cx, cy, "Grupo Tauro")),
        gd[0], valign="top", margins=(0, 0, 0, 120))]
    for i, (titulo, lineas) in enumerate(DIRECCIONES):
        cols.append(cell(
            para(run(titulo, font=FONT_SEMI, sz=12, color=ROJO, caps=True,
                     spacing=20, b=True), after=40)
            + "".join(para(run(l, font=FONT, sz=11, color=GRIS_TXT), after=12)
                      for l in lineas),
            gd[i + 1], valign="top", margins=(0, 0, 0, 160)))

    return (fila_web
            + para(run("", sz=2), before=70,
                   pbd=dict(bottom=border(4, LINEA)))
            + para(run("", sz=4), after=70)
            + table([row(cols)], gd))


def marca_de_agua(rid, cx, cy):
    """Imagen flotante detrás del texto, anclada a la página."""
    did = O.next_id()
    x = int((8.5 - cx / float(O.EMU_PER_INCH)) / 2 * O.EMU_PER_INCH)
    y = int(4.15 * O.EMU_PER_INCH)
    dib = (
        '<w:r><w:drawing>'
        '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" '
        'relativeHeight="2" behindDoc="1" locked="0" layoutInCell="1" '
        'allowOverlap="1">'
        '<wp:simplePos x="0" y="0"/>'
        '<wp:positionH relativeFrom="page"><wp:posOffset>%d</wp:posOffset>'
        '</wp:positionH>'
        '<wp:positionV relativeFrom="page"><wp:posOffset>%d</wp:posOffset>'
        '</wp:positionV>'
        '<wp:extent cx="%d" cy="%d"/>'
        '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        '<wp:wrapNone/>'
        '<wp:docPr id="%d" name="Marca de agua"/>'
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:nvPicPr><pic:cNvPr id="%d" name="Marca de agua"/>'
        '<pic:cNvPicPr/></pic:nvPicPr>'
        '<pic:blipFill><a:blip r:embed="%s"/><a:stretch><a:fillRect/></a:stretch>'
        '</pic:blipFill>'
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        '</pic:pic></a:graphicData></a:graphic></wp:anchor>'
        '</w:drawing></w:r>' % (x, y, cx, cy, did, did + 1, rid, cx, cy))
    return para(dib, after=0, line=20, line_rule='exact')


# --------------------------------------------------------------------------
# Documento
# --------------------------------------------------------------------------
def glossary_xml(ns):
    return XML_DECL + (
        '<w:glossaryDocument %s><w:docParts><w:docPart>'
        '<w:docPartPr><w:name w:val="%s"/>'
        '<w:category><w:name w:val="General"/>'
        '<w:gallery w:val="placeholder"/></w:category>'
        '<w:types><w:type w:val="bbPlcHdr"/></w:types>'
        '<w:behaviors><w:behavior w:val="content"/></w:behaviors>'
        '<w:guid w:val="{8B41C4A2-6F13-4E5D-9B70-2C61D8E37A45}"/>'
        '</w:docPartPr>'
        '<w:docPartBody><w:p><w:r><w:t xml:space="preserve">'
        'Haga clic aquí para escribir.</w:t></w:r></w:p></w:docPartBody>'
        '</w:docPart></w:docParts></w:glossaryDocument>' % (ns, DOCPART))


def construir(destino):
    import build as B          # se reutiliza el empaquetador OPC

    pkg = B.Package()
    pkg.rel("", B.REL + "officeDocument", "word/document.xml")
    pkg.rel("", B.REL + "extended-properties", "docProps/app.xml")
    pkg.rel("", "http://schemas.openxmlformats.org/package/2006/relationships/"
            "metadata/core-properties", "docProps/core.xml")

    doc = "word/document.xml"
    pkg.rel(doc, B.REL + "styles", "styles.xml")
    pkg.rel(doc, B.REL + "settings", "settings.xml")
    pkg.rel(doc, B.REL + "numbering", "numbering.xml")
    pkg.rel(doc, B.REL + "glossaryDocument", "glossary/document.xml")

    for nombre in ("logo_ft", "logo_gt", "watermark"):
        pkg.add("word/media/%s.png" % nombre,
                open(os.path.join(ASSETS, "%s.png" % nombre), "rb").read())
    rid_ft = pkg.rel(doc, B.REL + "image", "media/logo_ft.png")
    rid_wm = pkg.rel(doc, B.REL + "image", "media/watermark.png")
    rid_footer = pkg.rel(doc, B.REL + "footer", "footer1.xml")
    ftr = "word/footer1.xml"
    rid_gt = pkg.rel(ftr, B.REL + "image", "media/logo_gt.png")

    ft_cx, ft_cy = B.emu_for(os.path.join(ASSETS, "logo_ft.png"), 1.26)
    gt_cx, gt_cy = B.emu_for(os.path.join(ASSETS, "logo_gt.png"), 0.40)
    wm_cx, wm_cy = B.emu_for(os.path.join(ASSETS, "watermark.png"), 5.30)

    pkg.add(ftr, XML_DECL + "<w:ftr %s>%s</w:ftr>"
            % (B.NS, pie(rid_gt, gt_cx, gt_cy)))

    cuerpo = [
        marca_de_agua(rid_wm, wm_cx, wm_cy),
        encabezado(rid_ft, ft_cx, ft_cy),
        doble_filete(),
        para(run("", sz=6), after=40),
        paneles(),
        para(run("", sz=8), after=70),
        tabla_servicios(),
        para(run("", sz=8), after=70),
        totales(),
        para(run("", sz=6), after=40),
        condiciones(),
        para(run("La aceptación de esta cotización implica la conformidad con "
                 "las condiciones comerciales aquí descritas.",
                 font=FONT, sz=13, color=GRIS_TXT, i=True), jc="center",
             before=170, after=0),
        O.sect_pr(top=MARGEN_TOP, bottom=MARGEN_BOT, left=MARGEN_X,
                  right=MARGEN_X, header=440, footer=340,
                  ftr_rid=rid_footer, kind=None),
    ]

    pkg.add(doc, XML_DECL + '<w:document %s><w:body>%s</w:body></w:document>'
            % (B.NS, "".join(cuerpo)))
    pkg.add("word/glossary/document.xml", glossary_xml(B.NS))
    pkg.add("word/styles.xml", B.styles_xml())
    pkg.add("word/numbering.xml", B.numbering_xml())
    pkg.add("word/settings.xml", B.settings_xml())
    pkg.add("docProps/app.xml", B.app_xml())
    pkg.add("docProps/core.xml",
            B.core_xml("Cotización de servicio · Fletes Tauro"))

    ct = B.content_types(partes=sorted(pkg.parts)).replace(
        "</Types>",
        '<Override PartName="/word/glossary/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.'
        'wordprocessingml.document.glossary+xml"/></Types>')
    pkg.save(destino, ct)
    return destino


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "salida")
    if not os.path.isdir(out):
        os.makedirs(out)
    ruta = construir(os.path.join(out, "FORMATO_COTIZACION_FLETES_TAURO.docx"))
    print(os.path.basename(ruta))


if __name__ == "__main__":
    main()
