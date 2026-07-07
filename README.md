# Sistema de Guias MTY <-> CDMX

Sistema para rastrear guias en la ruta unica Monterrey <-> Ciudad de Mexico,
usando una pistola lectora de codigos con **escaneo inteligente**, y un
webhook compatible con WhatsApp Business Cloud API (Meta) para que tus
clientes consulten el estatus de su guia escribiendo el numero por WhatsApp.

## Como funciona el escaneo inteligente

En el panel web solo eliges **en que plaza estas** (MTY o CDMX) una sola vez;
la eleccion queda guardada en el navegador. A partir de ahi solo escaneas y el
sistema decide automaticamente que significa cada escaneo:

Estando en la plaza P (la otra plaza es Q):

| Estado actual de la guia | Que hace el escaneo en P |
| --- | --- |
| No existe en el sistema | La registra: **salio de P hacia Q** (`EN_TRANSITO_A_Q`) |
| `EN_TRANSITO_A_P` (venia hacia aqui) | **Llego**: queda en bodega de P, lista (`EN_BODEGA_P`) |
| `EN_BODEGA_P` (estaba aqui) | **Vuelve a salir** de P hacia Q (`EN_TRANSITO_A_Q`) |
| `EN_TRANSITO_A_Q` (ya salio de aqui) | Escaneo repetido: no cambia nada, solo se registra en el historial |
| `EN_BODEGA_Q` (figuraba en la otra plaza) | Llego a P aunque no se escaneo su salida en Q (`EN_BODEGA_P`) |

Ejemplo: estas en MTY y escaneas una guia nueva -> el sistema registra que
salio hacia CDMX. Cuando esa guia llega a CDMX y la escanean alla -> el
sistema detecta que ya esta en bodega de CDMX, lista.

## Estatus posibles

- `EN_TRANSITO_A_CDMX` / `EN_TRANSITO_A_MTY`: la guia va en camino a esa plaza.
- `EN_BODEGA_CDMX` / `EN_BODEGA_MTY`: la guia llego y esta en esa bodega, lista.

(Los estatus del modelo anterior `EN_CAMINO_X` y `LLEGO_X` se migran
automaticamente al arrancar el servidor.)

## Historial

Cada escaneo queda registrado en la tabla `eventos` con la accion (SALIDA,
LLEGADA o ESCANEO_REPETIDO), la plaza donde se escaneo, una descripcion y la
fecha/hora. En el panel web, pestaña **"Guias e historial"**, puedes:

- Ver el resumen de cuantas guias hay en cada estatus.
- Buscar por numero de guia y filtrar por estatus.
- Dar clic en cualquier guia para ver su linea de tiempo completa.

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

## API REST

Todas las rutas requieren el header `X-App-Token: <APP_TOKEN>` (definido en
`.env`) si `APP_TOKEN` esta configurado.

- `POST /api/guias/escanear` `{ numeroGuia, plaza: "MTY"|"CDMX" }` ->
  aplica el escaneo inteligente y regresa `{ guia, tipo, mensaje }`, donde
  `tipo` es `salida`, `llegada` o `repetido`.
- `GET /api/guias?buscar=<texto>&estatus=<estatus>` -> lista de guias
  recientes, con busqueda por numero y filtro por estatus (ambos opcionales).
- `GET /api/guias/resumen` -> conteo de guias por estatus.
- `GET /api/guias/:numeroGuia` -> estatus actual, mensaje en lenguaje
  natural e historial completo de eventos.

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

- El campo `numeroGuia` se normaliza a mayusculas.
- El ciclo de ida y vuelta esta soportado: una guia en bodega puede volver a
  salir hacia la otra plaza y todo queda en el mismo historial.
