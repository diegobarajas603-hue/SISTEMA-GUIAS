# -*- coding: utf-8 -*-
"""Textos comerciales del formato original de Fletes Tauro.

Se conservan literalmente. Lo unico que se parametriza son las cifras de la
mercancia, que en el formato original estaban escritas a mano dentro del
parrafo.
"""

SALUDO = "A quien corresponda:"

INTRO_1 = "Agradecemos la oportunidad de cotizar su requerimiento de transporte."

# Las {llaves} se sustituyen por los datos capturados en la cotizacion.
INTRO_2 = ("Con base en la información proporcionada, la presente cotización "
           "considera el traslado de {tarimas} tarimas, con dimensiones de "
           "{largo} m de largo, {ancho} m de ancho y {alto} m de alto, así como "
           "un peso aproximado de {peso} kg.")

INTRO_3 = ("De acuerdo con las características de la mercancía anteriormente "
           "descritas, ponemos a su consideración la siguiente propuesta "
           "económica:")

CONSIDERACIONES = [
    "La presente cotización se emite con base en las características de la "
    "mercancía proporcionadas por el cliente.",

    "Todos los importes indicados son más IVA.",

    "Los precios están sujetos a validación del peso, dimensiones y condiciones "
    "reales de la mercancía al momento de la recolección.",

    "El seguro de mercancía es opcional. En caso de requerir que el embarque "
    "viaje asegurado por Fletes Tauro, el costo será de $8.00 por cada millar "
    "del valor comercial declarado de la mercancía.",

    "La cotización no incluye servicios adicionales como maniobras, almacenajes, "
    "reexpediciones, citas de entrega (las cuales deberán solicitarse con un "
    "mínimo de 48 horas de anticipación) ni cualquier otro concepto "
    "extraordinario que pudiera generarse durante la operación.",

    "Para las recolecciones y entregas locales se utilizan unidades tipo rabón, "
    "mientras que el traslado entre Monterrey y Ciudad de México se realiza en "
    "tráiler con caja seca de 48 o 53 pies, de acuerdo con la disponibilidad "
    "operativa.",
]

NOTA_TABLA = ("Importes expresados en pesos mexicanos (MXN). Los precios "
              "indicados no incluyen IVA.")

WEB = "www.grupotauro.com.mx"

MATRIZ = {
    "titulo": "Matriz",

    "lineas": [
        "Carretera a Laredo Km. 16.5 No. 16501",
        "Col. Moisés Sáenz, Apodaca, N.L.",
        "C.P. 66613",
    ],
    "tel": "Tel.: (81) 1958-0740",
}

MEXICO = {
    "titulo": "México",

    "lineas": [
        "Álamo No. 28 / Av. Ceylán Esq. Encino",
        "Col. Tabla Honda",
        "Tlalnepantla, Edo. de México",
    ],
    "tel": "Tel.: (55) 5308-7500",
}

UNIDADES = [
    "Rabón (recolección y entrega local)",
    "Tráiler caja seca 48 pies",
    "Tráiler caja seca 53 pies",
    "Según disponibilidad operativa",
]
