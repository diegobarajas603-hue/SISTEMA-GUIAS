# Formato de cotización

`FORMATO_COTIZACION.docx` es el formato de cotización de Fletes Tauro con la paleta
de `CARATULA_DE_EMBARQUES`. Solo cambiaron los colores: el texto, las tablas, las
medidas de página y el logotipo quedaron exactamente como estaban.

## Paleta

Los seis colores salen tal cual de la carátula de embarques.

| Color | Uso |
|---|---|
| `#0F3A5D` azul marino | título, etiquetas, encabezado de la tabla y renglón de Total |
| `#5B7C99` azul acero | viñetas y letra chica del pie |
| `#8792A0` gris | texto de ejemplo de los campos por llenar |
| `#26323C` pizarra | cuerpo de texto y datos capturados |
| `#E9EEF3` azul niebla | bandas de sección |
| `#FFFFFF` blanco | texto sobre azul marino |

Apoyos derivados de la misma familia: `#F5F8FA` (renglones alternados),
`#DCE3EA` y `#C7D3DE` (líneas divisorias), `#2A5A82` (divisor dentro de la banda azul).

## Jerarquía

Se sigue la de la carátula, que evita el bloque oscuro continuo:

- **Bandas de sección** (Datos del cliente, Datos de la cotización, Consideraciones
  importantes) van en azul niebla con texto azul marino.
- **Azul marino sólido** se reserva para dos elementos que pertenecen a la misma
  tabla y la enmarcan: el encabezado de servicios y el renglón de Total.

Antes había negro `#111111` y rojo `#C21112` compitiendo entre sí; ahora hay una
sola tinta oscura y el rojo solo aparece en el logotipo, que conserva su color de marca.

## El Total se suma solo

El renglón de Total lleva un campo de Word `{ =SUM(C2:C6) \# "$ #,##0.00" }`
que suma la columna Importe de los cinco servicios.

**Word no recalcula al momento.** Después de capturar los importes hay que
actualizar el campo:

- Selecciona todo el documento (`Ctrl+E`, o `Ctrl+A` según el idioma de Word) y presiona `F9`, o
- clic derecho sobre el Total → *Actualizar campos*.

El documento queda con `updateFields`, así que también se actualiza solo al
abrirlo. Aun así conviene dar `F9` antes de imprimir o mandar el PDF.

### Por qué el Total se movió de lugar

Estaba en una tabla aparte, junto a "Importe con letra". Word solo resuelve
fórmulas dentro de una misma tabla, así que desde ahí ninguna fórmula alcanzaba
la columna de importes: se probó y daba 0. Ahora el Total es el último renglón
de la tabla de servicios, que además es donde lo pone la carátula
(`VALOR TOTAL DE LAS MERCANCIAS` va bajo su tabla).

### Por qué los importes ya no son control de contenido

Las cinco celdas de Importe eran controles de contenido (`srv_imp_1`…`srv_imp_5`).
Word no lee el texto de un control de contenido al evaluar una fórmula: con
control el Total daba 0, sin control y con el mismo texto dio 24,450.50. Se
quitaron solo esas cinco; los otros 17 campos del formulario siguen siendo
controles. Las celdas se ven igual — se escribe encima del texto de ejemplo.

Se puede capturar con formato: `$ 12,500.00` se suma correctamente.

## Regenerar

Si el formato base cambia, los dos scripts lo reconstruyen:

```bash
mkdir base && cd base && unzip -q ../FORMATO_COTIZACION_ORIGINAL.docx
python3 ../recolorear_cotizacion.py .    # paleta
python3 ../agregar_suma.py .             # Total automático
zip -Xq -D ../FORMATO_COTIZACION.docx '[Content_Types].xml'
zip -Xrq -D ../FORMATO_COTIZACION.docx . -x '[Content_Types].xml'
```
