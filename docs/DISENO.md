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

---

## 22. Segunda iteracion: cambios estructurales

La primera version rediseño la superficie. Esta rehace la estructura, con
cuatro decisiones que no son de estilo sino de producto.

### 22.1 Modo operacion: la terminal de escaneo ocupa la pantalla

**Critica del diseño anterior:** la pantalla mas usada del sistema (cientos de
escaneos al dia) vivia dentro de un menu lateral, un encabezado, una tarjeta y
un pie. Todo eso compite por atencion con lo unico que importa: el numero.

**Ahora:** al abrir Escanear, el menu y el encabezado desaparecen. Queda una
barra fina con el contexto (plaza y tipo de operacion), el campo a 2.3 rem
centrado en la pantalla, y debajo la confirmacion y los ultimos escaneos.

```
┌──────────────────────────────────────────────────────────────┐
│ [FT] PLAZA Monterrey │ [Bodega MTY↔CDMX][Domicilio][Ocurre]  ●Listo  ✕ │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│              ┌────────────────────────────────┐              │
│              │ ▥  AN1005▮                     │              │
│              └────────────────────────────────┘              │
│         El sistema decide solo si es salida o llegada        │
│                  12 guias en esta sesion                     │
│                                                              │
│              ( ✓ ) AN1005 — Salida registrada                │
│              ─────────────────────────────────               │
│              AN1004  Llego a bodega CDMX      17:42          │
└──────────────────────────────────────────────────────────────┘
```

**Justificacion:** el espacio vacio no es desperdicio, es jerarquia. Cuando en
la pantalla solo hay una cosa que hacer, no hace falta buscarla ni decidir.
El contador de sesion ocupa el hueco con informacion que al operador si le
importa ("como voy"), en vez de rellenar con adornos.

**Consecuencia asumida:** desde la terminal no hay menu. Se navega con la
paleta (Ctrl+K) o con la cruz. Es el mismo compromiso que hacen los editores
de codigo en modo concentracion, y es deliberado.

### 22.2 Paleta de comandos (Ctrl+K)

Una sola entrada para todo: se escribe un numero de guia y aparecen las
coincidencias reales del servidor; se escribe una palabra y aparecen las
acciones. Navegacion con flechas, `Enter` ejecuta, `Esc` cierra.

**Justificacion:** es la diferencia entre un panel y una herramienta. El
usuario experto deja de recorrer menus y pasa a **ordenar**. Ademas resuelve la
navegacion en modo operacion sin devolver el menu a la pantalla.

### 22.3 El dashboard se ordena por urgencia, no por disponibilidad

