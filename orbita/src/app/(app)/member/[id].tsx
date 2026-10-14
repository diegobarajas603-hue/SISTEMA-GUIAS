import { router, useLocalSearchParams } from 'expo-router';
import { BatteryMedium, Crosshair, EyeOff, Gauge, History, MapPin, Navigation, Siren } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card, Divider } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { MemberMarker } from '@/components/map/MemberMarker';
import { Screen } from '@/components/Screen';
import { StatusDot } from '@/components/StatusDot';
import { useNow } from '@/hooks/useNow';
import { formatAccuracy, formatDateTime, formatDistance, formatDuration, formatSpeed, freshness, freshnessColor, memberStatusText, timeAgo } from '@/lib/format';
import { directionsUrl, distanceMeters } from '@/lib/geo';
import { darkMapStyle } from '@/lib/mapStyle';
import { friendlyError } from '@/lib/supabase';
import { colors, fonts, radius, type } from '@/lib/theme';
import { listBlocked, setBlocked } from '@/services/circles';
import { useCirclesStore } from '@/store/circles';
import { useLocationStore } from '@/store/location';
import { toast } from '@/store/toast';

export default function MemberDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow(1000);
  const circles = useCirclesStore((s) => s.circles);
  const loc = useCirclesStore((s) => (id ? s.locations[id] : undefined));
  const sos = useCirclesStore((s) => s.incomingSos.find((e) => e.user_id === id));
  const sosProfile = useCirclesStore((s) => (id ? s.sosProfiles[id] : undefined));
  const myFix = useLocationStore((s) => s.fix);
  const [blocked, setBlockedState] = useState(false);

  useEffect(() => {
    listBlocked().then((l) => setBlockedState(!!id && l.includes(id))).catch(() => {});
  }, [id]);

  const memberships = useMemo(
    () => circles.flatMap((c) => c.members.filter((m) => m.user_id === id).map((m) => ({ circle: c, member: m }))),
    [circles, id],
  );
  const base = memberships[0]?.member;
  const name = base?.full_name ?? sosProfile?.full_name ?? 'Contacto';
  const color = base?.color ?? sosProfile?.color ?? colors.primary;
  const avatar = base?.avatar_url ?? sosProfile?.avatar_url ?? null;
  const sharingWithMe = memberships.some((m) => m.member.sharing_enabled);
  const historyAllowed = memberships.some((m) => m.member.share_history);
  const shareStatus = base?.share_status ?? 'off';

  const f = sos ? 'live' : freshness(loc?.recorded_at, now);
  const statusText = sos
    ? `Alerta SOS activa · ${formatDuration(now - new Date(sos.started_at).getTime())}`
    : memberStatusText({ updatedAt: loc?.recorded_at, shareStatus, sharingInCircle: sharingWithMe, now });
  const distance = loc && myFix ? distanceMeters(myFix.coords, loc) : null;

  const toggleBlock = async (value: boolean) => {
    if (!id) return;
    setBlockedState(value);
    try {
      await setBlocked(id, value);
      toast(value ? `${name} ya no puede ver tu ubicación.` : `${name} puede volver a ver tu ubicación.`, 'success');
    } catch (e) {
      setBlockedState(!value);
      toast(friendlyError(e), 'danger');
    }
  };

  const openDirections = () => {
    if (!loc) return;
    const urls = directionsUrl(loc, name);
    Linking.openURL(Platform.OS === 'ios' ? urls.ios : urls.android).catch(() => {});
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Avatar name={name} uri={avatar} color={color} size={88} ring={sos ? colors.danger : color} />
        <Text style={type.display}>{name}</Text>
        <View style={styles.statusRow}>
          <StatusDot color={sos ? colors.danger : shareStatus === 'paused' ? colors.warning : loc ? freshnessColor[f] : colors.offline} size={9} pulse={!!sos || f === 'live'} />
          <Text style={[type.bodyDim, sos && { color: colors.danger }]}>{statusText}</Text>
        </View>
      </View>

      {sos ? (
        <View style={styles.sos}>
          <Siren size={22} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.sosTitle}>{name} necesita ayuda</Text>
            <Text style={styles.sosText}>
              Activada {timeAgo(sos.started_at, now)}
              {sos.message ? ` · "${sos.message}"` : ''}. Si no responde, llama a emergencias.
            </Text>
          </View>
        </View>
      ) : null}

      {loc ? (
        <>
          <View style={styles.mapWrap}>
            <MapView
              style={StyleSheet.absoluteFill}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              customMapStyle={Platform.OS === 'android' ? darkMapStyle : undefined}
              userInterfaceStyle="dark"
              region={{ latitude: loc.latitude, longitude: loc.longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              toolbarEnabled={false}
            >
              <MemberMarker id={loc.user_id} name={name} avatarUrl={avatar} color={color} latitude={loc.latitude} longitude={loc.longitude} updatedAt={loc.recorded_at} sos={!!sos} />
            </MapView>
          </View>

          <Card>
            <ListRow icon={MapPin} iconColor={colors.accent} title="Última actualización" subtitle={formatDateTime(loc.recorded_at)} right={<Text style={styles.value}>{timeAgo(loc.recorded_at, now)}</Text>} />
            <Divider />
            <ListRow icon={Crosshair} title="Precisión" subtitle={loc.is_approximate ? 'Comparte ubicación aproximada' : undefined} right={<Text style={styles.value}>{formatAccuracy(loc.accuracy)}</Text>} />
            <Divider />
            <ListRow icon={Gauge} iconColor={colors.success} title="Velocidad" right={<Text style={styles.value}>{formatSpeed(loc.speed)}</Text>} />
            {distance !== null ? (
              <>
                <Divider />
                <ListRow icon={Navigation} iconColor={colors.warning} title="Distancia de ti" right={<Text style={styles.value}>{formatDistance(distance)}</Text>} />
              </>
            ) : null}
            {loc.battery_level !== null ? (
              <>
                <Divider />
                <ListRow icon={BatteryMedium} iconColor="#A78BFA" title="Batería" right={<Text style={styles.value}>{Math.round(loc.battery_level * 100)}%</Text>} />
              </>
            ) : null}
          </Card>
          <Button title="Cómo llegar" icon={Navigation} onPress={openDirections} />
          {sos ? <Button title="Llamar a emergencias (911)" icon={Siren} variant="danger" onPress={() => Linking.openURL('tel:911')} /> : null}
        </>
      ) : (
        <View style={styles.noLoc}>
          <Text style={type.bodyDim}>
            {shareStatus === 'paused'
              ? `${name} pausó su ubicación.`
              : `${name} no está compartiendo su ubicación contigo en este momento.`}
          </Text>
        </View>
      )}

      {memberships.length ? (
        <Card title="Privacidad">
          {historyAllowed ? (
            <>
              <ListRow icon={History} title="Ver historial" subtitle={`${name} te dio permiso de ver sus recorridos`} onPress={() => router.push({ pathname: '/history', params: { user: id } })} chevron />
              <Divider />
            </>
          ) : null}
          <ListRow
            icon={EyeOff}
            iconColor={colors.danger}
            title={`Dejar de compartir con ${name.split(' ')[0]}`}
            subtitle="No verá tu ubicación en ningún círculo, sin avisarle"
            toggle={{ value: blocked, onChange: toggleBlock }}
          />
        </Card>
      ) : null}

      {memberships.length ? (
        <Text style={[type.caption, { textAlign: 'center', marginTop: 4 }]}>En común: {memberships.map((m) => m.circle.name).join(', ')}</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 10, paddingBottom: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sos: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 18, borderRadius: radius.xl, backgroundColor: colors.danger },
  sosTitle: { color: '#fff', fontFamily: fonts.extrabold, fontSize: 16 },
  sosText: { color: 'rgba(255,255,255,0.9)', fontFamily: fonts.medium, fontSize: 13, marginTop: 2, lineHeight: 18 },
  mapWrap: { height: 200, borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  value: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  noLoc: { padding: 20, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center' },
});
