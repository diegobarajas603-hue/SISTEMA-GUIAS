# =========================================================
# pdf_generator.py — Liquidaciones
# -----------------------------------------------------------
# Dibuja el PDF de liquidación y el reporte mensual con el
# mismo lenguaje visual del sistema: mucho blanco, líneas
# finas y jerarquía por tamaño de letra.
#
# Pensado para imprimir: solo tinta negra y grises, sin
# fondos ni bloques de color (ahorra tinta).
#
# Se genera primero en un archivo temporal y solo se renombra
# al nombre final si terminó bien.
# =========================================================

import os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import Table, TableStyle, Paragraph


# Paleta de impresión: solo negro y grises
TINTA = colors.HexColor("#111114")     # texto principal y cifras
TINTA_2 = colors.HexColor("#4A4A53")   # texto secundario
GRIS = colors.HexColor("#85858F")      # etiquetas
LINEA = colors.HexColor("#D7D7DE")     # divisores finos
LINEA_FUERTE = TINTA                   # línea de totales

FUENTE = "Helvetica"
FUENTE_B = "Helvetica-Bold"


class ErrorGenerandoPDF(Exception):
    """Se lanza cuando un PDF no se pudo generar correctamente."""
    pass


# ---------------------------------------------------------
# Utilidades de dibujo
# ---------------------------------------------------------
def _etiqueta(c, x, y, texto, tam=6.8, color=GRIS, alinear="izq", espacio=1.1, fuente=FUENTE):
    """Texto en mayúsculas con espaciado entre letras (como las etiquetas de la pantalla)."""
    texto = str(texto).upper()
    ancho = stringWidth(texto, fuente, tam) + espacio * max(len(texto) - 1, 0)
    if alinear == "der":
        x -= ancho
    elif alinear == "centro":
        x -= ancho / 2
    t = c.beginText(x, y)
    t.setFont(fuente, tam)
    t.setCharSpace(espacio)
    t.setFillColor(color)
    t.textOut(texto)
    t.setCharSpace(0)      # el espaciado no debe pasar al resto del documento
    c.drawText(t)
    return ancho


def _linea(c, x1, x2, y, grosor=0.5, color=LINEA):
    c.setStrokeColor(color)
    c.setLineWidth(grosor)
    c.line(x1, y, x2, y)


# =========================================================
# LIQUIDACIÓN DE VIAJE
# -----------------------------------------------------------
# Una hoja carta con: datos del viaje, percepciones (sueldo,
# ida, regreso, estancia, maniobras, extras, casetas,
# rendimiento), deducciones (gastos, préstamo, infonavit con
# sus 4 pagos) y el total a pagar, más firmas de visto bueno
# y del operador.
# =========================================================

MESES_ABREV = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
               "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def dinero(valor):
    """Formatea un número como $1,234.50. Nunca truena con vacíos."""
    try:
        return "${:,.2f}".format(float(valor or 0))
    except (TypeError, ValueError):
        return "$0.00"


def fecha_corta(iso):
    """'2026-09-01' -> '01-Sep-2026'. Si no es fecha válida, la regresa tal cual."""
    if not iso:
        return ""
    try:
        a, m, d = str(iso).split("-")
        return f"{int(d):02d}-{MESES_ABREV[int(m) - 1]}-{a}"
    except (ValueError, IndexError):
        return str(iso)


MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
               "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def mes_largo(iso_mes):
    """'2026-09' -> 'Septiembre 2026'"""
    try:
        a, m = iso_mes.split("-")[:2]
        return f"{MESES_LARGO[int(m) - 1].capitalize()} {a}"
    except (ValueError, IndexError):
        return iso_mes


def fecha_larga(iso):
    """'2026-09-25' -> '25 de septiembre de 2026'"""
    try:
        a, m, d = str(iso).split("-")
        return f"{int(d)} de {MESES_LARGO[int(m) - 1]} de {a}"
    except (ValueError, IndexError):
        return str(iso)


DIAS_ABREV = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]


