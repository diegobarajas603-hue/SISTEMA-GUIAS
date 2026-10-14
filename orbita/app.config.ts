import type { ExpoConfig } from 'expo/config';

// Dominio de los enlaces de invitación (https://<dominio>/invite/XXXXXXXX).
const INVITE_DOMAIN = process.env.EXPO_PUBLIC_INVITE_DOMAIN ?? 'orbita.app';

const config: ExpoConfig = {
  name: 'Órbita',
  slug: 'orbita',
  scheme: 'orbita',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#07080D',
  ios: {
    bundleIdentifier: 'app.orbita.mobile',
    supportsTablet: false,
    usesAppleSignIn: true,
    associatedDomains: [`applinks:${INVITE_DOMAIN}`],
    infoPlist: {
      // Actualizaciones de ubicación en segundo plano + notificaciones remotas.
      UIBackgroundModes: ['location', 'fetch', 'remote-notification'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'app.orbita.mobile',
    adaptiveIcon: {
      backgroundColor: '#07080D',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'POST_NOTIFICATIONS',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: INVITE_DOMAIN, pathPrefix: '/invite' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 120,
        resizeMode: 'contain',
        backgroundColor: '#07080D',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Órbita usa tu ubicación para mostrarte en el mapa y, sólo si tú lo activas, compartirla con tus círculos.',
        locationAlwaysAndWhenInUsePermission:
          'Permite "Siempre" para que tus círculos vean tu ubicación aunque la app esté en segundo plano. Sólo se comparte mientras tengas "Compartir ubicación" activo y puedes pausarlo cuando quieras.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-notifications',
      {
        color: '#7C5CFF',
        defaultChannel: 'default',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Órbita necesita acceso a tus fotos para elegir tu foto de perfil.',
        cameraPermission: 'Órbita necesita la cámara para tomar tu foto de perfil.',
      },
    ],
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    inviteDomain: INVITE_DOMAIN,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
