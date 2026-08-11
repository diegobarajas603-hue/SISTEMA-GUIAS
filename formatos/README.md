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

## Regenerar

Si el formato base cambia, `recolorear_cotizacion.py` vuelve a aplicar la paleta
sin tocar nada más:

```bash
mkdir base && cd base && unzip -q ../FORMATO_COTIZACION_ORIGINAL.docx
python3 ../recolorear_cotizacion.py .
zip -Xq -D ../FORMATO_COTIZACION.docx '[Content_Types].xml'
zip -Xrq -D ../FORMATO_COTIZACION.docx . -x '[Content_Types].xml'
```
