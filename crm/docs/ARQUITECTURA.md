# Aura CRM — Arquitectura

> **Aura** es la plataforma comercial inteligente de Fletes Tauro: un CRM de nueva
> generación donde la IA no es un módulo extra, sino la capa que atraviesa todo el
> producto.

---

## 1. Principios de arquitectura

| Principio | Cómo se materializa |
| --- | --- |
| **La IA nunca inventa números** | Los motores deterministas (`api/src/ia/motor.js`) calculan puntuaciones, pronósticos y riesgos con reglas auditables. El modelo de lenguaje solo **redacta y explica** lo que el motor calculó. |
| **Degradación elegante** | Sin `ANTHROPIC_API_KEY` el producto sigue completo: el copiloto responde con el motor de intenciones y los textos usan plantillas. La IA generativa es una mejora, no un requisito. |
| **Una sola pantalla por intención** | Cada módulo resuelve un trabajo completo sin saltos: la ficha 360 del cliente, el pipeline, la bandeja de tickets. Mínimo número de clics. |
| **Servidor delgado, dominio explícito** | Las rutas HTTP solo validan y traducen; toda la lógica vive en `servicios/`. El SQL vive junto al servicio que lo usa, no en un ORM opaco. |
| **Rendimiento percibido** | Caché cliente con React Query, *skeletons* con la forma real del contenido, animaciones sobre `transform`/`opacity`, y agregaciones hechas en Postgres (no en JS). |
| **Escala desde el día uno** | Índices en toda clave de acceso, paginación por cursor en listas grandes, y agregados en SQL. Preparado para decenas de miles de cuentas. |

---

## 2. Vista de alto nivel

```
┌───────────────────────────────────────────────────────────────────┐
│  NAVEGADOR — crm/web  (React 19 · TypeScript · Vite · Tailwind 4) │
│                                                                   │
│  Shell premium ─ Sidebar · Topbar · ⌘K Command Palette · Copiloto │
│      │                                                            │
│      ├── Sistema de diseño   componentes/ui   (primitivos)        │
│      ├── Kit de gráficas     componentes/graficas (SVG propio)    │
│      └── Módulos             modulos/<dominio>/                   │
│                                                                   │
│  Estado servidor: TanStack Query   ·   Estado UI: hooks locales   │
└───────────────────────────────┬───────────────────────────────────┘
                                │  JSON  /api/v1/*   (cookie de sesión)
┌───────────────────────────────┴───────────────────────────────────┐
│  API — crm/api  (Node 22 · Express · ESM)                         │
│                                                                   │
│  rutas/       validación + HTTP  (delgado, sin lógica)            │
│  servicios/   dominio + SQL      (una función = un caso de uso)   │
│  ia/          motor determinista + proveedor Claude + copiloto    │
│  motor/       ejecutor de automatizaciones                        │
│  middleware/  sesión, roles, errores, límite de peticiones        │
└───────────────────────────────┬───────────────────────────────────┘
                                │  pg (pool)
┌───────────────────────────────┴───────────────────────────────────┐
│  PostgreSQL 16 — 31 tablas · migrador idempotente · semilla real  │
└───────────────────────────────────────────────────────────────────┘
```

### Por qué esta separación

- **`rutas/` no contiene lógica.** Cada archivo mapea verbos HTTP a funciones de
  servicio. Eso hace que la misma lógica sea invocable desde el ejecutor de
  automatizaciones y desde las herramientas del copiloto de IA, sin duplicar nada.
- **`servicios/` es la única capa que habla SQL.** Un caso de uso = una función
  exportada. Los agregados del dashboard son una sola consulta con `FILTER`, no
  diez consultas en un bucle.
- **`ia/` consume `servicios/`.** El copiloto no tiene acceso a la base de datos:
  usa las mismas funciones que la API pública, con el usuario de la sesión. La IA
  no puede ver más de lo que el usuario ya puede ver.

---

## 3. Estructura de carpetas

