import { useState } from 'react';

import { friendlyError } from '@/lib/supabase';
import { getPermissionState, openSettings, requestBackground, requestForeground } from '@/services/location/permissions';
import { useLocationStore } from '@/store/location';
import { useSharingStore } from '@/store/sharing';
import { toast } from '@/store/toast';
import type { ShareMode } from '@/types/db';

/**
 * Flujo explícito para empezar a compartir: permiso "mientras se usa" →
 * (opcional) permiso "siempre" → activar en el servidor. Si la persona no da
 * permiso "siempre", se comparte sólo con la app abierta y se le dice.
 */
export function useShareFlow() {
  const [busy, setBusy] = useState(false);
  const [askBackground, setAskBackground] = useState<ShareMode | null>(null);

  const activate = async (mode: ShareMode, withBackground: boolean) => {
    setBusy(true);
    try {
      if (withBackground) await requestBackground();
      useLocationStore.getState().bumpPermissions();
      const { background } = await useSharingStore.getState().setSharing('active', mode);
      toast(
        background ? 'Estás compartiendo tu ubicación.' : 'Compartiendo sólo mientras la app esté abierta. Activa "Permitir siempre" para segundo plano.',
        background ? 'success' : 'warning',
      );
    } catch (e) {
      toast(friendlyError(e), 'danger');
    } finally {
      setBusy(false);
      setAskBackground(null);
    }
  };

  /** Paso 1: el usuario eligió un modo. */
  const start = async (mode: ShareMode) => {
    let perm = await getPermissionState();
    if (perm.level === 'undetermined' || (perm.level === 'denied' && perm.canAskAgain)) perm = await requestForeground();
    if (perm.level === 'denied') {
      toast('Necesitas permitir la ubicación en Ajustes para compartirla.', 'warning');
      openSettings();
      return;
    }
    if (perm.level === 'always') return activate(mode, false);
    // Explicar antes de pedir "siempre" (requisito de ambas tiendas).
    setAskBackground(mode);
  };

  const stop = async (status: 'off' | 'paused') => {
    setBusy(true);
    try {
      await useSharingStore.getState().setSharing(status);
      toast(status === 'paused' ? 'Ubicación en pausa. Nadie ve tu ubicación.' : 'Dejaste de compartir tu ubicación.', 'info');
    } catch (e) {
      toast(friendlyError(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return { busy, start, stop, askBackground, confirmBackground: (yes: boolean) => askBackground && activate(askBackground, yes), cancelBackground: () => setAskBackground(null) };
}
