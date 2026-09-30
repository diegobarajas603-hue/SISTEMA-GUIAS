import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { initials } from '@/lib/format';
import { fonts } from '@/lib/theme';

interface Props {
  name: string | null | undefined;
  uri?: string | null;
  color?: string;
  size?: number;
  ring?: string | null;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ name, uri, color = '#7C5CFF', size = 44, ring, style }: Props) {
  const ringWidth = ring ? Math.max(2, size * 0.06) : 0;
  const inner = size - ringWidth * 2;
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, padding: ringWidth, backgroundColor: ring ?? 'transparent' },
        style,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} contentFit="cover" transition={200} />
      ) : (
        <LinearGradient
          colors={[lighten(color), color]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.fallback, { width: inner, height: inner, borderRadius: inner / 2 }]}
        >
          <Text style={[styles.initials, { fontSize: inner * 0.38 }]}>{initials(name)}</Text>
        </LinearGradient>
      )}
    </View>
  );
}

function lighten(hex: string, amount = 0.28) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontFamily: fonts.extrabold, letterSpacing: 0.5 },
});
