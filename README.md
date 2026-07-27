# CRM de Ventas — Fletes Tauro

Sistema de ventas para gestionar la relacion con los clientes de Fletes
Tauro: pipeline de prospectos, cotizaciones con folio y PDF con logotipo,
envio por correo y WhatsApp, tareas con recordatorios, servicios
realizados y reportes comerciales calculados con informacion real.
Pensado para un equipo de hasta 10 personas con usuarios y roles, y con
diseño adaptable a celular.

## Que incluye

- **Panel operativo**: KPIs del dia (prospectos activos, cotizaciones
  abiertas y su monto, ganado del mes, venta del mes, pendientes), mis
  tareas, cotizaciones por vencer, proximos servicios, embudo y bitacora
  de actividad del equipo.
- **Pipeline**: tablero kanban por etapas (nuevo → contactado →
  calificado → propuesta → negociacion → ganado / perdido) con arrastrar
  y soltar en computadora y "Mover a..." en celular.
- **Prospectos y clientes**: registro completo de empresas con RFC, giro,
  origen del prospecto, direccion, vendedor asignado y notas; contactos
  ilimitados por empresa con botones directos para llamar, WhatsApp y
  correo.
- **Historial real**: cada llamada, mensaje, correo, reunion, visita,
  nota, cambio de etapa, cotizacion, envio y conversion queda registrado
  con usuario, fecha y hora en la linea de tiempo de la empresa.
- **Cotizaciones** con el flujo: cliente → ruta y carga → servicio y
  unidad → costos adicionales → precio e impuestos → vista previa →
  PDF/envio. Formato completo: cliente, origen, destino, tipo de unidad,
  mercancia, peso, maniobras, seguro, otros cargos, tarifa, IVA,
  retencion de IVA (4% fletes), vigencia y condiciones.
  - Folio consecutivo automatico (`COT-2026-0001`).
  - PDF profesional con el logotipo de Fletes Tauro e importe con letra.
  - Envio por **correo** (SMTP, con el PDF adjunto) y por **WhatsApp**
    (liga wa.me con el mensaje listo y liga publica del PDF; envio
    directo opcional con la API de WhatsApp Business).
  - Estatus: borrador, enviada, aceptada, rechazada, vencida (automatico
    al pasar la vigencia) y convertida. Duplicar para renegociar.
- **Conversion a servicio**: una cotizacion aceptada se convierte en
  servicio con folio `SRV-2026-0001`; el prospecto pasa a cliente en
  automatico.
- **Servicios realizados**: programado → en transito → entregado →
  facturado → pagado (o cancelado), con operador, fechas, factura y
  venta; tambien alta directa sin cotizacion.
- **Tareas completables y recordatorios**: con vencimiento, prioridad,
  responsable y liga a la empresa; agrupadas en vencidas / hoy /
  proximas.
- **Reportes comerciales** con datos reales y rango de fechas:
  cotizaciones emitidas vs ganadas, tasa de conversion, venta por mes,
  desempeno por vendedor, top de clientes, rutas mas vendidas, embudo;
  exportables a CSV.
- **Busqueda global y altas rapidas**: buscador de empresas, contactos y
  folios en la barra superior, y boton "+" para capturar prospecto,
  cotizacion, tarea, actividad o servicio desde cualquier pantalla.
- **Catalogos**: rutas (origen-destino), tipos de unidad con capacidad,
  tarifas base por ruta+unidad (el asistente las sugiere solo) y
  vendedores.
- **Usuarios y roles** para las 10 personas:
  - `admin`: todo, incluidos usuarios, configuracion y eliminaciones.
  - `gerente`: ve y edita todo, administra catalogos y reasigna vendedores.
  - `vendedor`: captura y da seguimiento a sus empresas y cotizaciones.
- **Base de datos persistente** en SQLite (archivo local, sin instalar
  nada extra).

## Instalacion

Requiere **Node.js 22.5 o mas nuevo** (usa el SQLite integrado de Node).

