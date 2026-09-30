import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, gradients, radius } from '@/lib/theme';

import { PressableScale } from './PressableScale';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg' | 'sm';
}

export function Button({ title, onPress, variant = 'primary', icon: Icon, loading, disabled, style, size = 'lg' }: Props) {
  const height = size === 'lg' ? 56 : size === 'md' ? 48 : 40;
  const fg = variant === 'secondary' || variant === 'ghost' ? colors.text : '#fff';
  const content = (
    <View style={[styles.row, { height }]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? <Icon size={size === 'sm' ? 16 : 19} color={fg} strokeWidth={2.2} /> : null}
          <Text style={[styles.label, { color: fg, fontSize: size === 'sm' ? 14 : 16 }]}>{title}</Text>
        </>
      )}
    </View>
  );

  const gradient =
    variant === 'primary' ? gradients.primary : variant === 'danger' ? gradients.danger : variant === 'success' ? (['#3EE0A8', '#10B981'] as const) : null;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      haptic={variant === 'danger' ? 'heavy' : true}
      style={[styles.base, { borderRadius: size === 'sm' ? radius.md : radius.lg }, variant === 'secondary' && styles.secondary, style]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {gradient ? (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: size === 'sm' ? radius.md : radius.lg }}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  secondary: { backgroundColor: colors.surfaceHigh, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18 },
  label: { fontFamily: fonts.bold, letterSpacing: 0.1 },
});