```
crm/
├── docs/
│   ├── ARQUITECTURA.md        ← este documento
│   ├── MODELO-DATOS.md        ← 31 tablas, relaciones, índices
│   ├── SISTEMA-DISENO.md      ← tokens, escalas, movimiento, componentes
│   ├── NAVEGACION-UX.md       ← mapa de rutas y flujos clave
│   └── ROADMAP.md             ← plan por fases y estado
│
├── api/
│   ├── src/
│   │   ├── index.js           arranque: migra, escucha
│   │   ├── app.js             ensamblado de Express
│   │   ├── config.js          entorno tipado con valores por defecto
│   │   ├── db/
│   │   │   ├── pool.js        pool pg + helpers (uno, muchos, tx)
│   │   │   ├── esquema.sql    DDL completo idempotente
│   │   │   ├── migrar.js      aplica esquema (--reiniciar para limpiar)
│   │   │   └── semilla.js     18 meses de datos realistas y coherentes
│   │   ├── lib/               errores, validación, fechas, dinero, texto
│   │   ├── middleware/        sesión, roles, errores, rate-limit
│   │   ├── servicios/         un archivo por dominio
│   │   ├── ia/
│   │   │   ├── motor.js       cálculos deterministas explicables
│   │   │   ├── proveedor.js   cliente Claude API (opcional)
│   │   │   ├── copiloto.js    orquestador con herramientas
│   │   │   ├── herramientas.js  contrato de herramientas del copiloto
│   │   │   └── redaccion.js   correos y propuestas
│   │   ├── motor/ejecutor.js  ejecución de automatizaciones
│   │   └── rutas/             un router por dominio
│   └── package.json
│
└── web/
    ├── src/
    │   ├── main.tsx · App.tsx · rutas.tsx
    │   ├── estilos/            tokens.css · base.css
    │   ├── lib/                cliente API, formato, hooks, tipos
    │   ├── componentes/
    │   │   ├── ui/             ~24 primitivos (Boton, Panel, Tabla, …)
    │   │   ├── graficas/       kit SVG animado propio
    │   │   ├── layout/         Shell, Sidebar, Topbar, Paleta ⌘K
    │   │   └── ia/             Copiloto, InsightCard, ScoreAnillo
    │   └── modulos/            dashboard, prospectos, clientes, …
    └── package.json
```

---

## 4. Modelo de dominio (resumen)

Cinco entidades vertebran el sistema; todo lo demás cuelga de ellas.

```
                 ┌──────────┐
                 │  LEAD    │  prospecto sin calificar aún
                 └────┬─────┘  score IA 0-100 + señales
            convertir │
                 ┌────▼─────┐        ┌────────────┐
                 │  CUENTA  │◄───────┤  CONTACTO  │
                 └────┬─────┘ 1    n └────────────┘
                      │ 1
                      │ n
            ┌─────────▼────────┐      ┌──────────────┐
            │   OPORTUNIDAD    │─────►│  COTIZACIÓN  │
            └─────────┬────────┘ 1  n └──────┬───────┘
                      │                      │ n
                      │                ┌─────▼──────┐
                      │                │  PRODUCTO  │
                      │                └────────────┘
                      │
        ┌─────────────┼─────────────┬──────────────┐
   ┌────▼─────┐  ┌────▼─────┐  ┌────▼────┐  ┌──────▼─────┐
   │ACTIVIDAD │  │  SEÑAL   │  │ TICKET  │  │  BITÁCORA  │
   └──────────┘  └──────────┘  └─────────┘  └────────────┘
   llamadas,     comportamiento  soporte     cronología
   correos,      que alimenta    con SLA     unificada de
   reuniones     el lead score               todo el sistema
```

**La `bitácora` es la columna vertebral de la experiencia.** Toda escritura
relevante registra un renglón (`entidad_tipo`, `entidad_id`, `tipo`, `titulo`,
`metadata`). Eso permite que la ficha 360 del cliente, el detalle de la
oportunidad y el feed del dashboard sean **la misma consulta con otro filtro**, en
lugar de tres implementaciones distintas.

Detalle completo de las 31 tablas: [`MODELO-DATOS.md`](./MODELO-DATOS.md).

---

## 5. La capa de IA en detalle

