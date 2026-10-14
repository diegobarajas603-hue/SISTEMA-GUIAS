import Constants from 'expo-constants';

function required(name: string, value: string | undefined): string {
  if (!value) {
    console.warn(`[Órbita] Falta la variable ${name}. Copia .env.example a .env y complétala.`);
    return '';
  }
  return value;
}

export const env = {
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  inviteDomain:
    process.env.EXPO_PUBLIC_INVITE_DOMAIN ??
    (Constants.expoConfig?.extra?.inviteDomain as string | undefined) ??
    'orbita.app',
  enableGoogle: process.env.EXPO_PUBLIC_ENABLE_GOOGLE === 'true',
  easProjectId: Constants.expoConfig?.extra?.eas?.projectId as string | undefined,
};

export const inviteLink = (code: string) => `https://${env.inviteDomain}/invite/${code}`;
