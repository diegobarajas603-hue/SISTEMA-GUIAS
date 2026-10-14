import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'orbita.pendingInvite';

/** Guarda un código de invitación abierto antes de iniciar sesión. */
export const savePendingInvite = (code: string) => AsyncStorage.setItem(KEY, code).catch(() => {});

export async function takePendingInvite(): Promise<string | null> {
  const code = await AsyncStorage.getItem(KEY).catch(() => null);
  if (code) await AsyncStorage.removeItem(KEY).catch(() => {});
  return code;
}
