import * as AppleAuthentication from 'expo-apple-authentication';
import { Link, router } from 'expo-router';
import { Lock, Mail } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { env } from '@/lib/env';
import { friendlyError } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';
import { useAuth } from '@/services/auth';

export default function Login() {
  const { signIn, signInWithGoogle, signInWithApple } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState<'email' | 'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  const run = async (kind: 'email' | 'google' | 'apple', fn: () => Promise<void>) => {
    setError(null);
    setLoading(kind);
    try {
      await fn();
    } catch (e) {
      const msg = friendlyError(e);
      if (msg.includes('Confirma tu correo')) {
        router.push({ pathname: '/verify-email', params: { email } });
      } else if (!/canceled|cancelled|ERR_REQUEST_CANCELED/i.test(String(e))) {
        setError(msg);
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <AuthShell title="Bienvenido a Órbita" subtitle="Tu gente, cerca. Comparte tu ubicación sólo con quien tú elijas.">
      <TextField
        label="Correo electrónico"
        icon={Mail}
        value={email}
        onChangeText={setEmail}
        placeholder="tu@correo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label="Contraseña"
        icon={Lock}
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        error={error}
      />
      <Link href="/forgot-password" style={styles.forgot}>
        ¿Olvidaste tu contraseña?
      </Link>
      <Button title="Iniciar sesión" loading={loading === 'email'} disabled={!email || !password} onPress={() => run('email', () => signIn(email, password))} />

      {env.enableGoogle || appleAvailable ? (
        <View style={styles.dividerRow}>
          <View style={styles.line} />
          <Text style={styles.or}>o continúa con</Text>
          <View style={styles.line} />
        </View>
      ) : null}
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={20}
          style={{ height: 54 }}
          onPress={() => run('apple', signInWithApple)}
        />
      ) : null}
      {env.enableGoogle ? (
        <Button title="Continuar con Google" variant="secondary" loading={loading === 'google'} onPress={() => run('google', signInWithGoogle)} />
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>¿No tienes cuenta?</Text>
        <Link href="/register" style={styles.link}>
          Crear cuenta
        </Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  forgot: { alignSelf: 'flex-end', color: colors.primary, fontFamily: fonts.semibold, fontSize: 14, marginTop: -4 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  or: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  footerText: { color: colors.textDim, fontFamily: fonts.medium, fontSize: 14 },
  link: { color: colors.primary, fontFamily: fonts.bold, fontSize: 14 },
});
