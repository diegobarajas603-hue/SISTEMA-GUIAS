import { Briefcase, Heart, HeartHandshake, Home, ShieldAlert, Users, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { CircleKind } from '@/types/db';

export const CIRCLE_KINDS: { kind: CircleKind; label: string; icon: LucideIcon; color: string }[] = [
  { kind: 'familia', label: 'Familia', icon: Home, color: '#7C5CFF' },
  { kind: 'amigos', label: 'Amigos', icon: Users, color: '#22D3EE' },
  { kind: 'trabajo', label: 'Trabajo', icon: Briefcase, color: '#60A5FA' },
  { kind: 'pareja', label: 'Pareja', icon: Heart, color: '#F472B6' },
  { kind: 'emergencias', label: 'Emergencias', icon: ShieldAlert, color: '#FF4D6D' },
  { kind: 'otro', label: 'Otro', icon: HeartHandshake, color: '#34D399' },
];

export const kindInfo = (kind: CircleKind) => CIRCLE_KINDS.find((k) => k.kind === kind) ?? CIRCLE_KINDS[5];

export function CircleIcon({ kind, color, size = 44 }: { kind: CircleKind; color?: string; size?: number }) {
  const info = kindInfo(kind);
  const c = color ?? info.color;
  const Icon = info.icon;
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.34, backgroundColor: `${c}24`, borderColor: `${c}55` }]}>
      <Icon size={size * 0.46} color={c} strokeWidth={2.1} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
