# =========================================================
# pdf_generator.py — Liquidaciones
# -----------------------------------------------------------
# Dibuja el PDF de liquidación con el mismo estilo del sistema
# de salidas. Se genera primero en un archivo temporal y solo se
# renombra al nombre final si terminó bien.
# =========================================================

import os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import Table, TableStyle, Paragraph


# Paleta (misma que la pantalla): carbón + acento índigo
VERDE = colors.HexColor("#1D2327")        # carbón (encabezados)
VERDE_SUAVE = colors.HexColor("#EAF2FA")  # índigo suave (totales)
DORADO = colors.HexColor("#2271B1")       # índigo (acento)
DORADO_SUAVE = colors.HexColor("#EAF2FA")
MARFIL = colors.HexColor("#F6F7F8")
LINEA = colors.HexColor("#DCDFE3")
TINTA = colors.HexColor("#1D2327")
TINTA_2 = colors.HexColor("#50575E")
GRIS = colors.HexColor("#9CA3AF")


class ErrorGenerandoPDF(Exception):
    """Se lanza cuando un PDF no se pudo generar correctamente."""
    pass


def _header(c, width, height, titulo, folio):
    c.setFillColor(colors.white)
    c.rect(0, 0, width, height, fill=1)

    # Banda verde con línea dorada
    c.setFillColor(VERDE)
    c.rect(0, height - 96, width, 96, fill=1, stroke=0)
    c.setFillColor(DORADO)
    c.rect(0, height - 99, width, 3, fill=1, stroke=0)

    # Monograma
    c.setFillColor(DORADO)
    c.roundRect(40, height - 74, 34, 34, 8, fill=1, stroke=0)
    c.setFillColor(VERDE)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(57, height - 63, "L")

    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(88, height - 52, titulo)
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#9CA3AF"))
    c.drawString(89, height - 68, "SISTEMA DE LIQUIDACIONES  ·  CONTROL DE VIAJES")

    c.setFillColor(colors.white)
    c.setFont("Helvetica", 9)
    c.drawRightString(width - 40, height - 46, "FOLIO")
    c.setFont("Helvetica-Bold", 20)
    c.drawRightString(width - 40, height - 68, str(folio))


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


def _tabla_liquidacion(filas, col_widths, encabezado=None, fila_total=False):
    datos = ([encabezado] if encabezado else []) + filas
    table = Table(datos, colWidths=col_widths)
    estilo = [
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, LINEA),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (-1, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (-1, -1), TINTA),
        ('TEXTCOLOR', (1, 0), (1, -1), TINTA_2),
    ]
    if encabezado:
        estilo += [
            ('BACKGROUND', (0, 0), (-1, 0), VERDE),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('LINEBELOW', (0, 0), (-1, 0), 1.5, DORADO),
        ]
    if fila_total:
        estilo += [
            ('BACKGROUND', (0, -1), (-1, -1), VERDE_SUAVE),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0, -1), (-1, -1), VERDE),
        ]
    table.setStyle(TableStyle(estilo))
    return table


def _dibujar_tabla(c, table, x, y_top):
    """Dibuja una tabla con su esquina superior izquierda en (x, y_top). Regresa el y inferior."""
    _, alto = table.wrap(0, 0)
    table.drawOn(c, x, y_top - alto)
    return y_top - alto


