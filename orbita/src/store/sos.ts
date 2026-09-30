import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import { startBackgroundUpdates, stopBackgroundUpdates } from '@/services/location/background';
import type { SosEvent } from '@/types/db';

import { isSharingNow, useSharingStore } from './sharing';

interface SosState {
  active: SosEvent | null;
  recipients: number;
  load: () => Promise<void>;
  start: (coords: { latitude: number; longitude: number; accuracy: number | null }, message?: string) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

export const useSosStore = create<SosState>((set, get) => ({
  active: null,
  recipients: 0,

  load: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data } = await supabase
      .from('sos_events')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    set({ active: (data as SosEvent | null) ?? null });
    if (data) {
      const { count } = await supabase
        .from('sos_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('sos_id', (data as SosEvent).id);
      set({ recipients: count ?? 0 });
    }
  },

  start: async (coords, message) => {
    const { data, error } = await supabase.rpc('start_sos', {
      p_latitude: coords.latitude,
      p_longitude: coords.longitude,
      p_accuracy: coords.accuracy,
      p_message: message ?? null,
    });
    if (error) throw error;
    const row = (data as { sos_id: string; recipients: number }[])[0];
    const { data: event } = await supabase.from('sos_events').select('*').eq('id', row.sos_id).single();
    set({ active: event as SosEvent, recipients: row.recipients });
    // Durante el SOS, seguimiento de alta precisión también en segundo plano.
    await startBackgroundUpdates('sos').catch(() => false);
  },

  cancel: async () => {
    const current = get().active;
    if (!current) return;
    const { error } = await supabase.rpc('cancel_sos', { p_id: current.id });
    if (error) throw error;
    set({ active: null, recipients: 0 });
    // Volver al modo anterior: seguir compartiendo normal o detener todo.
    if (isSharingNow(useSharingStore.getState().settings)) await startBackgroundUpdates().catch(() => false);
    else await stopBackgroundUpdates();
  },

  reset: () => set({ active: null, recipients: 0 }),
}));
