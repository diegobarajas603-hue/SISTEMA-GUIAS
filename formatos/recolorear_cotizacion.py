#!/usr/bin/env python3
"""
Aplica la paleta de la CARATULA DE EMBARQUES al FORMATO DE COTIZACION.
Solo cambia colores: no toca textos, medidas, tablas ni imagenes.

Paleta tomada de CARATULA_DE_EMBARQUES_ACTUALIZADO_1.xlsx
    0F3A5D  azul marino   titulos, etiquetas, encabezado de tabla
    5B7C99  azul acero    apoyo, vinetas
    8792A0  gris          texto de ejemplo / campos por llenar
    26323C  pizarra       cuerpo de texto
    E9EEF3  azul niebla   bandas de seccion
    FFFFFF  blanco        texto sobre azul marino
"""
import re
import sys
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
def w(tag): return f"{{{W}}}{tag}"

NAVY   = "0F3A5D"   # azul marino
STEEL  = "5B7C99"   # azul acero
GRAY   = "8792A0"   # gris de datos
SLATE  = "26323C"   # pizarra (cuerpo)
BAND   = "E9EEF3"   # banda de seccion
FIELD  = "F5F8FA"   # relleno de campo (paso mas claro de BAND)
RULE   = "DCE3EA"   # linea divisoria
RULE2  = "C7D3DE"   # linea divisoria mas marcada
NAVY_L = "2A5A82"   # divisor dentro de la banda azul marino
WHITE  = "FFFFFF"

# Celdas que en el original iban en negro (111111) o rojo (C21112).
# Anchos de celda que pasan a BANDA CLARA (texto azul marino encima).
LIGHT_CELLS = {"5500", "4488", "10368"}
# Anchos de celda que pasan a AZUL MARINO SOLIDO (texto blanco encima).
SOLID_CELLS = {"720", "7148", "2500", "1700", "2668"}

OLD_STRONG = {"111111", "C21112"}


def cell_width(tc):
    tcpr = tc.find(w("tcPr"))
    if tcpr is None:
        return None
    tcw = tcpr.find(w("tcW"))
    return tcw.get(w("w")) if tcw is not None else None


def recolor_document(xml: bytes) -> bytes:
    root = etree.fromstring(xml)

    # ---- 1. Celdas con relleno fuerte: banda clara o azul solido ----
    for tc in root.iter(w("tc")):
        tcpr = tc.find(w("tcPr"))
        if tcpr is None:
            continue
        shd = tcpr.find(w("shd"))
        if shd is None or shd.get(w("fill")) not in OLD_STRONG:
            continue

        width = cell_width(tc)
        if width in LIGHT_CELLS:
            new_fill, new_text = BAND, NAVY
        elif width in SOLID_CELLS:
            new_fill, new_text = NAVY, WHITE
        else:                                   # sin clasificar -> banda clara
            new_fill, new_text = BAND, NAVY

        shd.set(w("fill"), new_fill)

        # bordes de la celda
        borders = tcpr.find(w("tcBorders"))
        if borders is not None:
            for b in borders:
                if b.get(w("color")) in OLD_STRONG:
                    b.set(w("color"), new_fill)

        # texto que iba en blanco o rosa dentro de esa celda
        for col in tc.iter(w("color")):
            if col.get(w("val")) in ("FFFFFF", "F3C9C9"):
                col.set(w("val"), new_text)

    # ---- 2. Titulo COTIZACION: negro -> azul marino ----
    for r in root.iter(w("r")):
        texts = "".join(t.text or "" for t in r.iter(w("t")))
        if "COTIZACIÓN" in texts or "COTIZACION" in texts:
            for col in r.iter(w("color")):
                if col.get(w("val")) == "111111":
                    col.set(w("val"), NAVY)

    # ---- 3. Resto de colores de texto ----
    TEXT_MAP = {
        "111111": SLATE,   # valores capturados por el usuario
        "555555": NAVY,    # etiquetas de campo
        "6E6E6E": SLATE,   # numeros de renglon, consideraciones, nota final
        "AFAFAF": GRAY,    # texto de ejemplo
        "C21112": STEEL,   # vinetas
        "F3C9C9": WHITE,   # importe del total
    }
    for col in root.iter(w("color")):
        v = col.get(w("val"))
        if v in TEXT_MAP:
            col.set(w("val"), TEXT_MAP[v])

    # ---- 4. Rellenos restantes ----
    FILL_MAP = {"FAFAFA": FIELD, "111111": BAND, "C21112": BAND}
    for shd in root.iter(w("shd")):
        v = shd.get(w("fill"))
        if v in FILL_MAP:
            shd.set(w("fill"), FILL_MAP[v])

    # ---- 5. Bordes restantes ----
    BORDER_MAP = {
        "E4E4E4": RULE,
        "C9C9C9": RULE2,
        "FAFAFA": FIELD,
        "3A3A3A": NAVY_L,
        "111111": NAVY,
        "C21112": NAVY,
    }
    for el in root.iter():
        v = el.get(w("color"))
        if v in BORDER_MAP:
            el.set(w("color"), BORDER_MAP[v])

    return etree.tostring(root, xml_declaration=True,
                          encoding="UTF-8", standalone=True)


def recolor_footer(xml: bytes) -> bytes:
    root = etree.fromstring(xml)

    TEXT_MAP = {
        "111111": NAVY,    # numero de pagina
        "6E6E6E": STEEL,   # direcciones y letra chica
        "C21112": NAVY,    # sitio web y rotulos de sucursal
        "C9C9C9": RULE2,   # separador "·"
    }
    for col in root.iter(w("color")):
        v = col.get(w("val"))
        if v in TEXT_MAP:
            col.set(w("val"), TEXT_MAP[v])

    BORDER_MAP = {"E4E4E4": RULE, "C9C9C9": RULE2, "C21112": NAVY, "111111": NAVY}
    for el in root.iter():
        v = el.get(w("color"))
        if v in BORDER_MAP:
            el.set(w("color"), BORDER_MAP[v])

    for shd in root.iter(w("shd")):
        if shd.get(w("fill")) in ("FAFAFA",):
            shd.set(w("fill"), FIELD)
        elif shd.get(w("fill")) in OLD_STRONG:
            shd.set(w("fill"), NAVY)

    return etree.tostring(root, xml_declaration=True,
                          encoding="UTF-8", standalone=True)


def recolor_styles(xml: bytes) -> bytes:
    """Color de texto por omision del documento -> pizarra de la caratula."""
    root = etree.fromstring(xml)
    for col in root.iter(w("color")):
        if col.get(w("val")) == "33383D":
            col.set(w("val"), SLATE)
    return etree.tostring(root, xml_declaration=True,
                          encoding="UTF-8", standalone=True)


if __name__ == "__main__":
    base = sys.argv[1]
    for name, fn in (("word/document.xml", recolor_document),
                     ("word/footer1.xml", recolor_footer),
                     ("word/styles.xml", recolor_styles)):
        path = f"{base}/{name}"
        with open(path, "rb") as fh:
            data = fh.read()
        out = fn(data)
        with open(path, "wb") as fh:
            fh.write(out)
        print(f"listo: {name}")
