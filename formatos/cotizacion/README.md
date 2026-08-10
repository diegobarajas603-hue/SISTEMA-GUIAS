# Formato de cotizaciones — Fletes Tauro

Formato de cotizacion en Word: una sola hoja tamano carta.

- **`COTIZACION_FLETES_TAURO_2026.docx`** — el formato listo para usar.
- `cotizacion.js` — el script que lo genera.
- `previsualizar.sh` — genera el .docx y una imagen por hoja para revisarlo.
- `assets/` — el logotipo en PNG, exportado desde `public/logo-tauro.svg`.

## Que contiene

El mismo contenido del documento original, sin agregarle nada: los cuatro
parrafos de la carta, la tabla de CONCEPTO / COSTO con Recoleccion, Flete y
Servicio de entrega, y las seis consideraciones importantes. Del membrete se
conservan el logotipo, las direcciones de matriz y Mexico y el sitio web.

La unica palabra que no viene del documento original es el titulo
**COTIZACION** del membrete, que se puso para que la hoja diga que es al
abrirla. Si no lo quieres, se borra y no afecta nada mas.

Tambien se eligio, de las dos versiones que traia el archivo original, la mas
completa de cada frase: "$8.00 por cada millar" (y no "por el millar") y
"la siguiente propuesta economica:" (y no "la siguiente propuesta :").

## Como se usa

Abre el `.docx` en Word y escribe los importes en la columna COSTO, junto a
cada `$`. Guarda una copia por cliente para conservar el formato original
limpio.

La hoja tiene lugar de sobra: caben unos ocho renglones mas antes de irse a una
segunda pagina.

## Como esta armado

- Hoja carta, margenes de 1", ancho util de 9360 twips.
- Dos tipografias de Office, presentes en Windows y en Mac: **Cambria** para el
  titulo, el saludo y los importes, y **Calibri** para el texto y los rotulos.
- Paleta sin tintas saturadas: grafito `#23272B` en lugar de negro puro, vino
  `#8A3B33` en lugar del rojo de marca, y grises calidos para los filetes. El
  unico rojo saturado de la hoja es el del propio logotipo, que asi queda como
  el acento de la pagina. El encabezado de la tabla va en grafito `#2B2F34`.
- Contraste sobre blanco: texto 8.2:1, rotulos 5.1:1, vino 7.6:1. Texto blanco
  sobre grafito 13.5:1.
- La vineta de las consideraciones paso a un numeral con sangria francesa:
  hace el mismo papel de marcador y alinea mejor el bloque.
- El logotipo, las direcciones de las dos plazas y el sitio web viven en el
  encabezado y el pie, asi que si la cotizacion llegara a crecer a dos hojas la
  segunda sale membretada sola.
- La tabla lleva `keepNext` en todas sus filas menos la ultima: si crece, se
  pasa completa a la hoja siguiente en vez de partirse.

## Como regenerarlo

Solo hace falta si se cambia el diseno o el texto del formato; para cotizar dia
a dia basta con editar el `.docx`.

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
