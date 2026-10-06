# =========================================================
# fuente_salidas.py — Enlace con el sistema de salidas
# -----------------------------------------------------------
# Aquí vive TODO lo que lee del sistema de salidas. Hay dos
# formas de conectarse (se eligen en config_data.py):
#
#   A) Archivo: abre reportes.db del sistema de salidas en modo
#      SOLO LECTURA. Nunca escribe ni bloquea esa base.
#   B) URL: pide los datos por internet al sistema de salidas
#      (necesita extras/api_salidas.py instalado allá).
#
# Ambas regresan lo mismo:
#   obtener_folio(folio)  -> (ida, regreso) como diccionarios, o (None, None)
#   folios_recientes(n)   -> lista de (folio, operador, fecha_salida)
#   estado()              -> texto para mostrar cómo está la conexión
# =========================================================

import os
import json
import sqlite3
import urllib.request
import urllib.error

import config_data
import database


class ErrorFuente(Exception):
    """No se pudo leer el sistema de salidas."""
    pass


def _ruta_db():
    ruta = (config_data.RUTA_SALIDAS_DB or "").strip()
    if ruta:
        return ruta
    return os.path.normpath(
        os.path.join(database.BASE_DIR, "..", "ReporteSalidas_Pro", "data", "reportes.db")
    )


def _usa_url():
    return bool((config_data.URL_SALIDAS or "").strip())


def _url_base():
    return config_data.URL_SALIDAS.strip().rstrip("/")


# ---------------------------------------------------------
# A) ARCHIVO (solo lectura)
# ---------------------------------------------------------
def _conn_ro():
    ruta = _ruta_db()
    if not os.path.exists(ruta):
        raise ErrorFuente(
            f"No se encontró la base de datos del sistema de salidas en: {ruta}. "
            "Revisa RUTA_SALIDAS_DB en config_data.py."
        )
    uri = "file:" + ruta.replace("\\", "/") + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def _folio_archivo(folio):
    conn = _conn_ro()
    try:
        ida = conn.execute("SELECT * FROM reportes WHERE folio = ?", (folio,)).fetchone()
        regreso = conn.execute("SELECT * FROM regresos WHERE folio = ?", (folio + "-R",)).fetchone()
        return (dict(ida) if ida else None, dict(regreso) if regreso else None)
    finally:
        conn.close()


def _recientes_archivo(n):
    conn = _conn_ro()
    try:
        filas = conn.execute(
            "SELECT folio, operador, fecha_salida FROM reportes ORDER BY id DESC LIMIT ?", (n,)
        ).fetchall()
        return [(f["folio"], f["operador"], f["fecha_salida"]) for f in filas]
    finally:
        conn.close()


# ---------------------------------------------------------
# B) URL (API del sistema de salidas)
# ---------------------------------------------------------
def _get_json(ruta):
    url = _url_base() + ruta
    peticion = urllib.request.Request(url)
    if config_data.CLAVE_API_SALIDAS:
        peticion.add_header("X-Clave-Api", config_data.CLAVE_API_SALIDAS)
    try:
        with urllib.request.urlopen(peticion, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        if e.code == 401:
            raise ErrorFuente(
                "El sistema de salidas rechazó la clave. Revisa que la variable "
                "CLAVE_API_SALIDAS sea igual en los dos sistemas."
            ) from e
        raise ErrorFuente(f"El sistema de salidas respondió con error {e.code} en {url}") from e
    except (urllib.error.URLError, ValueError, OSError) as e:
        raise ErrorFuente(
            f"No se pudo conectar con el sistema de salidas en {url}. "
            f"Revisa URL_SALIDAS en config_data.py y que api_salidas.py esté instalado allá. Detalle: {e}"
        ) from e


def _folio_url(folio):
    datos = _get_json(f"/api/folio/{folio}")
    if not datos or not datos.get("ida"):
        return (None, None)
    return (datos.get("ida"), datos.get("regreso"))


def _recientes_url(n):
    datos = _get_json(f"/api/folios?limite={n}") or []
    return [(d["folio"], d["operador"], d["fecha_salida"]) for d in datos]


# ---------------------------------------------------------
# API PÚBLICA
# ---------------------------------------------------------
def obtener_folio(folio):
    if _usa_url():
        return _folio_url(folio)
    return _folio_archivo(folio)


def folios_recientes(n=400):
    if _usa_url():
        return _recientes_url(n)
    return _recientes_archivo(n)


def estado():
    """Regresa (ok, descripcion) para mostrar en pantalla."""
    origen = f"URL: {_url_base()}" if _usa_url() else f"Archivo: {_ruta_db()}"
    try:
        cuantos = len(folios_recientes(5))
        return True, f"Conectado al sistema de salidas ({origen})"
    except ErrorFuente as e:
        return False, str(e)
