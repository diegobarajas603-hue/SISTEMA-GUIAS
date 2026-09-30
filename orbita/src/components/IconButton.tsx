import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/lib/theme';

import { Glass } from './Glass';
import { PressableScale } from './PressableScale';

interface Props {
  icon: LucideIcon;
  onPress?: () => void;
  size?: number;
  color?: string;
  badge?: number;
  style?: StyleProp<ViewStyle>;
  label: string;
  glass?: boolean;
}

export function IconButton({ icon: Icon, onPress, size = 46, color = colors.text, badge, style, label, glass = true }: Props) {
  const inner = (
    <View style={[styles.center, { width: size, height: size }]}>
      <Icon size={size * 0.44} color={color} strokeWidth={2.1} />
    </View>
  );
  return (
    <PressableScale onPress={onPress} style={style} accessibilityRole="button" accessibilityLabel={label}>
      {glass ? <Glass radius={size / 2}>{inner}</Glass> : <View style={[styles.plain, { borderRadius: size / 2 }]}>{inner}</View>}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  plain: { backgroundColor: colors.surfaceHigh, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  badgeText: { color: '#fff', fontFamily: fonts.bold, fontSize: 10 },
});
