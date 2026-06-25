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

```bash
npm install
cp .env.example .env
# edita .env con tus tokens
npm start
```

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

## Conectar con WhatsApp Business (Meta Cloud API)

1. Crea una app en [developers.facebook.com](https://developers.facebook.com/)
   con el producto **WhatsApp**.
2. Obtén el `Phone Number ID` y un token de acceso (temporal o permanente
   via System User) y ponlos en `.env` como `WHATSAPP_PHONE_NUMBER_ID` y
   `WHATSAPP_TOKEN`.
3. Define `WHATSAPP_VERIFY_TOKEN` en `.env` con cualquier cadena secreta.
4. En el panel de Meta, configura el webhook con:
   - **Callback URL**: `https://tu-dominio.com/webhook/whatsapp`
   - **Verify token**: el mismo valor de `WHATSAPP_VERIFY_TOKEN`
   - Suscribete al campo `messages`.
5. Tu servidor debe estar accesible publicamente por HTTPS (puedes usar un
   reverse proxy, un servicio de hosting, o un tunel como ngrok mientras
   pruebas).

Cuando un cliente escribe su numero de guia por WhatsApp, el sistema busca
la guia y responde automaticamente con su estatus actual.

## Notas

- La base de datos es SQLite (`data/guias.db`), no requiere servidor de
  base de datos aparte.
- El campo `numeroGuia` se normaliza a mayusculas.
- Una guia se "reinicia" automaticamente si se vuelve a escanear como
  "Ingreso" desde otra plaza (es decir, el ciclo de retorno MTY->CDMX->MTY).
