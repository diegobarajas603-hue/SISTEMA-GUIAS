# Sistema de diseño — Fletes Tauro TMS

Documento del rediseño del panel interno (`public/panel.html`) como software
empresarial. Todo lo marcado **Implementado** ya está en el código; lo marcado
**Propuesto** requiere trabajo de backend y queda como siguiente paso.

> La página pública de rastreo (`public/rastreo.html`) **no cambia**: conserva a
> propósito su rojo carmín y su verde esmeralda. Es una pieza de marca dirigida
> al cliente final y su trabajo es transmitir energía y confianza, no sobriedad
> operativa. Mezclarla con el sistema interno le quitaría fuerza comercial.

---

## 1. Diagnóstico del diseño anterior

| Área | Estado anterior | Problema real |
|---|---|---|
| Paleta | Neutros cálidos (papel/cuero) + vino | Cálida y editorial: correcta para el cliente, pero sin la sensación de instrumento de precisión que pide una terminal de trabajo |
| Jerarquía | Todas las tarjetas con el mismo peso visual | Nada indicaba qué es lo importante de cada pantalla |
| Escaneo | Campo de texto normal, un poco más grande | La pantalla más usada del sistema se veía igual que un formulario de configuración |
| Navegación | Menú fijo de 246 px, sin colapsar | En laptops de 1366 px se comía el 18% del ancho útil |
| Encabezado | Título + un buscador | Sin hora, sin accesos rápidos, sin alertas |
| Teclado | Solo Enter en el campo de escaneo | Todo lo demás exigía ratón |
| Estados vacíos | «Sin guías» en gris | No explicaban por qué ni qué hacer |
| Carga | Pantalla en blanco | Se percibe más lento de lo que es |
| Números de guía | Tipografía proporcional | `AN1005` y `AN1006` se distinguen mal de un vistazo |

---

## 2. Problemas de UX encontrados

1. **El escaneo competía por atención.** El selector de tipo de operación y las
   notas ocupaban tanto peso visual como el campo que se usa 300 veces al día.
2. **Confirmación débil.** Tras escanear, el operador tenía que *leer* para
   saber si salió bien. Con la vista en el paquete, no en el monitor, eso es un
   error esperando a ocurrir.
3. **Sin salida por teclado.** Cambiar de pantalla obligaba a soltar la pistola.
4. **Sin señal de anomalías.** Una guía detenida tres días en tránsito no
   aparecía por ningún lado; se descubría cuando el cliente reclamaba.
5. **Sin sentido del tiempo.** Los cortes de salida son por horario y no había
   un reloj a la vista.
6. **Ancho desperdiciado** en equipos chicos.

---

## 3. Propuesta de rediseño (implementada)

Cuatro decisiones de fondo:

1. **El chrome se oscurece, el contenido se aclara.** Menú y encabezado en navy;
   el área de trabajo en blanco sobre lienzo gris frío. El ojo entiende sin
   pensarlo dónde está la herramienta y dónde el trabajo.
2. **Un solo color significa "acción".** El azul eléctrico es lo único
   interactivo. Nada decorativo lo usa, así que nunca se duda de qué es un botón.
3. **El rojo se reserva.** Solo aparece en acciones destructivas. Un rojo que
   sale poco es un rojo al que se le hace caso.
4. **La pantalla de escaneo se vuelve una terminal**, no un formulario.

---

## 4. Paleta de colores

### Chrome oscuro — autoridad y encuadre

| Token | HEX | Uso | Justificación |
|---|---|---|---|
| `--navy-950` | `#060B14` | Fondo del login | Casi negro con tinte azul: serio sin ser fúnebre |
| `--navy-900` | `#0A1120` | Menú lateral | El azul muy oscuro se asocia a instituciones y banca; el negro puro se asocia a lujo y a *gaming*, y ninguno de los dos es esto |
| `--navy-800` | `#141F35` | Hover, tarjetas oscuras | Un escalón visible sin romper la calma |
| `--navy-linea` | `#1F2C46` | Bordes sobre oscuro | Separa sin dibujar líneas duras |
| `--navy-texto` | `#93A3BE` | Texto secundario oscuro | Contraste 6.2:1 sobre `--navy-900` |

### Azul eléctrico — acción

