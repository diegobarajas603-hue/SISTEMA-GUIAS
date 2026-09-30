import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { MapPin, MessageSquare, Phone, ShieldCheck, Users, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useNow } from '@/hooks/useNow';
import { formatAccuracy, formatDuration } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import { colors, fonts, radius } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { currentPositionForSos, listContacts, smsContacts } from '@/services/safety';
import { useLocationStore } from '@/store/location';
import { useSosStore } from '@/store/sos';
import { toast } from '@/store/toast';

const COUNTDOWN = 5;
type Phase = 'countdown' | 'sending' | 'active' | 'error';

/**
 * Flujo SOS: cuenta regresiva cancelable → obtener ubicación → registrar el
 * evento (hora + ubicación) y avisar → pantalla activa con contador y
 * opción de cancelar.
 */
export default function SosScreen() {
  const insets = useSafeAreaInsets();
  const now = useNow(1000);
  const { profile } = useAuth();
  const active = useSosStore((s) => s.active);
  const recipients = useSosStore((s) => s.recipients);
  const fix = useLocationStore((s) => s.fix);
  const [phase, setPhase] = useState<Phase>(active ? 'active' : 'countdown');
  const [count, setCount] = useState(COUNTDOWN);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const started = useRef(false);

  const send = async () => {
    if (started.current) return;
    started.current = true;
    setPhase('sending');
    try {
      const position = await currentPositionForSos();
      await useSosStore.getState().start({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setPhase('active');
    } catch (e) {
      started.current = false;
      setError(friendlyError(e));
      setPhase('error');
    }
  };

  // Cuenta regresiva
  useEffect(() => {
    if (phase !== 'countdown') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    // Al terminar el último segundo se envía la alerta.
    const t = setTimeout(() => (count <= 1 ? send() : setCount((c) => c - 1)), 1000);
    return () => clearTimeout(t);
     
  }, [phase, count]);

  const cancel = async () => {
    setCancelling(true);
    try {
      await useSosStore.getState().cancel();
      toast('Alerta cancelada. Avisamos a tus contactos que estás bien.', 'success');
      router.back();
    } catch (e) {
      toast(friendlyError(e), 'danger');
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  const sendSms = async () => {
    const coords = fix?.coords ?? active;
    if (!coords) return;
    const contacts = await listContacts();
    const ok = await smsContacts(contacts, coords, profile?.full_name ?? '');
    if (!ok) toast('No hay contactos con teléfono o el SMS no está disponible.', 'warning');
  };

  const elapsed = active ? now - new Date(active.started_at).getTime() : 0;
  const remaining = active ? new Date(active.expires_at).getTime() - now : 0;

  return (
    <View style={styles.root}>
      <LinearGradient colors={phase === 'active' ? ['#3B0713', '#12040A', '#07080D'] : ['#240812', '#07080D']} style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
        {phase === 'countdown' ? (
          <Animated.View entering={FadeIn} style={styles.center}>
            <Text style={styles.kicker}>ENVIANDO ALERTA SOS EN</Text>
            <Animated.Text key={count} entering={ZoomIn.springify().damping(12)} style={styles.count}>
              {count}
            </Animated.Text>
            <Text style={styles.sub}>Se compartirá tu ubicación con tus contactos de emergencia.</Text>
          </Animated.View>
        ) : phase === 'sending' ? (
          <Animated.View entering={FadeIn} style={styles.center}>
            <MapPin size={54} color={colors.danger} />
            <Text style={styles.title}>Obteniendo tu ubicación…</Text>
            <Text style={styles.sub}>Usando GPS, Wi-Fi y red móvil.</Text>
          </Animated.View>
        ) : phase === 'error' ? (
          <Animated.View entering={FadeIn} style={styles.center}>
            <Text style={styles.title}>No se pudo enviar</Text>
            <Text style={styles.sub}>{error}</Text>
            <Button title="Reintentar" variant="danger" onPress={send} style={{ alignSelf: 'stretch', marginTop: 12 }} />
            <Button title="Llamar al 911" icon={Phone} variant="secondary" onPress={() => Linking.openURL('tel:911')} style={{ alignSelf: 'stretch' }} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn} style={{ flex: 1, gap: 18 }}>
            <View style={styles.center}>
              <View style={styles.badge}>
                <ShieldCheck size={16} color="#fff" />
                <Text style={styles.badgeText}>ALERTA SOS ACTIVA</Text>
              </View>
              <Text style={styles.timer}>{formatDuration(elapsed)}</Text>
              <Text style={styles.sub}>Termina sola en {formatDuration(Math.max(0, remaining))} si no la cancelas.</Text>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Users size={18} color={colors.danger} />
                <Text style={styles.infoText}>
                  {recipients ? `${recipients} ${recipients === 1 ? 'persona ve' : 'personas ven'} tu ubicación en tiempo real` : 'Nadie recibió la alerta: agrega contactos de emergencia o llama al 911'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <MapPin size={18} color={colors.danger} />
                <Text style={styles.infoText}>
                  {fix ? `${fix.coords.latitude.toFixed(5)}, ${fix.coords.longitude.toFixed(5)} · ${formatAccuracy(fix.coords.accuracy)}` : active ? `${active.latitude.toFixed(5)}, ${active.longitude.toFixed(5)}` : '—'}
                </Text>
              </View>
            </View>

            <View style={{ flex: 1 }} />
            <Button title="Llamar al 911" icon={Phone} variant="danger" onPress={() => Linking.openURL('tel:911')} />
            <Button title="Enviar SMS a mis contactos" icon={MessageSquare} variant="secondary" onPress={sendSms} />
            <Button title="Minimizar" variant="ghost" onPress={() => router.back()} />
          </Animated.View>
        )}

        {phase === 'countdown' || phase === 'active' ? (
          <Button
            title={phase === 'countdown' ? 'Cancelar' : 'Cancelar alerta · estoy bien'}
            icon={X}
            variant="secondary"
            onPress={() => (phase === 'countdown' ? router.back() : setConfirmCancel(true))}
          />
        ) : phase === 'error' ? (
          <Button title="Cerrar" variant="ghost" onPress={() => router.back()} />
        ) : null}
      </View>

      <ConfirmDialog
        visible={confirmCancel}
        icon={ShieldCheck}
        title="¿Estás a salvo?"
        message="Avisaremos a tus contactos que cancelaste la alerta y dejarán de ver tu ubicación (salvo que la compartas normalmente)."
        confirmLabel="Sí, cancelar alerta"
        cancelLabel="Mantener activa"
        loading={cancelling}
        onConfirm={cancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 24, gap: 12 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, flexGrow: 1 },
  kicker: { color: colors.danger, fontFamily: fonts.extrabold, fontSize: 13, letterSpacing: 2 },
  count: { color: '#fff', fontFamily: fonts.extrabold, fontSize: 150, lineHeight: 170 },
  title: { color: '#fff', fontFamily: fonts.extrabold, fontSize: 24, textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.medium, fontSize: 14.5, textAlign: 'center', lineHeight: 21, paddingHorizontal: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.danger, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  badgeText: { color: '#fff', fontFamily: fonts.extrabold, fontSize: 12, letterSpacing: 1.5 },
  timer: { color: '#fff', fontFamily: fonts.extrabold, fontSize: 72, fontVariant: ['tabular-nums'], marginTop: 8 },
  infoCard: { gap: 14, padding: 18, borderRadius: radius.xl, backgroundColor: 'rgba(255,77,109,0.10)', borderWidth: 1, borderColor: 'rgba(255,77,109,0.35)' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoText: { flex: 1, color: '#fff', fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
});