def generar_pdf_liquidacion(filename, liq):
    """
    Genera el PDF de liquidación. `liq` es un diccionario con las
    mismas llaves que las columnas de la tabla `liquidaciones`.
    """
    tmp_filename = filename + ".tmp"
    folio = liq.get("folio", "")

    try:
        c = canvas.Canvas(tmp_filename, pagesize=letter)
        width, height = letter
        margen = 40
        ancho_util = width - 2 * margen

        _header(c, width, height, "LIQUIDACIÓN DE VIAJE", folio)

        # ---------- Datos generales ----------
        y = height - 115
        c.setFillColor(DORADO)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(margen, y, "DATOS DEL VIAJE")
        y -= 8

        llegada, estancias_pagadas, _ = desglose_estancia(liq.get("estancia_fechas"))
        col_datos = [95, ancho_util / 2 - 95, 95, ancho_util / 2 - 95]
        datos = [
            ["Operador", liq.get("operador", ""), "Fecha liquidación", fecha_corta(liq.get("fecha"))],
            ["Folio", str(folio), "Tipo de sueldo", (liq.get("tipo_sueldo") or "").upper()],
            ["Fecha salida", fecha_corta(liq.get("fecha_salida")), "Fecha regreso", fecha_corta(liq.get("fecha_regreso")) or "—"],
        ]
        t = Table(datos, colWidths=col_datos)
        t.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('BACKGROUND', (0, 0), (-1, -1), MARFIL),
            ('TEXTCOLOR', (0, 0), (0, -1), TINTA_2),
            ('TEXTCOLOR', (2, 0), (2, -1), TINTA_2),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, LINEA),
            ('BOX', (0, 0), (-1, -1), 0.5, LINEA),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        y = _dibujar_tabla(c, t, margen, y) - 18

        # ---------- Percepciones ----------
        col_perc = [130, ancho_util - 130 - 110, 110]
        if not llegada:
            detalle_estancia = "Sin estancia"
        elif not estancias_pagadas:
            detalle_estancia = f"Llegada {fecha_corta(llegada)} · sin días de estancia"
        else:
            dias_txt = ", ".join(f"{fecha_corta(f)} ({d} {dinero(m)})" for f, d, m in estancias_pagadas)
            detalle_estancia = (
                f"Llegada {fecha_corta(llegada)} · {len(estancias_pagadas)} día(s): {dias_txt}"
            )
        rendimiento_txt = "Sí" if int(liq.get("rendimiento_aplica") or 0) else "No aplica"
        filas_perc = [
            ["Sueldo", (liq.get("tipo_sueldo") or "").capitalize(), dinero(liq.get("sueldo"))],
            ["Ida", f"Cliente: {liq.get('ida_cliente') or '—'}", dinero(liq.get("ida_monto"))],
            ["Regreso", f"Cliente: {liq.get('regreso_cliente') or '—'}", dinero(liq.get("regreso_monto"))],
            ["Estancia", Paragraph(detalle_estancia, _estilo_chico()), dinero(liq.get("estancia_monto"))],
            ["Maniobras", "", dinero(liq.get("maniobras"))],
            ["Extras", "", dinero(liq.get("extras"))],
            ["Casetas", "", dinero(liq.get("casetas"))],
            ["Rendimiento", rendimiento_txt, dinero(liq.get("rendimiento_monto"))],
            ["TOTAL", "", dinero(liq.get("total"))],
        ]
        t = _tabla_liquidacion(filas_perc, col_perc, ["PERCEPCIONES", "Detalle", "Monto"], fila_total=True)
        y = _dibujar_tabla(c, t, margen, y) - 18

        # ---------- Deducciones ----------
        pagos = []
        for i in range(1, 5):
            f = liq.get(f"infonavit_pago{i}")
            fo = liq.get(f"infonavit_folio{i}") or ""
            if not f:
                pagos.append(f"Pago {i}: ____")
            elif fo and fo != str(folio):
                pagos.append(f"Pago {i}: {fecha_corta(f)} (folio {fo})")
            else:
                pagos.append(f"Pago {i}: {fecha_corta(f)}")
        filas_ded = [
            ["Gastos", "", dinero(liq.get("gastos"))],
            ["Préstamo", "", dinero(liq.get("prestamo"))],
            ["Infonavit", Paragraph("  |  ".join(pagos), _estilo_chico()), dinero(liq.get("infonavit"))],
        ]
        t = _tabla_liquidacion(filas_ded, col_perc, ["DEDUCCIONES", "Detalle", "Monto"])
        y = _dibujar_tabla(c, t, margen, y) - 16

        # ---------- Total a pagar ----------
        alto_caja = 44
        c.setFillColor(VERDE)
        c.roundRect(margen, y - alto_caja, ancho_util, alto_caja, 10, fill=1, stroke=0)
        c.setFillColor(DORADO)
        c.rect(margen, y - alto_caja + 8, 4, alto_caja - 16, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(margen + 18, y - alto_caja + 17, "TOTAL A PAGAR")
        c.setFont("Helvetica", 8.5)
        c.setFillColor(colors.HexColor("#9CA3AF"))
        c.drawString(margen + 140, y - alto_caja + 18, "Total − Gastos − Préstamo − Infonavit")
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 20)
        c.drawRightString(width - margen - 16, y - alto_caja + 14, dinero(liq.get("total_pagar")))
        y -= alto_caja + 14

        # ---------- Observaciones (si hay) ----------
        obs = (liq.get("observaciones") or "").strip()
        if obs:
            c.setFillColor(TINTA_2)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(margen, y, "Observaciones:")
            p = Paragraph(obs, _estilo_chico())
            _, alto_p = p.wrap(ancho_util - 90, 60)
            p.drawOn(c, margen + 85, y - alto_p + 8)

        # ---------- Firmas ----------
        firmas_y = 95
        c.setStrokeColor(TINTA_2)
        c.setLineWidth(0.8)
        c.line(margen + 30, firmas_y, margen + 240, firmas_y)
        c.line(width - margen - 240, firmas_y, width - margen - 30, firmas_y)

        c.setFillColor(VERDE)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(margen + 135, firmas_y - 16, "VISTO BUENO")
        c.drawCentredString(width - margen - 135, firmas_y - 16, "FIRMA DEL OPERADOR")

        c.setFillColor(TINTA_2)
        c.setFont("Helvetica", 9)
        c.drawCentredString(width - margen - 135, firmas_y - 30, liq.get("operador", ""))

        c.setFillColor(DORADO)
        c.rect(0, 0, width, 3, fill=1, stroke=0)
        c.setFont("Helvetica", 7.5)
        c.setFillColor(GRIS)
        c.drawCentredString(width / 2, 34, "Documento generado por el Sistema de Liquidaciones")

        c.save()
        os.replace(tmp_filename, filename)

    except Exception as e:
        if os.path.exists(tmp_filename):
            try:
                os.remove(tmp_filename)
            except OSError:
                pass
        raise ErrorGenerandoPDF(f"No se pudo generar el PDF de la liquidación {folio}: {e}") from e


