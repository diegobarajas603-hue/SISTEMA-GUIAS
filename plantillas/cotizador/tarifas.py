# -*- coding: utf-8 -*-
"""Tabuladores de tarifas y logica de calculo.

Estos valores se escriben en la seccion "TABULADORES Y TARIFAS" del documento.
El macro de Word lee las tarifas DESDE ESAS TABLAS, no desde este archivo: aqui
solo viven los valores iniciales con los que se genera la plantilla y los tres
ejemplos de verificacion.
"""

MANUAL = "Personalizado (capturar importe)"

# --------------------------------------------------------------------------
# Tabuladores por peso (servicio dentro de zona)
# --------------------------------------------------------------------------
# (rango, peso maximo en kg, tarifa)
TAB_RECOLECCION = [
    ("Hasta 500 kg",        500,    850.00),
    ("De 501 a 1,000 kg",   1000,  1150.00),
    ("De 1,001 a 2,000 kg", 2000,  1450.00),
    ("De 2,001 a 3,500 kg", 3500,  1850.00),
    ("De 3,501 a 5,000 kg", 5000,  2300.00),
    ("Más de 5,000 kg",     999999, 2750.00),
]

TAB_ENTREGA = [
    ("Hasta 500 kg",        500,    900.00),
    ("De 501 a 1,000 kg",   1000,  1200.00),
    ("De 1,001 a 2,000 kg", 2000,  1500.00),
    ("De 2,001 a 3,500 kg", 3500,  1900.00),
    ("De 3,501 a 5,000 kg", 5000,  2350.00),
    ("Más de 5,000 kg",     999999, 2800.00),
]

# --------------------------------------------------------------------------
# Zonas foraneas (servicio fuera de zona)
# --------------------------------------------------------------------------
# (zona, cobertura, tarifa recoleccion, tarifa entrega)
TAB_ZONAS = [
    ("Zona 1", "Área metropolitana ampliada",              1450.00, 1500.00),
    ("Zona 2", "Hasta 50 km fuera del área metropolitana", 2100.00, 2200.00),
    ("Zona 3", "De 51 a 100 km",                           2850.00, 2950.00),
    ("Zona 4", "De 101 a 200 km",                          3900.00, 4050.00),
    ("Zona 5", "Más de 200 km",                            5200.00, 5400.00),
]

# --------------------------------------------------------------------------
# Fletes troncales
# --------------------------------------------------------------------------
RUTAS = ["Monterrey → Ciudad de México", "Ciudad de México → Monterrey"]
SERVICIOS = [
    "Carga consolidada regular",
    "Carga consolidada material peligroso",
    "Camión completo",
]
# (ruta, servicio, tarifa)
TAB_FLETES = [
    (RUTAS[0], SERVICIOS[0],  4900.00),
    (RUTAS[0], SERVICIOS[1],  6800.00),
    (RUTAS[0], SERVICIOS[2], 32000.00),
    (RUTAS[1], SERVICIOS[0],  5100.00),
    (RUTAS[1], SERVICIOS[1],  7100.00),
    (RUTAS[1], SERVICIOS[2], 33500.00),
]

# --------------------------------------------------------------------------
# Maniobras / seguro / cita
# --------------------------------------------------------------------------
TAB_MANIOBRAS = [
    ("Maniobra estándar (hasta 2 tarimas)",  650.00),
    ("Maniobra estándar (3 a 6 tarimas)",   1150.00),
    ("Maniobra con montacargas",            1600.00),
    ("Maniobra manual / estibada",          2200.00),
    (MANUAL,                                   0.00),
]

# (concepto, base de calculo, tarifa)
TAB_SEGURO = [
    ("Cobertura estándar", "Por millar del valor declarado", 8.00),
    ("Prima mínima",       "Importe fijo",                 350.00),
    (MANUAL,               "Importe fijo",                   0.00),
]

TAB_CITA = [
    ("Cita programada (48 h de anticipación)", 450.00),
    ("Cita en plataforma / andén de cliente",  850.00),
    (MANUAL,                                     0.00),
]

# --------------------------------------------------------------------------
# Conceptos de la cotizacion
# --------------------------------------------------------------------------
DENTRO = "Dentro de zona"
FUERA = "Fuera de zona"
AUTO_PESO = "Automático por peso"
MANUAL_MOD = "Importe manual"

PESOS = [r[0] for r in TAB_RECOLECCION]
ZONAS = [z[0] for z in TAB_ZONAS]

OPC_RECOLECCION = [AUTO_PESO] + PESOS + ZONAS
OPC_ENTREGA = [AUTO_PESO] + PESOS + ZONAS
OPC_MANIOBRAS = [m[0] for m in TAB_MANIOBRAS]
OPC_SEGURO = [s[0] for s in TAB_SEGURO]
OPC_CITA = [c[0] for c in TAB_CITA]

