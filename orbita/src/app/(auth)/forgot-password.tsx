import { Mail, MailCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { friendlyError } from '@/lib/supabase';
import { colors, type } from '@/lib/theme';
import { useAuth } from '@/services/auth';

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell back logo={false} title="Recupera tu acceso" subtitle="Te enviaremos un enlace para crear una contraseña nueva.">
      {sent ? (
        <View style={styles.sent}>
          <MailCheck size={40} color={colors.success} />
          <Text style={[type.heading, { textAlign: 'center' }]}>Revisa tu correo</Text>
          <Text style={[type.bodyDim, { textAlign: 'center', lineHeight: 21 }]}>
            Si existe una cuenta con {email.trim()}, recibirás un enlace. Ábrelo desde este teléfono.
          </Text>
        </View>
      ) : (
        <>
          <TextField
            label="Correo electrónico"
            icon={Mail}
            value={email}
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={error}
          />
          <Button title="Enviar enlace" loading={loading} disabled={!email.includes('@')} onPress={submit} />
        </>
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  sent: { alignItems: 'center', gap: 12, padding: 24, borderRadius: 24, backgroundColor: colors.successSoft },
});
