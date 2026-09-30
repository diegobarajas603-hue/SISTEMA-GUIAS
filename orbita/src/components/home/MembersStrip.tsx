import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { PressableScale } from '@/components/PressableScale';
import { firstName, freshness, freshnessColor } from '@/lib/format';
import { colors, fonts } from '@/lib/theme';

export interface StripMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  color: string;
  updatedAt: string | null;
  sos?: boolean;
}

export function MembersStrip({ members, now, onPress, onLongPress }: { members: StripMember[]; now: number; onPress: (m: StripMember) => void; onLongPress: (m: StripMember) => void }) {
  if (!members.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {members.map((m) => {
        const f = freshness(m.updatedAt, now);
        const dot = m.sos ? colors.danger : freshnessColor[f];
        return (
          <PressableScale key={m.id} onPress={() => onPress(m)} onLongPress={() => onLongPress(m)} style={styles.item} accessibilityLabel={`Ver a ${m.name}`}>
            <View>
              <Avatar name={m.name} uri={m.avatarUrl} color={m.color} size={44} ring={m.sos ? colors.danger : f === 'none' ? null : m.color} style={f === 'none' && !m.sos ? { opacity: 0.55 } : undefined} />
              <View style={[styles.dot, { backgroundColor: dot }]} />
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {firstName(m.name)}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 14, paddingVertical: 2 },
  item: { alignItems: 'center', width: 56, gap: 5 },
  dot: { position: 'absolute', right: 0, bottom: 0, width: 13, height: 13, borderRadius: 7, borderWidth: 2.5, borderColor: '#10121B' },
  name: { color: colors.textDim, fontFamily: fonts.semibold, fontSize: 11.5 },
});