def desglose_estancia(fechas):
    """
    Aplica la regla de estancia: el primer día (llegada) no se paga;
    cada día siguiente se paga según el día de la semana.
    Regresa (llegada, [(fecha, dia_semana, monto), ...], total).
    """
    import datetime
    import config_data

    fechas = sorted({f.strip() for f in (fechas or "").split(",") if f.strip()})
    if not fechas:
        return None, [], 0.0

    llegada = fechas[0]
    pagados = []
    total = 0.0
    for f in fechas[1:]:
        try:
            dia = datetime.date.fromisoformat(f).weekday()
        except ValueError:
            continue
        monto = float(config_data.TARIFA_ESTANCIA["FIN_DE_SEMANA" if dia >= 5 else "ENTRE_SEMANA"])
        pagados.append((f, DIAS_ABREV[dia], monto))
        total += monto
    return llegada, pagados, round(total, 2)


def _estilo_chico(color=TINTA_2, tam=8.5):
    from reportlab.lib.styles import ParagraphStyle
    return ParagraphStyle("chico", fontName=FUENTE, fontSize=tam, leading=tam * 1.4, textColor=color)


def _dibujar_tabla(c, table, x, y_top):
    """Dibuja una tabla con su esquina superior izquierda en (x, y_top). Regresa el y inferior."""
    _, alto = table.wrap(0, 0)
    table.drawOn(c, x, y_top - alto)
    return y_top - alto


def _fecha_mini(iso):
    """'2026-09-18' -> '18 sep'"""
    try:
        _, m, d = str(iso).split("-")
        return f"{int(d)} {MESES_LARGO[int(m) - 1][:3]}"
    except (ValueError, IndexError):
        return str(iso or "")


def _conceptos(c, x, y, ancho, titulo, filas, total_txt, total):
    """
    Bloque de conceptos: etiqueta de sección, renglones "concepto · detalle ... monto"
    con mucho aire y una línea final con el total. Regresa el y inferior.
    """
    _etiqueta(c, x, y, titulo, tam=7, espacio=1.4)
    y -= 10
    estilo_det = _estilo_chico(TINTA_2, 8.5)
    datos = [[f[0], Paragraph(f[1], estilo_det) if f[1] else "", f[2]] for f in filas]
    datos.append([total_txt, "", total])
    t = Table(datos, colWidths=[110, ancho - 110 - 110, 110])
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), FUENTE),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (-1, -1), TINTA),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (1, 0), (1, -1), 16),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (-1, 0), (-1, -1), 'RIGHT'),
        ('LINEBELOW', (0, 0), (-1, -3), 0.4, LINEA),
        ('LINEABOVE', (0, -1), (-1, -1), 0.8, LINEA_FUERTE),
        ('FONTNAME', (0, -1), (-1, -1), FUENTE_B),
        ('TOPPADDING', (0, -1), (-1, -1), 9),
    ]))
    return _dibujar_tabla(c, t, x, y)