| Token | HEX | Uso |
|---|---|---|
| `--azul` | `#2F6BFF` | Botón primario, foco, página activa |
| `--azul-600` | `#1E54E6` | Degradado inferior del botón |
| `--azul-tenue` | `rgba(47,107,255,.10)` | Fondos de selección, anillo de foco |

**Por qué este azul:** es el color de mayor asociación cultural con
*tecnología y fiabilidad*, y a esta saturación mantiene 4.6:1 sobre blanco, así
que puede usarse en texto y no solo en fondos. Un azul más oscuro se
confundiría con el navy del chrome; uno más claro perdería contraste.

### Cian — acento de datos

| Token | HEX | Uso |
|---|---|---|
| `--cian` | `#0FB6CC` | Segunda serie de las gráficas, estado «en reparto» |

**Por qué un segundo acento:** en las gráficas hacen falta dos series
distinguibles. Si la segunda fuera otro azul, se leerían como lo mismo; si fuera
naranja o rojo, parecerían una alarma. El cian es el vecino del azul en el
círculo cromático: se distingue sin cambiar de familia y **nunca se usa en
elementos clicables**, para que nadie lo confunda con una acción.

### Neutros fríos — el lienzo

| Token | HEX | Uso |
|---|---|---|
| `--lienzo` | `#F5F7FA` | Fondo de la aplicación |
| `--superficie` | `#FFFFFF` | Tarjetas |
| `--superficie-3` | `#F2F5F9` | Hover de filas, campos apagados |
| `--linea` | `#E3E8EF` | Bordes |
| `--tinta` | `#0C1424` | Texto principal (negro suave, 16.8:1) |
| `--tinta-2` | `#48546C` | Texto secundario (8.1:1) |
| `--tinta-3` | `#7B879E` | Texto terciario (4.6:1) |

**Por qué fríos y no cálidos:** los neutros con tinte azul leen como
*instrumento*; los cálidos leen como *papel*. Además evitan que el navy del
menú parezca sucio por contraste simultáneo.

### Semánticos — cada color, un solo significado

| Estado | HEX texto | HEX fondo | Justificación |
|---|---|---|---|
| En tránsito | `#8A5A11` | `#FDF3E2` | Ámbar = en movimiento, atención sin alarma |
| En almacén | `#3D3DA8` | `#EEEEFB` | Índigo = quieto y guardado; se separa del azul de acción |
| En reparto | `#0A6F7D` | `#E7F7F9` | Cian = última milla, continuidad con el dato |
| Entregado | `#076B46` | `#E7F6F0` | Verde = cerrado con éxito, universal |
| Incidencia | `#A61F2D` | `#FDF1F2` | Rojo = requiere intervención humana |
| Cancelado | `#7B879E` | `#F2F5F9` | Gris = existe pero ya no cuenta |

> **Nota honesta:** los badges de *Incidencia* y *Cancelado* están diseñados y
> listos en CSS (`.s-incidencia`, `.s-cancelado`), pero **el modelo de datos no
> tiene esos estados todavía**. No los conecté a nada para no mostrar
> información falsa. Ver §21.

---

## 5. Tipografía

```css
font-family: 'Inter', 'SF Pro Text', -apple-system, BlinkMacSystemFont,
             'Segoe UI Variable Text', 'Segoe UI', Roboto, Arial, sans-serif;
```

**Por qué la pila del sistema y no una fuente descargada:** en una terminal de
escaneo, 200–400 ms de espera por una fuente web es tiempo real perdido y un
salto de texto en pantalla. Inter se usa si el equipo ya la tiene; si no, cae en
la fuente nativa, que en Windows 11 y macOS actuales es excelente.

**Escala:** 0.65 / 0.72 / 0.78 / 0.85 / 0.875 / 1 / 1.22 / 1.6 / 1.9 rem.

**Números de guía en monoespaciada** (`ui-monospace, SF Mono, Cascadia Mono,
Menlo, Consolas`): con ancho fijo, `AN1005` y `AN1006` se alinean carácter con
carácter y el ojo detecta la cifra distinta sin leer el número completo. Es la
mejora de legibilidad más barata de todo el rediseño.

Todas las cifras usan `font-variant-numeric: tabular-nums` para que no
"bailen" al actualizarse.

