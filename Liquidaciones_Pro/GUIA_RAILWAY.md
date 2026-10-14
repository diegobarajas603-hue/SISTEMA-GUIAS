# Subir los dos sistemas a Railway

Son dos proyectos separados en Railway (o dos "servicios" dentro del
mismo proyecto), cada uno con su propio Volume para su base de datos:

```
Railway
├── Servicio "salidas"        <- carpeta ReporteSalidas_Pro_Railway
│   └── Volume en /data       (reportes.db, PDFs, backups)
└── Servicio "liquidaciones"  <- carpeta Liquidaciones_Pro
    └── Volume en /data       (liquidaciones.db, PDFs, backups)
```

⚠️ Importante: Railway borra los archivos del servicio en cada despliegue.
Sin el Volume y la variable `DATA_DIR`, perderías la base de datos cada
vez que subas un cambio.

---

## PASO 1 — Subir el sistema de salidas

1. Crea un repositorio nuevo en GitHub (ej. `salidas`) y sube el contenido
   de la carpeta `ReporteSalidas_Pro_Railway` (NO subas `data/`, `PDFs/` ni
   `backups/`; ya están en el `.gitignore`).
2. En Railway: **New Project → Deploy from GitHub repo** → elige ese repo.
3. En el servicio, pestaña **Variables**, agrega:
   ```
   DATA_DIR = /data
   ```
4. Pestaña **Settings → Volumes → Add Volume**, con *Mount path* `/data`.
5. **Settings → Networking → Generate Domain**. Te da una dirección como
   `https://salidas-production.up.railway.app`. Apúntala.
6. Espera a que el deploy termine y abre la dirección. Verás el sistema
   vacío (folio inicial 50587).

### Migrar tu base de datos actual (los 330 reportes)

1. En tu computadora, cierra el sistema de salidas y copia el archivo
   `C:\ReporteSalidas_Pro\ReporteSalidas_Pro\data\reportes.db`.
2. Entra a `https://TU-DOMINIO-SALIDAS/admin/respaldos`.
3. En "Restaurar / migrar base de datos" selecciona ese `reportes.db` y da
   clic en **Subir y restaurar**.
4. Listo: el historial ya muestra todos tus folios y el siguiente folio
   continúa donde ibas. Los PDF viejos no se suben, pero cualquiera se
   regenera con el botón "Editar" del historial.

Comprueba el API abriendo `https://TU-DOMINIO-SALIDAS/api/folios?limite=3`.
Debe mostrar tres folios en texto.

---

## PASO 2 — Subir el sistema de liquidaciones

El código ya está en GitHub dentro del repositorio `SISTEMA-GUIAS`, en la
carpeta `Liquidaciones_Pro`. No hace falta otro repositorio: Railway puede
desplegar solo esa carpeta.

1. En tu proyecto de Railway: **+ New → GitHub Repo → SISTEMA-GUIAS**.
   Se crea un servicio nuevo (el sistema de guías que ya tengas no se toca).
2. En el servicio nuevo, **Settings → Source**:
   - **Root Directory:** `Liquidaciones_Pro`
   - **Watch Paths:** `Liquidaciones_Pro/**` (así solo se vuelve a
     desplegar cuando cambia liquidaciones).
3. **Settings → Volumes → Add Volume** con *Mount path* `/data`.
4. Pestaña **Variables**:
   ```
   DATA_DIR          = /data
   URL_SALIDAS       = https://TU-DOMINIO-SALIDAS      (sin diagonal al final)
   CLAVE_API_SALIDAS = (la misma clave del PASO 3)
   ```
   Opcional: `ZONA_HORARIA` (por defecto `CST6`, hora del centro de México).
5. **Settings → Networking → Generate Domain**. Ese es el link para abrirlo
   desde cualquier lugar (ej. `https://liquidaciones-production.up.railway.app`).
6. Ábrelo: la primera vez pide **crear la cuenta del administrador**.
   Después da de alta a los demás en **Usuarios**.
7. El punto de abajo en la barra lateral debe estar **verde** ("Salidas en
   línea"). Si está rojo, pasa el mouse encima: dice qué falta.

## PASO 3 — Proteger la API del sistema de salidas (clave)

Liquidaciones lee los folios del sistema de salidas por internet
(`/api/folio/...`). Sin clave, cualquiera con la dirección podría leer esos
datos. Con la clave, solo liquidaciones puede.

1. Genera una clave larga, por ejemplo con:
   `python -c "import secrets; print(secrets.token_urlsafe(32))"`
   (o cualquier generador de contraseñas, 30+ caracteres, sin espacios).
2. En el repositorio del **sistema de salidas**:
   - Copia `Liquidaciones_Pro/extras/api_salidas.py` junto a su `app.py`
     (si ya lo tenía, reemplázalo: la versión nueva revisa la clave).
   - En su `app.py`, debajo de `app = Flask(__name__)`, debe estar:
     ```python
     import api_salidas
     app.register_blueprint(api_salidas.bp)
     ```
3. En Railway, servicio **salidas → Variables**: `CLAVE_API_SALIDAS = (la clave)`.
4. En el servicio **liquidaciones → Variables**: la **misma** clave.
5. Comprueba: `https://TU-DOMINIO-SALIDAS/api/folios?limite=3` en el
   navegador debe responder `{"error": "Clave inválida"}`. Eso significa
   que ya está protegida; liquidaciones sí entra porque manda la clave.

> Mientras solo uno de los dos tenga la clave, el punto se pone rojo con el
> aviso "El sistema de salidas rechazó la clave". Al poner la misma en ambos
> se arregla solo (Railway reinicia el servicio al cambiar variables).

## Notas del servidor

- **Hora:** Railway trabaja en UTC. Liquidaciones usa la hora del centro de
  México para la fecha de liquidación, la bitácora y los respaldos.
- **Sesión:** en Railway la cookie de inicio de sesión solo viaja por HTTPS.
  La clave que la firma se guarda en el Volume (`/data/clave_sesion`).
- **Datos:** la base, los PDF, los respaldos y los usuarios viven en el
  Volume. Sin el Volume y `DATA_DIR=/data` se perderían en cada despliegue.
- **Repositorio público:** `SISTEMA-GUIAS` es público. Las claves van
  solo en las Variables de Railway, nunca en el código.

---

## Cómo se actualiza después

Cada vez que subas un cambio al repo de GitHub, Railway lo vuelve a
desplegar solo. La base de datos, los PDF y los respaldos están en el
Volume, así que no se pierden.

## Respaldos

Los dos sistemas siguen haciendo respaldo automático (al arrancar, cada
hora y antes de borrar) dentro del Volume. Puedes descargarlos desde
`/admin/respaldos` de cada sistema. Recomendación: descarga uno cada
semana a tu computadora.

## Usarlo en Windows sigue igual

Las mismas carpetas funcionan en tu computadora con `iniciar.bat`. Al no
tener las variables de Railway, guardan todo junto al programa como
siempre. En Windows, para el enlace usa `RUTA_SALIDAS_DB` en
`config_data.py` (Opción A) o pon la URL de Railway en `URL_SALIDAS`
(Opción B) si quieres capturar liquidaciones desde tu PC contra el
sistema de salidas que está en la nube.

Si desde tu PC usas la Opción B contra el sistema de salidas de Railway,
la clave también se necesita ahí: en `iniciar.bat`, antes de la línea que
abre el programa, agrega `set CLAVE_API_SALIDAS=tu-clave` (ese archivo
quédatelo solo en tu PC; no lo subas con la clave a GitHub).
