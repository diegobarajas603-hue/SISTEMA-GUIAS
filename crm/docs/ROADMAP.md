# Aura CRM — Plan de desarrollo por fases

Cada fase deja el producto **ejecutable y verificable**. No hay fases que dejen la
aplicación a medio arrancar.

---

## Fase 0 · Arquitectura y diseño ✅

Documentos de arquitectura, modelo de datos, sistema de diseño, navegación y este
plan. Elección de stack verificada con un *build* real antes de escribir producto
(Vite 8 · React 19 · TS 7 · Tailwind 4 · Postgres 16).

**Entregable**: `docs/` completo.

---

## Fase 1 · Datos ✅

Esquema de 33 tablas con 97 índices, migrador idempotente y generador de semilla
determinista con 18 meses de historia comercial coherente de Fletes Tauro.

**Verificación**: esquema aplicado dos veces contra Postgres 16 real sin error;
recuento de filas por tabla tras la semilla.

---

## Fase 2 · API ✅

Express en ESM: `config`, pool con helpers (`uno`, `muchos`, `tx`), middleware de
sesión (cookie `HttpOnly` + token *hasheado*), roles, límite de peticiones, manejo
central de errores. Servicios de dominio con todo el SQL. Routers por módulo.

**Verificación**: prueba de humo que recorre todos los endpoints autenticados.

---

## Fase 3 · Inteligencia ✅

Motor determinista (lead score explicable, probabilidad de cierre, pronóstico con
intervalo, estancamiento, churn, venta cruzada, *next best action*), proveedor
Claude opcional, copiloto con herramientas y respaldo por intenciones, redacción de
correos y propuestas.

**Verificación**: las diez preguntas del pliego respondidas con y sin `API_KEY`.

---

## Fase 4 · Sistema de diseño y shell ✅

Tokens en OKLCH, tema claro/oscuro, ~24 primitivos, kit de gráficas SVG propio,
shell (sidebar animada, topbar glass), paleta ⌘K, panel de copiloto, atajos
globales, notificaciones.

---

## Fase 5 · Dashboard ✅

Ventas del mes con gráfica animada, embudo de 6 etapas con conversión real,
pronóstico de IA con probabilidad de superar meta, actividades de hoy, objetivos con
progreso, ranking de vendedores, clientes nuevos e inactivos, oportunidades en
riesgo, próximas actividades.

---

## Fase 6 · Prospectos ✅

Cuatro vistas (Kanban con arrastre propio, Tabla ordenable, Tarjetas, Cronología),
filtros inteligentes, etiquetas, anillo de score con desglose, conversión en dos
clics, alta con procesamiento automático de IA.

---

## Fase 7 · Clientes y oportunidades ✅

Ficha 360 a tres columnas con cronología unificada. Pipeline visual con arrastre,
análisis de IA por oportunidad (probabilidad, riesgos, acciones), productos,
cotizador con folio, totales e impuestos.

---

## Fase 8 · Marketing · Soporte · Agenda ✅

Campañas con ROI calculado, envíos con métricas de embudo, segmentos, landings.
Bandeja de tickets con semáforo de SLA, conversación multicanal, sugerencia de IA,
base de conocimiento. Agenda con vistas mes/semana/agenda y panel de sincronización.

---

## Fase 9 · Reportes y automatizaciones ✅

Reportes interactivos (ingresos, embudo, conversión por vendedor, velocidad, mapa de
calor de actividad, pronóstico) con exportación CSV. Editor visual de flujos con
lienzo, nodos arrastrables, conexiones curvas, paleta de acciones y **ejecutor real**
en el backend con traza por paso.

---

## Fase 10 · Verificación y entrega ✅

`typecheck` sin errores, *build* de producción, prueba de humo de la API completa,
capturas de las pantallas principales en claro y oscuro, README de operación,
commit y push.

---

## Después de esta entrega

Lo que queda fuera del alcance de esta construcción y sería el siguiente paso
natural, en orden de valor:

1. **Integraciones reales de canal** — Gmail/Outlook (OAuth + sincronización
   bidireccional), WhatsApp Cloud API (reutilizando el webhook ya existente en el
   sistema de guías), Google/Outlook Calendar. La interfaz y el modelo ya están
   preparados; falta la capa de OAuth y los *webhooks*.
2. **Puente con el sistema de guías** — `tickets.guia_relacionada` ya existe; el
   siguiente paso es ligar cuentas del CRM con guías reales para que la ficha 360
   muestre los embarques en curso del cliente.
3. **Aprendizaje del scoring** — el motor es determinista y auditable. Con 6–12 meses
   de resultados reales se pueden recalibrar los pesos por regresión logística
   contra el cierre efectivo, conservando la explicabilidad.
4. **Pruebas automatizadas** — la prueba de humo cubre el contrato de la API; el
   siguiente nivel es Vitest para el motor de IA (funciones puras, ideales para
   pruebas de unidad) y Playwright para los flujos críticos.
5. **Multi-inquilino y auditoría** — RLS de Postgres por organización si el producto
   se ofrece a terceros.
6. **Adjuntos reales** — `archivos` guarda metadatos; falta el almacén (S3 o
   equivalente) con URLs firmadas.
