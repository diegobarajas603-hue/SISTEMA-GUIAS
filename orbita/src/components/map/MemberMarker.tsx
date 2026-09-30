import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { Avatar } from '@/components/Avatar';
import { firstName, freshness, freshnessColor } from '@/lib/format';
import { colors, fonts } from '@/lib/theme';

interface Props {
  id: string;
  name: string;
  avatarUrl: string | null;
  color: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
  sos?: boolean;
  onPress?: () => void;
}

/**
 * Marcador personalizado: foto o iniciales con el color de la persona, una
 * "cola" de pin y un punto de estado (verde/amarillo/gris). En SOS, rojo.
 */
export function MemberMarker({ id, name, avatarUrl, color, latitude, longitude, updatedAt, sos, onPress }: Props) {
  // En Android el marcador se rasteriza: dejar que se actualice un momento
  // tras cada cambio visual y luego congelarlo para no gastar CPU.
  const f = freshness(updatedAt);
  const signature = `${f}|${sos}|${avatarUrl}|${name}|${color}`;
  const [frozen, setFrozen] = useState<string | null>(null);
  const tracks = frozen !== signature;
  useEffect(() => {
    const t = setTimeout(() => setFrozen(signature), 800);
    return () => clearTimeout(t);
  }, [signature]);

  const ring = sos ? colors.danger : color;
  return (
    <Marker
      identifier={id}
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracks}
      onPress={onPress}
      zIndex={sos ? 100 : 10}
    >
      <View style={styles.wrap}>
        {sos ? <View style={styles.sosHalo} /> : null}
        <View style={[styles.bubble, { borderColor: ring }]}>
          <Avatar name={name} uri={avatarUrl} color={color} size={42} />
          <View style={[styles.dot, { backgroundColor: sos ? colors.danger : freshnessColor[f] }]} />
        </View>
        <View style={[styles.tail, { borderTopColor: ring }]} />
        <View style={[styles.label, sos && { backgroundColor: colors.danger }]}>
          <Text style={styles.labelText} numberOfLines={1}>
            {sos ? `SOS · ${firstName(name)}` : firstName(name)}
          </Text>
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: 110 },
  sosHalo: {
    position: 'absolute',
    top: -10,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 77, 109, 0.28)',
  },
  bubble: {
    padding: 3,
    borderRadius: 28,
    borderWidth: 3,
    backgroundColor: colors.bg,
  },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: colors.bg,
  },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  label: {
    position: 'absolute',
    top: 62,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(10, 12, 20, 0.88)',
  },
  labelText: { color: colors.text, fontFamily: fonts.bold, fontSize: 11 },
});
