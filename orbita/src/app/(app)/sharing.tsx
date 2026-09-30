import { router } from 'expo-router';
import { Check, Clock, EyeOff, History, Infinity as InfinityIcon, MapPinOff, Pause, Power, Radio, Settings2, ShieldCheck, Timer } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Divider } from '@/components/Card';
import { CircleIcon } from '@/components/CircleIcon';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { StatusDot } from '@/components/StatusDot';
import { useNow } from '@/hooks/useNow';
import { useShareFlow } from '@/hooks/useShareFlow';
import { friendlyError } from '@/lib/supabase';
import { colors, fonts, type } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { updateMyMembership } from '@/services/circles';
import { openSettings } from '@/services/location/permissions';
import { useCirclesStore } from '@/store/circles';
import { useLocationStore } from '@/store/location';
import { isSharingNow, useSharingStore } from '@/store/sharing';
import { toast } from '@/store/toast';
import type { ShareMode } from '@/types/db';

const MODES: { mode: ShareMode; title: string; subtitle: string; icon: typeof Clock }[] = [
  { mode: 'always', title: 'Compartir siempre', subtitle: 'También en segundo plano, sin fecha de fin', icon: InfinityIcon },
  { mode: '1h', title: 'Compartir durante 1 hora', subtitle: 'Se apaga solo al terminar', icon: Timer },
  { mode: '8h', title: 'Compartir durante 8 horas', subtitle: 'Ideal para un viaje o la jornada', icon: Clock },
  { mode: 'until_off', title: 'Compartir hasta que lo desactive', subtitle: 'Mientras no lo apagues tú', icon: Power },
];

export default function Sharing() {
  const now = useNow(15_000);
  const { session } = useAuth();
  const settings = useSharingStore((s) => s.settings);
  const backgroundActive = useSharingStore((s) => s.backgroundActive);
  const permission = useLocationStore((s) => s.permission);
  const circles = useCirclesStore((s) => s.circles);
  const flow = useShareFlow();

  const sharing = isSharingNow(settings, now);
  const paused = settings?.status === 'paused';
  const myId = session?.user.id;

  const statusColor = sharing ? colors.success : paused ? colors.warning : colors.offline;
  const statusTitle = sharing ? 'Compartiendo ubicación' : paused ? 'Ubicación en pausa' : 'No estás compartiendo';
  const statusText = sharing
    ? settings?.expires_at
      ? `Hasta las ${new Date(settings.expires_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
      : backgroundActive
        ? 'Tus círculos te ven, también con la app en segundo plano.'
        : 'Sólo mientras la app esté abierta.'
    : paused
      ? 'Nadie ve tu ubicación. Reanúdala cuando quieras.'
      : 'Nadie ve tu ubicación.';

  const toggleCircle = async (circleId: string, value: boolean) => {
    try {
      await updateMyMembership(circleId, { sharing_enabled: value });
    } catch (e) {
      toast(friendlyError(e), 'danger');
    }
  };

  return (
    <Screen title="Compartir ubicación" subtitle="Tú decides quién, dónde y por cuánto tiempo.">
      <Animated.View entering={FadeInDown.duration(400)} style={[styles.status, { borderColor: `${statusColor}66`, backgroundColor: `${statusColor}18` }]}>
        <StatusDot color={statusColor} size={12} pulse={sharing} />
        <View style={{ flex: 1 }}>
          <Text style={[type.heading, { color: statusColor }]}>{statusTitle}</Text>
          <Text style={[type.bodyDim, { marginTop: 2 }]}>{statusText}</Text>
        </View>
      </Animated.View>

      <Card title="¿Cómo quieres compartir?">
        {MODES.map((m, i) => {
          const selected = sharing && settings?.mode === m.mode;
          return (
            <View key={m.mode}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                icon={m.icon}
                iconColor={selected ? colors.success : colors.primary}
                title={m.title}
                subtitle={m.subtitle}
                onPress={flow.busy ? undefined : () => flow.start(m.mode)}
                right={selected ? <Check size={20} color={colors.success} /> : null}
              />
            </View>
          );
        })}
      </Card>

      {sharing || paused ? (
        <Card>
          {sharing ? (
            <ListRow icon={Pause} iconColor={colors.warning} title="Pausar ubicación" subtitle="Tus círculos verán que estás en pausa" onPress={() => flow.stop('paused')} />
          ) : (
            <ListRow icon={Radio} iconColor={colors.success} title="Reanudar" subtitle="Vuelve a compartir con el último modo" onPress={() => flow.start(settings?.mode ?? 'until_off')} />
          )}
          <Divider />
          <ListRow icon={MapPinOff} title="Dejar de compartir" subtitle="Se borra tu última ubicación publicada" destructive onPress={() => flow.stop('off')} />
        </Card>
      ) : null}

      <Card title="En qué círculos compartes">
        {circles.length ? (
          circles.map((c, i) => {
            const mine = c.members.find((m) => m.user_id === myId);
            return (
              <View key={c.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  left={<CircleIcon kind={c.kind} color={c.color} size={38} />}
                  title={c.name}
                  subtitle={`${c.members.length} ${c.members.length === 1 ? 'miembro' : 'miembros'}`}
                  toggle={{ value: !!mine?.sharing_enabled, onChange: (v) => toggleCircle(c.id, v) }}
                />
              </View>
            );
          })
        ) : (
          <ListRow icon={ShieldCheck} title="Aún no tienes círculos" subtitle="Crea uno o acepta una invitación" onPress={() => router.push('/circles')} chevron />
        )}
      </Card>

      <Card title="Más controles">
        <ListRow icon={EyeOff} title="Dejar de compartir con una persona" subtitle="Abre su perfil desde Mi grupo" onPress={() => router.push('/circles')} chevron />
        <Divider />
        <ListRow icon={History} title="Historial de ubicación" subtitle={settings?.save_history ? 'Guardándose · sólo tú lo ves' : 'Desactivado'} onPress={() => router.push('/history')} chevron />
        <Divider />
        <ListRow
          icon={Settings2}
          title="Permisos del sistema"
          subtitle={
            permission?.level === 'always'
              ? `Siempre · ${permission.precise ? 'precisa' : 'aproximada'}`
              : permission?.level === 'whenInUse'
                ? `Sólo con la app abierta · ${permission.precise ? 'precisa' : 'aproximada'}`
                : 'Sin permiso'
          }
          onPress={openSettings}
          chevron
        />
      </Card>

      <Text style={styles.note}>
        Órbita no tiene funciones ocultas: tu ubicación sólo se envía mientras ves el indicador «Compartiendo ubicación», y el sistema muestra
        su propio aviso cuando se usa en segundo plano.
      </Text>

      <ConfirmDialog
        visible={!!flow.askBackground}
        icon={Radio}
        title='¿Compartir también en segundo plano?'
        message='Para que tu círculo te vea con la app cerrada, elige "Permitir siempre" en la siguiente pantalla. Puedes pausarlo cuando quieras y verás un aviso del sistema mientras esté activo.'
        confirmLabel="Continuar"
        cancelLabel="Sólo con la app abierta"
        loading={flow.busy}
        onConfirm={() => flow.confirmBackground(true)}
        onCancel={() => flow.confirmBackground(false)}
        onDismiss={flow.cancelBackground}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24, borderWidth: 1 },
  note: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 19, textAlign: 'center', paddingHorizontal: 12, marginTop: 4 },
});
