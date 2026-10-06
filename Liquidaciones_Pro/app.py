# =========================================================
# app.py — Sistema de Liquidaciones
# -----------------------------------------------------------
# Programa independiente, con su propia carpeta y su propia
# base de datos (data/liquidaciones.db). Se ENLAZA al sistema
# de salidas solo para leer folios, operador, fechas y clientes
# (ver fuente_salidas.py y config_data.py).
#
#   database.py        -> base propia + respaldos
#   fuente_salidas.py  -> lectura del sistema de salidas
#   pdf_generator.py   -> PDF de liquidación
#   config_data.py     -> ruta/URL del sistema de salidas y sueldos
# =========================================================

import os
import sqlite3
import webbrowser
import threading
import time
import traceback

from flask import Flask, render_template, request, send_file, redirect, url_for

import database
import config_data
import pdf_generator
import fuente_salidas

app = Flask(__name__)

database.asegurar_carpetas()
database.init_db()
database.iniciar_respaldo_periodico(intervalo_segundos=3600)


# =========================================================
# UTILIDADES
# =========================================================

def campo(form, nombre, default="", mayusculas=False):
    valor = (form.get(nombre) or default).strip()
    return valor.upper() if mayusculas else valor


def numero(form, nombre):
    """Lee un monto tolerando '$', comas y vacíos."""
    crudo = (form.get(nombre) or "").replace("$", "").replace(",", "").strip()
    if not crudo:
        return 0.0
    try:
        return round(float(crudo), 2)
    except ValueError:
        return 0.0


def pagina_error(titulo, mensaje, volver="/"):
    return f'''
    <html>
    <head><meta charset="utf-8"><title>{titulo}</title></head>
    <body style="font-family: Arial, sans-serif; max-width: 640px; margin: 60px auto; text-align: center;">
        <h2 style="color:#B91C1C;">{titulo}</h2>
        <p style="color:#374151; font-size: 16px; word-break: break-word;">{mensaje}</p>
        <a href="{volver}" style="display:inline-block; margin-top:20px; padding:10px 20px;
           background:#111827; color:white; border-radius:8px; text-decoration:none;">
           Volver
        </a>
    </body>
    </html>
    ''', 400


@app.errorhandler(404)
def error_404(e):
    return pagina_error("Página no encontrada", "La dirección que buscas no existe.")


@app.errorhandler(500)
def error_500(e):
    traceback.print_exc()
    return pagina_error(
        "Ocurrió un error inesperado",
        "El sistema tuvo un problema pero sigue funcionando. "
        "Tus datos están a salvo (hay respaldos automáticos)."
    )


@app.errorhandler(fuente_salidas.ErrorFuente)
def error_fuente(e):
    return pagina_error("No se pudo leer el sistema de salidas", str(e))


@app.context_processor
def contexto_global():
    conectado, estado = fuente_salidas.estado()
    return {
        "hoy_texto": pdf_generator.fecha_larga(time.strftime("%Y-%m-%d")),
        "conectado": conectado,
        "estado": estado,
    }


@app.template_filter("dinero")
def filtro_dinero(valor):
    return pdf_generator.dinero(valor)


@app.template_filter("mes_largo")
def filtro_mes_largo(valor):
    return pdf_generator.mes_largo(valor)


@app.template_filter("fecha_corta")
def filtro_fecha_corta(valor):
    return pdf_generator.fecha_corta(valor)


@app.template_filter("monto")
def filtro_monto(valor):
    """Para los cuadros del formulario: vacío si es 0, si no con 2 decimales."""
    try:
        v = float(valor or 0)
    except (TypeError, ValueError):
        return ""
    return "" if v == 0 else "{:.2f}".format(v)


# =========================================================
# LÓGICA DE LA LIQUIDACIÓN
# =========================================================

CAMPOS_NUMERICOS = (
    "sueldo", "ida_monto", "regreso_monto", "estancia_monto", "maniobras",
    "extras", "casetas", "rendimiento_monto", "gastos", "prestamo", "infonavit",
)

CAMPOS_TEXTO = (
    "fecha", "tipo_sueldo", "ida_cliente", "regreso_cliente", "estancia_fechas",
    "infonavit_pago1", "infonavit_pago2", "infonavit_pago3", "infonavit_pago4",
    "observaciones", "maniobras_descripcion",
)


