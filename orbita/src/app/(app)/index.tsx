import { router } from 'expo-router';
import { Bell, ChevronRight, Layers, LocateFixed, MapPin, Radio, Shield, Siren, Users } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Glass } from '@/components/Glass';
import { ActionTile } from '@/components/home/ActionTile';
import { CircleChips } from '@/components/home/CircleChips';
import { GpsPill } from '@/components/home/GpsPill';
import { MembersStrip, type StripMember } from '@/components/home/MembersStrip';
import { SharingBadge } from '@/components/home/SharingBadge';
import { IconButton } from '@/components/IconButton';
import { MemberMarker } from '@/components/map/MemberMarker';
import { SelfMarker } from '@/components/map/SelfMarker';
import { PressableScale } from '@/components/PressableScale';
import { useNow } from '@/hooks/useNow';
import { firstName, formatAccuracy, formatDuration, formatHeading, formatSpeed, timeAgo } from '@/lib/format';
import { darkMapStyle } from '@/lib/mapStyle';
import { colors, fonts, type } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { requestForeground } from '@/services/location/permissions';
import { useAlertsStore } from '@/store/alerts';
import { useCirclesStore, visibleMembers } from '@/store/circles';
import { useLocationStore } from '@/store/location';
import { isSharingNow, useSharingStore } from '@/store/sharing';
import { useSosStore } from '@/store/sos';

const DEFAULT_REGION: Region = { latitude: 19.4326, longitude: -99.1332, latitudeDelta: 0.08, longitudeDelta: 0.08 };
const CARD_HEIGHT = 330;

