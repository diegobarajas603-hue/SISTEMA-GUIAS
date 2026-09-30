import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';

import { getPermissionState } from '@/services/location/permissions';
import { PROFILES, SIGNAL_LOST_MS, WEAK_ACCURACY_M, type TrackingProfile } from '@/services/location/policy';
import { maybeUpload } from '@/services/location/uploader';
import { useLocationStore } from '@/store/location';
import { isSharingNow, useSharingStore } from '@/store/sharing';
import { useSosStore } from '@/store/sos';
import { toast } from '@/store/toast';

import { useAppActive } from './useAppActive';

/**
 * Seguimiento en primer plano. Corre sólo con la app abierta y con permiso
 * ya concedido (nunca pide permisos por su cuenta). En el mapa usa el perfil
 * de máxima precisión; en otras pantallas, uno más ligero. Publica al
 * servidor sólo si el usuario está compartiendo o tiene un SOS activo.
 */
export function useLocationEngine(mapFocused: boolean) {
  const appActive = useAppActive();
  const sos = useSosStore((s) => s.active);
  const profile: TrackingProfile = sos ? 'sos' : mapFocused ? 'map' : 'app';
  const lastFixAt = useRef(0);
  const permissionNonce = useLocationStore((s) => s.permissionNonce);

  useEffect(() => {
    if (!appActive) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    const { setFix, setGps, setPermission } = useLocationStore.getState();

    (async () => {
      const perm = await getPermissionState();
      if (cancelled) return;
      setPermission(perm);
      if (perm.level === 'denied' || perm.level === 'undetermined') {
        setGps('denied');
        return;
      }
      if (!perm.servicesEnabled) {
        setGps('disabled');
        return;
      }
      if (!useLocationStore.getState().fix) {
        setGps('searching');
        // Arranque rápido con la última posición conocida (si es reciente).
        const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(() => null);
        if (last && !cancelled) setFix(last);
      }

      try {
        sub = await Location.watchPositionAsync(
          PROFILES[profile].watch,
          (fix) => {
            lastFixAt.current = Date.now();
            setFix(fix);
            const acc = fix.coords.accuracy ?? 999;
            setGps(acc > WEAK_ACCURACY_M ? 'weak' : 'ok');

            const sharing = isSharingNow(useSharingStore.getState().settings) || !!useSosStore.getState().active;
            if (sharing) {
              maybeUpload(fix, profile, { approximate: !perm.precise }).then((r) => {
                if (r === 'not_sharing') useSharingStore.getState().load();
              });
            }
          },
          () => setGps('lost'),
        );
        if (cancelled) sub.remove();
      } catch {
        setGps('lost');
      }
    })();

    // Vigilante de señal: sin lecturas por un rato → "Sin señal GPS".
    const watchdog = setInterval(async () => {
      if (!lastFixAt.current) return;
      if (Date.now() - lastFixAt.current > SIGNAL_LOST_MS) {
        const enabled = await Location.hasServicesEnabledAsync().catch(() => true);
        const prev = useLocationStore.getState().gps;
        const next = enabled ? 'lost' : 'disabled';
        if (prev !== next) {
          setGps(next);
          if (prev === 'ok' || prev === 'weak') {
            toast(enabled ? 'Se perdió la señal GPS. Mostrando la última ubicación.' : 'Los servicios de ubicación están apagados.', 'warning');
          }
        }
      }
    }, 10_000);

    return () => {
      cancelled = true;
      sub?.remove();
      clearInterval(watchdog);
    };
  }, [appActive, profile, permissionNonce]);

  // Expiración local de "Compartir durante 1 h / 8 h".
  const expiresAt = useSharingStore((s) => (s.settings?.status === 'active' ? s.settings.expires_at : null));
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    const timer = setTimeout(
      () => {
        useSharingStore
          .getState()
          .setSharing('off')
          .then(() => toast('Terminó el tiempo: dejaste de compartir tu ubicación.', 'info'))
          .catch(() => {});
      },
      Math.max(0, ms),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
}