Es la decisión de diseño más importante del producto, así que se explica aparte.

### 5.1 Dos capas, responsabilidades separadas

```
                      ┌─────────────────────────────────────┐
   Datos del CRM ────► │  MOTOR DETERMINISTA  (motor.js)     │
                      │  · lead score 0-100 + motivos       │
                      │  · probabilidad de cierre           │
                      │  · pronóstico + intervalo           │
                      │  · riesgo de estancamiento          │
                      │  · churn y venta cruzada            │
                      │  · next best action                 │
                      └──────────────┬──────────────────────┘
                                     │  hechos + explicación
                                     ▼
                      ┌─────────────────────────────────────┐
                      │  PROVEEDOR CLAUDE  (proveedor.js)   │
                      │  redacta · resume · conversa         │
                      │  NUNCA calcula cifras                │
                      └──────────────┬──────────────────────┘
                                     │ (si no hay API key)
                                     ▼
                      ┌─────────────────────────────────────┐
                      │  RESPALDO POR PLANTILLAS            │
                      │  mismas cifras, prosa determinista  │
                      └─────────────────────────────────────┘
```

**Consecuencia práctica:** cuando el dashboard dice *"82% de probabilidad de
superar tu objetivo"*, ese 82% viene de una función pura y verificable, no de un
modelo de lenguaje. La IA generativa solo elige las palabras. Esto elimina la
clase de error más grave en un CRM con IA: cifras alucinadas sobre las que alguien
toma decisiones comerciales.

### 5.2 Lead score explicable

El score es una suma ponderada y **cada punto es rastreable**:

| Dimensión | Peso | Señales que la alimentan |
| --- | --- | --- |
| Comportamiento | 30 | aperturas de correo, clics, visitas a precios, descargas |
| Ajuste (fit) | 25 | industria objetivo, tamaño de empresa, zona de operación |
| Intención | 20 | solicitó cotización, preguntó precios, mencionó plazo |
| Interacción | 15 | respondió, contestó llamada, aceptó reunión |
| Recencia | 10 | penaliza silencio prolongado |

La API devuelve `score` **y** `score_motivos`, un arreglo de
`{ etiqueta, puntos, detalle }`. La interfaz muestra el número y, al pasar el
cursor, el desglose: *"Abrió el correo 5 veces · +12"*. Nunca un número sin
justificación.

### 5.3 Copiloto con herramientas

El copiloto no recibe un volcado de la base de datos en el prompt. Declara
**herramientas** (`ia/herramientas.js`) que son funciones de `servicios/`:

`oportunidades_por_cerrar`, `cuentas_sin_seguimiento`, `conversion_por_vendedor`,
`resumen_de_hoy`, `pronostico`, `riesgos_detectados`, `buscar_entidad`,
`redactar_correo`, `generar_propuesta`, `siguiente_mejor_accion`.

Ciclo: pregunta → Claude elige herramienta → el servicio devuelve datos reales →
Claude redacta. Sin API key, un clasificador de intenciones enruta la pregunta a
la misma herramienta y la respuesta se arma con plantillas. **Las diez preguntas
de ejemplo del pliego funcionan en ambos modos.**

### 5.4 Automatización de leads entrantes

`POST /api/v1/leads` (formulario, landing o webhook) dispara, en una transacción:

```
lead entra
   ├─ normaliza empresa · deduce industria y tamaño
   ├─ calcula score + motivos (motor)
   ├─ clasifica intención · urgencia · prioridad
   ├─ asigna ejecutivo (round-robin ponderado por carga y zona)
   ├─ crea actividades de seguimiento con vencimiento
   ├─ genera insight de siguiente mejor acción
   ├─ escribe bitácora + notificación al ejecutivo
   └─ dispara automatizaciones con evento `lead.creado`
```

---

## 6. Seguridad

- **Sesiones**: cookie `HttpOnly` + `SameSite=Lax`, token de 32 bytes aleatorios
  guardado *hasheado* (SHA-256) en `sesiones`; el token en claro nunca toca la BD.
- **Contraseñas**: `scrypt` con sal por usuario y comparación en tiempo constante
  (`timingSafeEqual`), igual que el sistema de guías existente.