def leer_liquidacion(form):
    """Arma el diccionario de la liquidación desde el formulario y calcula totales."""
    liq = {}
    for nombre in CAMPOS_TEXTO:
        liq[nombre] = campo(form, nombre, mayusculas=nombre.endswith("cliente") or nombre in ("observaciones", "maniobras_descripcion"))
    for nombre in CAMPOS_NUMERICOS:
        liq[nombre] = numero(form, nombre)

    liq["tipo_sueldo"] = (liq["tipo_sueldo"] or "REGULAR").upper()
    # El sueldo siempre sale de config_data.py según el tipo elegido
    liq["sueldo"] = float(config_data.SUELDOS.get(liq["tipo_sueldo"], liq["sueldo"]))

    liq["rendimiento_aplica"] = 1 if form.get("rendimiento_aplica") else 0
    if not liq["rendimiento_aplica"]:
        liq["rendimiento_monto"] = 0.0

    fechas = sorted({f.strip() for f in liq["estancia_fechas"].split(",") if f.strip()})
    liq["estancia_fechas"] = ",".join(fechas)

    liq["total"] = round(
        liq["sueldo"] + liq["ida_monto"] + liq["regreso_monto"] + liq["estancia_monto"]
        + liq["maniobras"] + liq["extras"] + liq["casetas"] + liq["rendimiento_monto"], 2
    )
    liq["total_pagar"] = round(
        liq["total"] - liq["gastos"] - liq["prestamo"] - liq["infonavit"], 2
    )
    return liq


def fila_a_dict(cursor, fila):
    if fila is None:
        return None
    return {desc[0]: fila[idx] for idx, desc in enumerate(cursor.description)}


def prestamo_numerico(texto):
    """'700 PESOS' -> 700.0"""
    digitos = "".join(ch for ch in (texto or "") if ch.isdigit() or ch == ".")
    try:
        return float(digitos) if digitos else 0.0
    except ValueError:
        return 0.0


def generar_pdf_seguro(liq, volver):
    pdf_name = os.path.join(database.PDF_DIR, f"Liquidacion_{liq['folio']}.pdf")
    try:
        pdf_generator.generar_pdf_liquidacion(pdf_name, liq)
    except pdf_generator.ErrorGenerandoPDF as e:
        return pagina_error(
            "La liquidación se guardó, pero el PDF no se pudo generar",
            f"Puedes reintentar el PDF entrando a 'Editar'. Detalle: {e}",
            volver
        )
    return None


# =========================================================
# INFONAVIT POR OPERADOR Y MES
# =========================================================

def mes_de(fecha_iso):
    """'2026-09-25' -> '2026-09'. Si viene vacío, el mes actual."""
    fecha_iso = (fecha_iso or "").strip()
    return fecha_iso[:7] if len(fecha_iso) >= 7 else time.strftime("%Y-%m")


def pagos_infonavit(conn, operador, mes, folio_actual):
    """
    Regresa los 4 pagos del operador en ese mes:
      [{"n":1, "fecha":"2026-09-01", "folio":"50908", "bloqueado":True}, ...]
    Un pago está bloqueado si lo registró OTRO folio.
    """
    fila = conn.execute(
        "SELECT * FROM infonavit_mensual WHERE operador = ? AND mes = ?", (operador, mes)
    ).fetchone()
    registro = {}
    if fila:
        registro = {d[0]: fila[i] for i, d in enumerate(conn.execute(
            "SELECT * FROM infonavit_mensual WHERE id = ?", (fila[0],)).description)}

    pagos = []
    for i in range(1, 5):
        fecha = registro.get(f"pago{i}_fecha") or ""
        folio = registro.get(f"pago{i}_folio") or ""
        pagos.append({
            "n": i, "fecha": fecha, "folio": folio,
            "bloqueado": bool(fecha and folio and folio != folio_actual),
        })
    return pagos


