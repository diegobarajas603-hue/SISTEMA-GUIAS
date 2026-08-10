# Plantilla de cotizaciones · Fletes Tauro

Plantilla de Word que genera cotizaciones **en una sola hoja**, seleccionando
conceptos con casillas y listas desplegables y calculando los importes contra
tabuladores editables.

La hoja que ve el cliente contiene **exactamente** el contenido del formato
original de Fletes Tauro: logotipo, «A quien corresponda:», los tres párrafos de
presentación, la tabla CONCEPTO / COSTO, las seis consideraciones importantes y
los datos corporativos. No se agregó ningún dato que el formato no tuviera (no
hay folio, ni razón social del cliente, ni bloque de firmas).

## Archivos que se entregan (`salida/`)

| Archivo | Para qué sirve |
|---|---|
| `FORMATO_COTIZACION_FLETES_TAURO.docx` | **Formato rellenable de una hoja** (rojo/negro), reconstruido del PDF `COTIZACION_FLETES_TAURO_2026`. Se llena a mano en Word; no lleva macro. |
| `PLANTILLA_COTIZACION_FLETES_TAURO.docm` | **La herramienta.** Plantilla con el macro que calcula y arma la tabla. |
| `PLANTILLA_COTIZACION_FLETES_TAURO.docx` | La misma plantilla sin macro, por si se prefiere trabajar a mano. |
| `EJEMPLO_1_COTIZACION_FLETES_TAURO.docx` | Recolección + Flete + Entrega — **$ 7,850.00** |
| `EJEMPLO_2_COTIZACION_FLETES_TAURO.docx` | Recolección + Maniobras carga + Flete + Maniobras descarga + Seguro — **$ 9,650.00** |
| `EJEMPLO_3_COTIZACION_FLETES_TAURO.docx` | Recolección + Flete + Entrega + Cita — **$ 8,300.00** |

Los tres ejemplos usan la misma mercancía del formato original (2 tarimas,
1.20 × 1.00 × 1.50 m, 2,000 kg); lo único que cambia es qué conceptos se
marcaron.

Los ejemplos son cotizaciones ya generadas: sólo traen la sección que ve el
cliente, sin panel, sin tabuladores y sin controles de contenido.

## Cómo está armada la plantilla

La plantilla tiene tres secciones de Word:

1. **Panel de cotización** (pág. 1) — uso interno. Casillas de los siete
   conceptos, listas desplegables de modalidad y tabulador, columna de importe,
   y el valor declarado que sirve para calcular el seguro.
2. **Cotización** (pág. 2) — una sola hoja, lo que ve el cliente.
3. **Tabuladores y tarifas** (págs. 3-5) — uso interno. Aquí se editan precios.

Al exportar, las secciones 1 y 3 se eliminan automáticamente.

## Uso diario

1. Captura las cifras de la mercancía —tarimas, medidas y peso— **en el párrafo
   de la cotización** (los campos sombreados son controles de contenido de
   Word). El valor declarado va en el panel, porque sólo sirve para el seguro.
2. En el panel marca ☒ los conceptos que apliquen y elige modalidad y tabulador.
3. `Ctrl + Shift + G` → calcula importes y arma la tabla de conceptos.
4. `Ctrl + Shift + P` → genera el `.docx` limpio y el `.pdf` listos para enviar.

Macros disponibles (Vista ▸ Macros):

| Macro | Qué hace |
|---|---|
| `GenerarCotizacion` | Calcula y reconstruye la tabla de conceptos y el total. |
| `ExportarCotizacionPDF` | Documento limpio + PDF en la carpeta del archivo. |
| `GenerarCotizacionLimpia` | Sólo el documento Word limpio, abierto en pantalla. |
| `ActualizarListas` | Recarga las listas desplegables desde los tabuladores. |
| `NuevaCotizacion` | Limpia datos y desmarca conceptos. |

## Reglas de cálculo

