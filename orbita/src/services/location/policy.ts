import * as Location from 'expo-location';

/**
 * Niveles de actualización. La idea: máxima precisión sólo cuando alguien está
 * mirando el mapa; en segundo plano, lo justo para que el círculo vea dónde
 * estás sin agotar la batería.
 */
export type TrackingProfile = 'map' | 'app' | 'background' | 'backgroundSaver' | 'sos';

export interface ProfileConfig {
  watch: Location.LocationOptions;
  /** Intervalo mínimo entre envíos al servidor. */
  minUploadMs: number;
  /** Desplazamiento que fuerza un envío (si ya pasó minUploadMs). */
  minUploadMeters: number;
  /** Aunque no te muevas, se envía un "latido" con esta frecuencia. */
  heartbeatMs: number;
}

export const PROFILES: Record<TrackingProfile, ProfileConfig> = {
  // Mapa abierto: GPS + Wi-Fi + red a la mayor precisión.
  map: {
    watch: { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2_000, distanceInterval: 3 },
    minUploadMs: 5_000,
    minUploadMeters: 10,
    heartbeatMs: 30_000,
  },
  // App abierta en otra pantalla.
  app: {
    watch: { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 15 },
    minUploadMs: 15_000,
    minUploadMeters: 25,
    heartbeatMs: 60_000,
  },
  // Segundo plano normal.
  background: {
    watch: { accuracy: Location.Accuracy.Balanced, timeInterval: 60_000, distanceInterval: 50 },
    minUploadMs: 30_000,
    minUploadMeters: 50,
    heartbeatMs: 5 * 60_000,
  },
  // Segundo plano con batería baja (< 20 % y sin cargar).
  backgroundSaver: {
    watch: { accuracy: Location.Accuracy.Low, timeInterval: 3 * 60_000, distanceInterval: 200 },
    minUploadMs: 2 * 60_000,
    minUploadMeters: 200,
    heartbeatMs: 15 * 60_000,
  },
  // Emergencia: precisión alta y envíos frecuentes aunque haya poca batería.
  sos: {
    watch: { accuracy: Location.Accuracy.Highest, timeInterval: 5_000, distanceInterval: 5 },
    minUploadMs: 5_000,
    minUploadMeters: 5,
    heartbeatMs: 20_000,
  },
};

export function backgroundTaskOptions(profile: 'background' | 'backgroundSaver' | 'sos'): Location.LocationTaskOptions {
  const { watch } = PROFILES[profile];
  const sos = profile === 'sos';
  return {
    ...watch,
    // iOS: agrupar lecturas cuando no hay prisa, para ahorrar batería.
    deferredUpdatesInterval: sos ? 0 : watch.timeInterval,
    deferredUpdatesDistance: sos ? 0 : watch.distanceInterval,
    activityType: Location.LocationActivityType.Other,
    pausesUpdatesAutomatically: false,
    // Transparencia: el sistema muestra siempre que la ubicación está en uso.
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: sos ? 'Órbita · Alerta SOS activa' : 'Órbita · Compartiendo ubicación',
      notificationBody: sos
        ? 'Tus contactos de emergencia ven tu ubicación en tiempo real.'
        : 'Tus círculos pueden ver tu ubicación. Abre la app para pausar.',
      notificationColor: sos ? '#FF4D6D' : '#7C5CFF',
      killServiceOnDestroy: false,
    },
  };
}

/** Umbral de precisión (m) a partir del cual la señal se considera débil. */
export const WEAK_ACCURACY_M = 80;
/** Sin lecturas durante este tiempo → "Sin señal GPS". */
export const SIGNAL_LOST_MS = 45_000;
