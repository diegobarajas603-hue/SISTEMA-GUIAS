import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/lib/theme';

import { PressableScale } from './PressableScale';

interface Props {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  /** Si se define, la fila muestra un interruptor. */
  toggle?: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean };
}

export function ListRow({ title, subtitle, icon: Icon, iconColor = colors.primary, left, right, onPress, chevron, destructive, toggle }: Props) {
  const body = (
    <View style={styles.row}>
      {left ??
        (Icon ? (
          <View style={[styles.iconWrap, { backgroundColor: `${iconColor}22` }]}>
            <Icon size={18} color={iconColor} strokeWidth={2.2} />
          </View>
        ) : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.title, destructive && { color: colors.danger }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          disabled={toggle.disabled}
          trackColor={{ false: 'rgba(255,255,255,0.12)', true: colors.primary }}
          thumbColor="#fff"
          ios_backgroundColor="rgba(255,255,255,0.12)"
        />
      ) : null}
      {chevron ? <ChevronRight size={18} color={colors.textMuted} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} scaleTo={0.98}>
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, minHeight: 56 },
  iconWrap: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.semibold, fontSize: 15.5, color: colors.text },
  subtitle: { fontFamily: fonts.medium, fontSize: 13, color: colors.textDim },
});