```bash
npm install
cp .env.example .env   # edita al menos ADMIN_PASSWORD
npm start
```

Abre `http://localhost:3000`. La primera vez se crean los catalogos
iniciales y el usuario administrador (`ADMIN_USER` / `ADMIN_PASSWORD` del
`.env`; por defecto `admin` / `admin123` — **cambiala de inmediato**).

Despues de entrar:

1. **Configuracion** → captura los datos fiscales de la empresa (salen en
   el PDF), el correo SMTP y, si quieres ligas de PDF por WhatsApp, la
   URL publica del sistema.
2. **Usuarios** → da de alta a las 10 personas con su rol.
3. **Catalogos** → revisa rutas y unidades, y captura tus tarifas base.
4. A vender: registra prospectos y haz tu primera cotizacion.

## Variables de entorno

| Variable | Para que sirve |
| --- | --- |
| `PORT` | Puerto del servidor (3000 por defecto) |
| `DB_PATH` | Archivo de la base de datos (por defecto `data/tauro-crm.db`) |
| `BASE_URL` | URL publica del sistema; habilita la liga del PDF en WhatsApp/correo |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Administrador inicial (solo primera vez) |
| `SESSION_HOURS` | Duracion de la sesion (12 h por defecto) |
| `SMTP_HOST/PORT/SECURE/USER/PASS`, `CORREO_DE` | Correo saliente; tambien se captura en el panel (el panel tiene prioridad) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Opcional: envio directo por la API de WhatsApp Business (Meta) |

## Envio por WhatsApp

Funciona de dos formas:

1. **Sin configurar nada**: el sistema abre WhatsApp con el mensaje ya
   escrito (folio, ruta, unidad, total y vigencia). Si capturaste
   `BASE_URL`, el mensaje incluye una liga publica y segura para que el
   cliente descargue el PDF (`/cotizacion/<token>.pdf`, con token
   aleatorio no adivinable).
2. **Con la API de WhatsApp Business (opcional)**: capturando token y
   Phone Number ID en Configuracion, el boton "Enviar directo (API)"
   manda el PDF al cliente sin abrir WhatsApp.

## Despliegue (Railway / Render / VPS)

- El servidor es un solo proceso Node (`npm start`).
- La base es un archivo SQLite: monta un **volumen persistente** y apunta
  `DB_PATH` ahi (por ejemplo `/data/tauro-crm.db`) para no perder datos
  entre despliegues.
- Define `BASE_URL` con tu dominio para las ligas de PDF.

## API

Toda la API vive bajo `/api` y requiere `Authorization: Bearer <token>`
(el token lo da `POST /api/auth/login`). Recursos principales:
`/api/empresas`, `/api/contactos`, `/api/actividades`, `/api/tareas`,
`/api/cotizaciones` (con `/pdf`, `/enviar-correo`, `/whatsapp`,
`/convertir`, `/duplicar`), `/api/servicios`, `/api/rutas`,
`/api/unidades`, `/api/tarifas`, `/api/reportes/resumen`,
`/api/reportes/comercial`, `/api/buscar`, `/api/usuarios`,
`/api/configuracion`. La unica ruta publica es
`GET /cotizacion/<token>.pdf`.

## Estructura

```
src/
  server.js        servidor Express y montaje de rutas
  db.js            esquema SQLite, semillas y helpers
  util.js          fechas de Mexico, dinero, importe con letra, scrypt
  auth.js          login, sesiones, roles y usuarios
  empresas.js      prospectos/clientes, contactos, pipeline, historial
  tareas.js        tareas y recordatorios
  cotizaciones.js  folios, totales, PDF, correo, WhatsApp, conversion
  servicios.js     servicios realizados
  catalogos.js     rutas, unidades y tarifas
  reportes.js      panel operativo, reporte comercial y busqueda global
  config.js        configuracion editable desde el panel
  pdf.js           PDF de cotizacion con el logotipo
  correo.js        envio SMTP (nodemailer)
public/            aplicacion web (SPA sin dependencias, adaptable a celular)
```