# clave, etiqueta visible para el cliente, opciones col.3, opciones col.4
#
# El orden de esta lista es el orden en que aparecen los conceptos tanto en el
# panel como en la tabla que ve el cliente: sigue la secuencia operativa real
# del embarque (recoleccion -> carga -> flete -> descarga -> entrega -> extras).
CONCEPTOS = [
    ("RECOLECCION", "Recolección",
     [DENTRO, FUERA, MANUAL_MOD], OPC_RECOLECCION),
    ("MANIOBRAS_CARGA", "Maniobras de carga",
     ["Según tabulador", MANUAL_MOD], OPC_MANIOBRAS),
    ("FLETE", "Flete",
     RUTAS + [MANUAL_MOD], SERVICIOS),
    ("MANIOBRAS_DESCARGA", "Maniobras de descarga",
     ["Según tabulador", MANUAL_MOD], OPC_MANIOBRAS),
    ("ENTREGA", "Servicio de entrega",
     [DENTRO, FUERA, MANUAL_MOD], OPC_ENTREGA),
    ("CITA", "Cita para entrega",
     ["Según tabulador", MANUAL_MOD], OPC_CITA),
    ("SEGURO", "Seguro de la mercancía",
     ["Sobre valor declarado", MANUAL_MOD], OPC_SEGURO),
]


# --------------------------------------------------------------------------
# Calculo (espejo exacto de la logica implementada en el macro VBA)
# --------------------------------------------------------------------------
def _tarifa_por_peso(tab, peso):
    for rango, maximo, tarifa in tab:
        if peso <= maximo:
            return rango, tarifa
    return tab[-1][0], tab[-1][2]


def _busca(tab, clave, col=1):
    for fila in tab:
        if fila[0] == clave:
            return fila[col]
    return None


def calcular_concepto(clave, modalidad, opcion, importe_manual, peso, valor_decl):
    """Devuelve (importe, detalle) para un concepto seleccionado.

    - clave: RECOLECCION / ENTREGA / FLETE / ...
    - modalidad: valor de la 3a columna del panel
    - opcion: valor de la 4a columna del panel
    - importe_manual: importe capturado a mano (o None)
    - peso: peso de la mercancia en kg
    - valor_decl: valor comercial declarado
    """
    if modalidad == MANUAL_MOD or opcion == MANUAL:
        return (float(importe_manual or 0), "Importe capturado manualmente")

    if clave in ("RECOLECCION", "ENTREGA"):
        tab = TAB_RECOLECCION if clave == "RECOLECCION" else TAB_ENTREGA
        col = 2 if clave == "RECOLECCION" else 3
        if modalidad == FUERA:
            tarifa = _busca(TAB_ZONAS, opcion, col)
            if tarifa is None:
                return (0.0, "Zona no encontrada en el tabulador")
            return (tarifa, "Fuera de zona · %s" % opcion)
        # Dentro de zona
        if opcion == AUTO_PESO or opcion not in PESOS:
            rango, tarifa = _tarifa_por_peso(tab, peso)
            return (tarifa, "Dentro de zona · %s" % rango)
        tarifa = [t for r, m, t in tab if r == opcion][0]
        return (tarifa, "Dentro de zona · %s" % opcion)

    if clave == "FLETE":
        for ruta, servicio, tarifa in TAB_FLETES:
            if ruta == modalidad and servicio == opcion:
                return (tarifa, "%s · %s" % (ruta, servicio))
        return (0.0, "Ruta/servicio no encontrado en el tabulador")

    if clave in ("MANIOBRAS_CARGA", "MANIOBRAS_DESCARGA"):
        tarifa = _busca(TAB_MANIOBRAS, opcion)
        return (tarifa or 0.0, opcion)

    if clave == "SEGURO":
        if opcion == "Cobertura estándar":
            tarifa = _busca(TAB_SEGURO, opcion, 2)
            importe = round(float(valor_decl) / 1000.0 * tarifa, 2)
            return (importe, "%s · $%s por millar sobre $%s"
                    % (opcion, fmt(tarifa), fmt(valor_decl)))
        tarifa = _busca(TAB_SEGURO, opcion, 2)
        return (tarifa or 0.0, opcion)

    if clave == "CITA":
        tarifa = _busca(TAB_CITA, opcion)
        return (tarifa or 0.0, opcion)

    # Concepto nuevo sin tabulador asociado: se usa el importe capturado.
    return (float(importe_manual or 0), "Importe capturado manualmente")


def etiqueta_cliente(clave, etiqueta, modalidad):
    """Texto que ve el cliente en la tabla de conceptos."""
    if clave == "FLETE" and modalidad in RUTAS:
        return "Flete %s" % modalidad.replace(" → ", " – ")
    return etiqueta


def fmt(n):
    return "{:,.2f}".format(float(n))


def money(n):
    return "$ " + fmt(n)
