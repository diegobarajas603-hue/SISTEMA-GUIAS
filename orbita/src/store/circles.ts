import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import type { Circle, DirectoryMember, LiveLocation, Profile, SosEvent } from '@/types/db';

export interface CircleWithMembers extends Circle {
  members: DirectoryMember[];
}

interface CirclesState {
  circles: CircleWithMembers[];
  /** Ubicaciones visibles para mí (el servidor ya filtró por consentimiento). */
  locations: Record<string, LiveLocation>;
  /** Alertas SOS activas de otras personas que me eligieron como contacto. */
  incomingSos: SosEvent[];
  /** Perfiles de quienes me enviaron un SOS (pueden no estar en mis círculos). */
  sosProfiles: Record<string, Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'color'>>;
  selectedCircleId: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  refreshLocations: () => Promise<void>;
  upsertLocation: (loc: LiveLocation) => void;
  removeLocation: (userId: string) => void;
  selectCircle: (id: string | null) => void;
  reset: () => void;
}

export const useCirclesStore = create<CirclesState>((set, get) => ({
  circles: [],
  locations: {},
  incomingSos: [],
  sosProfiles: {},
  selectedCircleId: null,
  loaded: false,

  load: async () => {
    const { data: circles, error } = await supabase.from('circles').select('*').order('created_at');
    if (error) throw error;

    const withMembers = await Promise.all(
      (circles as Circle[]).map(async (c) => {
        const { data } = await supabase.rpc('circle_directory', { p_circle: c.id });
        return { ...c, members: (data as DirectoryMember[] | null) ?? [] };
      }),
    );

    const selected = get().selectedCircleId;
    set({
      circles: withMembers,
      loaded: true,
      selectedCircleId: selected && withMembers.some((c) => c.id === selected) ? selected : null,
    });
    await get().refreshLocations();
  },

  refreshLocations: async () => {
    const [{ data: locs }, { data: sos }] = await Promise.all([
      supabase.from('live_locations').select('*'),
      supabase.from('sos_events').select('*').eq('status', 'active').gt('expires_at', new Date().toISOString()),
    ]);

    const locations: Record<string, LiveLocation> = {};
    for (const l of (locs as LiveLocation[] | null) ?? []) locations[l.user_id] = l;

    const { data: auth } = await supabase.auth.getUser();
    const incomingSos = ((sos as SosEvent[] | null) ?? []).filter((e) => e.user_id !== auth.user?.id);

    let sosProfiles = get().sosProfiles;
    const missing = incomingSos.map((e) => e.user_id).filter((id) => !sosProfiles[id]);
    if (missing.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, color')
        .in('id', missing);
      sosProfiles = { ...sosProfiles };
      for (const p of (profiles as CirclesState['sosProfiles'][string][] | null) ?? []) sosProfiles[p.id] = p;
    }

    set({ locations, incomingSos, sosProfiles });
  },

  upsertLocation: (loc) => set((s) => ({ locations: { ...s.locations, [loc.user_id]: loc } })),
  removeLocation: (userId) =>
    set((s) => {
      const next = { ...s.locations };
      delete next[userId];
      return { locations: next };
    }),
  selectCircle: (id) => set({ selectedCircleId: id }),
  reset: () => set({ circles: [], locations: {}, incomingSos: [], sosProfiles: {}, selectedCircleId: null, loaded: false }),
}));

/** Miembros únicos (sin mí) del círculo seleccionado o de todos los círculos. */
export function visibleMembers(state: Pick<CirclesState, 'circles' | 'selectedCircleId'>, myId: string | undefined) {
  const source = state.selectedCircleId
    ? state.circles.filter((c) => c.id === state.selectedCircleId)
    : state.circles;
  const byId = new Map<string, DirectoryMember & { circles: string[] }>();
  for (const c of source) {
    for (const m of c.members) {
      if (m.user_id === myId) continue;
      const existing = byId.get(m.user_id);
      if (existing) existing.circles.push(c.name);
      else byId.set(m.user_id, { ...m, circles: [c.name] });
    }
  }
  return [...byId.values()];
}
