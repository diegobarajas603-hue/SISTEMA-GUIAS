import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { friendlyError, supabase } from '@/lib/supabase';
import { colors, type } from '@/lib/theme';

/**
 * Destino de los enlaces de verificación de correo y de OAuth
 * (orbita://auth/callback?code=...). Canjea el código por una sesión.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(params.error_description ?? null);

  useEffect(() => {
    if (!params.code) {
      if (!params.error_description) router.replace('/');
      return;
    }
    supabase.auth
      .exchangeCodeForSession(params.code)
      .then(({ error: e }) => {
        if (e) setError(friendlyError(e));
        else router.replace('/');
      })
      .catch((e) => setError(friendlyError(e)));
  }, [params.code, params.error_description]);

  return (
    <View style={styles.root}>
      {error ? (
        <>
          <Text style={[type.title, { textAlign: 'center' }]}>No pudimos verificar el enlace</Text>
          <Text style={[type.bodyDim, { textAlign: 'center' }]}>{error}</Text>
          <Button title="Ir a iniciar sesión" onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={type.bodyDim}>Verificando…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
});