| Concepto | Modalidad | De dónde sale el importe |
|---|---|---|
| Recolección | Dentro de zona | Tabulador de recolección, por rango de peso |
| Recolección | Fuera de zona | Tabla de zonas, columna *Tarifa recolección* |
| Entrega | Dentro de zona | Tabulador de entrega, por rango de peso |
| Entrega | Fuera de zona | Tabla de zonas, columna *Tarifa entrega* |
| Flete | Ruta MTY→CDMX / CDMX→MTY | Tabla de fletes, cruce ruta × servicio |
| Maniobras carga/descarga | Según tabulador | Tabla de maniobras |
| Seguro | Sobre valor declarado | valor declarado ÷ 1,000 × tarifa por millar |
| Cita para entrega | Según tabulador | Tabla de citas |
| Cualquiera | Importe manual | Lo que se capture en la columna *Importe* |

Con «Automático por peso» el macro toma el primer renglón del tabulador cuyo
peso máximo sea igual o mayor al peso capturado en la cotización.

## Cambiar tarifas

Se edita la columna **Tarifa** de las tablas de la sección *Tabuladores y
tarifas*. Se pueden agregar o quitar renglones. Lo único que no debe cambiarse
es el orden de las columnas ni el texto alternativo de la tabla: el macro
localiza cada tabla por ese texto (clic derecho ▸ Propiedades de tabla ▸ Texto
alternativo), nunca por su posición.

Títulos internos: `tblConceptos`, `panelConceptos`, `panelOpciones`,
`tabRecoleccion`, `tabEntrega`, `tabZonas`, `tabFletes`, `tabManiobras`,
`tabSeguro`, `tabCita`.

## Agregar un concepto nuevo

Copia una fila del panel, cámbiale el nombre, elige **Importe manual** en
Modalidad y captura el costo. Si el concepto nuevo debe tener su propio
tabulador, se agrega la tabla (con su texto alternativo) y un `Case` en
`ImporteConcepto` dentro del módulo `Cotizador`.

## Regenerar los archivos

```bash
cd plantillas/cotizador
python3 build.py salida
```

| Archivo fuente | Contenido |
|---|---|
| `build.py` | Arma la plantilla con panel y macro. |
| `forma.py` | Arma el formato rellenable de una hoja (rojo/negro). |
| `ooxml.py` | Utilerías para escribir WordprocessingML. |
| `tarifas.py` | Tabuladores iniciales y espejo en Python de la lógica de cálculo. |
| `textos.py` | Textos comerciales del formato original, literales. |
| `vbaproject.py` | Empaqueta el proyecto VBA (`vbaProject.bin`) dentro del `.docm`. |
| `vba/Cotizador.bas` | Módulo principal del macro. |
| `vba/ThisDocument.cls` | Eventos del documento (atajos y listas dependientes). |
| `assets/` | Logotipos recortados de la papelería original. |
| `assets2/` | Logotipos y marca de agua del formato rojo/negro. |

## Si Word bloquea las macros

Es la protección de Windows para archivos que llegan por correo o descarga:
cierra el archivo, clic derecho ▸ Propiedades ▸ marca **Desbloquear** ▸ Aceptar,
y vuelve a abrirlo.

Si el proyecto VBA no cargara, el `.docm` sigue funcionando como documento
normal y el código puede importarse a mano: `Alt + F11` ▸ Archivo ▸ Importar
archivo, y se seleccionan `vba/Cotizador.bas` y `vba/ThisDocument.cls`.


## Formato rellenable de una hoja (`forma.py`)

Reconstrucción en Word del PDF `COTIZACION_FLETES_TAURO_2026`, con los cambios
solicitados:

* sin folio (ni en el encabezado ni en DATOS DE LA COTIZACIÓN)
* la tabla de servicios queda en **No. · Descripción del servicio · Importe**
  (fuera TIPO DE UNIDAD, CANT. y TARIFA UNITARIA)
* de los totales queda sólo **TOTAL** (fuera SUBTOTAL, I.V.A. 16% y RET. I.V.A. 4%)
* la página es **www.fletestauro.com.mx**

Los campos son controles de contenido de Word con texto de marcador de posición
real: se ven en gris cursiva y al escribir encima toman el formato definitivo.

```bash
python3 forma.py salida
```
