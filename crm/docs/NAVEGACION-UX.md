# Aura CRM — Navegación y experiencia de usuario

---

## 1. Mapa de rutas

```
/entrar                          acceso (fuera del shell)

/                                Dashboard inteligente
/prospectos                      Kanban · Tabla · Tarjetas · Cronología
/prospectos/:id                  ficha de prospecto (panel lateral o página)
/clientes                        cartera de cuentas
/clientes/:id                    FICHA 360 — todo en una pantalla
/oportunidades                   pipeline visual (tablero · tabla · pronóstico)
/oportunidades/:id               detalle con análisis de IA
/cotizaciones                    listado y cotizador
/cotizaciones/:id                editor de cotización
/marketing                       campañas · ROI · embudos
/marketing/campanas/:id          detalle de campaña
/marketing/segmentos             constructor de segmentos
/soporte                         bandeja de tickets con SLA
/soporte/:id                     conversación del ticket
/soporte/conocimiento            base de conocimiento
/agenda                          calendario mes · semana · agenda
/reportes                        analítica interactiva
/automatizaciones                lista de flujos
/automatizaciones/:id            editor visual de flujo
/ia                              copiloto a pantalla completa
/ajustes                         perfil · equipo · catálogo · integraciones
```

Cada ruta es un `React.lazy` independiente: entrar a Aura descarga el shell y el
dashboard, nada más.

---

## 2. Anatomía del shell

```
┌──────────────┬──────────────────────────────────────────────────────────┐
│              │  ⌘K Buscar…    ·   filtros contextuales   ·  🔔  ✨  ⏻   │ ← topbar (glass, fija)
│   AURA       ├──────────────────────────────────────────────────────────┤
│              │                                                          │
│  Dashboard   │                                                          │
│  Prospectos  │              CONTENIDO DEL MÓDULO                        │
│  Clientes    │                                                          │
│  Oportunid.  │                                                          │
│  Cotizacion. │                                                          │
│  ─────────── │                                                          │
│  Marketing   │                                                          │
│  Soporte     │                                                          │
│  Agenda      │                                                          │
│  ─────────── │                                                          │
│  Reportes    │                                                          │
│  Automatiz.  │                                                          │
│              │                                                          │
│  ▸ usuario   │                                                          │
└──────────────┴──────────────────────────────────────────────────────────┘
                                                    ┌───────────────────┐
                                                    │  ✨ COPILOTO      │ ← panel deslizante
                                                    │  disponible en    │    (⌘J), consciente
                                                    │  cualquier ruta   │    del contexto
                                                    └───────────────────┘
```

- **Sidebar**: tres grupos (Ventas · Relación · Inteligencia). El indicador de ruta
  activa es una barra que **se desliza** entre elementos con un `layoutId` de
  framer-motion — no aparece y desaparece. Contadores en vivo (tickets vencidos,
  actividades de hoy) con badge.
- **Topbar**: glass con desenfoque de 20 px; al hacer *scroll* gana borde inferior y
  la sombra entra progresivamente. Los filtros del módulo viven aquí, no dentro del
  contenido, para que la posición de los controles sea siempre la misma.
- **Copiloto**: `⌘J` desde cualquier parte. Recibe la ruta y la entidad abierta como
  contexto, así que "¿qué hago con este cliente?" ya sabe cuál es *este*.

---

## 3. Paleta de comandos (⌘K)

El acelerador central del producto. Una sola caja resuelve tres cosas:

1. **Buscar** en cuentas, contactos, leads, oportunidades, cotizaciones y tickets
   (una consulta al servidor, resultados agrupados, con desambiguación por empresa).
2. **Navegar** a cualquier módulo.
3. **Ejecutar**: crear prospecto, registrar llamada, nueva cotización, cambiar tema,
   preguntar a la IA.

Detalles que la hacen sentir nativa: entrada con desenfoque y escala desde 0.97;
navegación con ↑↓ que **sigue** al ratón; `Enter` ejecuta, `⌘Enter` abre en panel
lateral; secciones con encabezado en versalitas; atajo mostrado a la derecha de cada
acción; coincidencia difusa que resalta los caracteres coincidentes.

**Atajos globales**: `⌘K` paleta · `⌘J` copiloto · `⌘\` colapsar sidebar ·
`G` luego `D/P/C/O/A/R` para saltar de módulo · `N` nuevo en el módulo actual ·
`?` lista de atajos · `Esc` cierra la capa superior.

---

## 4. Flujos clave

### 4.1 Lead entrante → oportunidad (el flujo que define el producto)

```
① Llega el lead (formulario, landing, WhatsApp o carga manual)
        │
        ▼
