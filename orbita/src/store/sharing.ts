import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import { startBackgroundUpdates, stopBackgroundUpdates } from '@/services/location/background';
import { resetUploadState } from '@/services/location/uploader';
import type { ShareMode, ShareStatus, SharingSettings } from '@/types/db';

interface SharingState {
  settings: SharingSettings | null;
  /** true si hay permiso "Siempre" y la tarea de fondo está corriendo. */
  backgroundActive: boolean;
  loading: boolean;
  load: () => Promise<void>;
  setSharing: (status: ShareStatus, mode?: ShareMode) => Promise<{ background: boolean }>;
  setSaveHistory: (value: boolean) => Promise<void>;
  /** Sincroniza la tarea de fondo con el estado real (al abrir la app). */
  reconcile: (sosActive: boolean) => Promise<void>;
  reset: () => void;
}

export function isSharingNow(s: SharingSettings | null, now = Date.now()): boolean {
  if (!s || s.status !== 'active') return false;
  return !s.expires_at || new Date(s.expires_at).getTime() > now;
}

export const useSharingStore = create<SharingState>((set, get) => ({
  settings: null,
  backgroundActive: false,
  loading: false,

  load: async () => {
    set({ loading: true });
    const { data } = await supabase.from('sharing_settings').select('*').maybeSingle();
    set({ settings: (data as SharingSettings | null) ?? null, loading: false });
  },

  setSharing: async (status, mode = 'until_off') => {
    const { data, error } = await supabase.rpc('set_sharing', { p_status: status, p_mode: mode });
    if (error) throw error;
    set({ settings: data as SharingSettings });

    let background = false;
    if (status === 'active') {
      await resetUploadState(); // publicar de inmediato la primera lectura
      background = await startBackgroundUpdates().catch(() => false);
    } else {
      await stopBackgroundUpdates();
    }
    set({ backgroundActive: background });
    return { background };
  },

  setSaveHistory: async (value) => {
    const prev = get().settings;
    if (prev) set({ settings: { ...prev, save_history: value } });
    const { error } = await supabase
      .from('sharing_settings')
      .update({ save_history: value })
      .eq('user_id', prev?.user_id ?? '');
    if (error) {
      set({ settings: prev });
      throw error;
    }
  },

  reconcile: async (sosActive) => {
    await get().load();
    const sharing = isSharingNow(get().settings);
    if (sharing || sosActive) {
      const background = await startBackgroundUpdates(sosActive ? 'sos' : undefined).catch(() => false);
      set({ backgroundActive: background });
    } else {
      await stopBackgroundUpdates();
      set({ backgroundActive: false });
    }
  },

  reset: () => set({ settings: null, backgroundActive: false }),
}));