def _estilo_chico():
    from reportlab.lib.styles import ParagraphStyle
    return ParagraphStyle("chico", fontName="Helvetica", fontSize=9, leading=12,
                          textColor=TINTA_2)


# =========================================================
# REPORTE MENSUAL POR OPERADOR (hoja carta horizontal)
# =========================================================

def generar_pdf_reporte_mensual(filename, mes, operadores, totales, por_operador):
    from reportlab.lib.pagesizes import landscape
    from reportlab.platypus import SimpleDocTemplate, Spacer, PageBreak, KeepTogether
    from reportlab.lib.styles import ParagraphStyle

    tmp_filename = filename + ".tmp"
    titulo_mes = mes_largo(mes)

    def encabezado(c, doc):
        width, height = landscape(letter)
        c.saveState()
        c.setFillColor(VERDE)
        c.rect(0, height - 70, width, 70, fill=1, stroke=0)
        c.setFillColor(DORADO)
        c.rect(0, height - 73, width, 3, fill=1, stroke=0)
        c.roundRect(36, height - 55, 30, 30, 7, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 14)
        c.drawCentredString(51, height - 45, "L")
        c.setFont("Helvetica-Bold", 17)
        c.drawString(78, height - 38, "REPORTE MENSUAL POR OPERADOR")
        c.setFont("Helvetica", 8.5)
        c.setFillColor(colors.HexColor("#9CA3AF"))
        c.drawString(79, height - 53, "SISTEMA DE LIQUIDACIONES  ·  CONTROL DE VIAJES")
        c.setFillColor(colors.white)
        c.setFont("Helvetica", 8.5)
        c.drawRightString(width - 36, height - 33, "PERIODO")
        c.setFont("Helvetica-Bold", 16)
        c.drawRightString(width - 36, height - 52, titulo_mes.upper())
        c.setFillColor(DORADO)
        c.rect(0, 0, width, 3, fill=1, stroke=0)
        c.setFont("Helvetica", 7.5)
        c.setFillColor(GRIS)
        c.drawString(36, 16, "Documento generado por el Sistema de Liquidaciones")
        c.drawRightString(width - 36, 16, f"Página {doc.page}")
        c.restoreState()

    try:
        doc = SimpleDocTemplate(
            tmp_filename, pagesize=landscape(letter),
            leftMargin=36, rightMargin=36, topMargin=90, bottomMargin=36,
            title=f"Reporte mensual {titulo_mes}",
        )
        estilo_h = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=13, textColor=TINTA, spaceAfter=4)
        estilo_sub = ParagraphStyle("sub", fontName="Helvetica", fontSize=8.5, textColor=TINTA_2, spaceAfter=10)
        estilo_op = ParagraphStyle("op", fontName="Helvetica-Bold", fontSize=9.5, textColor=VERDE, spaceBefore=8, spaceAfter=4)
        estilo_celda = ParagraphStyle("c", fontName="Helvetica", fontSize=7.5, leading=9, textColor=TINTA)

        elementos = []

        # ---- Resumen
        elementos.append(Paragraph("Resumen por operador", estilo_h))
        elementos.append(Paragraph(
            f"{totales['viajes']} viaje(s) liquidado(s) · {len(operadores)} operador(es) · "
            f"Total percepciones {dinero(totales['total'])} · Total pagado {dinero(totales['total_pagar'])}",
            estilo_sub
        ))

        cabecera = ["Operador", "Viajes", "Sueldo", "Ida", "Regreso", "Estancia", "Maniobras",
                    "Extras", "Casetas", "Rendim.", "Total", "Gastos", "Préstamo", "Infonavit", "A pagar"]
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

        anchos = [138, 34] + [44] * 13
        tabla = Table(filas, colWidths=anchos, repeatRows=1)
        tabla.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 7.5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BACKGROUND', (0, 0), (-1, 0), VERDE),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('LINEBELOW', (0, 0), (-1, 0), 1.5, DORADO),
            ('LINEBELOW', (0, 1), (-1, -2), 0.4, LINEA),
            ('BACKGROUND', (10, 1), (10, -1), MARFIL),
            ('FONTNAME', (10, 1), (10, -1), 'Helvetica-Bold'),
            ('BACKGROUND', (14, 1), (14, -2), VERDE_SUAVE),
            ('FONTNAME', (14, 1), (14, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (14, 1), (14, -2), VERDE),
            ('BACKGROUND', (0, -1), (-1, -1), VERDE_SUAVE),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('LINEABOVE', (0, -1), (-1, -1), 1.2, VERDE),
            ('BACKGROUND', (14, -1), (14, -1), VERDE),
            ('TEXTCOLOR', (14, -1), (14, -1), colors.white),
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
            filas = [["Folio", "Fecha", "Sueldo", "Total", "Gastos", "Préstamo", "Infonavit", "A pagar"]]
            for d in lista:
                filas.append([
                    d["folio"], fecha_corta(d["fecha"]), (d["tipo_sueldo"] or "").capitalize(),
                    dinero(d["total"]), dinero(d["gastos"]), dinero(d["prestamo"]),
                    dinero(d["infonavit"]), dinero(d["total_pagar"]),
                ])
            filas.append(["", "", f"{o['viajes']} viaje(s)", dinero(o["total"]), dinero(o["gastos"]),
                          dinero(o["prestamo"]), dinero(o["infonavit"]), dinero(o["total_pagar"])])
            t = Table(filas, colWidths=[60, 80, 70, 80, 80, 80, 80, 90], repeatRows=1, hAlign="LEFT")
            t.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
                ('BACKGROUND', (0, 0), (-1, 0), MARFIL),
                ('TEXTCOLOR', (0, 0), (-1, 0), TINTA_2),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('LINEBELOW', (0, 0), (-1, 0), 0.8, DORADO),
                ('LINEBELOW', (0, 1), (-1, -2), 0.4, LINEA),
                ('FONTNAME', (0, 1), (0, -2), 'Helvetica-Bold'),
                ('TEXTCOLOR', (0, 1), (0, -2), VERDE),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('LINEABOVE', (0, -1), (-1, -1), 1, VERDE),
                ('TEXTCOLOR', (-1, 1), (-1, -1), VERDE),
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