② La IA lo procesa en < 1 s, en una sola transacción:
   score 0-100 con motivos · industria y tamaño deducidos · intención ·
   urgencia · prioridad · ejecutivo asignado por carga y zona ·
   actividades de seguimiento creadas · siguiente mejor acción sugerida
        │
        ▼
③ El ejecutivo recibe notificación y lo ve arriba del kanban,
   con el score y su explicación visible sin abrir nada
        │
        ▼
④ Un clic en «Contactar» → el copiloto redacta el correo con el
   contexto real (señales, industria, servicio de interés)
        │
        ▼
⑤ Al calificarlo: «Convertir» crea cuenta + contacto + oportunidad,
   arrastra la cronología completa y no pide re-escribir ni un dato
```

Coste para el ejecutivo: **dos clics** desde lead frío hasta oportunidad con
cronología, contra los ~12 de un CRM tradicional.

### 4.2 La ficha 360 del cliente

Todo en una pantalla, tres columnas, sin pestañas que escondan información:

| Izquierda (280 px) | Centro (fluido) | Derecha (340 px) |
| --- | --- | --- |
| Identidad, salud, riesgo de fuga, propietario, datos fiscales, etiquetas, contactos con rol de compra | **Cronología unificada** con filtros por tipo (llamadas, correos, WhatsApp, notas, cambios de etapa, tickets) + composición rápida | Panel de IA: riesgo de churn con motivos, venta cruzada sugerida, siguiente mejor acción; luego oportunidades abiertas, cotizaciones, facturas, contratos, tickets, archivos |

La cronología es la misma consulta a `bitacora` que alimenta el dashboard, filtrada
por `cuenta_id`. Una implementación, tres usos.

### 4.3 Pipeline de oportunidades

Tablero por etapa con encabezados que suman monto y conteo. Arrastrar una tarjeta:
la columna destino se ilumina, la tarjeta se inclina 2° y se eleva, el imán la
encaja. Al soltar, la etapa se actualiza de forma **optimista** y el historial se
registra; si el servidor rechaza, la tarjeta regresa con una animación de resorte.

Cada tarjeta muestra monto, días en etapa (ámbar > 14, rojo > 30), probabilidad del
vendedor **y** de la IA cuando difieren más de 20 puntos, y avatar del propietario.

### 4.4 El copiloto

`⌘J` abre el panel. Sugerencias iniciales según la ruta. La respuesta llega en
*streaming*, y cuando trae datos tabulares se renderiza como **tabla o gráfica real
dentro del chat**, con cada fila enlazada a su ficha. Toda cifra que menciona lleva
al lado su fuente ("3 oportunidades · $2.4 M · ver"), porque una respuesta sin
trazabilidad no es utilizable en una junta.

---

## 5. Detalles que enamoran

Los pequeños comportamientos, listados porque son el encargo explícito:

- **Contadores que animan** al montar y al cambiar de periodo, con `easeOutExpo`.
- **Gráficas que se dibujan** de izquierda a derecha, con el área rellenándose por
  detrás del trazo.
- **Skeletons con la geometría real** — cero salto de diseño.
- **Hover de fila**: fondo al 3 %, y las acciones aparecen deslizándose desde la
  derecha (no estaban ocultas con `opacity: 0` ocupando espacio: entran).
- **Indicador activo que se desliza** entre pestañas y elementos de menú.
- **Ondas de clic** desde el punto exacto del puntero.
- **Tooltips** que crecen 4 px desde el borde del elemento, con 400 ms de retardo al
  entrar y 0 al salir.
- **Insignias de IA** con gradiente azul→violeta y un destello que recorre el borde
  cuando el insight es nuevo.
- **Cambio de tema** con transición de vista cruzada, sin destello blanco.
- **Panel lateral** con resorte suave y fondo con desenfoque progresivo.
- **Arrastre de kanban** con inclinación, elevación e imán de columna.
- **Widgets del dashboard reordenables**, guardados en `usuarios.preferencias`.
- **Notificaciones** que entran desde la esquina con resorte y se apilan.
- **Vacíos ilustrados** distintos por módulo, nunca un "sin datos" gris.
- **Anillos de score** que dibujan su arco al aparecer, con el color según el tramo.

---

## 6. Rendimiento percibido

| Técnica | Efecto |
| --- | --- |
| Actualización optimista en arrastre, edición y completado | la interfaz responde en 0 ms |
| Precarga al pasar el cursor sobre un enlace de módulo | el módulo ya está cargado al hacer clic |
| `keepPreviousData` al cambiar filtros | no hay parpadeo a esqueleto |
| Esqueletos solo si la respuesta tarda > 180 ms | evita el destello en respuestas rápidas |
| Datos del dashboard en **una** petición agregada | una consulta SQL, no doce |
| `content-visibility: auto` en filas | listas largas sin coste de pintado |
