import { router, useLocalSearchParams } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { friendlyError, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { toast } from '@/store/toast';

/** Destino del correo de recuperación: orbita://reset-password?code=... */
export default function ResetPassword() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { updatePassword } = useAuth();
  const [ready, setReady] = useState(!code);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    supabase.auth.exchangeCodeForSession(code).then(({ error: e }) => {
      if (e) setError('El enlace expiró o ya se usó. Solicita uno nuevo.');
      setReady(true);
    });
  }, [code]);

  const submit = async () => {
    if (password.length < 8) return setError('Mínimo 8 caracteres.');
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    try {
      await updatePassword(password);
      toast('Contraseña actualizada.', 'success');
      router.replace('/');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell logo={false} title="Nueva contraseña" subtitle="Elige una contraseña segura que no uses en otros sitios.">
      {!ready ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <TextField label="Contraseña nueva" icon={Lock} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <TextField label="Confirmar" icon={Lock} value={confirm} onChangeText={setConfirm} secureTextEntry error={error} />
          <Button title="Guardar contraseña" loading={loading} onPress={submit} />
        </>
      )}
    </AuthShell>
  );
}
