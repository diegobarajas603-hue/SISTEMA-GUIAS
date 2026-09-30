# Órbita — seguridad personal y ubicación con tus círculos

App móvil para **Android e iOS** (Expo / React Native + TypeScript) para compartir
tu ubicación en tiempo real con grupos de confianza, siempre con consentimiento
explícito. Backend en **Supabase** (Postgres + Auth + Realtime + Storage), con la
privacidad aplicada en la base de datos mediante Row Level Security.

## Funciones

| Área | Qué incluye |
| --- | --- |
| Mapa principal | Mapa a pantalla completa en tema oscuro, tu avatar con cono de dirección y círculo de precisión, estado GPS, miembros con marcadores de color y punto de estado, tarjeta glass inferior («Mi ubicación», «Actualizada hace X segundos», estado de compartir) con los botones **Compartir ubicación · Mi grupo · Seguridad**. |
| Ubicación | Latitud, longitud, precisión, velocidad, dirección, altitud y fecha/hora. GPS + Wi-Fi + red móvil a través de las APIs nativas (`expo-location`). |
| Ahorro de batería | Perfiles adaptativos: máxima precisión con el mapa abierto, uno ligero en otras pantallas, uno equilibrado en segundo plano y uno de ahorro con batería < 20 % o modo de bajo consumo. Los envíos al servidor se filtran por tiempo y distancia, con un «latido» periódico. |
| Segundo plano | Android: *foreground service* con notificación permanente. iOS: modo de fondo `location` con el indicador del sistema visible. Se detiene solo si dejas de compartir, expira el tiempo o cierras sesión. |
| Señal y permisos | Detecta pérdida de GPS y servicios apagados (muestra la última ubicación), ubicación **aproximada vs. precisa** (iOS *reduced* / Android *coarse*) y pide permisos sólo tras una acción tuya, explicando antes el permiso «Siempre». |
| Autenticación | Registro, inicio y cierre de sesión, verificación de correo, recuperación de contraseña, inicio con **Apple** (iOS) y **Google** (opcional). Perfil con nombre, foto, correo, teléfono opcional, nombre de usuario e ID único. |
| Mis círculos | Familia, Amigos, Trabajo, Pareja, Emergencias u Otro, con icono, color, administrador y el estado de cada miembro (🟢 < 2 min, 🟡 < 30 min, ⚫ sin datos, 🟠 en pausa). |
| Invitaciones | Por correo, teléfono, nombre de usuario, código o enlace `https://<dominio>/invite/XXXXXXXX`. Pantalla «Juan te invitó a unirte a su círculo Familia» con **Aceptar / Rechazar**. |
| Privacidad | Compartir siempre, 1 h, 8 h o hasta que lo desactives; pausar; dejar de compartir; elegir círculo por círculo; dejar de compartir con una persona; salir de un grupo. El indicador de si compartes está siempre a la vista. |
| SOS | Confirmación → cuenta regresiva cancelable → ubicación precisa → registro del evento (hora + ubicación) → alerta y ubicación en vivo a tus contactos de emergencia durante 60 min → contador y botón para cancelar. También: llamar al 911 y SMS a contactos que no usan la app. |
| Alertas | Alertas SOS, invitaciones y nuevos miembros, en tiempo real y por notificación push. |
| Historial | Tus recorridos como línea sobre el mapa: **Hoy, Ayer, Últimos 7 días**, con distancia y duración. Sólo tú los ves, salvo que actives «Permitir ver mi historial» en un círculo. |

## Privacidad: cómo se garantiza

Las reglas viven en `supabase/migrations/…_init.sql` y las aplica el servidor, no la app:

- **Ubicación en vivo** de A visible para B sólo si A está compartiendo (y no expiró), ambos están en
  un mismo círculo, A comparte en **ese** círculo y no bloqueó a B, o si A tiene un SOS activo y B es
  destinatario.
