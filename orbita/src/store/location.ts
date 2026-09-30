import type { LocationObject } from 'expo-location';
import { create } from 'zustand';

import type { LocationPermissionState } from '@/services/location/permissions';

export type GpsStatus = 'idle' | 'searching' | 'ok' | 'weak' | 'lost' | 'disabled' | 'denied';

interface LocationState {
  fix: LocationObject | null;
  gps: GpsStatus;
  permission: LocationPermissionState | null;
  /** Cambia para que el motor vuelva a leer permisos (tras pedirlos). */
  permissionNonce: number;
  bumpPermissions: () => void;
  setFix: (fix: LocationObject) => void;
  setGps: (gps: GpsStatus) => void;
  setPermission: (p: LocationPermissionState) => void;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  fix: null,
  gps: 'idle',
  permission: null,
  permissionNonce: 0,
  bumpPermissions: () => set((s) => ({ permissionNonce: s.permissionNonce + 1 })),
  setFix: (fix) => {
    const prev = get().fix;
    if (prev && prev.timestamp > fix.timestamp) return; // ignorar lecturas viejas
    set({ fix });
  },
  setGps: (gps) => set({ gps }),
  setPermission: (permission) => set({ permission }),
}));
