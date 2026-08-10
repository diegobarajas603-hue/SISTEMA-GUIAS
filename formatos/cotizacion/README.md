# Formato de cotizaciones — Fletes Tauro

Formato corporativo de cotizacion en Word: una sola hoja tamano carta.

- **`COTIZACION_FLETES_TAURO_2026.docx`** — el formato listo para usar.
- `cotizacion.js` — el script que lo genera.
- `previsualizar.sh` — genera el .docx y una imagen por hoja para revisarlo.
- `assets/` — el logotipo en PNG, exportado desde `public/logo-tauro.svg`.

## Como se usa

Abre el `.docx` en Word y sustituye lo que va entre corchetes:

| Campo | Donde esta |
| --- | --- |
| `[ Razon social ]` | bloque de datos, segundo renglon |
| `[ Nombre y puesto ]` | bloque de datos, segundo renglon |
| `[ correo · telefono ]` | bloque de datos, segundo renglon |
| Folio, fecha y vigencia | primer renglon del bloque de datos |
| Piezas, dimensiones, peso y volumen | banda clara de "01 Mercancia a transportar" |
| Los tres `$ 0.00` de la tabla | "02 Propuesta economica" |
| Subtotal, IVA y total | ultimas tres filas de la misma tabla |

Guarda una copia por cliente para conservar el formato original limpio.

**Ojo con el alto.** La hoja esta calculada para llenarse completa y le sobran
unos dos renglones. Si el nombre del cliente ocupa dos lineas todavia cabe,
pero si agregas conceptos a la tabla o alargas las consideraciones, se va a una
segunda hoja. Cuando eso pase, lo mas facil es acortar los textos de apoyo en
gris que van debajo de cada concepto.

## Como esta armado

- Hoja carta, margenes de 0.95", ancho util de 9504 twips.
- Dos tipografias de Office, presentes en Windows y en Mac: **Cambria** para
  titulos e importes y **Calibri** para el texto y los rotulos.
- Paleta sin tintas saturadas: grafito `#23272B` en lugar de negro puro, vino
  `#8A3B33` en lugar del rojo de marca, y grises calidos para filetes y bandas.
  El unico rojo saturado de la hoja es el del propio logotipo, que asi queda
  como el acento de la pagina. La banda del total va en vino oscuro `#6E2E28` y
  el encabezado de la tabla en grafito `#2B2F34`.
- Contraste sobre blanco: texto 8.2:1, rotulos 5.1:1, vino 7.6:1. Texto blanco
  sobre grafito 13.5:1 y sobre vino oscuro 10.1:1.
- Las consideraciones van a dos columnas: a 7.5 pt una linea de 6.6" seria
  imposible de leer, y a 3.2" cae en el ancho comodo. El corte esta en la
  consideracion 4 (`CORTE` en el script) porque asi las dos columnas terminan
  casi a la misma altura; si se edita el texto, hay que revisar ese corte.
- El logotipo, las direcciones de las dos plazas y el sitio web viven en el
  encabezado y el pie, asi que si la cotizacion llegara a crecer a dos hojas la
  segunda sale membretada sola.
- La tabla de la propuesta economica lleva `keepNext` en todas sus filas menos
  la ultima: si crece, se pasa completa a la hoja siguiente en vez de partirse.

## Como regenerarlo

Solo hace falta si se cambia el diseno o el texto fijo del formato; para
cotizar dia a dia basta con editar el `.docx`.

```bash
cd formatos/cotizacion
npm install docx          # unica dependencia, no forma parte del servidor
node cotizacion.js
```

El script reescribe `COTIZACION_FLETES_TAURO_2026.docx` en esta misma carpeta.

Con LibreOffice y Poppler instalados, `./previsualizar.sh` hace lo mismo y
ademas deja un `pagina-1.jpg` para revisar como quedo.

### Volver a exportar el logotipo

Los PNG de `assets/` salen de `public/logo-tauro.svg`. Se regeneran abriendo el
SVG a 2400 px de ancho sobre fondo transparente y guardando dos tamanos:
`logo.png` de 1000 px (membrete) y `logo-sm.png` de 560 px (encabezado de una
eventual segunda hoja). No se usa el SVG directo porque Word no lo incrusta de
forma confiable.