def guardar_pagos_infonavit(conn, operador, mes, folio, form):
    """
    Combina lo que ya estaba registrado (de otros folios) con lo que
    capturó este folio, lo guarda en infonavit_mensual y regresa los 4
    pagos finales para dejar copia en la liquidación (PDF).
    """
    # Este folio solo puede tener pagos en un mes: limpiar otros meses
    for i in range(1, 5):
        conn.execute(
            f"UPDATE infonavit_mensual SET pago{i}_fecha = NULL, pago{i}_folio = NULL "
            f"WHERE pago{i}_folio = ? AND mes != ?", (folio, mes)
        )

    actuales = pagos_infonavit(conn, operador, mes, folio)
    finales = []
    anterior_lleno = True   # Regla: un pago solo se acepta si el anterior ya tiene fecha
    for pago in actuales:
        i = pago["n"]
        if pago["bloqueado"]:
            finales.append((pago["fecha"], pago["folio"]))
            anterior_lleno = True
            continue
        fecha = campo(form, f"infonavit_pago{i}") if anterior_lleno else ""
        finales.append((fecha, folio if fecha else ""))
        anterior_lleno = bool(fecha)

    conn.execute(
        "INSERT OR IGNORE INTO infonavit_mensual (operador, mes) VALUES (?, ?)", (operador, mes)
    )
    asignaciones = ", ".join(f"pago{i}_fecha = ?, pago{i}_folio = ?" for i in range(1, 5))
    valores = [v for par in finales for v in (par[0] or None, par[1] or None)]
    conn.execute(
        f"UPDATE infonavit_mensual SET {asignaciones} WHERE operador = ? AND mes = ?",
        valores + [operador, mes]
    )
    return finales


def quitar_pagos_de_folio(conn, folio):
    for i in range(1, 5):
        conn.execute(
            f"UPDATE infonavit_mensual SET pago{i}_fecha = NULL, pago{i}_folio = NULL "
            f"WHERE pago{i}_folio = ?", (folio,)
        )


@app.route('/api/infonavit')
def api_infonavit():
    """Usado por el formulario para mostrar los pagos del mes elegido."""
    from flask import jsonify
    operador = request.args.get("operador", "")
    mes = mes_de(request.args.get("fecha", ""))
    folio = request.args.get("folio", "")
    with database.get_conn() as conn:
        pagos = pagos_infonavit(conn, operador, mes, folio)
    return jsonify({"mes": mes, "mes_nombre": pdf_generator.mes_largo(mes), "pagos": pagos})


# =========================================================
# RUTAS
# =========================================================