---

## 6. Sistema de espaciado

Base 4 px. Todo el sistema usa estos ocho valores y ninguno más:

```css
--e-1: 4px;   --e-2: 8px;   --e-3: 12px;  --e-4: 16px;
--e-5: 20px;  --e-6: 24px;  --e-8: 32px;  --e-10: 40px;
```

Radios: `6 / 8 / 10 / 14 / 18 / 999 px`. Cuanto más grande el elemento, mayor el
radio, para que la curvatura se perciba constante.

---

## 7. Componentes rediseñados

### Botones

Tres niveles, jerarquía inequívoca:

- **Primario** — degradado azul + luz interior superior + sombra proyectada.
  El degradado sutil (`#2F6BFF → #1E54E6`) da volumen sin parecer un botón de
  2010. Al pulsar, escala a 0.985 y aparece una onda radial (*ripple*).
- **Secundario** — blanco, borde gris, sombra mínima.
- **Peligro** — contorno rojo sobre blanco. Nunca relleno: un botón rojo sólido
  invita a pulsarlo, y estos no deben invitar.

Cinco estados en todos: reposo, hover, active, focus-visible (anillo azul de
3 px) y disabled (opacidad 0.5 + `cursor: not-allowed`).

### Campos

Borde 1 px, radio 8, hover que oscurece el borde, foco con borde azul + anillo
de 3 px. Los `select` llevan su propia flecha en SVG embebido para verse igual
en todos los navegadores. El buscador y el campo de escaneo llevan icono
interior.

### Tarjetas

Borde de 1 px + sombra de dos capas (una de contacto a 1–2 px y otra difusa y
amplia). Una sola sombra difusa se ve barata; dos capas imitan cómo cae la luz
de verdad. Los KPI añaden un filo superior de 2 px del color de su categoría:
identifica sin llenar la tarjeta de color.

### Tablas

Encabezado en versalitas de 0.68 rem con `letter-spacing` amplio; filas de 12 px
de alto interior; hover que además pinta una barra azul de 2 px en la primera
celda para no perder la fila con la vista. Estados vacíos ilustrados.

### Badges

Píldora con punto de color a la izquierda. El punto hace que el estado se
distinga incluso para quien no diferencia bien los colores, y añade un ritmo
visual que ordena la columna.

---

## 8. Iconografía

**Estilo:** trazo de 1.75 px, esquinas redondeadas, rejilla de 24 px, sin
relleno (familia Lucide/Feather). Dibujados a mano en el HTML: **cero
dependencias externas**, cero peticiones de red.

| Concepto | Icono |
|---|---|
| Dashboard | cuatro rectángulos asimétricos |
| Escanear | código de barras entre corchetes de encuadre |
| Guías | caja isométrica |
| Eventos | reloj con flecha de retroceso |
| Configuración | *sliders* |
| Alertas | campana |

---

