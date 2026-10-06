# =========================================================
# config_data.py — Liquidaciones
# -----------------------------------------------------------
# AQUÍ SE CONFIGURA:
#   1) De dónde toma los folios (el sistema de salidas)
#   2) Los sueldos por tipo de viaje
#
# Respeta las comillas y las comas. Después de editar,
# reinicia el programa.
# =========================================================

# ---------------------------------------------------------
# 1) ENLACE CON EL SISTEMA DE SALIDAS
# ---------------------------------------------------------
# Opción A (misma computadora o carpeta compartida en red):
#   ruta al archivo reportes.db del sistema de salidas.
#   Ejemplos:
#     r"C:\ReporteSalidas_Pro\data\reportes.db"
#     r"\\SERVIDOR\Compartida\ReporteSalidas_Pro\data\reportes.db"
#   Si lo dejas en "", busca la carpeta ReporteSalidas_Pro
#   junto a esta carpeta (../ReporteSalidas_Pro/data/reportes.db).
RUTA_SALIDAS_DB = r"C:\ReporteSalidas_Pro\ReporteSalidas_Pro\data\reportes.db"

# Opción B (el sistema de salidas está en otra computadora o en
#   internet, por ejemplo Railway): dirección del sistema de salidas.
#   Requiere agregarle el archivo extras/api_salidas.py (ver INSTRUCCIONES).
#   Si pones una URL aquí, se usa en lugar de la Opción A.
#   Ejemplo: "https://mi-sistema.up.railway.app"
URL_SALIDAS = ""

# ---------------------------------------------------------
# 2) SUELDOS
# ---------------------------------------------------------
SUELDOS = {
    "REGULAR": 2800,
    "QUIMICO": 3100,
}

# ---------------------------------------------------------
# 3) ESTANCIA
# ---------------------------------------------------------
# En el calendario, el primer día marcado es el de LLEGADA y no
# se paga. Cada día siguiente cuenta como estancia y se paga
# según el día de la semana:
TARIFA_ESTANCIA = {
    "ENTRE_SEMANA": 150,   # lunes a viernes
    "FIN_DE_SEMANA": 300,  # sábado y domingo
}

# Puerto en el que abre este programa (el de salidas usa el 5000)
PUERTO = 5001

# ---------------------------------------------------------
# RAILWAY (no tocar): si existen estas variables de entorno,
# mandan sobre lo escrito arriba. Así el mismo código sirve en
# Windows y en Railway sin editar este archivo.
#   URL_SALIDAS      -> dirección del sistema de salidas
#   RUTA_SALIDAS_DB  -> ruta al reportes.db (si comparten Volume)
#   PORT             -> puerto que asigna Railway
# ---------------------------------------------------------
import os as _os
URL_SALIDAS = _os.environ.get("URL_SALIDAS", URL_SALIDAS)
RUTA_SALIDAS_DB = _os.environ.get("RUTA_SALIDAS_DB", RUTA_SALIDAS_DB)
PUERTO = int(_os.environ.get("PORT", PUERTO))
EN_SERVIDOR = bool(_os.environ.get("PORT") or _os.environ.get("RAILWAY_ENVIRONMENT"))

# Clave compartida con el sistema de salidas (Opción B). Debe ser la MISMA
# variable CLAVE_API_SALIDAS en los dos servicios de Railway. Nunca la
# escribas aquí: este archivo se sube a GitHub.
CLAVE_API_SALIDAS = _os.environ.get("CLAVE_API_SALIDAS", "").strip()

# Zona horaria. Railway trabaja en UTC (6 horas adelante de México), lo que
# movería la fecha de liquidación, la bitácora y el "mes actual". En el
# servidor se usa la hora del centro de México (UTC-6, sin horario de
# verano desde 2022). Se puede cambiar con la variable ZONA_HORARIA.
import time as _time
ZONA_HORARIA = _os.environ.get("ZONA_HORARIA", "CST6" if EN_SERVIDOR else "").strip()
if ZONA_HORARIA and hasattr(_time, "tzset"):
    _os.environ["TZ"] = ZONA_HORARIA
    _time.tzset()