@app.route('/')
def inicio():
    mensaje = request.args.get("mensaje", "")
    pdf = request.args.get("pdf", "")

    with database.get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT folio, fecha, operador, tipo_sueldo, total, total_pagar, ida_cliente
            FROM liquidaciones ORDER BY id DESC
        """)
        lista = cursor.fetchall()
        cursor.execute("SELECT folio FROM liquidaciones")
        ya_liquidados = {f[0] for f in cursor.fetchall()}

    # Folios del sistema de salidas que todavía no tienen liquidación
    conectado, estado = fuente_salidas.estado()
    pendientes = []
    if conectado:
        try:
            pendientes = [
                f for f in fuente_salidas.folios_recientes(400) if f[0] not in ya_liquidados
            ]
        except fuente_salidas.ErrorFuente as e:
            conectado, estado = False, str(e)

    # Indicadores del mes en curso
    mes_actual = time.strftime("%Y-%m")
    with database.get_conn() as conn:
        fila = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(total_pagar), 0) FROM liquidaciones WHERE substr(fecha, 1, 7) = ?",
            (mes_actual,)
        ).fetchone()
    anio, mes_num = int(mes_actual[:4]), int(mes_actual[5:7])
    mes_anterior = f"{anio - 1}-12" if mes_num == 1 else f"{anio}-{mes_num - 1:02d}"
    with database.get_conn() as conn:
        fila_ant = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(total_pagar), 0) FROM liquidaciones WHERE substr(fecha, 1, 7) = ?",
            (mes_anterior,)
        ).fetchone()
    kpi = {
        "mes_cantidad": fila[0],
        "mes_pagado": fila[1],
        "mes_nombre": pdf_generator.mes_largo(mes_actual),
        "ant_cantidad": fila_ant[0] if fila_ant[0] else None,
        "ant_pagado": fila_ant[1],
        "ant_nombre": pdf_generator.mes_largo(mes_anterior).split(" ")[0].lower(),
    }

    return render_template(
        'liquidaciones.html', lista=lista, pendientes=pendientes,
        mensaje=mensaje, pdf=pdf, conectado=conectado, estado=estado,
        kpi=kpi, hoy_texto=pdf_generator.fecha_larga(time.strftime("%Y-%m-%d")),
        seccion="panel"
    )


@app.route('/liquidaciones')
def liquidaciones():
    return redirect(url_for('inicio', **request.args))


@app.route('/liquidaciones/buscar', methods=['POST'])
def liquidacion_buscar():
    folio = campo(request.form, 'folio').upper().replace("-R", "")
    if not folio:
        return redirect(url_for('inicio', mensaje="Escribe un folio para buscar", tipo="warn"))

    with database.get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM liquidaciones WHERE folio = ?", (folio,))
        if cursor.fetchone():
            return redirect(url_for('liquidacion_editar', folio=folio))

    ida, regreso = fuente_salidas.obtener_folio(folio)
    if not ida:
        return redirect(url_for('inicio', mensaje=f"Folio {folio} no encontrado en el sistema de salidas", tipo="error"))

    liq = {
        "folio": ida["folio"],
        "operador": ida["operador"],
        "fecha_salida": ida["fecha_salida"],
        "fecha_regreso": (regreso or {}).get("fecha_regreso") or "",
        "fecha": time.strftime("%Y-%m-%d"),
        "tipo_sueldo": "REGULAR",
        "sueldo": config_data.SUELDOS["REGULAR"],
        "ida_cliente": ida.get("cliente") or "",
        "regreso_cliente": (regreso or {}).get("cliente") or "",
        "prestamo": prestamo_numerico(ida.get("prestamo")),
        "rendimiento_aplica": 0,
    }

    return render_template(
        'liquidacion_form.html', liq=liq, modo="nueva",
        sueldos=config_data.SUELDOS, regreso=regreso,
        tarifa_estancia=config_data.TARIFA_ESTANCIA,
        toast="Folio encontrado", toast_detalle=f"{liq['operador'].title()} · salida {pdf_generator.fecha_corta(liq['fecha_salida'])}"
    )


@app.route('/liquidaciones/guardar', methods=['POST'])
def liquidacion_guardar():
    folio = campo(request.form, 'folio')
    if not folio:
        return pagina_error("Faltan datos", "El folio es obligatorio.")

    ida, regreso = fuente_salidas.obtener_folio(folio)
    if not ida:
        return pagina_error(
            "Folio no encontrado",
            f"No existe ningún reporte de salida con el folio {folio}."
        )

    liq = leer_liquidacion(request.form)
    liq.update({
        "folio": folio,
        "operador": ida["operador"],
        "fecha_salida": ida["fecha_salida"],
        "fecha_regreso": (regreso or {}).get("fecha_regreso") or "",
        "creado": time.strftime("%Y-%m-%d %H:%M:%S"),
    })

    try:
        with database.get_conn() as conn:
            if conn.execute("SELECT 1 FROM liquidaciones WHERE folio = ?", (folio,)).fetchone():
                raise sqlite3.IntegrityError("duplicado")

            finales = guardar_pagos_infonavit(conn, liq["operador"], mes_de(liq["fecha"]), folio, request.form)
            for i, (fecha_p, folio_p) in enumerate(finales, start=1):
                liq[f"infonavit_pago{i}"] = fecha_p
                liq[f"infonavit_folio{i}"] = folio_p

            columnas = ", ".join(liq.keys())
            marcas = ", ".join("?" for _ in liq)
            conn.execute(
                f"INSERT INTO liquidaciones ({columnas}) VALUES ({marcas})",
                list(liq.values())
            )
    except sqlite3.IntegrityError:
        return pagina_error(
            "Liquidación duplicada",
            f"El folio {folio} ya tiene una liquidación. Búscalo para editarla."
        )

    error = generar_pdf_seguro(liq, "/")
    if error:
        return error

    return redirect(url_for('inicio', mensaje=f"Liquidación del folio {folio} guardada correctamente", pdf=folio, tipo="ok"))


@app.route('/liquidaciones/editar/<folio>', methods=['GET', 'POST'])
def liquidacion_editar(folio):
    if request.method == 'POST':
        liq = leer_liquidacion(request.form)
        with database.get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM liquidaciones WHERE folio = ?", (folio,))
            actual = fila_a_dict(cursor, cursor.fetchone())
            if not actual:
                return pagina_error("Liquidación no encontrada", f"No existe la liquidación del folio {folio}.")

            finales = guardar_pagos_infonavit(conn, actual["operador"], mes_de(liq["fecha"]), folio, request.form)
            for i, (fecha_p, folio_p) in enumerate(finales, start=1):
                liq[f"infonavit_pago{i}"] = fecha_p
                liq[f"infonavit_folio{i}"] = folio_p

            asignaciones = ", ".join(f"{k} = ?" for k in liq)
            cursor.execute(
                f"UPDATE liquidaciones SET {asignaciones} WHERE folio = ?",
                list(liq.values()) + [folio]
            )
            actual.update(liq)

        error = generar_pdf_seguro(actual, "/")
        if error:
            return error

        return redirect(url_for('inicio', mensaje=f"Liquidación del folio {folio} actualizada", pdf=folio, tipo="ok"))

    with database.get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM liquidaciones WHERE folio = ?", (folio,))
        liq = fila_a_dict(cursor, cursor.fetchone())

    if not liq:
        return pagina_error("Liquidación no encontrada", f"No existe la liquidación del folio {folio}.")

    # El regreso solo se usa para mostrar datos; si el sistema de salidas
    # no está disponible, se puede editar de todos modos.
    try:
        _, regreso = fuente_salidas.obtener_folio(folio)
    except fuente_salidas.ErrorFuente:
        regreso = None

    return render_template(
        'liquidacion_form.html', liq=liq, modo="editar",
        sueldos=config_data.SUELDOS, regreso=regreso,
        tarifa_estancia=config_data.TARIFA_ESTANCIA
    )


@app.route('/liquidaciones/pdf/<folio>')
def liquidacion_pdf(folio):
    pdf_name = os.path.join(database.PDF_DIR, f"Liquidacion_{folio}.pdf")
    if not os.path.exists(pdf_name):
        return pagina_error(
            "PDF no encontrado",
            f"No se encontró el PDF de la liquidación {folio}. Entra a 'Editar' y guarda para regenerarlo."
        )
    return send_file(pdf_name, as_attachment=False)


# =========================================================
# REPORTE MENSUAL POR OPERADOR
# =========================================================

COLUMNAS_REPORTE = (
    "sueldo", "ida_monto", "regreso_monto", "estancia_monto", "maniobras", "extras",
    "casetas", "rendimiento_monto", "total", "gastos", "prestamo", "infonavit", "total_pagar",
)


def datos_reporte_mensual(mes):
    """Regresa (meses_disponibles, filas_por_operador, totales, detalle_por_operador)."""
    with database.get_conn() as conn:
        meses = [f[0] for f in conn.execute(
            "SELECT DISTINCT substr(fecha, 1, 7) FROM liquidaciones WHERE fecha != '' ORDER BY 1 DESC"
        ).fetchall()]

        sumas = ", ".join(f"COALESCE(SUM({c}), 0)" for c in COLUMNAS_REPORTE)
        filas = conn.execute(f"""
            SELECT operador, COUNT(*), {sumas}
            FROM liquidaciones
            WHERE substr(fecha, 1, 7) = ?
            GROUP BY operador
            ORDER BY operador
        """, (mes,)).fetchall()

        detalle = conn.execute("""
            SELECT operador, folio, fecha, tipo_sueldo, total, gastos, prestamo, infonavit, total_pagar
            FROM liquidaciones
            WHERE substr(fecha, 1, 7) = ?
            ORDER BY operador, fecha, folio
        """, (mes,)).fetchall()

    operadores = []
    totales = {"viajes": 0, **{c: 0.0 for c in COLUMNAS_REPORTE}}
    for f in filas:
        fila = {"operador": f[0], "viajes": f[1]}
        for i, c in enumerate(COLUMNAS_REPORTE):
            fila[c] = round(f[2 + i] or 0, 2)
            totales[c] = round(totales[c] + fila[c], 2)
        totales["viajes"] += fila["viajes"]
        operadores.append(fila)

    por_operador = {}
    for d in detalle:
        por_operador.setdefault(d[0], []).append({
            "folio": d[1], "fecha": d[2], "tipo_sueldo": d[3], "total": d[4],
            "gastos": d[5], "prestamo": d[6], "infonavit": d[7], "total_pagar": d[8],
        })

    mes_actual = time.strftime("%Y-%m")
    if mes_actual not in meses:
        meses.insert(0, mes_actual)
    if mes not in meses:
        meses.append(mes)
        meses.sort(reverse=True)

    return meses, operadores, totales, por_operador


@app.route('/reportes')
def reportes():
    mes = mes_de(request.args.get("mes", ""))
    meses, operadores, totales, por_operador = datos_reporte_mensual(mes)
    conectado, estado = fuente_salidas.estado()
    return render_template(
        'reporte.html', mes=mes, meses=meses, operadores=operadores, totales=totales,
        por_operador=por_operador, mes_nombre=pdf_generator.mes_largo(mes),
        conectado=conectado, estado=estado, seccion="reportes"
    )


@app.route('/reportes/pdf')
def reporte_pdf():
    mes = mes_de(request.args.get("mes", ""))
    _, operadores, totales, por_operador = datos_reporte_mensual(mes)
    pdf_name = os.path.join(database.PDF_DIR, f"Reporte_Mensual_{mes}.pdf")
    try:
        pdf_generator.generar_pdf_reporte_mensual(pdf_name, mes, operadores, totales, por_operador)
    except pdf_generator.ErrorGenerandoPDF as e:
        return pagina_error("No se pudo generar el reporte", str(e), "/reportes")
    return send_file(pdf_name, as_attachment=False)


# =========================================================
# ADMIN
# =========================================================

@app.route('/admin/borrar_liquidacion/<folio>')
def borrar_liquidacion(folio):
    database.hacer_backup(motivo="antes_de_borrar")
    with database.get_conn() as conn:
        conn.execute("DELETE FROM liquidaciones WHERE folio = ?", (folio,))
        quitar_pagos_de_folio(conn, folio)
    pdf_path = os.path.join(database.PDF_DIR, f"Liquidacion_{folio}.pdf")
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
    return redirect(url_for('inicio', mensaje=f"Liquidación {folio} eliminada (se guardó respaldo)", tipo="warn"))


@app.route('/admin/respaldos')
def ver_respaldos():
    respaldos = []
    for nombre in database.listar_backups():
        ruta = os.path.join(database.BACKUP_DIR, nombre)
        partes = nombre[:-3].split("_")   # liquidaciones_YYYYMMDD_HHMMSS_motivo
        fecha_txt, motivo = "", ""
        if len(partes) >= 3:
            f, h = partes[1], partes[2]
            try:
                fecha_txt = f"{pdf_generator.fecha_corta(f'{f[:4]}-{f[4:6]}-{f[6:8]}')} {h[:2]}:{h[2:4]}"
            except Exception:
                fecha_txt = ""
            motivo = " ".join(partes[3:]).replace("_", " ")
        respaldos.append({
            "nombre": nombre, "fecha": fecha_txt, "motivo": motivo or "auto",
            "tamano": f"{os.path.getsize(ruta) / 1024:,.0f} KB",
        })
    conectado, estado = fuente_salidas.estado()
    return render_template(
        'respaldos.html', respaldos=respaldos, carpeta=database.BACKUP_DIR,
        mensaje=request.args.get("mensaje", ""),
        conectado=conectado, estado=estado, seccion="respaldos"
    )


@app.route('/admin/respaldos/nuevo')
def nuevo_respaldo():
    database.hacer_backup(motivo="manual")
    return redirect(url_for('ver_respaldos', mensaje="Respaldo creado correctamente", tipo="ok"))


@app.route('/admin/respaldos/descargar/<nombre>')
def descargar_respaldo(nombre):
    ruta = os.path.join(database.BACKUP_DIR, os.path.basename(nombre))
    if not os.path.exists(ruta):
        return pagina_error("Respaldo no encontrado", "Ese archivo de respaldo no existe.", "/admin/respaldos")
    return send_file(ruta, as_attachment=True)


# =========================================================
# INICIAR SERVIDOR
# =========================================================

def abrir_navegador():
    time.sleep(1)
    webbrowser.open(f'http://127.0.0.1:{config_data.PUERTO}')


if __name__ == '__main__':
    if not config_data.EN_SERVIDOR:
        threading.Thread(target=abrir_navegador).start()
    app.run(host='0.0.0.0', port=config_data.PUERTO, debug=False)
