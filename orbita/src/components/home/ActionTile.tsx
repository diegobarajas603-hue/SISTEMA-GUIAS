import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { colors, fonts, radius } from '@/lib/theme';

interface Props {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'neutral' | 'danger' | 'success';
}

export function ActionTile({ icon: Icon, label, onPress, tone = 'neutral' }: Props) {
  const gradient =
    tone === 'primary' ? (['#8B6CFF', '#5B3DF5'] as const) : tone === 'success' ? (['#3EE0A8', '#0EA371'] as const) : null;
  const iconColor = tone === 'danger' ? colors.danger : '#fff';
  const inner = (
    <View style={styles.inner}>
      <Icon size={20} color={iconColor} strokeWidth={2.2} />
      <Text style={[styles.label, tone === 'danger' && { color: colors.text }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
  return (
    <PressableScale onPress={onPress} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={label}>
      {gradient ? (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tile}>
          {inner}
        </LinearGradient>
      ) : (
        <View style={[styles.tile, styles.neutral, tone === 'danger' && styles.danger]}>{inner}</View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.lg, height: 72, overflow: 'hidden' },
  neutral: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  danger: { backgroundColor: 'rgba(255,77,109,0.14)', borderColor: 'rgba(255,77,109,0.45)' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  label: { color: '#fff', fontFamily: fonts.bold, fontSize: 12, textAlign: 'center' },
});