- La ubicación sólo se escribe mediante la función `push_location`, que la **rechaza** si no estás
  compartiendo. Al dejar de compartir se borra tu última ubicación publicada.
- Unirse a un círculo sólo es posible aceptando una invitación (consentimiento de ambas partes).
- El historial se guarda sólo si lo activas y es privado por defecto; compartirlo es un consentimiento aparte.
- Realtime aplica las mismas políticas, así que tampoco llegan cambios de quien no te dio permiso.

`supabase/tests/privacy_test.sql` comprueba estas reglas (17 casos, más 5 escrituras que deben ser
rechazadas) contra un Postgres local:

```bash
PGHOST=localhost PGUSER=postgres ./supabase/tests/run.sh
```

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Aplica la migración: `npx supabase link --project-ref <ref>` y luego `npx supabase db push`
   (o pega el SQL en *SQL Editor*).
3. **Auth → URL Configuration → Redirect URLs**: agrega `orbita://**`.
4. **Auth → Providers**: deja *Confirm email* activado. Opcional: activa Google y Apple.
5. Notificaciones push (opcional pero recomendado):
   - `npx supabase functions deploy push-alerts`
   - **Database → Webhooks → Create**: tabla `alerts`, evento `INSERT`, tipo *Supabase Edge Functions*, función `push-alerts`.

### 2. App

```bash
cd orbita
cp .env.example .env      # completa URL y anon key de Supabase
npm install
npx expo run:android      # o: npx expo run:ios
```

La app usa módulos nativos (mapas, ubicación en segundo plano), así que necesita un
**development build**; no funciona en Expo Go. Con EAS: `npx eas-cli@latest build --profile development`.

Variables en `.env`:

| Variable | Uso |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Conexión con Supabase |
| `EXPO_PUBLIC_INVITE_DOMAIN` | Dominio de los enlaces de invitación |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Google Maps en Android (en iOS se usa Apple Maps) |
| `EAS_PROJECT_ID` | Token de notificaciones push |
| `EXPO_PUBLIC_ENABLE_GOOGLE` | `true` para mostrar «Continuar con Google» |

### 3. Enlaces de invitación

Para que `https://<dominio>/invite/XXXXXXXX` abra la app, publica en ese dominio
`/.well-known/apple-app-site-association` (iOS) y `/.well-known/assetlinks.json` (Android)
con el bundle id / package `app.orbita.mobile`. Mientras tanto, el código de 8 caracteres
funciona desde **Mis círculos → Invitaciones → Unirme con código**.

### 4. Publicación en tiendas

- **Apple**: justifica el permiso «Siempre» y el modo de fondo `location` en la revisión (compartir
  con círculos de confianza y SOS); los textos de permiso ya están en `app.config.ts`.
- **Google Play**: completa la declaración de *ubicación en segundo plano* con un video que muestre
  el aviso previo, el permiso y la notificación permanente.

## Estructura

```
orbita/
├── app.config.ts            # permisos, modos de fondo, enlaces, plugins
├── src/
│   ├── app/                 # pantallas (Expo Router)
│   │   ├── (auth)/          # login, registro, recuperación, verificación
│   │   ├── (app)/           # mapa, círculos, compartir, seguridad, historial, perfil…
│   │   └── invite/[code]    # aceptar / rechazar invitación
│   ├── components/          # UI glass, marcadores del mapa, SOS…
│   ├── hooks/               # motor de ubicación, realtime
│   ├── services/            # auth, círculos, seguridad, notificaciones, ubicación
│   │   └── location/        # permisos, perfiles de batería, envío, tarea de fondo
│   ├── store/               # estado (zustand)
│   └── lib/                 # tema, formato, geometría, Supabase
└── supabase/
    ├── migrations/          # esquema + RLS + funciones
    ├── functions/push-alerts
    └── tests/               # pruebas de privacidad
```

## Comandos

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint (config de Expo)
npm start           # servidor de desarrollo
```
