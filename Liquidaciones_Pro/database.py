# =========================================================
# database.py — Liquidaciones
# -----------------------------------------------------------
# Base de datos PROPIA de liquidaciones (data/liquidaciones.db),
# con respaldos automáticos igual que el sistema de salidas.
# La base del sistema de salidas NUNCA se modifica desde aquí:
# solo se lee (ver fuente_salidas.py).
# =========================================================

import os
import sys
import sqlite3
import threading
import time
from datetime import datetime
from contextlib import contextmanager

if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# En Railway se define la variable DATA_DIR con la ruta del Volume
# (por ejemplo /data) para que la base, los PDF y los respaldos
# sobrevivan a cada nuevo despliegue. En Windows no se define y
# todo queda junto al programa, como siempre.
_DATA_ENV = (os.environ.get("DATA_DIR") or "").strip()

if _DATA_ENV:
    DATA_DIR = _DATA_ENV
    PDF_DIR = os.path.join(DATA_DIR, "PDFs")
    BACKUP_DIR = os.path.join(DATA_DIR, "backups")
else:
    DATA_DIR = os.path.join(BASE_DIR, "data")
    PDF_DIR = os.path.join(BASE_DIR, "PDFs")
    BACKUP_DIR = os.path.join(BASE_DIR, "backups")

DB_PATH = os.path.join(DATA_DIR, "liquidaciones.db")

MAX_BACKUPS = 60


def asegurar_carpetas():
    for carpeta in (DATA_DIR, PDF_DIR, BACKUP_DIR):
        os.makedirs(carpeta, exist_ok=True)


@contextmanager
def get_conn():
    """Conexión segura: commit si todo sale bien, rollback si algo falla."""
    asegurar_carpetas()
    conn = sqlite3.connect(DB_PATH, timeout=10)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------
# RESPALDOS
# ---------------------------------------------------------
def hacer_backup(motivo="auto"):
    asegurar_carpetas()
    if not os.path.exists(DB_PATH):
        return None

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    destino = os.path.join(BACKUP_DIR, f"liquidaciones_{timestamp}_{motivo}.db")
    try:
        origen = sqlite3.connect(DB_PATH)
        copia = sqlite3.connect(destino)
        with copia:
            origen.backup(copia)
        origen.close()
        copia.close()
    except Exception as e:
        print(f"[AVISO] No se pudo hacer el respaldo automático: {e}")
        return None

    _limpiar_backups_viejos()
    return destino


def _limpiar_backups_viejos():
    try:
        archivos = sorted(
            (f for f in os.listdir(BACKUP_DIR) if f.endswith(".db")),
            key=lambda f: os.path.getmtime(os.path.join(BACKUP_DIR, f))
        )
        exceso = len(archivos) - MAX_BACKUPS
        for f in archivos[:max(exceso, 0)]:
            os.remove(os.path.join(BACKUP_DIR, f))
    except Exception as e:
        print(f"[AVISO] No se pudo limpiar respaldos viejos: {e}")


def iniciar_respaldo_periodico(intervalo_segundos=3600):
    def loop():
        while True:
            time.sleep(intervalo_segundos)
            hacer_backup(motivo="periodico")

    threading.Thread(target=loop, daemon=True).start()


def listar_backups():
    asegurar_carpetas()
    archivos = [f for f in os.listdir(BACKUP_DIR) if f.endswith(".db")]
    archivos.sort(key=lambda f: os.path.getmtime(os.path.join(BACKUP_DIR, f)), reverse=True)
    return archivos


# ---------------------------------------------------------
# ESQUEMA
# ---------------------------------------------------------
def init_db():
    asegurar_carpetas()
    hacer_backup(motivo="arranque")

    with get_conn() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS liquidaciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                folio TEXT UNIQUE,
                fecha TEXT,
                operador TEXT,
                fecha_salida TEXT,
                fecha_regreso TEXT,
                tipo_sueldo TEXT,
                sueldo REAL DEFAULT 0,
                ida_cliente TEXT,
                ida_monto REAL DEFAULT 0,
                regreso_cliente TEXT,
                regreso_monto REAL DEFAULT 0,
                estancia_fechas TEXT,
                estancia_monto REAL DEFAULT 0,
                maniobras REAL DEFAULT 0,
                extras REAL DEFAULT 0,
                casetas REAL DEFAULT 0,
                rendimiento_aplica INTEGER DEFAULT 0,
                rendimiento_monto REAL DEFAULT 0,
                total REAL DEFAULT 0,
                gastos REAL DEFAULT 0,
                prestamo REAL DEFAULT 0,
                infonavit REAL DEFAULT 0,
                infonavit_pago1 TEXT,
                infonavit_pago2 TEXT,
                infonavit_pago3 TEXT,
                infonavit_pago4 TEXT,
                total_pagar REAL DEFAULT 0,
                observaciones TEXT,
                creado TEXT
            )
        ''')

        # Pagos de Infonavit por OPERADOR y MES (no por folio). Así, si el
        # operador sale con otro folio en el mismo mes, sus pagos ya
        # registrados aparecen y solo captura el siguiente.
        conn.execute('''
            CREATE TABLE IF NOT EXISTS infonavit_mensual (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operador TEXT,
                mes TEXT,
                pago1_fecha TEXT, pago1_folio TEXT,
                pago2_fecha TEXT, pago2_folio TEXT,
                pago3_fecha TEXT, pago3_folio TEXT,
                pago4_fecha TEXT, pago4_folio TEXT,
                UNIQUE(operador, mes)
            )
        ''')

        # Migración: en qué folio se registró cada pago (para el PDF)
        columnas = {fila[1] for fila in conn.execute("PRAGMA table_info(liquidaciones)")}
        for i in range(1, 5):
            if f"infonavit_folio{i}" not in columnas:
                conn.execute(f"ALTER TABLE liquidaciones ADD COLUMN infonavit_folio{i} TEXT")

        # Usuarios del sistema (inicio de sesión). Las contraseñas se guardan
        # cifradas (werkzeug.security), nunca en texto plano.
        conn.execute('''
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT UNIQUE NOT NULL,
                nombre TEXT,
                hash TEXT NOT NULL,
                rol TEXT NOT NULL DEFAULT 'capturista',
                activo INTEGER NOT NULL DEFAULT 1,
                creado TEXT
            )
        ''')

        # Bitácora: quién creó, editó o eliminó cada liquidación (y entradas).
        # Guarda una copia del operador y el monto porque al eliminar la
        # liquidación ya no existe.
        conn.execute('''
            CREATE TABLE IF NOT EXISTS bitacora (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fecha TEXT,
                usuario TEXT,
                nombre TEXT,
                accion TEXT,
                folio TEXT,
                detalle TEXT
            )
        ''')

        # Migración: descripción de la maniobra (texto libre, opcional)
        if "maniobras_descripcion" not in columnas:
            conn.execute("ALTER TABLE liquidaciones ADD COLUMN maniobras_descripcion TEXT")


# ---------------------------------------------------------
# CLAVE DE SESIÓN
# ---------------------------------------------------------
def clave_secreta():
    """
    Clave para firmar la sesión (cookie de inicio de sesión). Se crea una
    sola vez en data/clave_sesion y se reutiliza, para que las sesiones
    sobrevivan a un reinicio del programa.
    """
    import secrets
    asegurar_carpetas()
    ruta = os.path.join(DATA_DIR, "clave_sesion")
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            clave = f.read().strip()
        if len(clave) >= 32:
            return clave
    except OSError:
        pass
    clave = secrets.token_hex(32)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(clave)
    return clave