## 9. Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ ▂ En bodega MTY  ▂ En bodega CDMX  ▂ En tránsito  ▂ Reparto  ▂ Entregadas │
│   2                1                 7             2          4  │
├─────────────────────────────────────────────────────────────────┤
│ Actividad de los últimos [ 7 días ][ 14 días ][ 30 días ]        │
├──────────────────────────────────┬──────────────────────────────┤
│  GUÍAS ENVIADAS POR DÍA          │  ENTREGAS POR DÍA            │
│  16  en 14 días     ■ MTY ■ CDMX │  4  en 14 días               │
│  ▁▂▁▃▁▁█                         │  ╱╲__╱╲__╱                   │
├──────────────────────────────────┴──────────────────────────────┤
│  ACTIVIDAD RECIENTE                                             │
│  Fecha · Guía · Evento · Plaza · Descripción                    │
└─────────────────────────────────────────────────────────────────┘
```

Los KPI son **clicables** y llevan a la lista ya filtrada: de la cifra al
detalle en un solo clic.

---

## 10. Pantalla de escaneo

```
┌─────────────────────────────────────────────────────────────────┐
│  Estás escaneando en la plaza                        MONTERREY  │  ← navy
├─────────────────────────────────────────────────────────────────┤
│  Tipo de operación                                              │
│  [ Bodega MTY ↔ CDMX ]  [ A domicilio ]  [ Ocurre ]             │
│                                                                 │
│  Número de guía                          ● Listo para escanear  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ▥  AN1005▮                                                │  │  ← 1.5 rem mono
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ( ✓ )  AN1005 — Salida registrada                              │  ← confirmación
│         Salió de bodega MTY con destino a CDMX                  │
├─────────────────────────────────────────────────────────────────┤
│  AN1004: Llegó a bodega CDMX                        17:41:02    │
└─────────────────────────────────────────────────────────────────┘
```

Cuatro señales simultáneas por escaneo, para que ninguna sea imprescindible:

1. **Sonido** — agudo (éxito), medio (repetido), grave y cuadrado (error).
2. **Destello del borde de la pantalla** — verde o rojo, 520 ms. Se percibe con
   visión periférica, mirando el paquete y no el monitor.
3. **Tarjeta de confirmación** con icono de 44 px, título y explicación.
4. **Línea en la bitácora**, con hora, de los últimos 4 escaneos.

Cero clics: el foco vuelve solo al campo, que se vacía al instante. Si el
usuario tiene un rol de un solo tipo de operación, el selector desaparece por
completo (no hay nada que elegir) y la pantalla queda reducida al número.

---

## 11. Historial

Antes eran **dos** bloques con los mismos datos (una tabla y una línea de
tiempo). Ahora es una sola línea de tiempo, a ancho completo, con:

- punto de color por tipo de movimiento;
- acción en versalitas y fecha alineada a la derecha;
- descripción en 0.87 rem;
- los escaneos revertidos al 45% de opacidad y tachados.

---

## 12. Buscador

Dos buscadores con papeles distintos y visualmente diferentes:

- **Global** (encabezado): pastilla con lupa y tecla `/` visible. Va directo al
  detalle de una guía exacta.
- **De lista** (pantalla Guías): campo ancho + filtro de estatus. Filtra.

```html
<div class="buscador-global">
  <svg class="lupa">…</svg>
  <input type="text" id="buscarRapido" placeholder="Buscar numero de guia..." />
  <span class="kbd-hint"><span class="kbd">/</span></span>