def generar_pdf_liquidacion(filename, liq):
    """
    Genera el PDF de liquidación. `liq` es un diccionario con las
    mismas llaves que las columnas de la tabla `liquidaciones`.

    Diseño de una sola lectura: solo se imprimen los conceptos con
    monto (el sueldo siempre), con un detalle corto en gris.
    """
    tmp_filename = filename + ".tmp"
    folio = liq.get("folio", "")

    def monto(k):
        try:
            return float(liq.get(k) or 0)
        except (TypeError, ValueError):
            return 0.0

    try:
        c = canvas.Canvas(tmp_filename, pagesize=letter)
        c.setTitle(f"Liquidación {folio}")
        width, height = letter
        margen = 56
        ancho_util = width - 2 * margen
        derecha = width - margen

        # ---------- Encabezado ----------
        y = height - 64
        _etiqueta(c, margen, y, "Liquidación de viaje", tam=7, espacio=1.5)
        _etiqueta(c, derecha, y, f"Folio {folio}", tam=7, color=TINTA, fuente=FUENTE_B, alinear="der", espacio=1.5)
        y -= 34
        c.setFillColor(TINTA)
        c.setFont(FUENTE_B, 22)
        c.drawString(margen, y, (liq.get("operador") or "").title())
        y -= 20
        meta = [f"Salida {fecha_corta(liq.get('fecha_salida')) or '—'}"]
        if liq.get("fecha_regreso"):
            meta.append(f"Regreso {fecha_corta(liq.get('fecha_regreso'))}")
        meta.append(f"Liquidación {fecha_corta(liq.get('fecha')) or '—'}")
        c.setFont(FUENTE, 9)
        c.setFillColor(TINTA_2)
        c.drawString(margen, y, "     ·     ".join(meta))
        y -= 44

        # ---------- Percepciones (solo lo que tiene monto) ----------
        llegada, estancias_pagadas, _ = desglose_estancia(liq.get("estancia_fechas"))
        if estancias_pagadas:
            n = len(estancias_pagadas)
            det_estancia = f"{n} {'día' if n == 1 else 'días'} · llegada {_fecha_mini(llegada)}"
        elif llegada:
            det_estancia = f"Llegada {_fecha_mini(llegada)}"
        else:
            det_estancia = ""
        tipo = (liq.get("tipo_sueldo") or "").upper()
        perc = [("Sueldo", "Químico" if tipo == "QUIMICO" else tipo.capitalize(), dinero(liq.get("sueldo")))]
        for clave, nombre, detalle in (
            ("ida_monto", "Ida", (liq.get("ida_cliente") or "").title()),
            ("regreso_monto", "Regreso", (liq.get("regreso_cliente") or "").title()),
            ("estancia_monto", "Estancia", det_estancia),
            ("maniobras", "Maniobras", (liq.get("maniobras_descripcion") or "").capitalize()),
            ("extras", "Extras", ""),
            ("casetas", "Casetas", ""),
            ("rendimiento_monto", "Rendimiento", ""),
        ):
            if monto(clave):
                perc.append((nombre, detalle, dinero(liq.get(clave))))
        y = _conceptos(c, margen, y, ancho_util, "Percepciones", perc,
                       "Total percepciones", dinero(liq.get("total"))) - 36

        # ---------- Deducciones (solo lo que tiene monto) ----------
        pagos = [_fecha_mini(liq.get(f"infonavit_pago{i}")) for i in range(1, 5) if liq.get(f"infonavit_pago{i}")]
        ded = []
        for clave, nombre, detalle in (
            ("gastos", "Gastos", ""),
            ("prestamo", "Préstamo", ""),
            ("infonavit", "Infonavit", ("Pagos " if len(pagos) > 1 else "Pago ") + ", ".join(pagos) if pagos else ""),
        ):
            if monto(clave):
                ded.append((nombre, detalle, dinero(liq.get(clave))))
        total_ded = monto("gastos") + monto("prestamo") + monto("infonavit")
        if ded:
            y = _conceptos(c, margen, y, ancho_util, "Deducciones", ded,
                           "Total deducciones", dinero(total_ded)) - 40
        else:
            _etiqueta(c, margen, y, "Deducciones", tam=7, espacio=1.4)
            c.setFont(FUENTE, 10)
            c.setFillColor(TINTA_2)
            c.drawString(margen, y - 22, "Sin deducciones")
            y -= 62

        # ---------- Total a pagar ----------
        _linea(c, margen, derecha, y, grosor=1.4, color=LINEA_FUERTE)
        _etiqueta(c, margen, y - 30, "Total a pagar", tam=8, color=TINTA, fuente=FUENTE_B, espacio=1.6)
        c.setFillColor(TINTA)
        c.setFont(FUENTE_B, 28)
        c.drawRightString(derecha, y - 36, dinero(liq.get("total_pagar")))
        y -= 72

        # ---------- Observaciones (si hay) ----------
        obs = (liq.get("observaciones") or "").strip()
        if obs:
            _etiqueta(c, margen, y, "Observaciones", tam=7, espacio=1.4)
            p = Paragraph(obs, _estilo_chico(TINTA_2, 9))
            _, alto_p = p.wrap(ancho_util, 80)
            p.drawOn(c, margen, y - 8 - alto_p)
            y -= 8 + alto_p + 10

        # ---------- Firmas ----------
        firmas_y = max(70, min(120, y - 50))
        ancho_firma = 190
        centros = (margen + ancho_firma / 2, derecha - ancho_firma / 2)
        for cx in centros:
            _linea(c, cx - ancho_firma / 2, cx + ancho_firma / 2, firmas_y, grosor=0.6, color=TINTA_2)
        _etiqueta(c, centros[0], firmas_y - 14, "Visto bueno", tam=6.8, alinear="centro", espacio=1.3)
        _etiqueta(c, centros[1], firmas_y - 14, "Firma del operador", tam=6.8, alinear="centro", espacio=1.3)
        c.setFillColor(TINTA_2)
        c.setFont(FUENTE, 8.5)
        c.drawCentredString(centros[1], firmas_y - 27, (liq.get("operador") or "").title())

        c.save()
        os.replace(tmp_filename, filename)

    except Exception as e:
        if os.path.exists(tmp_filename):
            try:
                os.remove(tmp_filename)
            except OSError:
                pass
        raise ErrorGenerandoPDF(f"No se pudo generar el PDF de la liquidación {folio}: {e}") from e


