import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { AtSign, Copy, Link2, Mail, Phone, Send, Share2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import { inviteLink } from '@/lib/env';
import { friendlyError } from '@/lib/supabase';
import { colors, fonts, radius, type } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { createInvitation } from '@/services/circles';
import { useCirclesStore } from '@/store/circles';
import { toast } from '@/store/toast';
import type { Invitation } from '@/types/db';

type Method = 'link' | 'email' | 'phone' | 'username';

export default function InviteMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const circle = useCirclesStore((s) => s.circles.find((c) => c.id === id));
  const [method, setMethod] = useState<Method>('link');
  const [openInvite, setOpenInvite] = useState<Invitation | null>(null);
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = (code: string) =>
    `${profile?.full_name || 'Te'} te invitó a unirte a su círculo "${circle?.name ?? ''}" en Órbita.\n\n` +
    `Abre el enlace: ${inviteLink(code)}\nO usa el código: ${code}\n\n` +
    'Tu ubicación sólo se compartirá si aceptas.';

  // Un enlace/código abierto por visita a esta pantalla.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    createInvitation(id, 'link')
      .then((inv) => !cancelled && setOpenInvite(inv))
      .catch((e) => !cancelled && setError(friendlyError(e)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const sendDirect = async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const inv = await createInvitation(id, method, target);
      if (inv.invitee_user_id) {
        toast('Invitación enviada. Le llegará una notificación en Órbita.', 'success');
      } else {
        // La persona aún no usa Órbita: enviarle el enlace por el canal elegido.
        await Share.share({ message: message(inv.code) });
      }
      setTarget('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const fieldProps = {
    email: { label: 'Correo electrónico', icon: Mail, placeholder: 'persona@correo.com', keyboardType: 'email-address' as const },
    phone: { label: 'Número telefónico', icon: Phone, placeholder: '+52 81 1234 5678', keyboardType: 'phone-pad' as const },
    username: { label: 'Nombre de usuario', icon: AtSign, placeholder: '@usuario', keyboardType: 'default' as const },
  };

  return (
    <Screen title="Invitar a un miembro" subtitle={circle ? `Al círculo ${circle.name}` : undefined}>
      <Segmented<Method>
        value={method}
        onChange={(m) => {
          setMethod(m);
          setError(null);
        }}
        options={[
          { value: 'link', label: 'Enlace' },
          { value: 'email', label: 'Correo' },
          { value: 'phone', label: 'Teléfono' },
          { value: 'username', label: 'Usuario' },
        ]}
      />

      {method === 'link' ? (
        <Animated.View entering={FadeIn} style={{ gap: 14 }}>
          <View style={styles.codeCard}>
            {openInvite ? (
              <>
                <Text style={type.overline}>Código de invitación</Text>
                <Text style={styles.code} selectable>
                  {openInvite.code.slice(0, 4)} {openInvite.code.slice(4)}
                </Text>
                <View style={styles.linkRow}>
                  <Link2 size={15} color={colors.accent} />
                  <Text style={styles.link} numberOfLines={1} selectable>
                    {inviteLink(openInvite.code)}
                  </Text>
                </View>
                <Text style={type.caption}>Válido por 7 días · cualquier persona con el enlace podrá solicitar unirse</Text>
              </>
            ) : error ? (
              <Text style={[type.bodyDim, { color: colors.danger }]}>{error}</Text>
            ) : (
              <ActivityIndicator color={colors.primary} />
            )}
          </View>
          <Button title="Compartir enlace" icon={Share2} disabled={!openInvite} onPress={() => openInvite && Share.share({ message: message(openInvite.code) })} />
          <Button
            title="Copiar enlace"
            icon={Copy}
            variant="secondary"
            disabled={!openInvite}
            onPress={async () => {
              if (!openInvite) return;
              await Clipboard.setStringAsync(inviteLink(openInvite.code));
              toast('Enlace copiado.', 'success');
            }}
          />
        </Animated.View>
      ) : (
        <Animated.View key={method} entering={FadeIn} style={{ gap: 14 }}>
          <TextField
            {...fieldProps[method]}
            value={target}
            onChangeText={setTarget}
            autoCapitalize="none"
            autoCorrect={false}
            error={error}
            hint={
              method === 'username'
                ? 'Le llegará la invitación directamente en la app.'
                : 'Si ya usa Órbita le llegará en la app; si no, podrás enviarle el enlace.'
            }
          />
          <Button title="Enviar invitación" icon={Send} loading={loading} disabled={target.trim().length < 3} onPress={sendDirect} />
        </Animated.View>
      )}

      <View style={styles.consent}>
        <Text style={styles.consentTitle}>Consentimiento de ambas partes</Text>
        <Text style={styles.consentText}>
          Nadie ve la ubicación de nadie hasta que la persona invitada acepte y decida compartir. Cada quien puede pausar o salir cuando quiera.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeCard: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 26,
    paddingHorizontal: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.4)',
    minHeight: 170,
    justifyContent: 'center',
  },
  code: { color: colors.text, fontFamily: fonts.extrabold, fontSize: 38, letterSpacing: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  link: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 13.5, flexShrink: 1 },
  consent: { padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 4, marginTop: 6 },
  consentTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 13.5 },
  consentText: { color: colors.textDim, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18 },
});
