# Sistema de Guias MTY <-> CDMX

Sistema para rastrear guias en la ruta unica Monterrey <-> Ciudad de Mexico,
usando una pistola lectora de codigos para dar entradas/salidas, y un
webhook compatible con WhatsApp Business Cloud API (Meta) para que tus
clientes consulten el estatus de su guia escribiendo el numero por WhatsApp.

## Estatus posibles

- `EN_BODEGA_MTY` / `EN_BODEGA_CDMX`: la guia fue ingresada y esta en bodega.
- `EN_CAMINO_CDMX` / `EN_CAMINO_MTY`: el camion ya salio hacia esa plaza.
- `LLEGO_CDMX` / `LLEGO_MTY`: el camion ya llego a esa plaza.

## Instalacion

Requiere PostgreSQL (local o en un servicio como Railway/Render/Supabase).

```bash
npm install
cp .env.example .env
# edita .env con tu DATABASE_URL y tus tokens

# si tu PostgreSQL es local y no existe aun la base de datos:
createdb sistema_guias

npm start
```

El servidor crea automaticamente las tablas (`guias`, `eventos`) al arrancar.

El servidor corre en `http://localhost:3000`. Abre esa URL en una
computadora/tablet conectada a la pistola escaner (la pistola funciona
como teclado: escanea y manda "Enter" automaticamente).

## Flujo de escaneo

1. **Ingreso**: cuando la guia llega a la bodega de origen (MTY o CDMX),
   selecciona "Ingreso a bodega", la plaza de origen, y escanea.
2. **Salida**: cuando el camion sale hacia la otra plaza, selecciona
   "Salida (en camino)" y escanea las guias que se van.
3. **Llegada**: cuando el camion llega a destino, selecciona "Llegada a
   destino" y escanea.

## API REST

Todas las rutas requieren el header `X-App-Token: <APP_TOKEN>` (definido en
`.env`) si `APP_TOKEN` esta configurado.

- `POST /api/guias/ingreso` `{ numeroGuia, origen: "MTY"|"CDMX" }`
- `POST /api/guias/salida` `{ numeroGuia }`
- `POST /api/guias/llegada` `{ numeroGuia }`
- `GET /api/guias/:numeroGuia` -> estatus actual, mensaje en lenguaje
  natural e historial de eventos.
- `GET /api/guias` -> lista de guias recientes.

## Conectar con WhatsApp Business (Meta Cloud API) - desde cero

Como aun no tienes nada configurado en Meta, sigue estos pasos en orden.
Todo esto se hace dentro de [developers.facebook.com](https://developers.facebook.com/),
no requiere instalar nada adicional.

### 1. Crear la app de Meta

1. Entra a [developers.facebook.com/apps](https://developers.facebook.com/apps)
   con tu cuenta de Facebook (usa una cuenta de la empresa, no personal si es
   posible).
2. Clic en **"Crear app"** → tipo de app: **"Otro"** → caso de uso:
   **"Empresa"**.
3. Ponle un nombre (ej. "Sistema Guias Fletes Tauro") y crea la app.

### 2. Agregar el producto WhatsApp

1. En el panel de la app, busca la tarjeta **WhatsApp** y clic en
   **"Configurar"**.
2. Meta te pedira asociar o crear una **Cuenta de WhatsApp Business**
   (WABA). Sigue el asistente; puedes usar el numero de telefono de prueba
   que Meta te da gratis para probar antes de usar tu numero real.
3. En **WhatsApp > Configuracion de la API**, copia:
   - **Phone Number ID** (ID del numero de telefono)
   - **Token de acceso temporal** (dura 24 horas, sirve para probar)

### 3. Generar un token permanente (para produccion)

El token temporal expira en 24 horas, no sirve para un sistema en vivo.

1. Ve a **Configuracion de la empresa** (Business Settings) en
   business.facebook.com.
2. En **Usuarios > Usuarios del sistema**, crea un **System User** con rol
   de administrador.
3. Asigna ese usuario del sistema a tu app de WhatsApp con permiso
   `whatsapp_business_messaging`.
4. Genera un token para ese usuario del sistema, sin fecha de expiracion
   (o la mas larga posible). Ese es tu `WHATSAPP_TOKEN` definitivo.

### 4. Verificar tu numero real (cuando dejes el numero de prueba)

1. En **WhatsApp > Numeros de telefono**, clic en **"Agregar numero de
   telefono"** y registra el numero real de la empresa (debe poder recibir
   un SMS o llamada de verificacion, y no puede estar ya activo en la app
   normal de WhatsApp).
2. Una vez verificado, ese numero tendra su propio `Phone Number ID`,
   actualiza `WHATSAPP_PHONE_NUMBER_ID` en `.env`.

### 5. Configurar el webhook hacia tu sistema

1. Pon en tu `.env`:
   - `WHATSAPP_TOKEN` = el token del paso 2 o 3.
   - `WHATSAPP_PHONE_NUMBER_ID` = el ID del paso 2 o 4.
   - `WHATSAPP_VERIFY_TOKEN` = cualquier cadena secreta que tu inventes
     (ej. `tauro2026secreto`).
2. Despliega tu servidor en algun lugar accesible por HTTPS (Railway,
   Render, un VPS con dominio y certificado, etc). Mientras pruebas en tu
   computadora puedes usar un tunel como `ngrok http 3000` para obtener una
   URL publica temporal.
3. En el panel de Meta, ve a **WhatsApp > Configuracion** → **Webhooks**
   → **Editar**:
   - **Callback URL**: `https://tu-dominio.com/webhook/whatsapp`
   - **Verify token**: el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`
   - Clic en **Verificar y guardar** (Meta llamara a tu endpoint GET para
     confirmar que coincide).
4. En la lista de campos del webhook, suscribete al campo **`messages`**.

### 6. Probar

1. Registra una guia de prueba en el panel de escaneo (`/`).
2. Desde tu celular, envia un WhatsApp al numero configurado con el
   numero de guia (ej. "XYZ999").
3. El sistema debe responder automaticamente con el estatus.

Nota: mientras uses el numero de prueba gratuito de Meta, solo puede
recibir mensajes de numeros que agregues como "destinatarios de prueba" en
el panel de WhatsApp. Para que cualquier cliente pueda escribir, necesitas
verificar tu numero real de negocio (paso 4) y pasar la revision de la app
si planeas enviar mensajes fuera de la ventana de 24 horas de respuesta.

## Notas

- La base de datos es SQLite (`data/guias.db`), no requiere servidor de
  base de datos aparte.
- El campo `numeroGuia` se normaliza a mayusculas.
- Una guia se "reinicia" automaticamente si se vuelve a escanear como
  "Ingreso" desde otra plaza (es decir, el ciclo de retorno MTY->CDMX->MTY).
