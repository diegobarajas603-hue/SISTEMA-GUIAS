# Sistema de Liquidaciones

Programa **independiente** del sistema de salidas: tiene su propia carpeta,
su propia base de datos (`data/liquidaciones.db`), sus propios PDF y sus
propios respaldos. Solo se **enlaza** al sistema de salidas para *leer* el
folio, el operador, las fechas y los clientes del viaje. Nunca escribe en la
base de datos de salidas.

## 📁 Estructura

```
Liquidaciones_Pro/
├── app.py               <- Rutas de la aplicación
├── database.py          <- Base de datos propia + respaldos automáticos
├── fuente_salidas.py    <- El enlace con el sistema de salidas (solo lectura)
├── pdf_generator.py     <- PDF de liquidación
├── config_data.py       <- AQUÍ configuras el enlace y los sueldos
├── requirements.txt
├── iniciar.bat          <- Doble clic para arrancar en Windows
├── templates/           <- Páginas HTML
├── static/estilo.css    <- Diseño (colores, tipografía)
├── static/app.js        <- Interacciones (avisos, atajos, filtros, exportar)
├── extras/
│   └── api_salidas.py   <- OPCIONAL: solo para enlace por internet (ver abajo)
├── data/liquidaciones.db  (se crea sola)
├── PDFs/                  (se crea sola)
└── backups/               (se crea sola)
```

## ▶️ Cómo correrlo

1. Doble clic en `iniciar.bat` (instala Flask y ReportLab la primera vez).
   - O manualmente: `py -m pip install -r requirements.txt` y luego `py app.py`
2. Abre en `http://127.0.0.1:5001` (el de salidas usa el 5000, así pueden
   estar los dos abiertos al mismo tiempo).
3. Otras computadoras de la red entran a `http://TU-IP-LOCAL:5001`.

## 🔗 Cómo enlazarlo con el sistema de salidas

Se configura en `config_data.py`. Hay dos opciones:

### Opción A — Por archivo (misma computadora o carpeta compartida en red)

Pon la ruta al `reportes.db` del sistema de salidas:

```python
RUTA_SALIDAS_DB = r"C:\ReporteSalidas_Pro\data\reportes.db"
```

Si lo dejas vacío (`""`), busca automáticamente la carpeta
`ReporteSalidas_Pro` **junto** a esta carpeta, es decir:

```
Mis Sistemas/
├── ReporteSalidas_Pro/
│   └── data/reportes.db
└── Liquidaciones_Pro/
```

La base se abre en modo *solo lectura*: aunque los dos programas estén
abiertos al mismo tiempo, liquidaciones nunca bloquea ni modifica salidas.

### Opción B — Por internet o red (por ejemplo, si salidas está en Railway)

1. Copia `extras/api_salidas.py` a la carpeta del sistema de salidas, junto
   a su `app.py`.
2. En el `app.py` de salidas, debajo de `app = Flask(__name__)` agrega:

   ```python
   import api_salidas
   app.register_blueprint(api_salidas.bp)
   ```

3. Reinicia el sistema de salidas.
4. En el `config_data.py` de liquidaciones pon la dirección:

   ```python
   URL_SALIDAS = "https://tu-sistema.up.railway.app"
   ```

   Si `URL_SALIDAS` tiene algo, se usa en lugar de la Opción A.

Ese archivo solo agrega dos direcciones de *lectura* al sistema de salidas
(`/api/folio/<folio>` y `/api/folios`). No cambia nada de lo que ya hace.

