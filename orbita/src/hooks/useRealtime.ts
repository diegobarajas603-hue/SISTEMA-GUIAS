import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';
import { hasPushToken, notifyLocal } from '@/services/notifications';
import { useAlertsStore } from '@/store/alerts';
import { useCirclesStore } from '@/store/circles';
import type { AlertItem, LiveLocation } from '@/types/db';

/**
 * Suscripciones en tiempo real. Supabase Realtime aplica las mismas políticas
 * RLS que las consultas, así que sólo llegan cambios de personas cuyo
 * consentimiento está vigente.
 */
export function useRealtime(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    const circles = useCirclesStore.getState();
    const alerts = useAlertsStore.getState();

    const channel = supabase
      .channel(`orbita-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_locations' }, (payload: RealtimePostgresChangesPayload<LiveLocation>) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as Partial<LiveLocation>;
          if (old.user_id) useCirclesStore.getState().removeLocation(old.user_id);
        } else {
          useCirclesStore.getState().upsertLocation(payload.new);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts', filter: `user_id=eq.${userId}` }, async (payload: RealtimePostgresChangesPayload<AlertItem>) => {
        const alert = payload.new as AlertItem;
        useAlertsStore.getState().add(alert);
        if (alert.kind === 'sos' || alert.kind === 'sos_ended') useCirclesStore.getState().refreshLocations();
        if (alert.kind === 'member_joined') useCirclesStore.getState().load();
        // Sin push configurado, avisar con notificación local.
        if (!(await hasPushToken())) notifyLocal(alert.title, alert.body, { ...alert.data, kind: alert.kind }, alert.kind === 'sos');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circle_members' }, () => {
        useCirclesStore.getState().load().catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_events' }, () => {
        useCirclesStore.getState().refreshLocations();
      })
      .subscribe();

    circles.load().catch(() => {});
    alerts.load().catch(() => {});

    // Respaldo por si la conexión en tiempo real se corta, y para que las
    // ubicaciones vencidas (pausas, expiraciones) desaparezcan del mapa.
    const poll = setInterval(() => useCirclesStore.getState().refreshLocations().catch(() => {}), 30_000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
