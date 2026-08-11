#!/usr/bin/env python3
"""
Hace que el TOTAL del formato de cotizacion sume solo la columna Importe.

Por que se movio el Total
-------------------------
Word solo resuelve formulas dentro de una misma tabla. El Total estaba en una
tabla aparte, junto a "Importe con letra", asi que ninguna formula podia
alcanzar la columna de importes: se probo y daba 0. Ahora el Total es el
ultimo renglon de la tabla de servicios, que ademas es donde lo pone la
caratula de embarques (VALOR TOTAL DE LAS MERCANCIAS va bajo su tabla).

La tabla de servicios queda con 7 renglones: el 1 es el encabezado, del 2 al 6
son los cinco servicios y el 7 es el Total. De ahi el rango C2:C6.
"""
import copy
import sys
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
def w(tag): return f"{{{W}}}{tag}"

NAVY = "0F3A5D"
FORMULA = ' =SUM(C2:C6) \\# "$ #,##0.00" '
T_SERVICIOS, T_LETRA = 2, 3      # indices de tabla dentro del cuerpo
ANCHO_TOTAL = 10368


def sub(padre, tag, **attrs):
    e = etree.SubElement(padre, w(tag))
    for k, v in attrs.items():
        e.set(w(k), v)
    return e


def celda_azul(tr, ancho, gridspan=None, margen_izq="220", margen_der="120"):
    tc = etree.SubElement(tr, w("tc"))
    pr = sub(tc, "tcPr")
    sub(pr, "tcW", w=ancho, type="dxa")
    if gridspan:
        sub(pr, "gridSpan", val=gridspan)
    shd = sub(pr, "shd", val="clear", color="auto")
    shd.set(w("fill"), NAVY)
    mar = sub(pr, "tcMar")
    for lado, v in (("top", "170"), ("left", margen_izq),
                    ("bottom", "170"), ("right", margen_der)):
        sub(mar, lado, w=v, type="dxa")
    sub(pr, "vAlign", val="center")
    return tc


def liberar_importes(root):
    """
    Quita el control de contenido de las cinco celdas de Importe.

    Word no lee el texto que vive dentro de un control de contenido cuando
    evalua una formula de tabla: se probo y el Total daba 0. Sin el control,
    con el mismo texto, da 24,450.50. Las celdas conservan su apariencia
    (gris, cursiva); solo dejan de ser control para poder sumarse.
    El resto de los campos del formulario no se toca.
    """
    liberadas = 0
    for sdt in list(root.iter(w("sdt"))):
        pr = sdt.find(w("sdtPr"))
        tag = pr.find(w("tag")) if pr is not None else None
        if tag is None or not tag.get(w("val")).startswith("srv_imp_"):
            continue
        contenido = sdt.find(w("sdtContent"))
        runs = list(contenido)
        padre = sdt.getparent()
        pos = list(padre).index(sdt)
        padre.remove(sdt)
        for i, r in enumerate(runs):
            padre.insert(pos + i, r)
        liberadas += 1
    return liberadas


def agregar_suma(xml: bytes) -> bytes:
    root = etree.fromstring(xml)
    body = root.find(w("body"))
    servicios = body.findall(w("tbl"))[T_SERVICIOS]
    tabla_letra = body.findall(w("tbl"))[T_LETRA]

    n = liberar_importes(root)
    if n != 5:
        raise SystemExit(f"se esperaban 5 celdas de importe, se liberaron {n}")

    # ---- tomar el formato del Total que ya existia (tabla anidada) ----
    anidada = tabla_letra.find(f".//{w('tbl')}")
    if anidada is None:
        raise SystemExit("no se encontro la tabla anidada del Total")

    rpr_rotulo = copy.deepcopy(
        anidada.find(f".//{w('r')}/{w('rPr')}"))          # "Total" en blanco
    ppr_rotulo = copy.deepcopy(anidada.find(f".//{w('p')}/{w('pPr')}"))

    rpr_importe = None
    for sdt in anidada.iter(w("sdt")):
        pr = sdt.find(w("sdtPr"))
        tag = pr.find(w("tag")) if pr is not None else None
        if tag is not None and tag.get(w("val")) == "total":
            rpr_importe = copy.deepcopy(pr.find(w("rPr")))
    if rpr_importe is None:
        raise SystemExit("no se encontro el control 'total'")

    # ---- 1. renglon de Total al final de la tabla de servicios ----
    tr = etree.SubElement(servicios, w("tr"))
    trpr = sub(tr, "trPr")
    sub(trpr, "cantSplit")
    sub(trpr, "trHeight", val="680")

    # rotulo: ocupa las columnas No. + Descripcion
    tc = celda_azul(tr, "7868", gridspan="2")
    p = etree.SubElement(tc, w("p"))
    if ppr_rotulo is not None:
        p.append(copy.deepcopy(ppr_rotulo))
    r = etree.SubElement(p, w("r"))
    if rpr_rotulo is not None:
        r.append(copy.deepcopy(rpr_rotulo))
    sub(r, "t").text = "Total"

    # importe: campo de formula
    tc = celda_azul(tr, "2500", margen_izq="120", margen_der="200")
    p = etree.SubElement(tc, w("p"))
    ppr = sub(p, "pPr")
    sub(ppr, "spacing", line="327", lineRule="exact")
    sub(ppr, "jc", val="right")
    campo = etree.SubElement(p, w("fldSimple"))
    campo.set(w("instr"), FORMULA)
    r = etree.SubElement(campo, w("r"))
    r.append(copy.deepcopy(rpr_importe))
    sub(r, "t").text = "$ 0.00"

    # ---- 2. quitar el Total viejo y dejar el bloque de abajo a todo lo ancho ----
    celdas = tabla_letra.find(w("tr")).findall(w("tc"))
    celdas[1].getparent().remove(celdas[1])
    celdas[0].find(w("tcPr")).find(w("tcW")).set(w("w"), str(ANCHO_TOTAL))
    grid = tabla_letra.find(w("tblGrid"))
    for col in grid.findall(w("gridCol")):
        grid.remove(col)
    sub(grid, "gridCol", w=str(ANCHO_TOTAL))

    return etree.tostring(root, xml_declaration=True,
                          encoding="UTF-8", standalone=True)


def activar_update_fields(xml: bytes) -> bytes:
    """Word actualiza los campos al abrir el documento."""
    root = etree.fromstring(xml)
    if root.find(w("updateFields")) is None:
        nodo = etree.Element(w("updateFields"))
        nodo.set(w("val"), "true")
        ancla = root.find(w("footnotePr"))          # el esquema lo pide antes
        root.insert(list(root).index(ancla), nodo) if ancla is not None \
            else root.append(nodo)
    return etree.tostring(root, xml_declaration=True,
                          encoding="UTF-8", standalone=True)


if __name__ == "__main__":
    base = sys.argv[1]
    for nombre, fn in (("word/document.xml", agregar_suma),
                       ("word/settings.xml", activar_update_fields)):
        ruta = f"{base}/{nombre}"
        with open(ruta, "rb") as fh:
            datos = fh.read()
        with open(ruta, "wb") as fh:
            fh.write(fn(datos))
        print(f"listo: {nombre}")