export default function Home() {
  const insets = useSafeAreaInsets();
  const map = useRef<MapView>(null);
  const now = useNow(1000);
  const { profile, session } = useAuth();
  const myId = session?.user.id;

  const fix = useLocationStore((s) => s.fix);
  const gps = useLocationStore((s) => s.gps);
  const permission = useLocationStore((s) => s.permission);
  const settings = useSharingStore((s) => s.settings);
  const mySos = useSosStore((s) => s.active);
  const unread = useAlertsStore((s) => s.unread);
  const circles = useCirclesStore((s) => s.circles);
  const selectedCircleId = useCirclesStore((s) => s.selectedCircleId);
  const locations = useCirclesStore((s) => s.locations);
  const incomingSos = useCirclesStore((s) => s.incomingSos);
  const sosProfiles = useCirclesStore((s) => s.sosProfiles);
  const selectCircle = useCirclesStore((s) => s.selectCircle);

  const [mapType, setMapType] = useState<'standard' | 'hybrid'>('standard');
  const [following, setFollowing] = useState(true);
  const centeredOnce = useRef(false);

  const sharing = isSharingNow(settings, now);
  const members = useMemo(() => visibleMembers({ circles, selectedCircleId }, myId), [circles, selectedCircleId, myId]);
  const sosByUser = useMemo(() => new Map(incomingSos.map((e) => [e.user_id, e])), [incomingSos]);

  // Personas en el mapa: miembros con ubicación visible + quien me mandó SOS.
  const markers = useMemo(() => {
    const list = members
      .filter((m) => locations[m.user_id])
      .map((m) => ({ id: m.user_id, name: m.full_name, avatarUrl: m.avatar_url, color: m.color, loc: locations[m.user_id] }));
    for (const e of incomingSos) {
      if (list.some((m) => m.id === e.user_id)) continue;
      const p = sosProfiles[e.user_id];
      const loc = locations[e.user_id];
      if (p && loc) list.push({ id: e.user_id, name: p.full_name, avatarUrl: p.avatar_url, color: p.color, loc });
    }
    return list;
  }, [members, locations, incomingSos, sosProfiles]);

  const strip: StripMember[] = useMemo(
    () =>
      members.map((m) => ({
        id: m.user_id,
        name: m.full_name,
        avatarUrl: m.avatar_url,
        color: m.color,
        updatedAt: locations[m.user_id]?.recorded_at ?? null,
        sos: sosByUser.has(m.user_id),
      })),
    [members, locations, sosByUser],
  );

  // Centrar en mí con la primera lectura y seguirme mientras no mueva el mapa.
  useEffect(() => {
    if (!fix) return;
    if (!centeredOnce.current) {
      centeredOnce.current = true;
      map.current?.animateToRegion({ latitude: fix.coords.latitude, longitude: fix.coords.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 700);
    } else if (following) {
      map.current?.animateCamera({ center: { latitude: fix.coords.latitude, longitude: fix.coords.longitude } }, { duration: 500 });
    }
  }, [fix, following]);

  const recenter = useCallback(() => {
    setFollowing(true);
    if (fix) {
      map.current?.animateToRegion({ latitude: fix.coords.latitude, longitude: fix.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
    }
  }, [fix]);

  const fitAll = useCallback(() => {
    const pts = markers.map((m) => ({ latitude: m.loc.latitude, longitude: m.loc.longitude }));
    if (fix) pts.push({ latitude: fix.coords.latitude, longitude: fix.coords.longitude });
    if (!pts.length) return;
    setFollowing(false);
    if (pts.length === 1) {
      map.current?.animateToRegion({ ...pts[0], latitudeDelta: 0.012, longitudeDelta: 0.012 }, 600);
      return;
    }
    map.current?.fitToCoordinates(pts, {
      edgePadding: { top: insets.top + 150, right: 80, bottom: CARD_HEIGHT + 60, left: 60 },
      animated: true,
    });
  }, [markers, fix, insets.top]);

  const focusMember = (m: StripMember) => {
    const loc = locations[m.id];
    if (!loc) {
      router.push({ pathname: '/member/[id]', params: { id: m.id } });
      return;
    }
    setFollowing(false);
    map.current?.animateToRegion({ latitude: loc.latitude, longitude: loc.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
  };

  const needsPermission = gps === 'denied' || permission?.level === 'undetermined';
  const selfStale = gps === 'lost' || gps === 'disabled';
  const firstSos = incomingSos[0];
  const firstSosName = firstSos ? (sosProfiles[firstSos.user_id]?.full_name ?? members.find((m) => m.user_id === firstSos.user_id)?.full_name) : null;

  return (
    <View style={styles.root}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={Platform.OS === 'android' && mapType === 'standard' ? darkMapStyle : undefined}
        userInterfaceStyle="dark"
        mapType={mapType}
        initialRegion={DEFAULT_REGION}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        pitchEnabled
        rotateEnabled
        mapPadding={{ top: insets.top + 100, right: 0, bottom: CARD_HEIGHT - 20, left: 0 }}
        onPanDrag={() => setFollowing(false)}
      >
        {fix ? (
          <SelfMarker
            latitude={fix.coords.latitude}
            longitude={fix.coords.longitude}
            accuracy={fix.coords.accuracy}
            heading={fix.coords.heading}
            name={profile?.full_name ?? 'Yo'}
            avatarUrl={profile?.avatar_url ?? null}
            color={profile?.color ?? colors.primary}
            stale={selfStale}
            sharing={sharing || !!mySos}
          />
        ) : null}
        {markers.map((m) => (
          <MemberMarker
            key={m.id}
            id={m.id}
            name={m.name}
            avatarUrl={m.avatarUrl}
            color={m.color}
            latitude={m.loc.latitude}
            longitude={m.loc.longitude}
            updatedAt={m.loc.recorded_at}
            sos={sosByUser.has(m.id)}
            onPress={() => router.push({ pathname: '/member/[id]', params: { id: m.id } })}
          />
        ))}
      </MapView>

      {/* Viñeta superior para legibilidad de los controles */}
      <View pointerEvents="none" style={[styles.topShade, { height: insets.top + 140 }]} />

      {/* Barra superior */}
      <Animated.View entering={FadeInDown.duration(500)} style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topRow}>
          <GpsPill status={gps} accuracy={fix?.coords.accuracy ?? null} precise={permission?.precise ?? true} />
          <View style={{ flex: 1 }} />
          <IconButton icon={Bell} label="Alertas" badge={unread} onPress={() => router.push('/alerts')} />
          <PressableScale onPress={() => router.push('/profile')} accessibilityLabel="Mi perfil">
            <Avatar name={profile?.full_name} uri={profile?.avatar_url} color={profile?.color} size={46} ring="rgba(255,255,255,0.22)" />
          </PressableScale>
        </View>
        <CircleChips circles={circles} selected={selectedCircleId} onSelect={selectCircle} />
      </Animated.View>

      {/* Banners de emergencia */}
      <View style={[styles.banners, { top: insets.top + 118 }]}>
        {mySos ? (
          <Animated.View entering={FadeIn}>
            <PressableScale onPress={() => router.push('/safety/sos')}>
              <Glass radius={20} tint="rgba(255,77,109,0.35)" style={{ borderColor: colors.danger }}>
                <View style={styles.bannerRow}>
                  <Siren size={20} color="#fff" />
                  <Text style={styles.bannerText}>SOS activo · {formatDuration(now - new Date(mySos.started_at).getTime())}</Text>
                  <ChevronRight size={18} color="#fff" />
                </View>
              </Glass>
            </PressableScale>
          </Animated.View>
        ) : null}
        {firstSos ? (
          <Animated.View entering={FadeIn}>
            <PressableScale onPress={() => router.push({ pathname: '/member/[id]', params: { id: firstSos.user_id } })}>
              <Glass radius={20} tint="rgba(255,77,109,0.35)" style={{ borderColor: colors.danger }}>
                <View style={styles.bannerRow}>
                  <Siren size={20} color="#fff" />
                  <Text style={styles.bannerText} numberOfLines={1}>
                    {firstName(firstSosName)} activó una alerta SOS
                  </Text>
                  <Text style={styles.bannerCta}>Ver</Text>
                </View>
              </Glass>
            </PressableScale>
          </Animated.View>
        ) : null}
      </View>

      {/* Controles del mapa */}
      <View style={[styles.controls, { bottom: CARD_HEIGHT + insets.bottom + 8 }]}>
        <IconButton icon={Layers} label="Tipo de mapa" onPress={() => setMapType((t) => (t === 'standard' ? 'hybrid' : 'standard'))} />
        <IconButton icon={Users} label="Ver a todos" onPress={fitAll} />
        <IconButton icon={LocateFixed} label="Centrar en mí" color={following ? colors.accent : colors.text} onPress={recenter} />
      </View>

      {/* Tarjeta inferior */}
      <Animated.View entering={FadeInUp.duration(550).springify().damping(18)} style={[styles.cardWrap, { paddingBottom: insets.bottom + 10 }]}>
        <Glass radius={30} intensity={55}>
          <View style={styles.card}>
            <View style={styles.grabber} />
            {needsPermission ? (
              <View style={{ gap: 12 }}>
                <View style={styles.headerRow}>
                  <View style={[styles.pinIcon]}>
                    <MapPin size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.heading}>Activa tu ubicación</Text>
                    <Text style={type.bodyDim}>Para verte en el mapa. Nada se comparte hasta que tú lo decidas.</Text>
                  </View>
                </View>
                <Button
                  title="Permitir ubicación"
                  size="md"
                  onPress={async () => {
                    await requestForeground();
                    useLocationStore.getState().bumpPermissions();
                  }}
                />
              </View>
            ) : (
              <PressableScale onPress={() => router.push('/location')} scaleTo={0.98} haptic={false}>
                <View style={styles.headerRow}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={type.title}>Mi ubicación</Text>
                    <Text style={type.bodyDim}>{fix ? `Actualizada ${timeAgo(fix.timestamp, now)}` : 'Obteniendo ubicación…'}</Text>
                  </View>
                  <View style={styles.metrics}>
                    <Text style={styles.metric}>{formatAccuracy(fix?.coords.accuracy)}</Text>
                    <Text style={styles.metricDim}>
                      {formatSpeed(fix?.coords.speed)} · {formatHeading(fix?.coords.heading).split(' ')[0]}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textMuted} />
                </View>
              </PressableScale>
            )}

            <SharingBadge settings={settings} sos={!!mySos} now={now} />

            <MembersStrip
              members={strip}
              now={now}
              onPress={focusMember}
              onLongPress={(m) => router.push({ pathname: '/member/[id]', params: { id: m.id } })}
            />

            <View style={styles.actions}>
              <ActionTile icon={Radio} label={sharing ? 'Compartiendo' : 'Compartir ubicación'} tone={sharing ? 'success' : 'primary'} onPress={() => router.push('/sharing')} />
              <ActionTile icon={Users} label="Mi grupo" onPress={() => router.push('/circles')} />
              <ActionTile icon={Shield} label="Seguridad" tone="danger" onPress={() => router.push('/safety')} />
            </View>
          </View>
        </Glass>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(7,8,13,0.35)' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  banners: { position: 'absolute', left: 16, right: 16, gap: 8 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 48 },
  bannerText: { flex: 1, color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  bannerCta: { color: '#fff', fontFamily: fonts.extrabold, fontSize: 14 },
  controls: { position: 'absolute', right: 16, gap: 10 },
  cardWrap: { position: 'absolute', left: 10, right: 10, bottom: 0 },
  card: { padding: 18, paddingTop: 10, gap: 14 },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pinIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  metrics: { alignItems: 'flex-end', gap: 2 },
  metric: { color: colors.accent, fontFamily: fonts.bold, fontSize: 14 },
  metricDim: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 11.5 },
  actions: { flexDirection: 'row', gap: 10 },
});