**Critica:** el panel abria con cinco KPI de inventario ("cuantas tengo en
bodega"). Nadie llega por la mañana preguntandose eso: se pregunta **como
vamos hoy** y **que se atoro**.

**Ahora, en este orden:**

1. **HOY** — franja oscura con guias procesadas, salidas, llegadas y entregas
   del dia. La cifra principal en azul, las demas en navy.
2. **ATENCION** — banda ambar que **solo aparece si hay guias detenidas**. Un
   panel que siempre muestra una alerta deja de comunicar.
3. **INVENTARIO EN ESTE MOMENTO** — los KPI de siempre, ahora rotulados y
   demotados a su papel real: contexto, no titular.
4. Graficas y actividad reciente.

Requirio un cambio de backend: la consulta de estadisticas no contaba las
llegadas, asi que el dato del dia estaba incompleto.

### 22.4 Cada rol entra donde trabaja

Antes todos caian en la pantalla de escaneo. Ahora **el administrador entra al
panel de control** y **los roles operativos entran a la terminal**. El trabajo
de un administrador es mirar el conjunto, no dar de alta guias una por una.

### 22.5 Navegacion consolidada

"Escanear en MTY" y "Escanear en CDMX" eran dos entradas de menu para una sola
actividad. Ahora hay **una** entrada "Escanear" y la plaza se cambia desde la
propia barra de la terminal, que es donde se necesita. El menu baja de 6 a 5
entradas y la de escaneo deja de estar duplicada.

### 22.6 Verificacion

24 comprobaciones nuevas en navegador (modo operacion, conmutador de plaza,
paleta con busqueda real, jerarquia del dashboard, navegacion consolidada) mas
las 8 suites anteriores. Nueve suites en verde.

---

## 23. Tercera iteracion: nivel enterprise

La segunda iteracion rehizo la estructura. Esta cierra la distancia con el
software que se usa en operaciones grandes: **dejar constancia de quien hace
cada cosa**, convertir el escaneo en una terminal de punto de venta y darle a
la lista de guias el trato de un CRM.

### 23.1 El sistema ahora sabe quien escaneo

**Critica:** el historial decia *que* paso y *cuando*, pero no *quien*. En una
operacion con cuatro roles y varios turnos, ese hueco es el que impide cerrar
una discusion: "esta guia se marco entregada y no llego".

**Cambio de modelo de datos** (aditivo, no rompe nada):

```sql
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS usuario TEXT;
```

`registrarEvento` recibe el usuario como septimo parametro con valor por
defecto `null`, de modo que **toda llamada existente sigue funcionando igual**.
Los eventos anteriores a la columna quedan en `NULL` y la interfaz los muestra
como "sin registrar" — se dice la verdad en vez de inventar un responsable.

El nombre visible se resuelve con un `LEFT JOIN` contra `usuarios`, no se
copia: si alguien corrige su nombre, el historial entero se corrige con el.

**Lo que no cambio:** el endpoint publico de rastreo sigue proyectando solo
`{accion, descripcion, creado_en}`. El cliente final nunca ve quien movio su
paquete.

### 23.2 La confirmacion de escaneo, como un punto de venta

**Critica recibida:** *"No quiero una caja enorme en medio."*

Un POS profesional no pide confirmacion: muestra el resultado, lo deja leer y
se prepara para el siguiente. Eso es lo que hace ahora la terminal.

```
┌──────────────────────────────────────────────────────────────┐
│ [FT] PLAZA Monterrey │ [Bodega][Domicilio][Ocurre] │ 12 en esta sesion ●Listo ✕ │
├──────────────────────────────────────────────────────────────┤
│        ┌────────────────────────────────────────┐            │
│        │ ▥  Dispara la pistola y presiona Enter │            │  ← posicion fija
│        └────────────────────────────────────────┘            │
│         El sistema decide solo si es salida o llegada        │
│        ┌────────────────────────────────────────┐            │
│        │ (→)  Salida registrada                 │            │
│        │      Salio de bodega MTY hacia CDMX    │            │  ← hueco reservado
│        │      GUIA      MOVIMIENTO   ESTADO NUEVO│           │
│        │      AN1005    Salida       En transito │           │
│        │      DESTINO   HORA         OPERADOR    │           │
│        │      CDMX      15:42:03     J. Ramirez  │           │
│        │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬───────────────────  │            │  ← barra de 2 s
│        └────────────────────────────────────────┘            │
│        AN1004  Llego a bodega CDMX          15:41:20         │
│        AN1003  Salio de bodega MTY          15:40:58         │
└──────────────────────────────────────────────────────────────┘
```

Tres decisiones concretas:

1. **Dos segundos y se va sola.** Antes la confirmacion se quedaba 30 segundos
   y ademas borraba la bitacora al irse. Ahora la barra de progreso agota su
   recorrido, la tarjeta sale con una animacion de 260 ms y el campo queda
   listo. **Sin hacer clic.**
2. **El campo no se mueve nunca.** El hueco de la confirmacion (`.op-slot`,
   168 px) esta reservado aunque este vacio, y el campo se ancla arriba en vez
   de centrarse verticalmente. En un POS la mirada vuelve siempre al mismo
   punto; una interfaz que salta obliga a re-localizarla en cada paquete.
3. **El contador de sesion se mudo a la barra de estado.** Es contexto, no
   contenido: no debe competir con el campo.

**Lo que se muestra y por que ese orden:** Guia (que), Movimiento (que paso),
Estado nuevo (como quedo), Destino, Hora, Operador. Se lee de reojo en ese
orden porque es el orden en que se duda.

**Lo que el brief pedia y no se puede mostrar:** *Cliente* y *Destino
(direccion)* no existen en la base de datos. El sistema guarda plaza de origen
y plaza de destino (MTY/CDMX), no un destinatario ni un domicilio. Se muestra
la plaza y se deja dicho el hueco, en vez de inventar un dato.

### 23.3 Eventos: una linea de tiempo, no una tabla

La pantalla de Eventos mostraba, por cada guia, una tabla de cuatro columnas.
Una tabla comunica "estos registros son comparables entre si"; el recorrido de
un paquete no es eso, es una **secuencia**. Ahora cada grupo se despliega como
la misma linea de tiempo que ya usaba el detalle: punto de color por tipo de
movimiento, accion, fecha, descripcion y — nuevo — **plaza y operador**.

### 23.4 Guias: tabla, tarjetas, favoritas y filtros guardados

| Pieza | Que resuelve |
|---|---|
| **Conmutador tabla/tarjetas** | Barrer 200 guias pide una tabla; revisar 10 con atencion pide fichas. Son dos tareas distintas, no una preferencia estetica. |
| **Favoritas (estrella)** | Seguir un reclamo o un envio importante sin tocar el estado real del envio. Es una nota personal: vive en `localStorage`, no en la base. |
| **Filtro "Favoritas"** | Convierte esas marcas en una vista de trabajo. |
| **Filtros guardados** | Guarda la combinacion completa (pestaña, estatus, busqueda, rango de fechas) y la devuelve con un clic. |

Detalles que importan: la estrella hace `stopPropagation`, porque marcar no es
abrir; el nombre del filtro se escribe **en la misma fila** y no en un
`prompt()` del navegador, que bloquea la pagina y rompe el diseño; y la
seleccion de vista, las favoritas y los filtros sobreviven a la recarga.

### 23.5 El dashboard mide la operacion, no solo el inventario

Dos metricas nuevas en la franja HOY, ambas calculadas en SQL sobre datos
reales:

- **Tiempo medio en transito** — promedio de `LLEGADA - SALIDA` por guia sobre
  los ultimos 30 dias, ignorando eventos revertidos. Es el indicador que de
  verdad mide el servicio.
- **Operadores activos hoy** — `COUNT(DISTINCT usuario)` en horario de Mexico.
  Solo es posible gracias a 23.1.

La unidad se ajusta sola (`45 min`, `3 h 40 min`, `1 d 2 h`) para que el numero
siempre se lea de un vistazo.

### 23.6 Tema oscuro

No es un segundo diseño: son **los mismos componentes leyendo otros valores**.
El sistema ya estaba construido sobre tokens, asi que el modo oscuro es un
bloque `html[data-tema="oscuro"]` que redefine neutros, fondos semanticos y
sombras.

Tres decisiones:

- **Los colores de estado se conservan**, subidos un punto de luminosidad. Un
  operador que aprendio "ambar = salida, verde = entregado" no debe reaprender
  nada al cambiar de tema.
- **En oscuro la elevacion la da el borde**, no la sombra: una sombra sobre
  fondo oscuro no se ve.
- **El tema se aplica antes de pintar**, con un script en el `<head>`. Si se
  aplicara al final del documento, quien usa modo oscuro veria un destello
  blanco en cada carga. Si nunca se eligio, se respeta `prefers-color-scheme`.

Se alterna con el boton de la barra superior o con la tecla `T`.

### 23.7 Verificacion

Suite nueva de 30 comprobaciones en navegador (confirmacion POS y su
temporizador, estabilidad de la posicion del campo, operador en ambas lineas de
tiempo, conmutador de vistas, favoritas, filtros guardados, persistencia y tema
oscuro) mas las 10 suites anteriores. **Once suites en verde**, cero errores de
JavaScript, ninguna pantalla desborda en 400 px.

### 23.8 Lo que el brief pedia y no se entrego

Se dice explicitamente en vez de simularlo:

1. **Cliente / destinatario y direccion de entrega** — no existen en el modelo.
   El sistema opera con numero de guia y plaza.
2. **Top clientes** — depende de 1.
3. **Incidencias** — los badges existen en CSS desde la primera iteracion, pero
   no hay estado de incidencia en la base de datos.
4. **Mapa de flujo MTY ↔ CDMX** — se puede dibujar con los datos actuales
   (guias por estatus y sentido); quedo fuera de esta iteracion.

Los cuatro son trabajo de modelo de datos, no de interfaz. Ninguno se
"resolvio" con datos de ejemplo.

---

## 24. Bitacora: motivo y responsable de cada eliminacion o cancelacion

Eliminar y cancelar eran las dos unicas acciones del sistema que borraban
informacion sin dejar por que. Un numero desaparecia de la base y, meses
despues, nadie podia responder quien lo quito ni con que razon.

### 24.1 Una tabla que sobrevive a la guia

```sql
CREATE TABLE IF NOT EXISTS bitacora (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,          -- ELIMINACION o CANCELACION
  numero_guia TEXT NOT NULL,
  numero_nuevo TEXT,           -- en una cancelacion, la guia que la reemplaza
  motivo TEXT NOT NULL,
  usuario TEXT,
  estatus TEXT,                -- estatus que tenia en ese momento
  complemento TEXT,
  eventos INTEGER,             -- movimientos que se perdieron (eliminacion)
  creado_en TIMESTAMPTZ NOT NULL
);
```

**A proposito no tiene llave foranea contra `guias`.** Es la decision de diseño
que hace que la tabla sirva: si la tuviera, `ON DELETE` la arrastraria o el
borrado fallaria. La bitacora tiene que poder hablar de una guia que ya no
existe — es exactamente para eso.

El registro se escribe **antes del `DELETE`, en la misma transaccion**: o queda
la constancia y desaparece la guia, o no pasa ninguna de las dos cosas.

### 24.2 El motivo es obligatorio, y tiene que decir algo

`normalizarMotivo()` recorta, colapsa espacios y **rechaza menos de 5
caracteres**. Un motivo de dos letras no le sirve a nadie que abra la bitacora
en seis meses; permitirlo seria fingir que hay trazabilidad.

Se valida **antes de abrir la transaccion** (no tiene sentido tocar la base con
una peticion incompleta) y **tambien en el navegador**, para que el error se
vea junto al campo y no despues de un viaje al servidor.

En el modal de eliminar, el motivo va **antes** de la casilla de confirmacion y
se lleva el foco al abrir: primero se explica por que, y solo despues se
escribe el numero que consuma el borrado.

### 24.3 El motivo vive en dos lugares, a proposito

| Donde | Para quien |
|---|---|
| Evento `CAMBIO_NUMERO` de la guia (`… Motivo: …`) | Quien abre **esa** guia y quiere entender su historia |
| Tabla `bitacora` | Quien revisa **todas** las eliminaciones y cancelaciones juntas |

No es duplicacion ociosa: son dos preguntas distintas. La segunda es la unica
que sigue teniendo respuesta cuando la guia se elimino.

### 24.4 La pantalla

Entrada nueva en el menu, bajo **Sistema**, visible **solo para
administradores** — y el endpoint `GET /api/bitacora` exige `requireAdmin`, asi
que ocultar el menu es comodidad, no seguridad.

```
┌───────────────────────────────────────────────────────────────────┐
│  1 Guias eliminadas │ 1 Guias canceladas │ 2 Registros en total   │
│  Registro permanente. No se puede editar ni borrar desde el sistema│
├───────────────────────────────────────────────────────────────────┤
│  [🔍 Buscar por numero...]      [Todo][Eliminaciones][Cancelaciones]│
├───────────────────────────────────────────────────────────────────┤
│  HOY                                                              │
│ ┃ (→) CANCELADA   A̶N̶5̶0̶0̶2̶ → AN5502          01 ago 2026, 05:44 p.m.│
│ ┃  ┌─ MOTIVO ────────────────────────────────────────────────┐    │
│ ┃  │ El cliente no pago la entrega y se emitio una guia nueva│    │
│ ┃  └─────────────────────────────────────────────────────────┘    │
│ ┃  RESPONSABLE          ESTATUS QUE TENIA                         │
│ ┃  (A) Administrador    En transito a CDMX                        │
│  JUEVES, 30 DE JULIO DE 2026                                      │
│ ┃ (🗑) ELIMINADA  A̶N̶5̶0̶0̶1̶                   30 jul 2026, 05:44 p.m.│
└───────────────────────────────────────────────────────────────────┘
```

Cinco decisiones concretas:

1. **Fichas, no tabla.** Es un registro de responsabilidad, no un conjunto de
   filas comparables. El **motivo va en primer plano, citado en su propio
   recuadro**, porque es el dato que uno viene a buscar; quien y cuando van
   debajo, siempre en el mismo sitio, para recorrer la lista de un vistazo.
2. **Agrupadas por dia** ("Hoy", "Ayer", la fecha completa). Al revisar
   responsabilidades se busca *que paso el martes*, no el registro numero 47.
3. **Los numeros muertos van tachados.** En una cancelacion se ve
   `AN5002 → AN5502`; el numero nuevo **si es un enlace** (esa guia existe), el
   tachado no lo es. La forma comunica que uno se puede abrir y el otro no.
4. **Color por tipo**: rojo para eliminacion, ambar para cancelacion, en el
   borde izquierdo y en la etiqueta. El mismo codigo que ya usa el resto del
   sistema.
5. **Solo lectura.** No hay `POST`, `PUT`, `DELETE` ni `PATCH` sobre
   `/api/bitacora`, y la suite lo comprueba. Una bitacora que se puede editar
   no es una bitacora.

### 24.5 Lo que no cambio

- Las otras resoluciones (revertir un escaneo, registrar un complemento)
  **siguen sin pedir motivo**: no destruyen nada.
- Ningun endpoint desaparecio ni cambio de forma; `motivo` es un campo nuevo en
  el cuerpo de dos peticiones que ya existian.
- El rastreo publico no se entera de nada de esto.

### 24.6 Verificacion

Suite nueva de 34 comprobaciones: motivo obligatorio y con longitud minima en
ambas acciones, la guia intacta cuando la peticion se rechaza, normalizacion de
espacios, la constancia sobreviviendo al borrado, el vinculo entre numero viejo
y nuevo, el motivo en el historial de la guia, filtros por tipo y por numero,
403 para operadores, 401 sin sesion, ausencia de metodos de escritura, y la
pantalla completa (agrupacion por dia, contadores, filtros, enlace a la guia
nueva, estado vacio y bloqueo de la ruta para no administradores).

**Doce suites en verde.**

---

## 25. Mapa de flujo entre plazas

Era el ultimo punto del brief que se podia construir **sin tocar el modelo de
datos**, y quedaba pendiente desde la tercera iteracion.

### 25.1 La critica

El dashboard mostraba el inventario como un renglon de cinco tarjetas:

```
[ 12 En bodega MTY ] [ 8 En bodega CDMX ] [ 9 En transito ] [ 6 En reparto ] [ 71 Entregadas ]
```

Las cifras eran correctas y no comunicaban nada. Esta operacion **es un ida y
vuelta entre dos bodegas**, y un renglon de tarjetas destruye esa geometria:
obliga a reconstruir en la cabeza que "En bodega MTY" y "En bodega CDMX" son
dos puntas de la misma ruta, y que "En transito" son en realidad **dos flujos
en sentidos opuestos** sumados en un solo numero — el dato menos util posible,
porque nadie opera "el tránsito", se opera *lo que va hacia CDMX*.

### 25.2 Lo que hay ahora

```
 DONDE ESTA LA MERCANCIA EN ESTE MOMENTO
┌──────────────────┐                                  ┌──────────────────┐
│ ● MONTERREY      │      🚚 4 guias hacia CDMX       │ ● CIUDAD DE MEXICO│
│                  │      ────────────────────▶       │                  │
│  ● 2 en bodega   │                                  │  ● 1 en bodega   │
│  ○ 0 en reparto  │      🚚 3 guias hacia MTY        │  ● 2 en reparto  │
│  ● 2 entregadas  │      ◀────────────────────       │  ● 2 entregadas  │
└──────────────────┘                                  └──────────────────┘
```

Las cifras son **exactamente las mismas** que antes — sale del mismo
`/api/guias/resumen`, sin endpoints nuevos. Lo que cambia es que cada una esta
en el lugar donde ocurre.

Seis decisiones:

1. **El transito se separa por sentido.** Deja de ser un total y pasa a ser dos
   flujos. Es el cambio que mas informacion agrega y no costo una sola consulta
   nueva.
2. **La via se enciende sola.** Con carga se pone ambar y la linea se anima con
   un patron que se desplaza; vacia queda gris y quieta. El movimiento en
   pantalla significa movimiento real, no decoracion.
3. **El cero no desaparece, se apaga** (opacidad 0.42, y vuelve a 1 al pasar el
   cursor). Un hueco vacio tambien es informacion: *aqui no hay nada en
   reparto* es una respuesta, no una ausencia.
4. **Todo es un enlace filtrado.** Cada cifra abre Guias con la pestaña y el
   estatus ya puestos — incluida la regla de que la pestaña de una plaza agrupa
   lo que **salio** de ahi, asi que un estatus de CDMX abre la pestaña MTY.
5. **El destino va escrito, no solo dibujado.** "4 guias hacia CDMX", no "4 en
   transito". Al apilarse en pantalla chica las plazas quedan una encima de
   otra y una flecha horizontal deja de significar nada; el texto sigue siendo
   correcto en cualquier ancho, y ahi la flecha se oculta.
6. **Los KPI se eliminaron, no se sumaron.** Mostrar las dos cosas seria dejar
   las mismas cinco cifras dos veces en la misma pantalla. Se borro tambien el
   CSS de `.kpi` y los iconos que solo alimentaban ese bloque: codigo muerto es
   deuda, aunque no se vea.

### 25.3 Verificacion

11 comprobaciones nuevas dentro de la suite enterprise: los dos nodos y sus
tres filas, las dos vias con su destino escrito, ausencia del renglon de KPI,
**las cifras del mapa contrastadas contra `/api/guias/resumen`** (que el dibujo
no se despegue del dato), y que tocar una cifra o una via abra Guias con la
pestaña y el estatus correctos. Doce suites en verde.

---

## 26. Correcciones y endurecimiento

Ronda de arreglos a partir de un reporte concreto (el codigo de barras se veia
mal en tema oscuro) mas una auditoria de lo que podia tumbar el sistema.

### 26.1 El codigo de barras en tema oscuro

**El sintoma:** en oscuro aparecia un rectangulo blanco flotando dentro de la
tarjeta, con el numero en una franja suelta. Parecia un error de dibujo.

**La causa:** JsBarcode pinta su propio rectangulo blanco **solo detras de las
barras** y escribe el numero en negro encima. Contra una tarjeta oscura, ese
recorte blanco no tenia ninguna relacion con el resto de la caja.

**Lo que NO se hizo:** invertir el codigo para que combinara con el tema
oscuro. Un lector optico necesita barras oscuras sobre fondo claro; un codigo
invertido se ve elegante y **deja de escanear**. La apariencia no manda sobre
la funcion.

**Lo que se hizo:** convertirla en lo que realmente es —una etiqueta fisica—.
Tarjeta blanca completa en los dos temas, con su rotulo ("Guia",
"Complemento"), las barras, y el numero escrito **por nosotros** con la
tipografia del sistema (`displayValue: false`). En oscuro se le da un borde
mas marcado y una sombra suave para que el blanco no deslumbre, sin bajarle el
contraste a las barras.

### 26.2 Tres defectos encontrados en la auditoria

| Defecto | Consecuencia | Arreglo |
|---|---|---|
| `decodeURIComponent` sin proteger en el router | Una URL como `#/guia/%%%` lanzaba y dejaba el panel a medio pintar | Se intenta decodificar; si falla se usa el texto crudo |
| El historial se ordenaba por `id`, no por fecha | Las notas administrativas se escriben con la fecha del momento, asi que la historia se leia salteada en el tiempo | `ORDER BY creado_en DESC, id DESC` |
| "Escaneos" contaba notas de admin y escaneos revertidos | Una guia escaneada dos veces decia "4 escaneos" | Cuenta solo movimientos reales no revertidos |

### 26.3 Que el sistema no se caiga

- **Rechazos sin atrapar.** Desde Node 15 una promesa rechazada que nadie
  atrapa **mata el proceso**. Aqui eso significa dejar sin escanear a las dos
  plazas hasta que el hosting reinicie. Ahora se registra y el servidor sigue
  vivo: perder una peticion es mucho menos grave que perder el servicio. Una
  excepcion sin atrapar si sale (con codigo 1) para que el hosting levante una
  instancia limpia, porque ahi el proceso queda en estado dudoso.
- **Cuerpos gigantes.** `express.json({ limit: '256kb' })` y un `413` con
  mensaje claro, en vez de dejar que una peticion enorme se coma la memoria.
- **WhatsApp colgado.** La llamada a Meta no tenia limite de tiempo: una
  respuesta que nunca llega dejaba la peticion viva para siempre. Ahora corta a
  los 10 s y el fallo se registra sin afectar al escaneo ni al panel.

Se comprobo ademas, con datos reales, que **no hay XSS**: se inyecto
`<script>` y `<img onerror>` en los dos campos de texto libre que existen
(motivo de la bitacora y nombre de usuario) y ambos se muestran como texto.

### 26.4 Configuracion, reorganizada

Eran cinco tarjetas apiladas con anchos distintos (520 px y 820 px), que
dejaban un borde derecho dentado, y dos defectos visibles: el desplegable de
rol cortaba "Entregas a domicilio" con la flecha encima del texto, y el boton
"Eliminar" quedaba fuera de la tarjeta.

Ahora son **dos columnas**: a la izquierda lo tuyo (cuenta, contraseña,
enlaces, zona de peligro), a la derecha la gestion de usuarios, que es la que
necesita ancho. Las acciones por fila pasaron a **botones de icono** (llave y
bote) con `title` y `aria-label` que dicen a que usuario aplican: dos botones
con texto se comian el ancho de la tabla.

Detalle que costo un intento: en una rejilla, un elemento no se encoge por
debajo de su contenido salvo que se le ponga `min-width: 0`. Sin eso la tabla
de usuarios ensanchaba la columna y desbordaba la pantalla en el celular.

### 26.5 Verificacion

Dos suites nuevas:

- **Caos** (24 comprobaciones): base recien instalada, rutas y guias que no
  existen, sesion revocada en el servidor, token invalido guardado, la API
  devolviendo 500 en todo, y respuestas con campos faltantes. En ningun caso
  la pantalla queda en blanco ni se lanza una excepcion.
- **Pulido** (33 comprobaciones): la etiqueta blanca y legible en los dos
  temas, el numero contrastando, el historial cronologico contrastado contra
  la API, el contador de escaneos, URL mal formadas, configuracion sin cortes
  en tres anchos, y que los botones de icono de verdad restablezcan la
  contraseña y borren al usuario.

Ese ultimo detalle atrapo un error mientras se escribia: los `<select>` de rol
y plaza tambien llevan `data-id`, asi que `[data-id]` enganchaba el manejador
de borrado a los desplegables. Se acoto a `button[data-id]`.

**Catorce suites en verde.**
