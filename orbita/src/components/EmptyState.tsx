import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, type } from '@/lib/theme';

export function EmptyState({ icon: Icon, title, message, children }: { icon: LucideIcon; title: string; message: string; children?: ReactNode }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Icon size={30} color={colors.primary} strokeWidth={1.8} />
      </View>
      <Text style={[type.heading, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.bodyDim, { textAlign: 'center', lineHeight: 21 }]}>{message}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 20 },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.35)',
    marginBottom: 6,
  },
});
