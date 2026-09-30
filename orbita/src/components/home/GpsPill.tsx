import { StyleSheet, Text, View } from 'react-native';

import { Glass } from '@/components/Glass';
import { StatusDot } from '@/components/StatusDot';
import { formatAccuracy } from '@/lib/format';
import { colors, fonts } from '@/lib/theme';
import type { GpsStatus } from '@/store/location';

const META: Record<GpsStatus, { label: string; color: string }> = {
  idle: { label: 'Ubicación', color: colors.offline },
  searching: { label: 'Buscando señal…', color: colors.warning },
  ok: { label: 'GPS preciso', color: colors.success },
  weak: { label: 'Señal débil', color: colors.warning },
  lost: { label: 'Sin señal GPS', color: colors.danger },
  disabled: { label: 'Ubicación apagada', color: colors.danger },
  denied: { label: 'Sin permiso', color: colors.offline },
};

export function GpsPill({ status, accuracy, precise }: { status: GpsStatus; accuracy: number | null; precise: boolean }) {
  const meta = META[status];
  const showAcc = (status === 'ok' || status === 'weak') && accuracy !== null;
  return (
    <Glass radius={999}>
      <View style={styles.row} accessibilityLabel={`Estado GPS: ${meta.label}`}>
        <StatusDot color={meta.color} size={8} pulse={status === 'ok' || status === 'searching'} />
        <Text style={styles.label}>{meta.label}</Text>
        {showAcc ? <Text style={styles.acc}>{formatAccuracy(accuracy)}</Text> : null}
        {!precise && status !== 'denied' ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>Aproximada</Text>
          </View>
        ) : null}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 40 },
  label: { color: colors.text, fontFamily: fonts.bold, fontSize: 13 },
  acc: { color: colors.textDim, fontFamily: fonts.semibold, fontSize: 12 },
  tag: { backgroundColor: colors.warningSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { color: colors.warning, fontFamily: fonts.bold, fontSize: 10 },
});
