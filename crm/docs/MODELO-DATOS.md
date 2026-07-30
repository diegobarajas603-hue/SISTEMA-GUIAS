# Aura CRM — Modelo de datos

33 tablas en PostgreSQL 16. DDL completo y ejecutable:
[`api/src/db/esquema.sql`](../api/src/db/esquema.sql) — verificado contra un
Postgres real y **idempotente** (se puede reaplicar sin error).

---

## 1. Reglas transversales

| Regla | Motivo |
| --- | --- |
| Importes en `BIGINT` de **centavos** | Cero errores de redondeo. `NUMERIC` sería correcto pero más lento en agregados; el punto flotante es inaceptable para dinero. |
| Enumeraciones como `TEXT` + `CHECK` | Añadir un valor es un `ALTER … DROP/ADD CONSTRAINT`, no un `ALTER TYPE` que bloquea la tabla. |
| `TIMESTAMPTZ` siempre en UTC | El formateo y la zona son del cliente. |
| `JSONB` solo para lo genuinamente variable | `score_motivos`, `ia_riesgos`, `nodos` de automatización, `metadata` de bitácora. Nunca para datos que se filtran u ordenan. |
| `TEXT[]` para etiquetas | Evita una tabla puente para algo que solo se lee y filtra con `&&`. |
| Borrado en cascada desde la cuenta | Borrar una cuenta limpia su universo. Los catálogos usan `RESTRICT`. |

---

## 2. Grupos de tablas

### 2.1 Organización (4)

| Tabla | Rol |
| --- | --- |
| `equipos` | Agrupación por zona (MTY / CDMX / Nacional). |
| `usuarios` | Personas, rol, zona, meta mensual, `preferencias` JSONB (tema, widgets). |
| `sesiones` | PK = **SHA-256 del token**. El token en claro nunca se persiste. |
| `metas` | Objetivo por usuario/equipo, mes y tipo. Única por combinación. |

### 2.2 Comercial (4)

| Tabla | Rol |
| --- | --- |
| `cuentas` | Empresa. `tipo` distingue prospecto/cliente/inactivo. Lleva `salud`, `riesgo_churn`, `ingresos_ano`, `valor_vida` — precalculados por el motor de IA para que las listas no recalculen nada. |
| `contactos` | Personas de la cuenta, con `rol_compra` (decisor, campeón, bloqueador…) para el mapa de poder. |
| `leads` | Prospecto sin calificar. Contiene la clasificación de IA: `score`, `score_motivos`, `temperatura`, `intencion`, `urgencia`, `prioridad`. |
| `senales` | Materia prima del score: aperturas, clics, visita a precios, descargas, llamadas atendidas. 13 tipos con `peso`. |

### 2.3 Pipeline y catálogo (5)

`productos` · `oportunidades` · `oportunidad_productos` · `etapa_historial` ·
(más `cotizaciones`, abajo)

`oportunidades` guarda **dos probabilidades a propósito**:
`probabilidad` (la que declara el vendedor) e `ia_probabilidad` (la que calcula el
motor). Mostrar ambas es lo que permite decir *"tú dices 80%, el modelo dice 45%,
y estas son las razones"* — el tipo de fricción útil que un CRM debe crear.

`etapa_historial` registra cada cambio de etapa con `dias_en_anterior`. De ahí
salen sin esfuerzo: velocidad de pipeline, tiempo de cierre por etapa, y la
detección de oportunidades estancadas.

### 2.4 Cotizaciones (2)

`cotizaciones` (folio, estados `borrador→enviada→vista→aceptada/rechazada/vencida`,
totales desglosados) · `cotizacion_items` (línea con descuento e importe).

El estado `vista` existe porque saber que el cliente **abrió** la cotización y no
respondió es una de las señales de compra más fuertes que hay.

### 2.5 Registro de actividad (5)

`actividades` · `notas` · `archivos` · `contratos` · `facturas`

`actividades` es polimórfica por columnas nulables (`cuenta_id`, `lead_id`,
`oportunidad_id`, `ticket_id`, `contacto_id`) en lugar de un par
`entidad_tipo/entidad_id`. Es deliberado: permite **integridad referencial real** y
`JOIN` directos, a cambio de columnas nulas. En un CRM donde la actividad se
consulta desde cinco vistas distintas, los `JOIN` importan más que la elegancia.
`origen` distingue `manual` / `ia` / `automatizacion`, que es lo que hace medible
el valor de la automatización.

### 2.6 Atención al cliente (4)

`tickets` · `ticket_mensajes` · `articulos_kb` (+ `actividades` compartida)

`tickets` incorpora SLA calculado (`sla_horas`, `sla_vence_en`,
`primera_respuesta_en`), `sentimiento`, `csat`, `ia_sugerencia` e `ia_resuelto`.
`guia_relacionada` es el puente explícito con el **sistema de guías** existente:
un ticket de "¿dónde va mi carga?" queda ligado al número de guía.

