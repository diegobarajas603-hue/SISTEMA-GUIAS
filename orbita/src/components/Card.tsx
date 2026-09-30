import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, type } from '@/lib/theme';

/** Tarjeta de sección (vidrio ligero, sin desenfoque: va sobre fondos opacos). */
export function Card({ children, style, title, action }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string; action?: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      {title ? (
        <View style={styles.titleRow}>
          <Text style={type.overline}>{title}</Text>
          {action}
        </View>
      ) : null}
      <View style={[styles.card, style]}>{children}</View>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginTop: 8 },
  card: {
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 52 },
});
