# Control de Herramientas · Fletes Tauro (versión web)

Sistema de control de herramientas rediseñado: login con usuarios, asignación con
carrito y cantidades, responsivas en PDF (todas / últimas), salidas de almacén con
folio único y PDF, catálogos, y página de migración para traer los datos del
sistema anterior (XAMPP).

- **Backend:** Node.js + Express + MySQL (mysql2), PDFs con pdfkit
- **Frontend:** React + Vite (interfaz en español, responsiva para celular)
- **Despliegue:** Docker (Railway) — también corre local contra XAMPP

## Correr en tu computadora (opcional, contra XAMPP)

```bash
cd herramientas-web
npm install
npm run build
npm start
```

Abre http://localhost:8090 — usuario `admin`, contraseña `admin123` (cámbiala al entrar).
Sin variables de entorno se conecta a MySQL local (root sin contraseña, base
`control_herramientas`), igual que el sistema viejo.

## Desplegar en Railway (paso a paso)

1. **Crear el proyecto**: en [railway.app](https://railway.app) → *New Project* →
   *Deploy from GitHub repo* → autoriza GitHub y elige `SISTEMA-GUIAS`.
2. **Carpeta raíz**: en el servicio creado → *Settings* → *Root Directory* =
   `herramientas-web`. Railway detecta el `Dockerfile` automáticamente.
3. **Base de datos**: en el proyecto → *Create* (＋ New) → *Database* → **MySQL**.
4. **Volumen para las fotos**: clic derecho sobre el servicio web → *Attach Volume*
   → *Mount path*: `/data`. (Sin esto las fotos se pierden en cada actualización.)
5. **Variables** del servicio web (*Variables* → *New Variable*):

   | Variable | Valor |
   |---|---|
   | `MYSQL_URL` | `${{MySQL.MYSQL_URL}}` (referencia al servicio MySQL) |
   | `UPLOADS_DIR` | `/data/uploads` |
   | `JWT_SECRET` | una cadena larga aleatoria (ej. 40 letras/números) |
   | `ADMIN_PASSWORD` | contraseña inicial del usuario `admin` |

6. **Dominio público**: servicio web → *Settings* → *Networking* →
   *Generate Domain*. Esa URL es tu sistema en línea.
7. Entra con `admin` + la contraseña de `ADMIN_PASSWORD` y cámbiala desde el menú
   de usuario.

## Migrar los datos del sistema anterior

1. En la computadora del sistema viejo corre `respaldo.bat` (genera
   `base_de_datos.sql` en `C:\RESPALDOS_HERRAMIENTA\<fecha>`).
2. Comprime tu carpeta `uploads` (fotos) en un `.zip`.
3. En el sistema en línea: **Administración → Migración** → sube primero el `.sql`
   y luego el `.zip`. Puedes repetirlo las veces que necesites (el .sql reemplaza
   los datos; las fotos se agregan).

## Variables que entiende el servidor

`MYSQL_URL` (o `MYSQLHOST/MYSQLPORT/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE`,
o `DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME`), `UPLOADS_DIR`, `JWT_SECRET`,
`ADMIN_USER`, `ADMIN_PASSWORD`, `PORT`.
