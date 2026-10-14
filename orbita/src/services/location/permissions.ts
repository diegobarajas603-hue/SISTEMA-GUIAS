import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

export type PermissionLevel = 'undetermined' | 'denied' | 'whenInUse' | 'always';

export interface LocationPermissionState {
  level: PermissionLevel;
  /** false = el usuario eligió "ubicación aproximada" (iOS reduced / Android coarse). */
  precise: boolean;
  servicesEnabled: boolean;
  canAskAgain: boolean;
}

export async function getPermissionState(): Promise<LocationPermissionState> {
  const [fg, bg, servicesEnabled] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync().catch(() => null),
    Location.hasServicesEnabledAsync().catch(() => true),
  ]);
  return {
    level: levelFrom(fg, bg),
    precise: isPrecise(fg),
    servicesEnabled,
    canAskAgain: fg.canAskAgain,
  };
}

/** Pide permiso "mientras se usa la app". Nunca se llama sin una acción del usuario. */
export async function requestForeground(): Promise<LocationPermissionState> {
  await Location.requestForegroundPermissionsAsync();
  return getPermissionState();
}

/**
 * Pide permiso "siempre" (segundo plano). En Android 11+ el sistema manda a
 * Ajustes; en iOS el diálogo puede aparecer más tarde. Requiere antes el
 * permiso de primer plano.
 */
export async function requestBackground(): Promise<LocationPermissionState> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    const res = await Location.requestForegroundPermissionsAsync();
    if (res.status !== 'granted') return getPermissionState();
  }
  await Location.requestBackgroundPermissionsAsync();
  return getPermissionState();
}

export function openSettings() {
  if (Platform.OS === 'ios') Linking.openURL('app-settings:');
  else Linking.openSettings();
}

function levelFrom(fg: Location.LocationPermissionResponse, bg: Location.PermissionResponse | null): PermissionLevel {
  if (fg.status === 'undetermined') return 'undetermined';
  if (fg.status !== 'granted') return 'denied';
  if (bg?.status === 'granted' || fg.ios?.scope === 'always') return 'always';
  return 'whenInUse';
}

function isPrecise(fg: Location.LocationPermissionResponse): boolean {
  if (fg.status !== 'granted') return false;
  if (fg.ios) return fg.ios.accuracy !== 'reduced';
  if (fg.android) return fg.android.accuracy !== 'coarse';
  return true;
}
