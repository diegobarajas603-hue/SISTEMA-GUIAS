/**
 * Tarea de ubicación en segundo plano.
 *
 * Usa las APIs oficiales: en Android un Foreground Service con notificación
 * permanente ("Compartiendo ubicación"), y en iOS el modo de fondo "location"
 * con el indicador azul del sistema visible. Sólo se registra cuando el
 * usuario activa "Compartir ubicación" o una alerta SOS, y se detiene sola si
 * el servidor responde que ya no está compartiendo.
 *
 * Este archivo debe importarse en el nivel superior de la app (src/app/_layout)
 * para que la tarea exista aunque el sistema despierte la app sin interfaz.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { useLocationStore } from '@/store/location';

import { backgroundTaskOptions, type TrackingProfile } from './policy';
import { maybeUpload } from './uploader';

export const LOCATION_TASK = 'orbita-background-location';
const PROFILE_KEY = 'orbita.bgProfile';

type BgProfile = Extract<TrackingProfile, 'background' | 'backgroundSaver' | 'sos'>;

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  // La lectura más reciente es la que importa.
  const latest = data.locations.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));

  useLocationStore.getState().setFix(latest);

  const profile = ((await AsyncStorage.getItem(PROFILE_KEY)) as BgProfile | null) ?? 'background';
  const result = await maybeUpload(latest, profile);

  if (result === 'not_sharing' || result === 'no_session') {
    // Se dejó de compartir (expiró 1 h/8 h, se pausó en otro dispositivo,
    // o se cerró sesión): no seguir leyendo la ubicación.
    await stopBackgroundUpdates();
    return;
  }

  // Adaptarse a la batería sin reiniciar la tarea en cada lectura.
  if (profile !== 'sos') {
    const desired = await desiredProfile();
    if (desired !== profile) await startBackgroundUpdates(desired);
  }
});

async function desiredProfile(): Promise<BgProfile> {
  try {
    const [level, state, lowPower] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
      Battery.isLowPowerModeEnabledAsync(),
    ]);
    const charging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
    if (!charging && (lowPower || (level >= 0 && level < 0.2))) return 'backgroundSaver';
  } catch {
    // Sin datos de batería: perfil normal.
  }
  return 'background';
}

export async function isBackgroundTracking(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Inicia (o reconfigura) las actualizaciones en segundo plano. Devuelve false
 * si no hay permiso "Siempre": en ese caso sólo se comparte con la app abierta.
 */
export async function startBackgroundUpdates(profile?: BgProfile): Promise<boolean> {
  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return false;
  const chosen = profile ?? (await desiredProfile());
  await AsyncStorage.setItem(PROFILE_KEY, chosen);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, backgroundTaskOptions(chosen));
  return true;
}

export async function stopBackgroundUpdates(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_KEY).catch(() => {});
  if (await isBackgroundTracking()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
  }
}
