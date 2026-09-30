import * as Clipboard from 'expo-clipboard';
import { Compass, Copy, Crosshair, Gauge, Mountain, Navigation, Satellite, Timer } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, Divider } from '@/components/Card';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { useNow } from '@/hooks/useNow';
import { formatAccuracy, formatCoord, formatDateTime, formatHeading, formatSpeed, timeAgo } from '@/lib/format';
import { mapsWebLink } from '@/lib/geo';
import { colors, fonts } from '@/lib/theme';
import { openSettings } from '@/services/location/permissions';
import { useLocationStore } from '@/store/location';
import { toast } from '@/store/toast';

const GPS_TEXT = {
  idle: 'Inactivo',
  searching: 'Buscando señal',
  ok: 'Señal buena',
  weak: 'Señal débil',
  lost: 'Sin señal: se muestra la última ubicación',
  disabled: 'Servicios de ubicación apagados',
  denied: 'Sin permiso de ubicación',
} as const;

export default function LocationDetails() {
  const now = useNow(1000);
  const fix = useLocationStore((s) => s.fix);
  const gps = useLocationStore((s) => s.gps);
  const permission = useLocationStore((s) => s.permission);
  const c = fix?.coords;

  return (
    <Screen title="Mi ubicación" subtitle={fix ? `Actualizada ${timeAgo(fix.timestamp, now)}` : 'Sin lectura todavía'}>
      <View style={styles.coords}>
        <View style={{ flex: 1 }}>
          <Text style={styles.coordLabel}>LATITUD</Text>
          <Text style={styles.coordValue}>{formatCoord(c?.latitude)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.coordLabel}>LONGITUD</Text>
          <Text style={styles.coordValue}>{formatCoord(c?.longitude)}</Text>
        </View>
      </View>

      <Card>
        <ListRow icon={Crosshair} iconColor={colors.accent} title="Precisión" subtitle="Radio aproximado de error" right={<Text style={styles.value}>{formatAccuracy(c?.accuracy)}</Text>} />
        <Divider />
        <ListRow icon={Gauge} iconColor={colors.success} title="Velocidad" right={<Text style={styles.value}>{formatSpeed(c?.speed)}</Text>} />
        <Divider />
        <ListRow icon={Compass} iconColor={colors.warning} title="Dirección" right={<Text style={styles.value}>{formatHeading(c?.heading)}</Text>} />
        <Divider />
        <ListRow icon={Mountain} iconColor="#A78BFA" title="Altitud" right={<Text style={styles.value}>{c?.altitude != null ? `${Math.round(c.altitude)} m` : '—'}</Text>} />
        <Divider />
        <ListRow icon={Timer} iconColor={colors.primary} title="Fecha y hora" right={<Text style={styles.value}>{fix ? formatDateTime(fix.timestamp) : '—'}</Text>} />
      </Card>

      <Card title="Fuente">
        <ListRow icon={Satellite} title="Estado GPS" subtitle={GPS_TEXT[gps]} />
        <Divider />
        <ListRow
          icon={Navigation}
          title={permission?.precise === false ? 'Ubicación aproximada' : 'Ubicación precisa'}
          subtitle={
            permission?.precise === false
              ? 'Elegiste compartir una ubicación aproximada. Tus círculos verán un área, no tu punto exacto.'
              : 'GPS, Wi-Fi y redes móviles combinados por el sistema.'
          }
          onPress={permission?.precise === false ? openSettings : undefined}
          chevron={permission?.precise === false}
        />
      </Card>

      {c ? (
        <Button
          title="Copiar coordenadas"
          icon={Copy}
          variant="secondary"
          onPress={async () => {
            await Clipboard.setStringAsync(`${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)} · ${mapsWebLink(c)}`);
            toast('Coordenadas copiadas.', 'success');
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  coords: {
    flexDirection: 'row',
    gap: 12,
    padding: 18,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.3)',
  },
  coordLabel: { color: colors.accent, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2 },
  coordValue: { color: colors.text, fontFamily: fonts.extrabold, fontSize: 20, marginTop: 4, fontVariant: ['tabular-nums'] },
  value: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
});