- **Roles**: `admin`, `gerente`, `ejecutivo`, `marketing`, `soporte`. El middleware
  `exigirRol()` protege escrituras sensibles; los ejecutivos ven su cartera y los
  gerentes la del equipo.
- **Bloqueo por fuerza bruta**: 10 intentos fallidos → 15 minutos de bloqueo.
- **SQL**: exclusivamente consultas parametrizadas. El ordenamiento dinámico se
  resuelve contra una lista blanca de columnas, nunca por interpolación.
- **Límite de peticiones** en `/auth/login` y en `/ia/*` (el más costoso).
- **La IA hereda permisos**: las herramientas del copiloto reciben el usuario de la
  sesión y filtran por él. No hay escalada de privilegios vía chat.

---

## 7. Rendimiento

| Técnica | Dónde |
| --- | --- |
| Agregación en SQL con `FILTER (WHERE …)` | dashboard, reportes, embudo |
| Índices compuestos por patrón de acceso | ver `MODELO-DATOS.md` §4 |
| Caché por clave + `staleTime` | TanStack Query en todo el frontend |
| División de código por módulo | `React.lazy` en cada ruta |
| Animaciones solo `transform`/`opacity` | kit de movimiento (§ diseño) |
| `content-visibility` en listas largas | tablas y kanban |
| Skeletons con la geometría real | evita salto de diseño al cargar |
| `prefers-reduced-motion` respetado | todo el sistema de movimiento |

---

## 8. Decisiones técnicas y sus alternativas

| Decisión | Alternativa descartada | Motivo |
| --- | --- | --- |
| Kit de gráficas SVG propio | Recharts / Chart.js | Las librerías tienen una estética reconocible y genérica; el pliego pide que nada se vea genérico. El kit propio pesa ~14 kB y anima con `framer-motion`. |
| SQL directo con `pg` | Prisma / TypeORM | El valor del producto está en agregaciones analíticas; un ORM las esconde y las hace lentas. El SQL explícito es auditable. |
| Motor determinista + LLM redactor | Todo al LLM | Un CRM no puede alucinar cifras de venta. |
| Tailwind 4 con `@theme` | CSS-in-JS | Cero coste en tiempo de ejecución y los tokens quedan en un solo archivo. |
| Drag & drop propio (pointer events) | dnd-kit | Control total del *feel* (elevación, inclinación, imán de columna) con ~150 líneas. |
| Cookie `HttpOnly` | JWT en `localStorage` | Inmune a robo por XSS. |

---

## 9. Convenciones de código

- **Dominio en español** (`cuentas`, `oportunidades`, `cotizaciones`), igual que el
  sistema de guías existente. Andamiaje técnico en inglés cuando es idiomático
  (`useQuery`, `props`).
- **API**: recursos en plural, `snake_case` en JSON (coincide con las columnas, lo
  que elimina una capa de mapeo). Fechas ISO 8601 en UTC.
- **Errores**: `{ error: { codigo, mensaje, detalles? } }` con HTTP correcto.
  `ErrorHTTP` en `lib/errores.js` es la única forma de fallar deliberadamente.
- **Dinero**: enteros en centavos en la BD (`bigint`), formateado en el borde.
  Nunca aritmética de punto flotante sobre importes.
- **Frontend**: un módulo = una carpeta con `Pagina*.tsx` + componentes locales.
  Nada de carpetas globales de "componentes varios".

---

## 10. Nota sobre dependencias

`npm audit` reporta un aviso *high* en `react-router` (7.12–8.2): *RSC Mode CSRF
Bypass*. Aplica exclusivamente al modo **React Server Components / Server
Actions**. Aura es una SPA con `createBrowserRouter` y sin servidor de React, por
lo que la ruta de código afectada nunca se carga. Se eligió la versión más
reciente a propósito: las versiones anteriores (≤ 7.17) sí traen fallos
explotables desde el cliente (XSS y *open redirect* en `<Link>`/`useNavigate`) que
sí afectarían a una SPA. Revisar en cada actualización.
