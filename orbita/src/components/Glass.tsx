import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/lib/theme';

interface Props {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  radius?: number;
  /** Tinte adicional sobre el vidrio (p. ej. rojo en SOS). */
  tint?: string;
  padded?: boolean;
}

/**
 * Superficie de vidrio esmerilado. En iOS usa desenfoque nativo; en Android
 * (donde el desenfoque en tiempo real es costoso) una capa translúcida con el
 * mismo borde luminoso, para mantener la estética sin sacrificar fluidez.
 */
export function Glass({ children, style, intensity = 40, radius: r = radius.xl, tint, padded }: Props) {
  return (
    <View style={[styles.base, { borderRadius: r }, padded && styles.padded, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={intensity} tint="systemChromeMaterialDark" style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidFill, { borderRadius: r }]} />
      )}
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, borderRadius: r }]} /> : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.highlight, { borderRadius: r }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(12, 14, 22, 0.35)' : 'transparent',
  },
  padded: { padding: 18 },
  androidFill: { backgroundColor: 'rgba(16, 18, 28, 0.93)' },
  highlight: {
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
});
