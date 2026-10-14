import { ScrollView, StyleSheet, Text } from 'react-native';

import { Glass } from '@/components/Glass';
import { PressableScale } from '@/components/PressableScale';
import { colors, fonts } from '@/lib/theme';

interface Props {
  circles: { id: string; name: string; color: string }[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function CircleChips({ circles, selected, onSelect }: Props) {
  if (!circles.length) return null;
  const items = [{ id: null as string | null, name: 'Todos', color: colors.primary }, ...circles];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((c) => {
        const active = c.id === selected;
        return (
          <PressableScale key={c.id ?? 'all'} onPress={() => onSelect(c.id)} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <Glass radius={999} tint={active ? `${c.color}40` : undefined} style={active ? { borderColor: `${c.color}AA` } : undefined}>
              <Text style={[styles.label, active && { color: colors.text }]}>{c.name}</Text>
            </Glass>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16 },
  label: { color: colors.textDim, fontFamily: fonts.bold, fontSize: 13, paddingHorizontal: 14, paddingVertical: 9 },
});
