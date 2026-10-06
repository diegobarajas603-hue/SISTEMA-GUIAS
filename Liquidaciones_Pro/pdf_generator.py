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


def _monograma(c, x, y, tam=22):
    """Cuadro "LQ" solo con contorno (no gasta tinta de relleno)."""
    c.setStrokeColor(TINTA)
    c.setLineWidth(1)
    c.roundRect(x, y, tam, tam, 4, fill=0, stroke=1)
    c.setFillColor(TINTA)
    c.setFont(FUENTE_B, tam * 0.36)
    c.drawCentredString(x + tam / 2, y + tam * 0.36, "LQ")


def _pie(c, width, margen, izquierda, derecha=""):
    _linea(c, margen, width - margen, 46)
    c.setFont(FUENTE, 7)
    c.setFillColor(GRIS)
    c.drawString(margen, 32, izquierda)
    if derecha:
        c.drawRightString(width - margen, 32, derecha)


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


def _tabla_conceptos(filas, col_widths):
    """Filas concepto · detalle · monto separadas por líneas finas, sin fondos."""
    table = Table(filas, colWidths=col_widths)
    table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), FUENTE),
        ('FONTSIZE', (0, 0), (-1, -1), 9.5),
        ('TEXTCOLOR', (0, 0), (-1, -1), TINTA),
        ('TEXTCOLOR', (1, 0), (1, -1), TINTA_2),
        ('FONTSIZE', (1, 0), (1, -1), 8.5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (1, 0), (1, -1), 8),
        ('RIGHTPADDING', (1, 0), (1, -1), 12),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, LINEA),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (-1, 0), (-1, -1), 'RIGHT'),
        # Fila de subtotal: línea negra arriba, negritas
        ('LINEABOVE', (0, -1), (-1, -1), 0.8, LINEA_FUERTE),
        ('FONTNAME', (0, -1), (-1, -1), FUENTE_B),
        ('TOPPADDING', (0, -1), (-1, -1), 8),
    ]))
    return table


def _dibujar_tabla(c, table, x, y_top):
    """Dibuja una tabla con su esquina superior izquierda en (x, y_top). Regresa el y inferior."""
    _, alto = table.wrap(0, 0)
    table.drawOn(c, x, y_top - alto)
    return y_top - alto


