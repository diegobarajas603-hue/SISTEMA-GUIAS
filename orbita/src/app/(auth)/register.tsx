import { Link, router } from 'expo-router';
import { Lock, Mail, User } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { friendlyError } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';
import { useAuth } from '@/services/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = {
    name: name.trim().length < 2 ? 'Escribe tu nombre.' : null,
    email: !EMAIL_RE.test(email.trim()) ? 'Correo no válido.' : null,
    password: password.length < 8 ? 'Mínimo 8 caracteres.' : null,
    confirm: confirm !== password ? 'Las contraseñas no coinciden.' : null,
  };
  const valid = !Object.values(problems).some(Boolean);
  const [touched, setTouched] = useState(false);

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setError(null);
    setLoading(true);
    try {
      const { needsVerification } = await signUp(name, email, password);
      if (needsVerification) router.replace({ pathname: '/verify-email', params: { email: email.trim() } });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell back title="Crea tu cuenta" subtitle="Nadie verá tu ubicación hasta que tú decidas compartirla." logo={false}>
      <TextField label="Nombre" icon={User} value={name} onChangeText={setName} placeholder="Tu nombre" autoComplete="name" textContentType="name" error={touched ? problems.name : null} />
      <TextField
        label="Correo electrónico"
        icon={Mail}
        value={email}
        onChangeText={setEmail}
        placeholder="tu@correo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={touched ? problems.email : null}
      />
      <TextField
        label="Contraseña"
        icon={Lock}
        value={password}
        onChangeText={setPassword}
        placeholder="Mínimo 8 caracteres"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={touched ? problems.password : null}
      />
      <TextField
        label="Confirmar contraseña"
        icon={Lock}
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Repite tu contraseña"
        secureTextEntry
        autoComplete="new-password"
        error={touched ? problems.confirm : error}
      />
      <Button title="Crear cuenta" loading={loading} onPress={submit} />
      <Text style={styles.legal}>
        Al crear tu cuenta aceptas que Órbita sólo procese tu ubicación cuando tú la compartes. Puedes pausarla o eliminarla en cualquier momento.
      </Text>
      <View style={styles.footer}>
        <Text style={styles.footerText}>¿Ya tienes cuenta?</Text>
        <Link href="/login" style={styles.link}>
          Inicia sesión
        </Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  legal: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 },
  footerText: { color: colors.textDim, fontFamily: fonts.medium, fontSize: 14 },
  link: { color: colors.primary, fontFamily: fonts.bold, fontSize: 14 },
});
