import { useLocalSearchParams } from 'expo-router';
import { Clock, History as HistoryIcon, Lock, Route, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListRow } from '@/components/ListRow';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { firstName, formatDistance, formatDuration, formatTime } from '@/lib/format';
import { pathLength, regionFor, simplify } from '@/lib/geo';
import { darkMapStyle } from '@/lib/mapStyle';
import { friendlyError, supabase } from '@/lib/supabase';
import { colors, fonts, radius, type } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { useCirclesStore } from '@/store/circles';
import { useSharingStore } from '@/store/sharing';
import { toast } from '@/store/toast';
import type { HistoryPoint } from '@/types/db';

type Range = 'today' | 'yesterday' | 'week';

function rangeBounds(range: Range): [Date, Date] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  if (range === 'yesterday') {
    const y = new Date(start);
    y.setDate(y.getDate() - 1);
    return [y, start];
  }
  if (range === 'week') start.setDate(start.getDate() - 6);
  return [start, end];
}

export default function History() {
  const params = useLocalSearchParams<{ user?: string }>();
  const { session, profile } = useAuth();
  const myId = session?.user.id;
  const settings = useSharingStore((s) => s.settings);
  const circles = useCirclesStore((s) => s.circles);
  const map = useRef<MapView>(null);

  const [range, setRange] = useState<Range>('today');
  const [userId, setUserId] = useState<string | undefined>(params.user ?? myId);
  const [loaded, setLoaded] = useState<{ key: string; points: HistoryPoint[] } | null>(null);
  const queryKey = `${userId}|${range}`;
  const points = loaded?.key === queryKey ? loaded.points : null;
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Personas cuyo historial puedo ver: yo y quien me dio consentimiento explícito.
  const people = useMemo(() => {
    const list = [{ id: myId!, name: 'Yo', avatar: profile?.avatar_url ?? null, color: profile?.color ?? colors.primary }];
    const seen = new Set([myId]);
    for (const c of circles)
      for (const m of c.members)
        if (m.share_history && !seen.has(m.user_id)) {
          seen.add(m.user_id);
          list.push({ id: m.user_id, name: firstName(m.full_name), avatar: m.avatar_url, color: m.color });
        }
    return list;
  }, [circles, myId, profile]);

  const isMine = userId === myId;

  useEffect(() => {
    if (!userId) return;
    const key = `${userId}|${range}`;
    const [from, to] = rangeBounds(range);
    supabase
      .from('location_history')
      .select('*')
      .eq('user_id', userId)
      .gte('recorded_at', from.toISOString())
      .lt('recorded_at', to.toISOString())
      .order('recorded_at')
      .limit(5000)
      .then(({ data }) => setLoaded({ key, points: (data as HistoryPoint[] | null) ?? [] }));
  }, [userId, range]);

  const path = useMemo(() => simplify(points ?? [], 6), [points]);
  const stats = useMemo(() => {
    if (!points?.length) return null;
    return {
      distance: pathLength(points),
      duration: new Date(points[points.length - 1].recorded_at).getTime() - new Date(points[0].recorded_at).getTime(),
      from: new Date(points[0].recorded_at),
      to: new Date(points[points.length - 1].recorded_at),
    };
  }, [points]);

  useEffect(() => {
    const region = regionFor(path);
    if (region) map.current?.animateToRegion(region, 600);
  }, [path]);

  const person = people.find((p) => p.id === userId) ?? people[0];

  const clearHistory = async () => {
    const { error } = await supabase.from('location_history').delete().eq('user_id', myId!);
    setConfirmDelete(false);
    if (error) return toast(friendlyError(error), 'danger');
    setLoaded({ key: queryKey, points: [] });
    toast('Tu historial fue eliminado.', 'success');
  };

  return (
    <Screen title="Historial" subtitle="Tus recorridos anteriores. Sólo tú los ves, salvo que des permiso.">
      {people.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {people.map((p) => (
            <PressableScale key={p.id} onPress={() => setUserId(p.id)} style={styles.person}>
              <Avatar name={p.name} uri={p.avatar} color={p.color} size={46} ring={p.id === userId ? colors.primary : null} />
              <Text style={[styles.personName, p.id === userId && { color: colors.text }]}>{p.name}</Text>
            </PressableScale>
          ))}
        </ScrollView>
      ) : null}

      <Segmented<Range>
        value={range}
        onChange={setRange}
        options={[
          { value: 'today', label: 'Hoy' },
          { value: 'yesterday', label: 'Ayer' },
          { value: 'week', label: 'Últimos 7 días' },
        ]}
      />

      <View style={styles.mapWrap}>
        <MapView
          ref={map}
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          customMapStyle={Platform.OS === 'android' ? darkMapStyle : undefined}
          userInterfaceStyle="dark"
          toolbarEnabled={false}
        >
          {path.length > 1 ? (
            <>
              <Polyline coordinates={path} strokeWidth={9} strokeColor="rgba(124, 92, 255, 0.25)" lineCap="round" lineJoin="round" />
              <Polyline coordinates={path} strokeWidth={4} strokeColor={person.color} lineCap="round" lineJoin="round" />
            </>
          ) : null}
          {path.length ? (
            <>
              <Marker coordinate={path[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={[styles.endpoint, { backgroundColor: colors.success }]} />
              </Marker>
              <Marker coordinate={path[path.length - 1]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={[styles.endpoint, { backgroundColor: colors.danger }]} />
              </Marker>
            </>
          ) : null}
        </MapView>
        {points === null ? (
          <View style={styles.mapOverlay}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !points.length ? (
          <View style={styles.mapOverlay}>
            <Route size={28} color={colors.textMuted} />
            <Text style={[type.bodyDim, { textAlign: 'center' }]}>Sin recorridos en este periodo.</Text>
          </View>
        ) : null}
      </View>

      {stats ? (
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatDistance(stats.distance)}</Text>
            <Text style={type.caption}>Distancia</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatDuration(stats.duration)}</Text>
            <Text style={type.caption}>Tiempo</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {formatTime(stats.from)}–{formatTime(stats.to)}
            </Text>
            <Text style={type.caption}>Horario</Text>
          </View>
        </View>
      ) : null}

      {isMine ? (
        <Card title="Privacidad del historial">
          <ListRow
            icon={settings?.save_history ? HistoryIcon : Lock}
            iconColor={settings?.save_history ? colors.success : colors.textDim}
            title="Guardar mi historial"
            subtitle="Se guarda sólo mientras compartes ubicación. Para que otros lo vean, actívalo por círculo."
            toggle={{
              value: !!settings?.save_history,
              onChange: (v) =>
                useSharingStore
                  .getState()
                  .setSaveHistory(v)
                  .then(() => toast(v ? 'Guardando tu historial.' : 'Ya no se guarda tu historial.', 'success'))
                  .catch((e) => toast(friendlyError(e), 'danger')),
            }}
          />
        </Card>
      ) : (
        <ListRow icon={Clock} title={`Historial compartido por ${person.name}`} subtitle="Puede retirar este permiso en cualquier momento." />
      )}

      {isMine ? <Button title="Borrar todo mi historial" icon={Trash2} variant="secondary" onPress={() => setConfirmDelete(true)} /> : null}

      <ConfirmDialog
        visible={confirmDelete}
        tone="danger"
        icon={Trash2}
        title="¿Borrar tu historial?"
        message="Se eliminarán todos tus recorridos guardados. No se puede deshacer."
        confirmLabel="Borrar"
        onConfirm={clearHistory}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  person: { alignItems: 'center', gap: 6, width: 60 },
  personName: { color: colors.textDim, fontFamily: fonts.semibold, fontSize: 12 },
  mapWrap: { height: 320, borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.bgElevated },
  mapOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(7,8,13,0.55)' },
  endpoint: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: '#fff' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, padding: 14, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 4 },
  statValue: { color: colors.text, fontFamily: fonts.extrabold, fontSize: 16 },
});