def _seccion(c, x, y, numero, titulo):
    """Encabezado de sección numerado: '01  PERCEPCIONES'."""
    c.setFont(FUENTE, 7.5)
    c.setFillColor(GRIS)
    c.drawString(x, y, numero)
    _etiqueta(c, x + 18, y, titulo, tam=7.5, color=TINTA, fuente=FUENTE_B, espacio=1.3)
    return y - 8


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
    from reportlab.lib.pagesizes import landscape
    from reportlab.platypus import SimpleDocTemplate, Spacer, PageBreak, KeepTogether
    from reportlab.lib.styles import ParagraphStyle

    tmp_filename = filename + ".tmp"
    titulo_mes = mes_largo(mes)
    margen = 40

    def encabezado(c, doc):
        width, height = landscape(letter)
        c.saveState()
        top = height - 40
        _monograma(c, margen, top - 18)
        _etiqueta(c, margen + 34, top - 3, "Reporte mensual por operador", tam=7, espacio=1.4)
        _etiqueta(c, margen + 34, top - 14, "Sistema de liquidaciones · Control de viajes", tam=6, espacio=0.9)
        _etiqueta(c, width - margen, top - 3, "Periodo", tam=7, alinear="der", espacio=1.4)
        c.setFillColor(TINTA)
        c.setFont(FUENTE_B, 15)
        c.drawRightString(width - margen, top - 20, titulo_mes)
        _linea(c, margen, width - margen, top - 32)
        _pie(c, width, margen, "Documento generado por el Sistema de Liquidaciones", f"Página {doc.page}")
        c.restoreState()

    def estilo_tabla(ultima_es_total=True, col_destacadas=()):
        estilo = [
            ('FONTNAME', (0, 0), (-1, -1), FUENTE),
            ('TEXTCOLOR', (0, 0), (-1, -1), TINTA),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (0, -1), 0),
            ('RIGHTPADDING', (-1, 0), (-1, -1), 0),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            # Cabecera: texto gris pequeño y línea negra debajo, sin fondo
            ('FONTNAME', (0, 0), (-1, 0), FUENTE_B),
            ('TEXTCOLOR', (0, 0), (-1, 0), GRIS),
            ('FONTSIZE', (0, 0), (-1, 0), 6.5),
            ('LINEBELOW', (0, 0), (-1, 0), 0.8, LINEA_FUERTE),
            ('LINEBELOW', (0, 1), (-1, -2 if ultima_es_total else -1), 0.4, LINEA),
        ]
        for col in col_destacadas:
            estilo.append(('FONTNAME', (col, 1), (col, -1), FUENTE_B))
        if ultima_es_total:
            estilo += [
                ('LINEABOVE', (0, -1), (-1, -1), 0.8, LINEA_FUERTE),
                ('FONTNAME', (0, -1), (-1, -1), FUENTE_B),
                ('TOPPADDING', (0, -1), (-1, -1), 7),
            ]
        return estilo

    try:
        doc = SimpleDocTemplate(
            tmp_filename, pagesize=landscape(letter),
            leftMargin=margen, rightMargin=margen, topMargin=92, bottomMargin=62,
            title=f"Reporte mensual {titulo_mes}",
        )
        estilo_h = ParagraphStyle("h", fontName=FUENTE_B, fontSize=15, leading=19, textColor=TINTA, spaceAfter=2)
        estilo_sub = ParagraphStyle("sub", fontName=FUENTE, fontSize=8.5, textColor=TINTA_2, spaceAfter=14)
        estilo_op = ParagraphStyle("op", fontName=FUENTE_B, fontSize=10, textColor=TINTA, spaceBefore=12, spaceAfter=6)
        estilo_celda = ParagraphStyle("c", fontName=FUENTE, fontSize=7.5, leading=9, textColor=TINTA)

        elementos = []

        # ---- Resumen
        elementos.append(Paragraph("Resumen por operador", estilo_h))
        elementos.append(Paragraph(
            f"{totales['viajes']} viaje(s) liquidado(s) · {len(operadores)} operador(es) · "
            f"Total percepciones {dinero(totales['total'])} · Total pagado {dinero(totales['total_pagar'])}",
            estilo_sub
        ))

        cabecera = ["OPERADOR", "VIAJES", "SUELDO", "IDA", "REGRESO", "ESTANCIA", "MANIOBRAS",
                    "EXTRAS", "CASETAS", "RENDIM.", "TOTAL", "GASTOS", "PRÉSTAMO", "INFONAVIT", "A PAGAR"]
        filas = [cabecera]
        for o in operadores:
            filas.append([
                Paragraph(o["operador"], estilo_celda), str(o["viajes"]),
                dinero(o["sueldo"]), dinero(o["ida_monto"]), dinero(o["regreso_monto"]),
                dinero(o["estancia_monto"]), dinero(o["maniobras"]), dinero(o["extras"]),
                dinero(o["casetas"]), dinero(o["rendimiento_monto"]), dinero(o["total"]),
                dinero(o["gastos"]), dinero(o["prestamo"]), dinero(o["infonavit"]),
                dinero(o["total_pagar"]),
            ])
        filas.append([
            "TOTAL DEL MES", str(totales["viajes"]),
            dinero(totales["sueldo"]), dinero(totales["ida_monto"]), dinero(totales["regreso_monto"]),
            dinero(totales["estancia_monto"]), dinero(totales["maniobras"]), dinero(totales["extras"]),
            dinero(totales["casetas"]), dinero(totales["rendimiento_monto"]), dinero(totales["total"]),
            dinero(totales["gastos"]), dinero(totales["prestamo"]), dinero(totales["infonavit"]),
            dinero(totales["total_pagar"]),
        ])

        anchos = [130, 30] + [42] * 13
        tabla = Table(filas, colWidths=anchos, repeatRows=1)
        tabla.setStyle(TableStyle(estilo_tabla(True, (10, 14)) + [
            ('FONTSIZE', (0, 1), (-1, -1), 7.5),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ]))
        elementos.append(tabla)

        # ---- Detalle por operador
        if por_operador:
            elementos.append(PageBreak())
            elementos.append(Paragraph("Detalle por operador", estilo_h))
            elementos.append(Paragraph("Folios liquidados en el mes, por operador.", estilo_sub))

        for o in operadores:
            lista = por_operador.get(o["operador"], [])
            if not lista:
                continue
            filas = [["FOLIO", "FECHA", "SUELDO", "TOTAL", "GASTOS", "PRÉSTAMO", "INFONAVIT", "A PAGAR"]]
            for d in lista:
                filas.append([
                    d["folio"], fecha_corta(d["fecha"]), (d["tipo_sueldo"] or "").capitalize(),
                    dinero(d["total"]), dinero(d["gastos"]), dinero(d["prestamo"]),
                    dinero(d["infonavit"]), dinero(d["total_pagar"]),
                ])
            filas.append(["", "", f"{o['viajes']} viaje(s)", dinero(o["total"]), dinero(o["gastos"]),
                          dinero(o["prestamo"]), dinero(o["infonavit"]), dinero(o["total_pagar"])])
            t = Table(filas, colWidths=[60, 80, 80, 80, 80, 80, 80, 90], repeatRows=1, hAlign="LEFT")
            t.setStyle(TableStyle(estilo_tabla(True, (0, 7)) + [
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
            ]))
            elementos.append(KeepTogether([Paragraph(o["operador"], estilo_op), t, Spacer(1, 6)]))

        doc.build(elementos, onFirstPage=encabezado, onLaterPages=encabezado)
        os.replace(tmp_filename, filename)

    except Exception as e:
        if os.path.exists(tmp_filename):
            try:
                os.remove(tmp_filename)
            except OSError:
                pass
        raise ErrorGenerandoPDF(f"No se pudo generar el reporte mensual {mes}: {e}") from e
