# Aura CRM — Sistema de diseño

> La referencia mental: **Linear** para la densidad y el teclado, **Stripe** para
> los datos, **Vercel** para la sobriedad, **Arc/Raycast** para el movimiento,
> **Apple HIG** para el criterio. Nada de eso se copia; se destila en un sistema
> propio.

Implementación: [`web/src/estilos/tokens.css`](../web/src/estilos/tokens.css) y
[`web/src/componentes/ui/`](../web/src/componentes/ui/).

---

## 1. Las siete reglas

1. **El dato es el héroe.** El cromo (bordes, fondos, sombras) nunca compite con
   la cifra. Si un elemento no ayuda a leer un dato o a actuar sobre él, se va.
2. **Una sola elevación por vista.** Todo flotando es todo plano. Solo lo
   accionable o lo temporal (menú, panel, tooltip) se eleva.
3. **El color significa algo.** Azul = acción o selección. Verde/ámbar/rojo =
   estado, nunca decoración. Violeta = IA, y solo IA. Todo lo demás es gris.
4. **El movimiento explica, no adorna.** Cada animación comunica origen, destino o
   jerarquía. Nada se mueve "porque se ve bien".
5. **Vacío antes que relleno.** El espacio en blanco es la señal más económica de
   producto caro.
6. **El teclado es un ciudadano de primera.** ⌘K abre todo. Toda acción frecuente
   tiene atajo. Todo estado de foco es visible y bonito.
7. **Coherencia sobre creatividad local.** Un patrón resuelto se reutiliza; no se
   reinventa por pantalla.

---

## 2. Color

Definido en **OKLCH** para que las rampas sean perceptualmente uniformes: un paso
de luminosidad se ve igual de grande en azul que en gris, lo que no ocurre en HSL.

### 2.1 Neutros

Grises **ligeramente fríos** (matiz 265) para que el azul de marca se sienta parte
de la misma familia y no un injerto.

```
Claro   canvas  oklch(0.985 0.002 265)   casi blanco, no blanco puro
        superficie          #FFFFFF
        borde   oklch(0.92  0.004 265)
        texto   oklch(0.22  0.012 265) → 0.45 secundario → 0.60 tenue

Oscuro  canvas  oklch(0.175 0.011 265)   azul-carbón, nunca #000
        superficie oklch(0.215 0.013 265)
        borde   oklch(0.30  0.014 265)
        texto   oklch(0.96  0.003 265) → 0.72 secundario → 0.58 tenue
```

**El modo oscuro no es una inversión.** Es una paleta propia: fondos en azul-carbón
(nunca negro puro, que produce halos en pantallas OLED y fatiga), bordes con más
contraste relativo, sombras sustituidas por luz de borde (`inset 0 1px 0`), y
saturación de acentos reducida un 8 % porque el color sobre fondo oscuro se
percibe más intenso.

### 2.2 Acentos

| Rol | Token | Valor | Uso |
| --- | --- | --- | --- |
| Azul eléctrico | `--color-marca-500` | `oklch(0.62 0.204 258)` | acción primaria, selección, series de datos |
| Azul profundo | `--color-marca-700` | `oklch(0.45 0.17 262)` | gradientes, encabezados, hover de primario |
| Verde | `--color-exito-500` | `oklch(0.66 0.16 156)` | ganado, pagado, dentro de SLA |
| Ámbar | `--color-alerta-500` | `oklch(0.78 0.15 76)` | por vencer, estancado, atención |
| Rojo | `--color-peligro-500` | `oklch(0.60 0.19 22)` | perdido, vencido, destructivo |
| Violeta | `--color-ia-500` | `oklch(0.62 0.19 295)` | **exclusivo de IA** |

Cada acento tiene además `-50` (fondo tenue), `-200` (borde) y `-600` (texto sobre
fondo tenue) para construir badges legibles en ambos temas.

**Ningún acento se usa como fondo de superficie grande.** Máximo: un badge, una
barra, una línea de gráfica, un botón.

### 2.3 El violeta de IA

Que la IA tenga color propio resuelve un problema real: el usuario debe distinguir
de un vistazo *"esto lo escribió el sistema"* de *"esto lo decidió un modelo"*.
Todo lo generado por IA lleva el gradiente azul→violeta y el ícono de destello.
Es honestidad de interfaz, no decoración.

### 2.4 Series de datos

