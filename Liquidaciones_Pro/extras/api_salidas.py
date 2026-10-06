# =========================================================
# extras/api_salidas.py
# -----------------------------------------------------------
# OPCIONAL. Solo se necesita si el sistema de liquidaciones va
# a conectarse por internet/red al sistema de salidas (Opción B,
# URL_SALIDAS en config_data.py de Liquidaciones).
#
# Cómo instalarlo en el sistema de salidas (ReporteSalidas_Pro):
#   1) Copia este archivo junto a app.py (misma carpeta).
#   2) En app.py, debajo de la línea  app = Flask(__name__)  agrega:
#
#        import api_salidas
#        app.register_blueprint(api_salidas.bp)
#
#   3) Reinicia el sistema de salidas.
#
# Solo expone lectura de folios (nunca modifica nada):
#   GET /api/folio/<folio>        -> {"ida": {...}, "regreso": {...} | null}
#   GET /api/folios?limite=400    -> [{"folio","operador","fecha_salida"}, ...]
# =========================================================

from flask import Blueprint, jsonify, request

import database

bp = Blueprint("api_salidas", __name__)


def _dict(cursor, fila):
    if fila is None:
        return None
    return {d[0]: fila[i] for i, d in enumerate(cursor.description)}


@bp.route("/api/folio/<folio>")
def api_folio(folio):
    with database.get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM reportes WHERE folio = ?", (folio,))
        ida = _dict(cur, cur.fetchone())
        cur.execute("SELECT * FROM regresos WHERE folio = ?", (folio + "-R",))
        regreso = _dict(cur, cur.fetchone())
    if not ida:
        return jsonify({"error": "Folio no encontrado"}), 404
    return jsonify({"ida": ida, "regreso": regreso})


@bp.route("/api/folios")
def api_folios():
    try:
        limite = min(int(request.args.get("limite", 400)), 2000)
    except ValueError:
        limite = 400
    with database.get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT folio, operador, fecha_salida FROM reportes ORDER BY id DESC LIMIT ?", (limite,)
        )
        filas = cur.fetchall()
    return jsonify([{"folio": f[0], "operador": f[1], "fecha_salida": f[2]} for f in filas])
