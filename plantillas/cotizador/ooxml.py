# -*- coding: utf-8 -*-
"""Helpers minimos para escribir WordprocessingML a mano.

Se escribe el XML directamente (y no con una libreria de alto nivel) porque la
plantilla necesita controles de contenido, casillas de verificacion, listas
desplegables y titulos de tabla (w:tblCaption), que las librerias habituales no
exponen.
"""

# --------------------------------------------------------------------------
# Paleta corporativa
# --------------------------------------------------------------------------
NAVY = "0F2B46"        # navy profundo  - encabezados y barras
NAVY_DARK = "0A1E33"   # navy casi negro
PETROL = "1C5C6B"      # azul petroleo  - acentos secundarios
GRAPHITE = "33383D"    # gris grafito   - texto principal
GRAY_TXT = "6E6E68"    # gris calido    - texto secundario
GRAY_SOFT = "9A9A94"   # gris calido claro - etiquetas
LINE = "D8DBE0"        # linea divisoria
LINE_SOFT = "EBEDF0"   # linea muy tenue
BG = "F5F6F8"          # fondo frio suave
BG_WARM = "F7F6F3"     # fondo calido suave
CHAMPAGNE = "B4975A"   # acento champagne / dorado
WHITE = "FFFFFF"

# Tipografias
FONT = "Segoe UI"
FONT_LIGHT = "Segoe UI Light"
FONT_SEMI = "Segoe UI Semibold"
FONT_SYM = "Segoe UI Symbol"

EMU_PER_INCH = 914400
TWIP_PER_INCH = 1440

_ids = {"n": 1000}


def next_id():
    _ids["n"] += 1
    return _ids["n"]


def esc(text):
    if text is None:
        return ""
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


