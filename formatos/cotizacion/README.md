# Formato de cotizaciones — Fletes Tauro

Formato corporativo de cotizacion en Word, en dos hojas tamano carta.

- **`COTIZACION_FLETES_TAURO_2026.docx`** — el formato listo para usar.
- `cotizacion.js` — el script que lo genera.
- `assets/` — el logotipo en PNG, exportado desde `public/logo-tauro.svg`.

## Como se usa

Abre el `.docx` en Word y sustituye lo que va entre corchetes:

| Campo | Donde esta |
| --- | --- |
| `[ Razon social del cliente ]` | bloque de datos, columna izquierda |
| `[ Nombre y puesto del contacto ]` | bloque de datos, columna izquierda |
| `[ correo@empresa.com · (00) 0000-0000 ]` | bloque de datos, columna izquierda |
| Folio, fecha y vigencia | franja superior del bloque de datos |
| Piezas, dimensiones, peso y volumen | banda gris "01 Propuesta de servicio" |
| Los tres `$ 0.00` de la tabla | "02 Propuesta economica" |
| Subtotal, IVA y total | ultimas tres filas de la misma tabla |

Guarda una copia por cliente para conservar el formato original limpio. Si el
numero de paginas cambia, actualiza los campos del pie con `Ctrl + E` y `F9`.

## Como esta armado

- Hoja carta, margenes de 1.1", ancho util de 9072 twips.
- Dos tipografias de Office, presentes en Windows y en Mac: **Cambria** para
  titulos e importes y **Calibri** para el texto y los rotulos.
- Paleta de tres tintas: negro `#0E0F11`, rojo de marca `#C21112` (el mismo del
  logotipo) y una escala de grises calidos para filetes y bandas. El rojo solo
  acentua; nunca rellena.
- El logotipo, las direcciones de matriz y Ciudad de Mexico y el sitio web van
  en el encabezado y el pie, asi que se repiten solos en cada hoja.
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

Para revisar el resultado en imagenes, con LibreOffice y Poppler instalados:

```bash
soffice --headless --convert-to pdf COTIZACION_FLETES_TAURO_2026.docx
pdftoppm -jpeg -r 110 COTIZACION_FLETES_TAURO_2026.pdf pagina
```

### Volver a exportar el logotipo

Los PNG de `assets/` salen de `public/logo-tauro.svg`. Se regeneran abriendo el
SVG a 2400 px de ancho sobre fondo transparente y guardando dos tamanos:
`logo.png` de 1000 px (membrete de la hoja 1) y `logo-sm.png` de 560 px
(encabezado de la hoja 2). No se usa el SVG directo porque Word no lo incrusta
de forma confiable.
