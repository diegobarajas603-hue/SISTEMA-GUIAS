import { router } from 'expo-router';
import { BellOff, CheckCheck, Siren, ShieldCheck, UserCheck, UserPlus, UserX, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { useNow } from '@/hooks/useNow';
import { timeAgo } from '@/lib/format';
import { colors, fonts, radius } from '@/lib/theme';
import { useAlertsStore } from '@/store/alerts';
import type { AlertItem, AlertKind } from '@/types/db';

const META: Record<AlertKind, { icon: LucideIcon; color: string }> = {
  sos: { icon: Siren, color: colors.danger },
  sos_ended: { icon: ShieldCheck, color: colors.success },
  invite: { icon: UserPlus, color: colors.primary },
  member_joined: { icon: UserCheck, color: colors.accent },
  invite_declined: { icon: UserX, color: colors.textDim },
};

function openAlert(a: AlertItem) {
  const d = a.data as { user_id?: string; code?: string; circle_id?: string };
  if ((a.kind === 'sos' || a.kind === 'sos_ended') && d.user_id) router.push({ pathname: '/member/[id]', params: { id: d.user_id } });
  else if (a.kind === 'invite' && d.code) router.push({ pathname: '/invite/[code]', params: { code: d.code } });
  else if (d.circle_id) router.push({ pathname: '/circles/[id]', params: { id: d.circle_id } });
}

export default function Alerts() {
  const now = useNow(30_000);
  const items = useAlertsStore((s) => s.items);
  const unread = useAlertsStore((s) => s.unread);

  useEffect(() => {
    useAlertsStore.getState().load();
  }, []);

  return (
    <Screen title="Alertas" subtitle="Avisos de seguridad y de tus círculos." right={unread ? <IconButton icon={CheckCheck} label="Marcar todo como leído" onPress={() => useAlertsStore.getState().markAllRead()} /> : undefined}>
      {!items.length ? <EmptyState icon={BellOff} title="Sin alertas" message="Aquí verás alertas SOS, invitaciones y nuevos miembros." /> : null}
      {items.map((a, i) => {
        const meta = META[a.kind] ?? META.member_joined;
        const Icon = meta.icon;
        return (
          <Animated.View key={a.id} entering={FadeInDown.delay(Math.min(i, 8) * 40)}>
            <PressableScale onPress={() => openAlert(a)} onLongPress={() => useAlertsStore.getState().remove(a.id)} scaleTo={0.98}>
              <View style={[styles.item, !a.read_at && styles.unread, a.kind === 'sos' && !a.read_at && styles.sos]}>
                <View style={[styles.icon, { backgroundColor: `${meta.color}22` }]}>
                  <Icon size={20} color={meta.color} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={1}>
                      {a.title}
                    </Text>
                    <Text style={styles.time}>{timeAgo(a.created_at, now)}</Text>
                  </View>
                  <Text style={styles.body}>{a.body}</Text>
                </View>
                {!a.read_at ? <View style={[styles.unreadDot, { backgroundColor: meta.color }]} /> : null}
              </View>
            </PressableScale>
          </Animated.View>
        );
      })}
      {items.length ? <Text style={styles.hint}>Mantén presionada una alerta para eliminarla.</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  unread: { backgroundColor: 'rgba(124,92,255,0.07)', borderColor: 'rgba(124,92,255,0.3)' },
  sos: { backgroundColor: 'rgba(255,77,109,0.1)', borderColor: 'rgba(255,77,109,0.45)' },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  time: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 11.5 },
  body: { color: colors.textDim, fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, alignSelf: 'center' },
  hint: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12, textAlign: 'center', marginTop: 6 },
});