Seis series ordenadas por distancia perceptual, no por rueda de color:
`marca-500 · teal-500 · violeta-500 · ámbar-500 · rosa-500 · lima-600`. Verificadas
para ser distinguibles en deuteranopía y en escala de grises (la luminosidad varía
entre series, no solo el matiz). Las series de estado (ganado/perdido) sí usan
verde/rojo porque ahí el significado manda.

---

## 3. Tipografía

**Inter Variable**, autoalojada (`@fontsource-variable/inter`) — sin petición a
terceros, sin salto de fuente, y funciona sin internet.

| Token | Tamaño / interlineado | Tracking | Uso |
| --- | --- | --- | --- |
| `--texto-2xs` | 10 / 14 | +0.06em | etiquetas en versalitas |
| `--texto-xs` | 11.5 / 16 | +0.01em | metadatos, ejes |
| `--texto-sm` | 13 / 19 | 0 | cuerpo de tabla, interfaz |
| `--texto-base` | 14.5 / 22 | −0.006em | cuerpo |
| `--texto-lg` | 17 / 24 | −0.012em | títulos de panel |
| `--texto-xl` | 21 / 28 | −0.018em | títulos de sección |
| `--texto-2xl` | 28 / 34 | −0.022em | cifras de KPI |
| `--texto-3xl` | 38 / 42 | −0.028em | cifra heroica |

El **tracking negativo que crece con el tamaño** es lo que separa la tipografía
premium de la genérica: Inter a 38 px con tracking 0 se ve suelto y amateur.

Cifras: `font-variant-numeric: tabular-nums` en **toda** cifra de tabla o KPI, para
que los dígitos no bailen al actualizarse. Fracciones y monedas con
`feature-settings: "ss03"`.

---

## 4. Espacio, radio, elevación

**Espacio**: escala de 4 px (`4 8 12 16 20 24 32 40 48 64`). Densidad de referencia:
fila de tabla 44 px, campo 36 px, botón 34 px. Cómodo con ratón, no derrochador.

**Radios**: `6` interno · `10` control · `14` tarjeta · `18` panel · `24` modal ·
`999` píldora. Regla: el radio del hijo = radio del padre − su padding, para que las
esquinas queden concéntricas. Es un detalle que casi nadie hace y que se percibe
aunque no se sepa nombrar.

**Elevación** — cinco niveles, sombras **multicapa** de opacidad baja:

```
nivel 1  0 1px 2px  −.04   ·  borde 1px            tarjeta en reposo
nivel 2  0 2px 4px  −.05  + 0 6px 16px −.05        tarjeta en hover
nivel 3  0 4px 8px  −.06  + 0 12px 28px −.07       menú, popover
nivel 4  0 8px 16px −.07  + 0 24px 48px −.09       panel lateral
nivel 5  0 16px 32px −.09 + 0 40px 80px −.12       modal
```

Una sola sombra grande y difusa se ve barata; dos capas (una de contacto, corta y
opaca; otra ambiental, amplia y tenue) imitan la luz real. En oscuro las sombras se
sustituyen por `inset 0 1px 0 rgba(255,255,255,.055)` — luz de borde superior.

**Glassmorphism, con criterio.** `backdrop-filter: blur(20px) saturate(180%)` +
fondo al 72 % **solo** en: topbar fija, paleta ⌘K, panel del copiloto y menús. Nunca
detrás de texto largo ni en tarjetas de contenido. Cuando el navegador no lo
soporta, `@supports` deja un fondo opaco.

**Neomorfismo**: exactamente dos usos, donde aporta la metáfora de "hundido":
el conmutador segmentado de vistas y el riel de las barras de progreso. Nada más.

---

## 5. Movimiento

| Token | ms | Curva | Uso |
| --- | --- | --- | --- |
| `--mov-instante` | 90 | `ease-out` | hover, foco |
| `--mov-rapido` | 160 | `cubic-bezier(.32,.72,0,1)` | botón, badge, tab |
| `--mov-medio` | 240 | `cubic-bezier(.32,.72,0,1)` | tarjeta, popover, tooltip |
| `--mov-panel` | 380 | `cubic-bezier(.16,1,.3,1)` | panel lateral, modal |
| `--mov-dato` | 700 | `cubic-bezier(.22,1,.36,1)` | dibujado de gráficas, contadores |

`cubic-bezier(.32,.72,0,1)` es la curva de la casa: arranca decidida y frena largo.
Es lo que hace que la interfaz se sienta *rápida* aunque la duración sea de 160 ms —
el 70 % del recorrido ocurre en el primer 30 % del tiempo.

