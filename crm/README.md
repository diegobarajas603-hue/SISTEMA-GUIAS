# Aura CRM · Fletes Tauro

Plataforma comercial inteligente construida desde cero: prospección, clientes 360,
pipeline, cotizaciones, marketing, soporte, agenda, reportes y un motor visual de
automatizaciones — con una capa de IA que atraviesa todo el producto.

Vive en `crm/` y no toca el sistema de guías existente del repositorio.

---

## Puesta en marcha

Requisitos: **Node 22+** y **PostgreSQL 16+**.

```bash
cd crm
npm install

# 1. Crea la base (una vez)
createdb aura_crm

# 2. Esquema + datos de demostración (18 meses coherentes)
npm run db:migrar
npm run db:semilla

# 3. API (:4100) y web (:5180) juntos
npm run dev
```

Al terminar la semilla imprime las credenciales de acceso. Por omisión:

| Usuario | Rol |
| --- | --- |
| `sistemas1@fletestauro.com.mx` | Administrador |
| `mariana.trevino@fletestauro.com.mx` | Gerente comercial (MTY) |
| `ricardo.elizondo@fletestauro.com.mx` | Gerente comercial (CDMX) |

Contraseña de demostración: `Aura2026!` (configurable con `CRM_DEMO_PASSWORD`).

> `npm run db:reiniciar` recrea el esquema y vuelve a sembrar. La semilla es
> determinista: la misma `CRM_SEED` produce exactamente los mismos datos.

---

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | API + web con recarga en caliente |
| `npm run dev:api` / `npm run dev:web` | Cada uno por separado |
| `npm run build` | Compila el frontend a `web/dist` |
| `npm start` | Sirve la API en modo producción |
| `npm run typecheck` | TypeScript en modo estricto, sin emitir |
| `npm run prueba:api` | 106 casos contra la API en marcha |
| `npm run prueba:importacion` | 20 casos del importador de clientes |
| `npm run prueba:ui` | Recorre la app en Chromium y captura pantallas |
| `npm run prueba:ui:importacion` | Recorre el asistente de importación en navegador |
| `npm run prueba:rendimiento` | Importa 50 000 clientes y mide bloqueos de interfaz |
| `npm run pruebas:archivos` | Genera los Excel de prueba (100 a 50 000 filas) |
| `npm run db:migrar` · `db:semilla` · `db:reiniciar` | Base de datos |

Las pruebas necesitan la API (`:4100`) levantada; `prueba:ui` además el front (`:5180`).

---

## Configuración

Todo tiene un valor por omisión razonable; solo se define lo que se quiera cambiar.

| Variable | Por omisión | Para qué |
| --- | --- | --- |
| `CRM_DATABASE_URL` | `postgres://postgres@localhost:5432/aura_crm` | Conexión a Postgres |
| `PORT` | *(la plataforma)* | Puerto de escucha; gana sobre `CRM_PORT` |
| `CRM_PORT` | `4100` | Puerto en local |
| `CRM_SESSION_HOURS` | `12` | Duración de la sesión |
| `CRM_COOKIE_SECURE` | `true` en producción | Cookie solo por HTTPS |
| `ANTHROPIC_API_KEY` | *(vacío)* | Activa la redacción generativa |
| `CRM_IA_MODELO` | `claude-sonnet-5` | Modelo para redacción |
| `CRM_DEMO_PASSWORD` | `Aura2026!` | Contraseña de los usuarios sembrados |
| `CRM_SEED` | `20260729` | Semilla del generador de datos |
| `CRM_SEMILLA_INICIAL` | `0` | Con `1`, siembra al arrancar si la base está vacía |
| `CRM_ADMIN_EMAIL` | — | Crea el administrador inicial si la base está vacía |
| `CRM_ADMIN_PASSWORD` | — | Su contraseña |
| `CRM_ADMIN_NOMBRE` | `Administrador` | Su nombre visible |
| `CRM_REINICIAR_BASE` | — | Vacía la base una vez; recuerda la palabra usada |
| `CRM_DB_SSL` | *(automático)* | TLS a Postgres; se detecta solo, defínelo solo para forzarlo |

### Sobre la IA

