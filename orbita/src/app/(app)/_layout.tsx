import * as Notifications from 'expo-notifications';
import { router, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { useLocationEngine } from '@/hooks/useLocationEngine';
import { useRealtime } from '@/hooks/useRealtime';
import { colors } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { registerForPush } from '@/services/notifications';
import { takePendingInvite } from '@/services/pendingInvite';
import { useSharingStore } from '@/store/sharing';
import { useSosStore } from '@/store/sos';

export const unstable_settings = { initialRouteName: 'index' };

export default function AppLayout() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const pathname = usePathname();

  useLocationEngine(pathname === '/');
  useRealtime(userId);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      await useSosStore.getState().load();
      await useSharingStore.getState().reconcile(!!useSosStore.getState().active);
    })().catch(() => {});
    registerForPush(userId).catch(() => {});
    takePendingInvite().then((code) => {
      if (code) router.push({ pathname: '/invite/[code]', params: { code } });
    });
  }, [userId]);

  // Abrir la pantalla correcta al tocar una notificación.
  useEffect(() => {
    const open = (data: Record<string, unknown> | undefined) => {
      if (!data) return;
      if ((data.kind === 'sos' || data.kind === 'sos_ended') && typeof data.user_id === 'string') {
        router.push({ pathname: '/member/[id]', params: { id: data.user_id } });
      } else if (data.kind === 'invite' && typeof data.code === 'string') {
        router.push({ pathname: '/invite/[code]', params: { code: data.code } });
      } else {
        router.push('/alerts');
      }
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification.request.content.data);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    return () => sub.remove();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="sharing" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="safety/sos" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="location" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