`ticket_mensajes.autor_tipo` incluye `ia`, de modo que la conversación muestre con
transparencia qué respondió la IA y qué un agente.

### 2.7 Marketing (4)

`campanas` · `envios_email` · `segmentos` · `landing_pages`

El ROI **no se almacena**: se calcula. `campanas.costo` contra la suma de
`oportunidades.monto` con `estado='ganada'` atribuidas a esa campaña vía
`campana_id` en `leads` y `oportunidades`. Un ROI guardado se queda obsoleto en
cuanto se cierra un trato.

`segmentos.definicion` es un árbol de reglas JSONB que el backend traduce a `WHERE`
con lista blanca de columnas y operadores. Nunca se interpola texto del usuario.

### 2.8 Automatizaciones (2)

`automatizaciones` (`evento` disparador, `condiciones`, `nodos`, `aristas` — el
grafo que dibuja el editor visual) · `automatizacion_ejecuciones` (traza paso a
paso con duración y error, para poder depurar un flujo sin leer código).

### 2.9 Transversales (2)

| Tabla | Rol |
| --- | --- |
| `bitacora` | **Cronología unificada.** Toda escritura relevante escribe aquí. La ficha 360, el detalle de oportunidad y el feed del dashboard son la misma consulta con distinto filtro. |
| `notificaciones` | Bandeja por usuario, con `tipo` `ia` para las que genera el motor. |

### 2.10 Capa de IA (3)

| Tabla | Rol |
| --- | --- |
| `ia_insights` | Hallazgos accionables: riesgo, venta cruzada, churn, estancada, NBA, reactivación. Cada uno con `explicacion`, `confianza`, `impacto` (dinero en juego), `severidad` y `acciones` ejecutables. `estado` permite descartar y aprender. |
| `ia_conversaciones` / `ia_mensajes` | Historial del copiloto. `ia_mensajes.datos` guarda las herramientas usadas y las tablas/gráficas devueltas, para poder re-renderizar una respuesta sin volver a llamar al modelo. |

---

## 3. El vocabulario de etapas compartido

Leads y oportunidades comparten una sola escala:

```
lead → contacto → calificado → propuesta → negociacion → ganado
                                                       ↘ perdido
```

- `leads.etapa` opera en `lead · contacto · calificado · perdido`.
- `oportunidades.etapa` opera en `calificado · propuesta · negociacion · ganado · perdido`.
- Ambas tablas mantienen además **`etapa_max`**: la etapa más avanzada alcanzada.

Esto último es la diferencia entre un embudo decorativo y uno correcto. El conteo
por `etapa` es una foto del presente (cuántos hay *ahora* en negociación); el
conteo por `etapa_max` da la **conversión real** (de 100 leads, cuántos llegaron
alguna vez a propuesta). El dashboard muestra las dos cosas, y los porcentajes de
conversión salen de `etapa_max`.

---

## 4. Estrategia de índices

97 índices, todos derivados de un patrón de acceso concreto. Los que importan:

| Índice | Consulta que resuelve |
| --- | --- |
| `ix_oport_estancadas` (parcial, `estado='abierta'`) | detección de estancamiento, sin tocar cerradas |
| `ix_oport_cierre` (parcial) | pronóstico del trimestre |
| `ix_tickets_sla` (parcial, estados abiertos) | semáforo de SLA en la bandeja |
| `ix_cuentas_churn` (parcial, `tipo='cliente'`) | top de riesgo de fuga |
| `ix_act_pendientes` (parcial, `estado='pendiente'`) | "actividades de hoy" y vencidas |
| `ix_bitacora_entidad` | cronología de cualquier ficha |
| `ix_*_nombre` sobre `lower(nombre)` | búsqueda global ⌘K sin escaneo completo |

Los índices **parciales** son la decisión clave: en un CRM el 90 % de las consultas
tocan solo los registros abiertos/activos, que con el tiempo son una fracción
pequeña de la tabla. Un índice parcial se mantiene chico para siempre.

---

## 5. Datos semilla

`api/src/db/semilla.js` genera **18 meses de historia coherente**, no ruido
aleatorio:

- 9 usuarios en 3 equipos (MTY, CDMX, Nacional) con metas mensuales.
- 10 servicios de carga reales de Fletes Tauro (consolidado, FTL, LTL, última
  milla, refrigerado, cross-docking, almacenaje, dedicado, express, proyecto).
- ~140 cuentas con industria, tamaño y zona verosímiles.
- ~260 contactos con rol de compra.
- ~320 leads con señales de comportamiento que **justifican** su score.
- ~420 oportunidades con historial de etapas, productos y fechas coherentes.
- Cotizaciones, facturas, contratos, tickets con SLA, campañas con envíos,
  actividades pasadas y futuras, automatizaciones de ejemplo, y bitácora completa.

La semilla es **determinista** (PRNG con semilla fija): dos ejecuciones producen la
misma base. Eso hace que las capturas, las demos y las pruebas sean reproducibles.
