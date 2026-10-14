import { router, useLocalSearchParams } from 'expo-router';
import { MailOpen } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/Button';
import { friendlyError } from '@/lib/supabase';
import { colors, fonts, type } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { toast } from '@/store/toast';

export default function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { resendVerification } = useAuth();
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    if (!email) return;
    setLoading(true);
    try {
      await resendVerification(email);
      toast('Te enviamos un nuevo correo de verificación.', 'success');
      setCooldown(60);
    } catch (e) {
      toast(friendlyError(e), 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell logo={false} title="Verifica tu correo" subtitle="Es el último paso para proteger tu cuenta.">
      <View style={styles.card}>
        <View style={styles.icon}>
          <MailOpen size={34} color={colors.primary} />
        </View>
        <Text style={[type.body, { textAlign: 'center', lineHeight: 22 }]}>
          Enviamos un enlace a{'\n'}
          <Text style={{ fontFamily: fonts.bold }}>{email ?? 'tu correo'}</Text>
        </Text>
        <Text style={[type.bodyDim, { textAlign: 'center', lineHeight: 20 }]}>
          Ábrelo desde este teléfono y volverás a Órbita con tu sesión iniciada.
        </Text>
      </View>
      <Button title={cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar correo'} variant="secondary" disabled={cooldown > 0 || !email} loading={loading} onPress={resend} />
      <Button title="Ya lo verifiqué, iniciar sesión" onPress={() => router.replace('/login')} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 14,
    padding: 24,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  icon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
});
