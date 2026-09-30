import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import type { AlertItem } from '@/types/db';

interface AlertsState {
  items: AlertItem[];
  unread: number;
  load: () => Promise<void>;
  add: (a: AlertItem) => void;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  reset: () => void;
}

const countUnread = (items: AlertItem[]) => items.filter((a) => !a.read_at).length;

export const useAlertsStore = create<AlertsState>((set, get) => ({
  items: [],
  unread: 0,
  load: async () => {
    const { data } = await supabase.from('alerts').select('*').order('created_at', { ascending: false }).limit(100);
    const items = (data as AlertItem[] | null) ?? [];
    set({ items, unread: countUnread(items) });
  },
  add: (a) =>
    set((s) => {
      if (s.items.some((x) => x.id === a.id)) return s;
      const items = [a, ...s.items];
      return { items, unread: countUnread(items) };
    }),
  markAllRead: async () => {
    const ids = get().items.filter((a) => !a.read_at).map((a) => a.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    set((s) => ({ items: s.items.map((a) => (a.read_at ? a : { ...a, read_at: now })), unread: 0 }));
    await supabase.from('alerts').update({ read_at: now }).in('id', ids);
  },
  remove: async (id) => {
    set((s) => {
      const items = s.items.filter((a) => a.id !== id);
      return { items, unread: countUnread(items) };
    });
    await supabase.from('alerts').delete().eq('id', id);
  },
  reset: () => set({ items: [], unread: 0 }),
}));