**Sin `ANTHROPIC_API_KEY` el producto funciona completo.** Esa es una decisión de
diseño, no una limitación: los números —lead score, pronóstico, probabilidad de
cierre, riesgo de fuga, siguiente mejor acción— los calcula siempre el motor
determinista de `api/src/ia/motor.js` sobre la base de datos. El modelo de lenguaje
solo redacta el texto que los acompaña. Sin clave, esa redacción usa plantillas y un
clasificador de intenciones; el copiloto responde igual las mismas preguntas.

Dicho de otro modo: **el modelo redacta, nunca calcula**. Ningún número que ve el
usuario sale de un modelo generativo.

---

## Desplegar en Railway

El repositorio ya trae `crm/railway.json` con el build, el arranque y el chequeo
de salud. Faltan cuatro pasos en el panel de Railway:

1. **Crea el servicio desde GitHub**, apuntando a la rama del proyecto, y en
   *Settings → Root Directory* escribe `crm`. Es imprescindible: la aplicación
   vive en esa subcarpeta, no en la raíz del repositorio.
2. **Añade un Postgres** al proyecto y enlázalo al servicio. Railway inyecta
   `DATABASE_URL`; la API la toma sola y activa TLS por su cuenta.
3. **Define las variables** del servicio:

   | Variable | Valor | Para qué |
   | --- | --- | --- |
   | `NODE_ENV` | `production` | Cookies solo por HTTPS y activos cacheados |
   | `CRM_SEMILLA_INICIAL` | `1` | Siembra la demostración en el primer arranque |
   | `CRM_DEMO_PASSWORD` | *(la que elijas)* | Contraseña de los usuarios sembrados |

   Si prefieres arrancar **sin datos de demostración**, deja `CRM_SEMILLA_INICIAL`
   en `0` y define en su lugar `CRM_ADMIN_EMAIL` y `CRM_ADMIN_PASSWORD`: el primer
   arranque crea ese administrador y desde ahí se da de alta al resto del equipo.
   Una de las dos cosas hace falta, o nadie podrá iniciar sesión.

   | Variable | Valor | Para qué |
   | --- | --- | --- |
   | `ANTHROPIC_API_KEY` | *(opcional)* | Activa la redacción generativa |

   **No definas `PORT`**: lo inyecta Railway y el proceso lo respeta.
4. **Genera el dominio** en *Settings → Networking → Generate Domain*.

El esquema se aplica solo en cada arranque, así que no hay paso de migración
manual. `CRM_SEMILLA_INICIAL=1` solo actúa si la base está vacía: en cuanto haya
un usuario real deja de hacer nada, y conviene ponerlo en `0`.

Para cargar tu cartera de verdad, entra a **Clientes → Importar Excel** en la
instancia desplegada en lugar de sembrar.

---

## Arrancar de cero con tus datos

Los datos de demostración sirven para conocer el sistema; para operar de verdad
conviene empezar limpio.

1. **Vacía la base.** En las variables del servicio define
   `CRM_REINICIAR_BASE` con cualquier palabra, por ejemplo `empezar-limpio`.
   El siguiente arranque borra todo y **registra esa palabra**: dejar la variable
   puesta ya no vuelve a borrar nada. Para volver a vaciar, cámbiala.
2. **Créate como administrador.** Quita `CRM_SEMILLA_INICIAL` (o ponla en `0`) y
   define `CRM_ADMIN_EMAIL` y `CRM_ADMIN_PASSWORD`. Al arrancar con la base vacía
   se crea esa cuenta.
3. **Da de alta a tu equipo** en *Ajustes → Equipo*. Crea primero los equipos por
   zona y luego a cada persona: el sistema genera una contraseña inicial que le
   pasas y que podrá cambiar al entrar.
4. **Carga tu catálogo** en *Ajustes → Servicios*, con precio y costo por unidad.
   El margen se calcula solo. Sin catálogo no se pueden armar cotizaciones.
5. **Importa tu cartera** en *Clientes → Importar Excel*.

Después del primer arranque conviene quitar `CRM_ADMIN_PASSWORD` de las variables
y cambiar la contraseña desde *Ajustes → Perfil*.

---

## Estructura

