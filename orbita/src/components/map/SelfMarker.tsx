import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Circle, Marker } from 'react-native-maps';

import { Avatar } from '@/components/Avatar';
import { colors } from '@/lib/theme';

interface Props {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  name: string;
  avatarUrl: string | null;
  color: string;
  stale: boolean;
  sharing: boolean;
}

/** Mi posición: avatar, cono de dirección y círculo de precisión aproximada. */
export function SelfMarker({ latitude, longitude, accuracy, heading, name, avatarUrl, color, stale, sharing }: Props) {
  const hasHeading = heading !== null && heading >= 0;
  const roundedHeading = hasHeading ? Math.round(heading / 10) * 10 : -1;
  const signature = `${roundedHeading}|${stale}|${sharing}|${avatarUrl}|${color}`;
  const [frozen, setFrozen] = useState<string | null>(null);
  const tracks = frozen !== signature;
  useEffect(() => {
    const t = setTimeout(() => setFrozen(signature), 600);
    return () => clearTimeout(t);
  }, [signature]);

  const ring = stale ? colors.offline : sharing ? colors.success : colors.accent;
  return (
    <>
      {accuracy && accuracy > 5 ? (
        <Circle
          center={{ latitude, longitude }}
          radius={accuracy}
          strokeWidth={1}
          strokeColor={stale ? 'rgba(100,108,132,0.5)' : 'rgba(34, 211, 238, 0.55)'}
          fillColor={stale ? 'rgba(100,108,132,0.10)' : 'rgba(34, 211, 238, 0.12)'}
          zIndex={1}
        />
      ) : null}
      <Marker coordinate={{ latitude, longitude }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracks} zIndex={50}>
        <View style={styles.wrap}>
          {hasHeading ? (
            <View style={[styles.coneWrap, { transform: [{ rotate: `${roundedHeading}deg` }] }]}>
              <View style={[styles.cone, { borderBottomColor: stale ? 'rgba(100,108,132,0.4)' : 'rgba(34, 211, 238, 0.45)' }]} />
            </View>
          ) : null}
          <View style={[styles.ring, { borderColor: ring }]}>
            <Avatar name={name} uri={avatarUrl} color={color} size={40} />
          </View>
        </View>
      </Marker>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  coneWrap: { position: 'absolute', width: 96, height: 96, alignItems: 'center' },
  cone: {
    width: 0,
    height: 0,
    borderLeftWidth: 18,
    borderRightWidth: 18,
    borderBottomWidth: 34,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  ring: {
    padding: 3,
    borderRadius: 26,
    borderWidth: 3,
    backgroundColor: colors.bg,
  },
});
