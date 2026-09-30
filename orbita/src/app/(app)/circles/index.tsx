import { router } from 'expo-router';
import { Inbox, Plus, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { CircleIcon, kindInfo } from '@/components/CircleIcon';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { StatusDot } from '@/components/StatusDot';
import { useNow } from '@/hooks/useNow';
import { freshness, freshnessColor, memberStatusText } from '@/lib/format';
import { colors, fonts, radius, type } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { listMyInvitations } from '@/services/circles';
import { useCirclesStore } from '@/store/circles';
import { useSharingStore } from '@/store/sharing';
import type { DirectoryMember } from '@/types/db';

export default function Circles() {
  const now = useNow(5000);
  const { session } = useAuth();
  const circles = useCirclesStore((s) => s.circles);
  const locations = useCirclesStore((s) => s.locations);
  const loaded = useCirclesStore((s) => s.loaded);
  const mySettings = useSharingStore((s) => s.settings);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    listMyInvitations().then((l) => setPending(l.length)).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await useCirclesStore.getState().load().catch(() => {});
    setPending((await listMyInvitations().catch(() => [])).length);
    setRefreshing(false);
  }, []);

  const statusFor = (m: DirectoryMember) => {
    const isMe = m.user_id === session?.user.id;
    const status = isMe ? (mySettings?.status ?? 'off') : m.share_status;
    const updatedAt = locations[m.user_id]?.recorded_at;
    const text = memberStatusText({ updatedAt, shareStatus: status, sharingInCircle: m.sharing_enabled, now });
    const visible = !!updatedAt && status === 'active' && m.sharing_enabled;
    const color = status === 'paused' ? colors.warning : visible ? freshnessColor[freshness(updatedAt, now)] : colors.offline;
    return { text, color, live: visible && freshness(updatedAt, now) === 'live' };
  };

  return (
    <Screen
      title="Mis círculos"
      subtitle="Las personas con las que compartes, y que comparten contigo."
      scroll={false}
      right={<IconButton icon={Inbox} label="Invitaciones" badge={pending} onPress={() => router.push('/invitations')} />}
    >
      <ScrollView
        contentContainerStyle={{ gap: 14, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        {loaded && !circles.length ? (
          <EmptyState icon={Users} title="Crea tu primer círculo" message="Familia, amigos, trabajo… Invita a quien quieras y decide con quién compartir tu ubicación.">
            <Button title="Crear círculo" icon={Plus} onPress={() => router.push('/circles/new')} style={{ alignSelf: 'stretch', marginTop: 12 }} />
            <Button title="Tengo un código" variant="secondary" onPress={() => router.push('/invitations')} style={{ alignSelf: 'stretch' }} />
          </EmptyState>
        ) : null}

        {circles.map((c, index) => {
          const info = kindInfo(c.kind);
          return (
            <Animated.View key={c.id} entering={FadeInDown.delay(index * 60).duration(400)}>
              <PressableScale onPress={() => router.push({ pathname: '/circles/[id]', params: { id: c.id } })} scaleTo={0.98}>
                <View style={[styles.card, { borderColor: `${c.color}40` }]}>
                  <View style={styles.cardHeader}>
                    <CircleIcon kind={c.kind} color={c.color} size={46} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.circleName}>{c.name.toUpperCase()}</Text>
                      <Text style={type.caption}>
                        {info.label} · {c.members.length} {c.members.length === 1 ? 'miembro' : 'miembros'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.members}>
                    {c.members.map((m) => {
                      const st = statusFor(m);
                      return (
                        <View key={m.user_id} style={styles.memberRow}>
                          <StatusDot color={st.color} size={9} pulse={st.live} />
                          <Text style={styles.memberName} numberOfLines={1}>
                            {m.user_id === session?.user.id ? 'Tú' : m.full_name || 'Sin nombre'}
                          </Text>
                          <Text style={styles.memberStatus} numberOfLines={1}>
                            — {st.text}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </PressableScale>
            </Animated.View>
          );
        })}
      </ScrollView>
      {circles.length ? (
        <View style={styles.fab}>
          <Button title="Nuevo círculo" icon={Plus} onPress={() => router.push('/circles/new')} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: 18, gap: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  circleName: { color: colors.text, fontFamily: fonts.extrabold, fontSize: 16, letterSpacing: 0.8 },
  members: { gap: 10 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberName: { color: colors.text, fontFamily: fonts.bold, fontSize: 14.5, maxWidth: '40%' },
  memberStatus: { flex: 1, color: colors.textDim, fontFamily: fonts.medium, fontSize: 13.5 },
  fab: { position: 'absolute', left: 16, right: 16, bottom: 24 },
});
