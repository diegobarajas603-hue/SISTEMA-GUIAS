import { StyleSheet, Text, View } from 'react-native';

import { StatusDot } from '@/components/StatusDot';
import { colors, fonts } from '@/lib/theme';
import type { SharingSettings } from '@/types/db';

import { isSharingNow } from '@/store/sharing';

/** Indicador SIEMPRE visible de si la ubicación se está compartiendo. */
export function SharingBadge({ settings, sos, now }: { settings: SharingSettings | null; sos: boolean; now: number }) {
  let color: string = colors.offline;
  let label = 'No estás compartiendo';
  let extra: string | null = null;

  if (sos) {
    color = colors.danger;
    label = 'SOS · compartiendo con emergencias';
  } else if (isSharingNow(settings, now)) {
    color = colors.success;
    label = 'Compartiendo ubicación';
    if (settings?.expires_at) {
      const mins = Math.max(0, Math.ceil((new Date(settings.expires_at).getTime() - now) / 60_000));
      extra = mins >= 60 ? `quedan ${Math.floor(mins / 60)} h ${mins % 60} min` : `quedan ${mins} min`;
    }
  } else if (settings?.status === 'paused') {
    color = colors.warning;
    label = 'Ubicación en pausa';
  }

  return (
    <View style={[styles.pill, { backgroundColor: `${color}1F`, borderColor: `${color}55` }]}>
      <StatusDot color={color} size={8} pulse={color === colors.success || color === colors.danger} />
      <Text style={[styles.text, { color }]}>{label}</Text>
      {extra ? <Text style={styles.extra}>· {extra}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  text: { fontFamily: fonts.bold, fontSize: 12.5 },
  extra: { color: colors.textDim, fontFamily: fonts.semibold, fontSize: 12 },
});