**Reglas duras**
- Solo se animan `transform`, `opacity`, `filter` y `clip-path`. Jamás `width`,
  `height`, `top` o `left` (provocan *layout*, es decir, tirones).
- Escalonado de listas: 18 ms por elemento, máximo 12 elementos. Más allá, es lento.
- Los contadores animan con `requestAnimationFrame` y `easeOutExpo`, redondeando al
  final para no mostrar cifras falsas a medio camino.
- Las gráficas dibujan su trazo una vez al montar, no en cada re-render.
- `@media (prefers-reduced-motion: reduce)` → todo a 1 ms y sin desplazamientos;
  los estados finales son idénticos. La interfaz sigue siendo completa.

**Retroalimentación al clic**: `scale(.975)` durante 90 ms + un halo que se expande
desde el punto exacto del puntero. Se siente físico sin ser un juguete.

---

## 6. Componentes

**Primitivos** (`componentes/ui/`, ~24): `Boton`, `BotonIcono`, `Panel`, `Tarjeta`,
`Insignia`, `Chip`, `Campo`, `Selector`, `AreaTexto`, `Interruptor`, `Segmentado`,
`Tabla`, `Menu`, `Modal`, `PanelLateral`, `Tooltip`, `Avatar`, `Pestanas`,
`Progreso`, `Esqueleto`, `Vacio`, `Cargando`, `Anillo`, `Notificacion`.

**Kit de gráficas** (`componentes/graficas/`, SVG propio, ~14 kB):
`GraficaArea`, `GraficaBarras`, `GraficaLinea`, `Chispa`, `Dona`, `Embudo`,
`MapaCalor`, `Medidor`, `BarrasApiladas`.

Se descartó Recharts a propósito: su estética es reconocible y el encargo pide que
nada se vea genérico. Además el kit propio permite gradientes de relleno con
`stop-opacity` decreciente, líneas de 1.75 px con `vector-effect`, guía vertical
sincronizada con el cursor y ejes con `tabular-nums`, sin luchar contra la API de
una librería.

**Reglas de gráfica**: máximo 6 series; eje Y siempre desde cero en barras; rejilla
horizontal al 6 % de opacidad y nunca vertical; etiqueta directa sobre la serie
cuando hay ≤ 3 (mejor que una leyenda, que obliga a ir y venir); tooltip con guía
vertical y valores alineados a la derecha.

---

## 7. Estados

Todo componente de datos define **cinco** estados, no dos:

1. **Cargando** — esqueleto con la geometría real del contenido (misma altura de
   fila, mismo ancho de columna) y un barrido de brillo de 1.4 s. Cero salto de
   diseño al llegar los datos.
2. **Vacío inicial** — ilustración mínima + una frase que explica qué aparecerá +
   la acción para crear el primer registro. Nunca "No hay datos".
3. **Vacío por filtro** — mensaje distinto, con botón para limpiar filtros.
4. **Error** — qué falló, en lenguaje humano, y un botón de reintento.
5. **Con datos.**

---

## 8. Accesibilidad

- Contraste AA verificado en ambos temas: texto normal ≥ 4.5:1, grande ≥ 3:1.
- Foco visible en todo elemento interactivo: anillo de 2 px con 2 px de separación,
  en azul de marca; `:focus-visible` para no molestar al ratón.
- El color nunca es el único portador de significado: los badges de estado llevan
  ícono además de color.
- Modales y paneles: foco atrapado, `Esc` cierra, foco devuelto al disparador.
- Etiquetas reales en todo campo; errores ligados con `aria-describedby`.
- Regiones `aria-live="polite"` para notificaciones y respuestas del copiloto.
- Toda la aplicación es operable sin ratón.
- Objetivos táctiles ≥ 40 px en móvil.

---

## 9. Adaptación a pantalla

| Ancho | Comportamiento |
| --- | --- |
| < 768 | Sidebar como cajón; tablas → tarjetas apiladas; kanban con desplazamiento horizontal y guías; copiloto a pantalla completa. |
| 768–1279 | Sidebar colapsada a íconos; rejillas de 12 → 6 columnas. |
| 1280–1727 | Disposición de referencia. |
| ≥ 1728 | Contenido tope 1680 px centrado, con la ficha 360 a tres columnas. |

Un CRM se usa 8 horas al día en un monitor grande: la disposición de referencia se
diseña para 1440–1680 px y el resto son adaptaciones, no al revés.