# --------------------------------------------------------------------------
# Runs
# --------------------------------------------------------------------------
def rpr(font=FONT, sz=20, b=False, i=False, color=GRAPHITE, caps=False,
        spacing=None, u=False, strike=False, vanish=False, valign=None,
        highlight=None):
    """Construye <w:rPr>. sz en medios puntos, spacing en veinteavos de punto."""
    parts = ['<w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>' % (font, font, font)]
    if b:
        parts.append("<w:b/><w:bCs/>")
    if i:
        parts.append("<w:i/><w:iCs/>")
    if caps:
        parts.append("<w:caps/>")
    if strike:
        parts.append("<w:strike/>")
    if vanish:
        parts.append("<w:vanish/>")
    if color:
        parts.append('<w:color w:val="%s"/>' % color)
    if spacing is not None:
        parts.append('<w:spacing w:val="%d"/>' % spacing)
    if u:
        parts.append('<w:u w:val="single"/>')
    if highlight:
        parts.append('<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % highlight)
    parts.append('<w:sz w:val="%d"/><w:szCs w:val="%d"/>' % (sz, sz))
    if valign:
        parts.append('<w:vertAlign w:val="%s"/>' % valign)
    return "<w:rPr>%s</w:rPr>" % "".join(parts)


def run(text="", **kw):
    props = rpr(**kw)
    body = ""
    if text:
        # Se respetan los espacios de inicio/fin.
        body = '<w:t xml:space="preserve">%s</w:t>' % esc(text)
    return "<w:r>%s%s</w:r>" % (props, body)


def brk(**kw):
    return "<w:r>%s<w:br/></w:r>" % rpr(**kw)


def tab_run(**kw):
    return "<w:r>%s<w:tab/></w:r>" % rpr(**kw)


def field(instr, result_text="", **kw):
    """Campo de Word, p.ej. PAGE o NUMPAGES."""
    props = rpr(**kw)
    res = run(result_text, **kw) if result_text else ""
    return ("<w:r>%s<w:fldChar w:fldCharType=\"begin\"/></w:r>"
            "<w:r>%s<w:instrText xml:space=\"preserve\"> %s </w:instrText></w:r>"
            "<w:r>%s<w:fldChar w:fldCharType=\"separate\"/></w:r>"
            "%s"
            "<w:r>%s<w:fldChar w:fldCharType=\"end\"/></w:r>"
            % (props, props, instr, props, res, props))


# --------------------------------------------------------------------------
# Bordes / sombreados
# --------------------------------------------------------------------------
def border(sz=4, color=LINE, style="single", space=0):
    """sz en octavos de punto: 4 = 0.5 pt, 8 = 1 pt, 12 = 1.5 pt."""
    return (style, sz, color, space)


NO_BORDER = ("nil", 0, "auto", 0)


def _border_xml(tag, spec):
    if spec is None:
        return ""
    style, sz, color, space = spec
    if style == "nil":
        return '<w:%s w:val="nil"/>' % tag
    return ('<w:%s w:val="%s" w:sz="%d" w:space="%d" w:color="%s"/>'
            % (tag, style, sz, space, color))


def borders_xml(wrapper, top=None, left=None, bottom=None, right=None,
                inside_h=None, inside_v=None, between=None):
    inner = (_border_xml("top", top) + _border_xml("left", left)
             + _border_xml("bottom", bottom) + _border_xml("right", right))
    if between is not None:
        inner += _border_xml("between", between)
    if inside_h is not None:
        inner += _border_xml("insideH", inside_h)
    if inside_v is not None:
        inner += _border_xml("insideV", inside_v)
    if not inner:
        return ""
    return "<w:%s>%s</w:%s>" % (wrapper, inner, wrapper)


def shd(fill):
    if not fill:
        return ""
    return '<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % fill


# --------------------------------------------------------------------------
# Parrafos
# --------------------------------------------------------------------------
def para(content="", jc=None, before=0, after=0, line=None, line_rule="auto",
         style=None, pbd=None, fill=None, ind_left=0, ind_right=0,
         ind_first=None, ind_hanging=None, keep_next=False, keep_lines=False,
         num=None, tabs=None, contextual=False, page_break_before=False):
    p = []
    if style:
        p.append('<w:pStyle w:val="%s"/>' % style)
    if keep_next:
        p.append("<w:keepNext/>")
    if keep_lines:
        p.append("<w:keepLines/>")
    if page_break_before:
        p.append("<w:pageBreakBefore/>")
    if num is not None:
        p.append('<w:numPr><w:ilvl w:val="%d"/><w:numId w:val="%d"/></w:numPr>'
                 % (num[1], num[0]))
    if pbd:
        p.append(borders_xml("pBdr", **pbd))
    if fill:
        p.append(shd(fill))
    if tabs:
        t = "".join('<w:tab w:val="%s" w:pos="%d"%s/>'
                    % (a, pos, (' w:leader="%s"' % ldr) if ldr else "")
                    for a, pos, ldr in tabs)
        p.append("<w:tabs>%s</w:tabs>" % t)
    sp = []
    sp.append('w:before="%d"' % before)
    sp.append('w:after="%d"' % after)
    if line:
        sp.append('w:line="%d" w:lineRule="%s"' % (line, line_rule))
    p.append("<w:spacing %s/>" % " ".join(sp))
    if ind_left or ind_right or ind_first or ind_hanging:
        bits = []
        if ind_left:
            bits.append('w:left="%d"' % ind_left)
        if ind_right:
            bits.append('w:right="%d"' % ind_right)
        if ind_first:
            bits.append('w:firstLine="%d"' % ind_first)
        if ind_hanging:
            bits.append('w:hanging="%d"' % ind_hanging)
        p.append("<w:ind %s/>" % " ".join(bits))
    if contextual:
        p.append("<w:contextualSpacing/>")
    if jc:
        p.append('<w:jc w:val="%s"/>' % jc)
    ppr = "<w:pPr>%s</w:pPr>" % "".join(p)
    return "<w:p>%s%s</w:p>" % (ppr, content)


def empty_para(sz=12, after=0, before=0):
    return para(run("", sz=sz), before=before, after=after)


# --------------------------------------------------------------------------
# Tablas
# --------------------------------------------------------------------------
def cell(content, w, fill=None, bd=None, valign="center", margins=None,
         span=1, nowrap=False, vmerge=None):
    """margins: (top, left, bottom, right) en twips."""
    props = ['<w:tcW w:w="%d" w:type="dxa"/>' % w]
    if span > 1:
        props.append('<w:gridSpan w:val="%d"/>' % span)
    if vmerge:
        props.append('<w:vMerge%s/>'
                     % (' w:val="restart"' if vmerge == "restart" else ""))
    if bd:
        props.append(borders_xml("tcBorders", **bd))
    if fill:
        props.append(shd(fill))
    if margins:
        t, l, b, r = margins
        props.append('<w:tcMar>'
                     '<w:top w:w="%d" w:type="dxa"/><w:left w:w="%d" w:type="dxa"/>'
                     '<w:bottom w:w="%d" w:type="dxa"/><w:right w:w="%d" w:type="dxa"/>'
                     '</w:tcMar>' % (t, l, b, r))
    if nowrap:
        props.append("<w:noWrap/>")
    props.append('<w:vAlign w:val="%s"/>' % valign)
    if not content:
        content = para(run(""))
    return "<w:tc><w:tcPr>%s</w:tcPr>%s</w:tc>" % ("".join(props), content)


def row(cells, height=None, h_rule="atLeast", header=False, cant_split=True):
    props = []
    if cant_split:
        props.append("<w:cantSplit/>")
    if height:
        props.append('<w:trHeight w:val="%d" w:hRule="%s"/>' % (height, h_rule))
    if header:
        props.append("<w:tblHeader/>")
    trpr = "<w:trPr>%s</w:trPr>" % "".join(props) if props else ""
    return "<w:tr>%s%s</w:tr>" % (trpr, "".join(cells))


def table(rows, grid, caption=None, bd=None, cellmar=(60, 100, 60, 100),
          ind=0, jc=None, layout="fixed"):
    props = ['<w:tblW w:w="%d" w:type="dxa"/>' % sum(grid)]
    if jc:
        props.append('<w:jc w:val="%s"/>' % jc)
    if ind:
        props.append('<w:tblInd w:w="%d" w:type="dxa"/>' % ind)
    if layout:
        props.append('<w:tblLayout w:type="%s"/>' % layout)
    if bd is None:
        bd = {}
    props.append(borders_xml("tblBorders", **bd))
    t, l, b, r = cellmar
    props.append('<w:tblCellMar>'
                 '<w:top w:w="%d" w:type="dxa"/><w:left w:w="%d" w:type="dxa"/>'
                 '<w:bottom w:w="%d" w:type="dxa"/><w:right w:w="%d" w:type="dxa"/>'
                 '</w:tblCellMar>' % (t, l, b, r))
    props.append('<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" '
                 'w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>')
    if caption:
        # w:tblCaption se expone en VBA como Table.Title: es como el macro
        # localiza cada tabla sin depender de su posicion. Va al final de
        # tblPr por el orden que impone el esquema.
        props.append('<w:tblCaption w:val="%s"/>' % esc(caption))
    gridxml = "".join('<w:gridCol w:w="%d"/>' % g for g in grid)
    return ("<w:tbl><w:tblPr>%s</w:tblPr><w:tblGrid>%s</w:tblGrid>%s</w:tbl>"
            % ("".join(props), gridxml, "".join(rows)))


# --------------------------------------------------------------------------
# Controles de contenido
# --------------------------------------------------------------------------
def sdt_text(tag, value, alias=None, multiline=False, **kw):
    """Control de contenido de texto enriquecido/plano."""
    alias = alias or tag
    props = ('<w:sdtPr>%s<w:alias w:val="%s"/><w:tag w:val="%s"/>'
             '<w:id w:val="%d"/><w:text%s/></w:sdtPr>'
             % (rpr(**kw), esc(alias), esc(tag), next_id(),
                ' w:multiLine="1"' if multiline else ""))
    return "<w:sdt>%s<w:sdtContent>%s</w:sdtContent></w:sdt>" % (
        props, run(value, **kw))


def sdt_dropdown(tag, value, items, alias=None, **kw):
    alias = alias or tag
    listxml = "".join('<w:listItem w:displayText="%s" w:value="%s"/>'
                      % (esc(i), esc(i)) for i in items)
    props = ('<w:sdtPr>%s<w:alias w:val="%s"/><w:tag w:val="%s"/>'
             '<w:id w:val="%d"/><w:dropDownList>%s</w:dropDownList></w:sdtPr>'
             % (rpr(**kw), esc(alias), esc(tag), next_id(), listxml))
    return "<w:sdt>%s<w:sdtContent>%s</w:sdtContent></w:sdt>" % (
        props, run(value, **kw))


def sdt_checkbox(tag, checked=False, alias=None, sz=24, color=NAVY):
    alias = alias or tag
    glyph = "☒" if checked else "☐"
    props = ('<w:sdtPr>%s<w:alias w:val="%s"/><w:tag w:val="%s"/>'
             '<w:id w:val="%d"/>'
             '<w14:checkbox>'
             '<w14:checked w14:val="%d"/>'
             '<w14:checkedState w14:val="2612" w14:font="MS Gothic"/>'
             '<w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/>'
             '</w14:checkbox></w:sdtPr>'
             % (rpr(font="MS Gothic", sz=sz, color=color), esc(alias), esc(tag),
                next_id(), 1 if checked else 0))
    return ("<w:sdt>%s<w:sdtContent>%s</w:sdtContent></w:sdt>"
            % (props, run(glyph, font="MS Gothic", sz=sz, color=color)))


# --------------------------------------------------------------------------
# Imagenes
# --------------------------------------------------------------------------
def image_run(rid, cx, cy, name="imagen"):
    did = next_id()
    return (
        '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
        '<wp:extent cx="%d" cy="%d"/>'
        '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        '<wp:docPr id="%d" name="%s"/>'
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:nvPicPr><pic:cNvPr id="%d" name="%s"/><pic:cNvPicPr/></pic:nvPicPr>'
        '<pic:blipFill><a:blip r:embed="%s"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
        % (cx, cy, did, esc(name), did + 1, esc(name), rid, cx, cy))


# --------------------------------------------------------------------------
# Secciones
# --------------------------------------------------------------------------
def sect_pr(top=1980, bottom=1440, left=1080, right=1080, header=680,
            footer=560, hdr_rid=None, ftr_rid=None, page_num_start=None,
            gutter=0, w=12240, h=15840, kind="nextPage"):
    # El orden de los hijos de sectPr lo impone el esquema:
    # headerReference, footerReference, type, pgSz, pgMar, pgNumType, cols...
    parts = []
    if hdr_rid:
        parts.append('<w:headerReference w:type="default" r:id="%s"/>' % hdr_rid)
    if ftr_rid:
        parts.append('<w:footerReference w:type="default" r:id="%s"/>' % ftr_rid)
    if kind:
        parts.append('<w:type w:val="%s"/>' % kind)
    parts.append('<w:pgSz w:w="%d" w:h="%d"/>' % (w, h))
    parts.append('<w:pgMar w:top="%d" w:right="%d" w:bottom="%d" w:left="%d" '
                 'w:header="%d" w:footer="%d" w:gutter="%d"/>'
                 % (top, right, bottom, left, header, footer, gutter))
    if page_num_start is not None:
        parts.append('<w:pgNumType w:start="%d"/>' % page_num_start)
    parts.append('<w:cols w:space="708"/><w:docGrid w:linePitch="360"/>')
    # Reordenar: headerReference debe ir antes de pgSz (ya lo esta).
    return "<w:sectPr>%s</w:sectPr>" % "".join(parts)


def para_with_sect(sect, content=""):
    """Parrafo final de seccion que transporta el sectPr."""
    return ('<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>'
            '<w:rPr><w:sz w:val="2"/></w:rPr>%s</w:pPr>%s</w:p>' % (sect, content))


def bookmark(name, bid=None):
    bid = bid or next_id()
    return ('<w:bookmarkStart w:id="%d" w:name="%s"/><w:bookmarkEnd w:id="%d"/>'
            % (bid, esc(name), bid))
