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

1. Otro repositorio en GitHub (ej. `liquidaciones`) con el contenido de la
   carpeta `Liquidaciones_Pro`.
2. Railway: **New Project → Deploy from GitHub repo** (o **New Service** en
   el mismo proyecto).
3. Pestaña **Variables**:
   ```
   DATA_DIR    = /data
   URL_SALIDAS = https://TU-DOMINIO-SALIDAS     (el del paso 1, sin diagonal al final)
   ```
4. **Settings → Volumes → Add Volume** con *Mount path* `/data`.
5. **Settings → Networking → Generate Domain**.
6. Abre la dirección. La franja de arriba debe decir en verde
   "Conectado al sistema de salidas (URL: ...)".

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