En la pantalla principal siempre se ve una franja verde ("Conectado al
sistema de salidas…") o roja con la explicación de qué falta configurar.

## 💵 Cómo se liquida un viaje

1. Escribe el folio de salida (ej. `50917`) o da clic en un chip de
   "Folios sin liquidar". Se cargan solos: operador, fecha de salida, fecha
   de regreso (si ya existe el folio `-R`), cliente de ida, cliente de
   regreso y el préstamo de $700 (editable).
2. **Percepciones**:
   - **Sueldo**: *Regular ($2,800)* o *Químico ($3,100)*. Los montos están en
     `config_data.py` (`SUELDOS`); ahí los cambias si suben.
   - **Ida** y **Regreso**: cliente + monto libres.
   - **Estancia**: marca en el calendario el día de llegada y los días que se
     quedó (los días del viaje se ven en amarillo como guía). El monto se
     calcula solo: el primer día marcado es la llegada y no se paga; cada día
     siguiente se paga $150 si es de lunes a viernes o $300 si es sábado o
     domingo (ejemplo: jueves + viernes = $150; viernes + sábado = $300).
     Las tarifas están en `config_data.py` (`TARIFA_ESTANCIA`). Si hace
     falta, el monto se puede corregir a mano.
   - **Maniobras**, **Extras**, **Casetas**: montos libres.
   - **Rendimiento**: activa el check y se habilita el cuadro del monto.
   - **Total**: se suma solo.
3. **Deducciones**: Gastos, Préstamo, Infonavit, y las fechas de los 4 pagos
   semanales de Infonavit del mes (Pago 1 al 4).
   Los pagos de Infonavit son **del operador y del mes**, no del folio: si el
   operador sale con otro folio en el mismo mes, los pagos que ya registró
   aparecen bloqueados con el folio donde se capturaron, y solo captura el
   siguiente. Al cambiar de mes los 4 cuadros empiezan de cero. Si se borra
   una liquidación, sus pagos se liberan.
4. **Total a pagar** = Total − Gastos − Préstamo − Infonavit (se calcula solo).
5. Al guardar se genera `PDFs/Liquidacion_<folio>.pdf` con las firmas de
   **Visto Bueno** y **Firma del Operador** (con su nombre debajo).

Cada folio se liquida **una sola vez**; si lo vuelves a buscar, te manda a
editarlo. Editar regenera el PDF.

## 📊 Reporte mensual por operador

En el menú lateral, **Reporte mensual**. Eliges el mes y ves, por operador:
viajes liquidados, sueldo, ida, regreso, estancia, maniobras, extras,
casetas, rendimiento, total, gastos, préstamo, Infonavit y total a pagar,
con la suma del mes al final. Clic en un operador muestra sus folios.
El botón **Descargar PDF** genera el reporte en hoja horizontal con el
resumen y el detalle por operador (`PDFs/Reporte_Mensual_AAAA-MM.pdf`).

## 🛡️ Respaldos

Igual que en salidas: uno al arrancar, uno cada hora, uno antes de borrar.
Se guardan en `backups/` (se conservan los últimos 60). Puedes verlos y
descargarlos en `http://127.0.0.1:5001/admin/respaldos`.

Para borrar una liquidación: `http://127.0.0.1:5001/admin/borrar_liquidacion/50917`

## ☁️ Subirlo a Railway

Sí se puede. Se conecta por URL (Opción B) al sistema de salidas, que
también tiene que estar en Railway. Los pasos completos, incluyendo cómo
migrar tu base de datos actual, están en `GUIA_RAILWAY.md`.

## 🔨 Generar el .exe

```
py -m pip install pyinstaller
py -m PyInstaller --onefile --add-data "templates;templates" --add-data "static;static" app.py
```

Después copia `config_data.py` junto al `.exe` en `dist/`. Las carpetas
`data/`, `PDFs/` y `backups/` se crean solas junto al ejecutable.

## Usuarios, inicio de sesión y bitácora

- **Primera vez:** al abrir el programa pide crear la cuenta del **administrador** (nombre, usuario y contraseña). No hay contraseña por defecto.
- **Roles:**
  - *Administrador:* todo lo demás, más **Usuarios** (dar de alta, desactivar, cambiar contraseñas) y **Bitácora**.
  - *Capturista:* captura, edita y elimina liquidaciones; ve el reporte y los respaldos.
- **Bitácora** (solo administrador): registra quién **creó, editó o eliminó** cada liquidación, con fecha, hora, operador y monto, además de las entradas al sistema y los cambios de usuarios. Por defecto muestra las eliminaciones y se puede exportar a CSV.
- Las contraseñas se guardan cifradas. La clave de la sesión se guarda en `data/clave_sesion` (se crea sola); no la compartas.
- **Si se olvida la contraseña del único administrador:** cierra el programa, haz una copia de `data/liquidaciones.db` y borra la tabla `usuarios` (por ejemplo con *DB Browser for SQLite*). Al abrir de nuevo pedirá crear el administrador; las liquidaciones y la bitácora no se pierden.