```
crm/
├── compartido/             Reglas que API y web comparten literalmente
│   ├── normalizar.js       RFC, teléfono, CP, estados, fechas de Excel
│   └── campos-importacion.js  Catálogo de campos y detección de columnas
├── api/                    Express (ESM) + PostgreSQL sin ORM
│   ├── src/
│   │   ├── db/             esquema.sql · migrar.js · semilla.js · pool.js
│   │   ├── rutas/          capa HTTP: valida y traduce, nada más
│   │   ├── servicios/      la lógica de negocio y su SQL
│   │   ├── ia/             motor determinista · copiloto · herramientas
│   │   ├── motor/          ejecutor de automatizaciones + programador
│   │   └── middleware/     sesión, roles, límite de peticiones
│   └── pruebas/humo.mjs    106 casos de extremo a extremo
├── web/                    React 19 · TypeScript · Vite · Tailwind 4
│   └── src/
│       ├── estilos/        tokens OKLCH, tema claro/oscuro
│       ├── componentes/    ui/ (primitivos) · graficas/ (SVG) · layout/ · ia/
│       ├── lib/            api, tipos, formato, hooks, consultas React Query
│       └── modulos/        un directorio por módulo del producto
├── docs/                   arquitectura, modelo de datos, diseño, UX, roadmap
└── pruebas/                recorridos en navegador y generador de Excel de prueba
```

La documentación de diseño se escribió antes del código y sigue vigente:
[`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md),
[`docs/MODELO-DATOS.md`](docs/MODELO-DATOS.md),
[`docs/SISTEMA-DISENO.md`](docs/SISTEMA-DISENO.md),
[`docs/NAVEGACION-UX.md`](docs/NAVEGACION-UX.md).

---

## Decisiones que conviene conocer

**Dinero en centavos.** Todo importe es un entero (`BIGINT`) de centavos, de la base
a la interfaz. Nunca hay coma flotante en un total.

**SQL a mano, sin ORM.** Los agregados pesados (embudo, pronóstico, velocidad por
etapa) se resuelven en Postgres con CTEs e índices, no trayendo filas a JavaScript.

**El embudo cuenta una sola población.** Un prospecto y la oportunidad que genera son
la misma operación avanzando; contarlos por separado daba conversiones superiores al
100 %. La función SQL `aura_nivel_etapa()` unifica ambos niveles de etapa.

**Las esperas de un flujo sobreviven al reinicio.** El nodo «Esperar» persiste su
reanudación en la base; el programador la retoma. No hay `setTimeout` en memoria.

**El catálogo de nodos es una sola fuente de verdad.** El editor visual se construye
desde `CATALOGO_NODOS` del backend, así que no puede dibujarse un paso que el
ejecutor no sepa ejecutar.

**Iconos en registro explícito.** `web/src/lib/iconos.tsx` enumera los iconos que se
resuelven por nombre. Un `import * as` de la librería impedía el *tree-shaking* y
metía 625 kB en el paquete; enumerarlos dejó el total en 346 kB.

**La importación valida dos veces, con el mismo código.** El navegador lee el
Excel y normaliza las 50 000 filas en un *web worker* para responder al instante;
el servidor vuelve a normalizar todo antes de escribir. Lo que llega del cliente
es una propuesta, nunca la verdad. Ambos importan `compartido/normalizar.js`, así
que la vista previa y lo que acaba en la base no pueden divergir.

**Una transacción por cliente, no por lote.** La cuenta y sus contactos entran o
no entran juntos —nunca queda una cuenta a medias— y a la vez una fila con
problemas no arrastra a las otras 199 del lote.

**El RFC manda sobre el nombre.** Hay decenas de «Transportes del Norte»; lo que
las distingue es el RFC. Si el registro entrante trae RFC y el candidato por
nombre tiene otro distinto, son empresas diferentes y se dan de alta por separado.

**Tema por atributo.** El modo oscuro se activa con `data-theme="dark"` en la raíz.
Un script previo a la primera pintura lo fija desde `localStorage` para que no haya
destello claro al cargar.

---

## Estado

- API: 106/106 casos en verde, incluidas las diez preguntas de ejemplo del copiloto,
  defensa ante inyección SQL y verificación aritmética de cotizaciones.
- Importación: 20/20 en API y 20/20 en navegador, con archivos reales de 100 a
  50 000 filas. Las 50 000 tardan 3.8 min y la pausa máxima del hilo principal es
  de 110 ms: la interfaz nunca se congela.
- Frontend: `tsc` estricto sin errores y compilación de producción limpia.
- Navegador: los doce módulos recorridos en Chromium sin errores de consola, en
  modo claro y oscuro, sin desbordamiento horizontal.

Los canales externos —envío real de correo y WhatsApp— están marcados como
`simulado` en el catálogo de nodos: registran la intención en la bitácora y lo
declaran en la interfaz. Falta conectar esas integraciones.