# =========================================================
# REPORTE MENSUAL POR OPERADOR (hoja carta horizontal)
# =========================================================

def generar_pdf_reporte_mensual(filename, mes, operadores, totales, por_operador):
    """
    Reporte mensual en hoja carta vertical, mismo estilo que la liquidación:
    titular con el mes, tres cifras del mes, una tabla por operador con las
    columnas esenciales y, al final, todos los folios del mes.
    """
    from reportlab.platypus import SimpleDocTemplate, Spacer, Flowable
    from reportlab.lib.styles import ParagraphStyle

    tmp_filename = filename + ".tmp"
    titulo_mes = mes_largo(mes)
    margen = 56
    width, height = letter
    pad = 6                                   # relleno interno del marco de ReportLab
    ancho_util = width - 2 * margen - 2 * pad

    def deducciones(d):
        return float(d.get("gastos") or 0) + float(d.get("prestamo") or 0) + float(d.get("infonavit") or 0)

    def encabezado(c, doc):
        c.saveState()
        y = height - 64
        _etiqueta(c, margen + pad, y, "Reporte mensual", tam=7, espacio=1.5)
        _etiqueta(c, width - margen - pad, y, f"{titulo_mes} · Página {doc.page}", tam=7, alinear="der", espacio=1.3)
        c.restoreState()

    class Cifras(Flowable):
        """Fila de tres cifras grandes (como los indicadores de la pantalla)."""
        def __init__(self, items):
            super().__init__()
            self.items = items

        def wrap(self, aw, ah):
            self.aw = aw
            return aw, 44

        def draw(self):
            col = self.aw / len(self.items)
            for i, (lbl, val) in enumerate(self.items):
                x = i * col
                _etiqueta(self.canv, x, 34, lbl, tam=6.8, espacio=1.3)
                self.canv.setFillColor(TINTA)
                self.canv.setFont(FUENTE_B if i == len(self.items) - 1 else FUENTE, 16)
                self.canv.drawString(x, 10, val)

    class Etiqueta(Flowable):
        def __init__(self, texto):
            super().__init__()
            self.texto = texto

        def wrap(self, aw, ah):
            return aw, 14

        def draw(self):
            _etiqueta(self.canv, 0, 2, self.texto, tam=7, espacio=1.4)

    def tabla(filas, anchos, total=True):
        t = Table(filas, colWidths=anchos, repeatRows=1, hAlign="LEFT")
        estilo = [
            ('FONTNAME', (0, 0), (-1, -1), FUENTE),
            ('FONTSIZE', (0, 0), (-1, -1), 9.5),
            ('TEXTCOLOR', (0, 0), (-1, -1), TINTA),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TEXTCOLOR', (1, 1), (-2, -1), TINTA_2),
            ('FONTNAME', (-1, 1), (-1, -1), FUENTE_B),
            # Cabecera: gris pequeño, sin fondo
            ('FONTSIZE', (0, 0), (-1, 0), 6.8),
            ('TEXTCOLOR', (0, 0), (-1, 0), GRIS),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('LINEBELOW', (0, 0), (-1, 0), 0.6, LINEA_FUERTE),
            ('LINEBELOW', (0, 1), (-1, -2 if total else -1), 0.4, LINEA),
        ]
        if total:
            estilo += [
                ('LINEABOVE', (0, -1), (-1, -1), 0.8, LINEA_FUERTE),
                ('FONTNAME', (0, -1), (-1, -1), FUENTE_B),
                ('TEXTCOLOR', (0, -1), (-1, -1), TINTA),
                ('TOPPADDING', (0, -1), (-1, -1), 8),
            ]
        t.setStyle(TableStyle(estilo))
        return t

    try:
        doc = SimpleDocTemplate(
            tmp_filename, pagesize=letter,
            leftMargin=margen, rightMargin=margen, topMargin=96, bottomMargin=56,
            title=f"Reporte mensual {titulo_mes}",
        )
        estilo_t = ParagraphStyle("t", fontName=FUENTE_B, fontSize=22, leading=26, textColor=TINTA)
        estilo_sub = ParagraphStyle("s", fontName=FUENTE, fontSize=9, leading=12, textColor=TINTA_2, spaceBefore=6)

        n_ops = len(operadores)
        total_ded = totales["gastos"] + totales["prestamo"] + totales["infonavit"]
        elementos = [
            Paragraph(titulo_mes, estilo_t),
            Paragraph(f"{totales['viajes']} {'viaje' if totales['viajes'] == 1 else 'viajes'} · "
                      f"{n_ops} {'operador' if n_ops == 1 else 'operadores'}", estilo_sub),
            Spacer(1, 32),
            Cifras([("Percepciones", dinero(totales["total"])),
                    ("Deducciones", dinero(total_ded)),
                    ("Total pagado", dinero(totales["total_pagar"]))]),
            Spacer(1, 40),
        ]

        # ---- Resumen por operador (5 columnas, como la pantalla)
        anchos = [ancho_util - 50 - 3 * 100, 50, 100, 100, 100]
        filas = [["OPERADOR", "VIAJES", "PERCEPCIONES", "DEDUCCIONES", "TOTAL A PAGAR"]]
        for o in operadores:
            filas.append([o["operador"].title(), str(o["viajes"]), dinero(o["total"]),
                          dinero(deducciones(o)), dinero(o["total_pagar"])])
        filas.append(["Total del mes", str(totales["viajes"]), dinero(totales["total"]),
                      dinero(total_ded), dinero(totales["total_pagar"])])
        if operadores:
            elementos += [Etiqueta("Por operador"), Spacer(1, 10), tabla(filas, anchos)]
        else:
            elementos.append(Paragraph(f"No hay liquidaciones en {titulo_mes.lower()}.", estilo_sub))

        # ---- Todos los folios del mes en una sola tabla, agrupados por operador
        if por_operador and operadores:
            anchos_f = [56, 76, 0, 86, 86, 86]
            anchos_f[2] = ancho_util - sum(anchos_f)
            filas = [["FOLIO", "FECHA", "OPERADOR", "TOTAL", "DEDUCCIONES", "A PAGAR"]]
            for o in operadores:
                for d in por_operador.get(o["operador"], []):
                    filas.append([d["folio"], fecha_corta(d["fecha"]), o["operador"].title(),
                                  dinero(d["total"]), dinero(deducciones(d)), dinero(d["total_pagar"])])
            t = tabla(filas, anchos_f, total=False)
            t.setStyle(TableStyle([
                ('ALIGN', (1, 0), (2, -1), 'LEFT'),
                ('LEFTPADDING', (2, 0), (2, -1), 8),
                ('TEXTCOLOR', (0, 1), (0, -1), TINTA),
            ]))
            elementos += [Spacer(1, 44), Etiqueta("Folios del mes"), Spacer(1, 10), t]

        doc.build(elementos, onFirstPage=encabezado, onLaterPages=encabezado)
        os.replace(tmp_filename, filename)

    except Exception as e:
        if os.path.exists(tmp_filename):
            try:
                os.remove(tmp_filename)
            except OSError:
                pass
        raise ErrorGenerandoPDF(f"No se pudo generar el reporte mensual {mes}: {e}") from e
