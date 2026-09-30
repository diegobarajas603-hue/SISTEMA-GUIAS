import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from './env';

// Sirve tanto a la app como a la tarea de ubicación en segundo plano: la
// sesión persiste en AsyncStorage, así que la tarea puede publicar la
// ubicación aunque la interfaz no esté montada.
export const supabase = createClient(env.supabaseUrl || 'https://invalid.local', env.supabaseAnonKey || 'missing', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Sólo refrescar el token mientras la app está en primer plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Traduce los errores del backend a mensajes para la persona usuaria. */
export function friendlyError(error: unknown): string {
  const raw =
    typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error);
  const map: Record<string, string> = {
    'Invalid login credentials': 'Correo o contraseña incorrectos.',
    'Email not confirmed': 'Confirma tu correo antes de iniciar sesión.',
    'User already registered': 'Ya existe una cuenta con ese correo.',
    not_authenticated: 'Tu sesión expiró. Vuelve a iniciar sesión.',
    not_a_member: 'Ya no perteneces a este círculo.',
    user_not_found: 'No encontramos a nadie con ese nombre de usuario.',
    already_member: 'Esa persona ya es miembro del círculo.',
    cannot_invite_self: 'No puedes invitarte a ti mismo.',
    target_required: 'Escribe a quién quieres invitar.',
    invitation_not_found: 'La invitación no existe o no es para ti.',
    invitation_closed: 'Esta invitación ya fue respondida o revocada.',
    invitation_expired: 'Esta invitación expiró. Pide una nueva.',
    cannot_accept_own_invitation: 'Es tu propia invitación: compártela con otra persona.',
    'Network request failed': 'Sin conexión. Revisa tu internet.',
  };
  for (const [key, message] of Object.entries(map)) {
    if (raw.includes(key)) return message;
  }
  if (/duplicate key.*username/i.test(raw)) return 'Ese nombre de usuario ya está ocupado.';
  if (/Password should be at least/i.test(raw)) return 'La contraseña debe tener al menos 8 caracteres.';
  return raw || 'Algo salió mal. Intenta de nuevo.';
}