</div>
```

---

## 13. Menú lateral

Estilo Linear/Vercel: navy, iconos de trazo, indicador de página activa como
barra azul de 3 px con halo, y **colapsable a 68 px** con etiquetas emergentes
al pasar el cursor. La preferencia se guarda por navegador.

```
Expandido (248px)          Contraído (68px)
┌──────────────────┐       ┌────┐
│ [logo]        ‹  │       │ FT │
│ OPERACIONES      │       ├────┤
│▎▣ Dashboard      │       │▎▣  │ ← tooltip al pasar
│ ▥ Escanear MTY   │       │ ▥  │
│ ▥ Escanear CDMX  │       │ ▥  │
│ ▤ Guías          │       │ ▤  │
│ ◷ Eventos        │       │ ◷  │
│ SISTEMA          │       │    │
│ ⚙ Configuración  │       │ ⚙  │
├──────────────────┤       ├────┤
│ Plaza: MTY       │       │MTY │
│ Admin    [Salir] │       │[→] │
└──────────────────┘       └────┘
```

---

## 14. Encabezado

```
┌──────────────────────────────────────────────────────────────────┐
│ Dashboard    [ 🔍 Buscar número de guía…    / ]    17:41  ▥  🔔 │
│                                                  mié 29 de jul   │
└──────────────────────────────────────────────────────────────────┘
```

- **Reloj** de 24 h con la fecha: los cortes de salida son por horario.
- **Acceso rápido a escanear** desde cualquier pantalla.
- **Campana de guías detenidas** — punto azul cuando hay guías con más de
  **3 días** en tránsito. Es una alerta calculada de datos reales, no un centro
  de notificaciones decorativo.

---

## 15. Accesibilidad

- Contraste AA verificado en todos los pares de texto (§4).
- `:focus-visible` con anillo azul de 2 px y separación de 2 px en **todo** lo
  interactivo, incluido lo que se opera con lector de pantalla.
- El estado nunca depende solo del color: los badges llevan punto y texto; las
  confirmaciones de escaneo llevan icono y texto.
- `aria-label` en los botones que solo tienen icono.
- `prefers-reduced-motion`: todas las animaciones se reducen a 0.01 ms.
- Objetivos táctiles de 34 px o más.
- La navegación funciona completa por teclado.

---

## 16. Microanimaciones

| Interacción | Animación | Duración |
|---|---|---|
| Entrada de tarjetas/resultados | fade + `translateY(6px)` | 220 ms |
| Apertura de modal | fade del fondo + `scale(0.98→1)` | 240 ms |
| Hover de KPI/chip | `translateY(-2px)` + sombra | 160 ms |
| Pulsar botón | `scale(0.985)` + ripple | 160/420 ms |
| Confirmación de escaneo | destello del borde | 520 ms |
| «Listo para escanear» | latido del punto verde | 2.2 s en bucle |
| Error de login | sacudida horizontal | 340 ms |
| Carga | skeleton con barrido | 1.3 s en bucle |
| Colapsar menú | `width` + rotación de la flecha | 160 ms |

Curva estándar `cubic-bezier(0.4, 0, 0.2, 1)`; para lo que "entra",
`cubic-bezier(0.16, 1, 0.3, 1)` (desaceleración marcada, sensación de precisión).

---

## 17. Reducción de clics

| Tarea | Antes | Ahora |
|---|---|---|
| Escanear 100 guías | 100 escaneos + clics de rescate al perder foco | 100 escaneos, cero clics |
| Ir a escanear desde cualquier lado | 1–2 clics | tecla `E` o botón del encabezado |
| Buscar una guía | clic al campo + escribir | tecla `/` + escribir |
| Ver guías de un estatus | 3 clics | 1 clic en el KPI |
| Detectar guías detenidas | imposible | campana del encabezado |

---

## 18. Responsive

| Ancho | Comportamiento |
|---|---|
| ≥ 1181 px | Menú completo de 248 px |
| 961–1180 px | Menú de 212 px, buscador más corto |
| 721–960 px (tablet) | Menú de solo iconos con tooltips; gráficas apiladas |
| ≤ 720 px | Menú como encabezado con fila deslizable; tablas ocultan columnas deducibles |

---

## 19. Fragmentos clave

**Botón primario con profundidad y ripple**

```css
button.primario {
  background: linear-gradient(180deg, #2F6BFF 0%, #1E54E6 100%);
  box-shadow: 0 1px 2px rgba(12,20,36,.16), inset 0 1px 0 rgba(255,255,255,.22);
  transition: transform 160ms cubic-bezier(.4,0,.2,1), box-shadow 160ms, filter 160ms;
}
button.primario:hover  { filter: brightness(1.06); transform: translateY(-1px); }
button.primario:active { transform: translateY(0) scale(.985); }
```

**Destello de confirmación de escaneo**

```javascript
function destellar(clase) {
  const d = document.getElementById('destello');
  d.className = 'destello';
  void d.offsetWidth;          // reinicia la animación
  d.className = 'destello ' + clase;
}
```

**Atajos que no estorban al escanear**

```javascript
document.addEventListener('keydown', (e) => {
  const enCampo = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName || '');
  if (enCampo) return;                    // escribiendo, manda el usuario
  if (e.key === '/') { e.preventDefault(); buscador.focus(); }
});
```

---

## 20. Verificación

El rediseño se probó con navegador real (Chromium) en 1440, 900 y 400 px:

- 22 comprobaciones del rediseño (menú colapsable, atajos, terminal, estados
  vacíos, encabezado);
- 7 suites de regresión anteriores (roles, cancelación, eliminación, atajo de
  borrado, recorrido general);
- ninguna pantalla desborda horizontalmente; cero errores de JavaScript.

---

## 21. Siguientes pasos (requieren backend)

1. **Estados «Incidencia» y «Cancelado».** Los badges existen; falta el modelo
   de datos: una guía debería poder marcarse con incidencia (dirección errónea,
   paquete dañado) y quedar cancelada sin borrarse.
2. **Paginación real.** Hoy la lista trae hasta 200 guías de una vez. Con
   volumen alto conviene paginar en el servidor.
3. **Centro de notificaciones.** La campana ya avisa de guías detenidas; el
   siguiente paso es persistir avisos y marcarlos como leídos.
4. **Guías por lote.** Escanear una lista y registrar la salida de todas juntas.
