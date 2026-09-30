import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import { stopBackgroundUpdates } from '@/services/location/background';
import { resetUploadState } from '@/services/location/uploader';
import { unregisterPushToken } from '@/services/notifications';
import { useAlertsStore } from '@/store/alerts';
import { useCirclesStore } from '@/store/circles';
import { useSharingStore } from '@/store/sharing';
import { useSosStore } from '@/store/sos';
import type { Profile } from '@/types/db';

WebBrowser.maybeCompleteAuthSession();

/** URL a la que regresan los correos de verificación y recuperación. */
export const authRedirect = (path: 'auth/callback' | 'reset-password') => Linking.createURL(path);

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  initializing: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<{ needsVerification: boolean }>;
  resendVerification: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loadedProfile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  // Sólo vale el perfil de la sesión actual (evita mostrar el de otra cuenta).
  const profile = loadedProfile && loadedProfile.id === userId ? loadedProfile : null;

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile((data as Profile | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      initializing,
      refreshProfile,

      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      },

      signUp: async (name, email, password) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: authRedirect('auth/callback') },
        });
        if (error) throw error;
        // Con "Confirm email" activado, Supabase no devuelve sesión hasta verificar.
        return { needsVerification: !data.session };
      },

      resendVerification: async (email) => {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: email.trim(),
          options: { emailRedirectTo: authRedirect('auth/callback') },
        });
        if (error) throw error;
      },

      sendPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: authRedirect('reset-password'),
        });
        if (error) throw error;
      },

      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      },

      signInWithGoogle: async () => {
        const redirectTo = authRedirect('auth/callback');
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) throw error;
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success') return;
        const code = new URL(result.url).searchParams.get('code');
        if (!code) throw new Error('No se recibió respuesta de Google.');
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      },

      signInWithApple: async () => {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
        if (!credential.identityToken) throw new Error('Apple no devolvió un token.');
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) throw error;
        // Apple sólo comparte el nombre la primera vez.
        const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
        if (name && data.user) {
          await supabase.from('profiles').update({ full_name: name }).eq('id', data.user.id);
        }
      },

      signOut: async () => {
        // Cerrar sesión siempre deja de compartir: sin rastreo "olvidado".
        await supabase.rpc('set_sharing', { p_status: 'off', p_mode: 'until_off' }).then(
          () => undefined,
          () => undefined,
        );
        await stopBackgroundUpdates();
        await resetUploadState();
        await unregisterPushToken();
        await supabase.auth.signOut();
        useSharingStore.getState().reset();
        useCirclesStore.getState().reset();
        useSosStore.getState().reset();
        useAlertsStore.getState().reset();
      },
    }),
    [session, profile, initializing, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
