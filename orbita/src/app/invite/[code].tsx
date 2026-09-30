import { router, useLocalSearchParams } from 'expo-router';
import { Check, Radio, ShieldCheck, Users, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { CircleIcon } from '@/components/CircleIcon';
import { Screen } from '@/components/Screen';
import { friendlyError } from '@/lib/supabase';
import { colors, fonts, radius, type } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { getInvitation, respondInvitation } from '@/services/circles';
import { savePendingInvite } from '@/services/pendingInvite';
import { toast } from '@/store/toast';
import type { InvitationPreview } from '@/types/db';

/**
 * Pantalla del enlace https://<dominio>/invite/XXXXXXXX
 * "Juan te invitó a unirte a su círculo Familia" → [Aceptar] [Rechazar]
 */
export default function InviteScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = (raw ?? '').toUpperCase();
  const { session, initializing } = useAuth();
  const [invite, setInvite] = useState<InvitationPreview | null | undefined>(undefined);
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  useEffect(() => {
    if (initializing) return;
    if (!session) {
      // Guardar el código y continuar después de iniciar sesión.
      savePendingInvite(code).then(() => {
        toast('Inicia sesión o crea tu cuenta para responder la invitación.', 'info');
        router.replace('/login');
      });
      return;
    }
    getInvitation(code)
      .then(setInvite)
      .catch(() => setInvite(null));
  }, [code, session, initializing]);

  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline');
    try {
      const circleId = await respondInvitation(code, accept, share);
      if (accept) {
        toast(`Te uniste a ${invite?.circle_name}.`, 'success');
        router.replace({ pathname: '/circles/[id]', params: { id: circleId } });
      } else {
        toast('Invitación rechazada.', 'info');
        router.replace('/');
      }
    } catch (e) {
      toast(friendlyError(e), 'danger');
    } finally {
      setBusy(null);
    }
  };

  if (invite === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const closed = !invite || invite.is_expired || invite.status !== 'pending';

  return (
    <Screen back>
      {!invite ? (
        <View style={styles.center}>
          <Text style={type.title}>Invitación no encontrada</Text>
          <Text style={[type.bodyDim, { textAlign: 'center' }]}>El código {code} no existe, expiró o fue enviado a otra persona.</Text>
          <Button title="Ir al inicio" onPress={() => router.replace('/')} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : (
        <>
          <Animated.View entering={ZoomIn.springify().damping(16)} style={styles.hero}>
            <View style={styles.avatars}>
              <Avatar name={invite.inviter_name} uri={invite.inviter_avatar} color={invite.circle_color} size={76} ring={colors.bg} />
              <View style={styles.badge}>
                <CircleIcon kind={invite.circle_kind} color={invite.circle_color} size={44} />
              </View>
            </View>
            <Text style={[type.title, { textAlign: 'center', lineHeight: 30 }]}>
              {invite.inviter_name || 'Alguien'} te invitó a unirte a su círculo{' '}
              <Text style={{ color: invite.circle_color }}>{invite.circle_name}</Text>
            </Text>
            <View style={styles.meta}>
              <Users size={14} color={colors.textDim} />
              <Text style={type.bodyDim}>
                {invite.member_count} {invite.member_count === 1 ? 'miembro' : 'miembros'}
              </Text>
            </View>
          </Animated.View>

          {invite.already_member ? (
            <View style={styles.info}>
              <Check size={18} color={colors.success} />
              <Text style={styles.infoText}>Ya eres miembro de este círculo.</Text>
            </View>
          ) : closed ? (
            <View style={styles.info}>
              <X size={18} color={colors.warning} />
              <Text style={styles.infoText}>{invite.is_expired ? 'Esta invitación expiró.' : 'Esta invitación ya no está disponible.'}</Text>
            </View>
          ) : (
            <Animated.View entering={FadeInDown.delay(150)} style={{ gap: 14 }}>
              <View style={styles.shareRow}>
                <View style={styles.shareIcon}>
                  <Radio size={18} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareTitle}>Compartir mi ubicación con este círculo</Text>
                  <Text style={styles.shareText}>Sólo si también activas «Compartir ubicación». Puedes cambiarlo después.</Text>
                </View>
                <Switch value={share} onValueChange={setShare} trackColor={{ false: 'rgba(255,255,255,0.12)', true: colors.primary }} thumbColor="#fff" />
              </View>

              <View style={styles.privacy}>
                <ShieldCheck size={16} color={colors.accent} />
                <Text style={styles.privacyText}>Al aceptar podrás ver a quienes compartan contigo en este círculo. Puedes salir en cualquier momento.</Text>
              </View>

              <Button title="Aceptar" icon={Check} loading={busy === 'accept'} disabled={!!busy} onPress={() => respond(true)} />
              <Button title="Rechazar" variant="secondary" loading={busy === 'decline'} disabled={!!busy} onPress={() => respond(false)} />
            </Animated.View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  center: { alignItems: 'center', gap: 14, paddingTop: 60 },
  hero: { alignItems: 'center', gap: 16, paddingVertical: 20, paddingHorizontal: 8 },
  avatars: { marginBottom: 6 },
  badge: { position: 'absolute', right: -14, bottom: -8, borderRadius: 16, backgroundColor: colors.bg, padding: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  info: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.05)' },
  infoText: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  shareIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  shareTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 14.5 },
  shareText: { color: colors.textDim, fontFamily: fonts.medium, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  privacy: { flexDirection: 'row', gap: 10, paddingHorizontal: 6 },
  privacyText: { flex: 1, color: colors.textDim, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18 },
});
