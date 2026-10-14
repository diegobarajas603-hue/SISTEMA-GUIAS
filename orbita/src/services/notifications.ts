import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

const TOKEN_KEY = 'orbita.pushToken';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Avisos',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#7C5CFF',
  });
  await Notifications.setNotificationChannelAsync('sos', {
    name: 'Alertas SOS',
    description: 'Alertas de emergencia de tus contactos',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400, 200, 800],
    lightColor: '#FF4D6D',
    bypassDnd: true,
  });
}

/**
 * Registra el dispositivo para notificaciones push de alertas de seguridad.
 * Devuelve false si no hay permiso o no hay proyecto EAS configurado; en ese
 * caso las alertas llegan igual en tiempo real mientras la app está abierta.
 */
export async function registerForPush(userId: string): Promise<boolean> {
  if (!Device.isDevice || !env.easProjectId) return false;

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return false;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: env.easProjectId });
    await supabase.from('push_tokens').upsert({
      token,
      user_id: userId,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      updated_at: new Date().toISOString(),
    });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch (e) {
    console.warn('[Órbita] No se pudo registrar el token push', e);
    return false;
  }
}

export async function unregisterPushToken() {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  if (!token) return;
  await supabase.from('push_tokens').delete().eq('token', token);
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function hasPushToken() {
  return !!(await AsyncStorage.getItem(TOKEN_KEY).catch(() => null));
}

/** Notificación local inmediata (p. ej. cuando no hay push configurado). */
export async function notifyLocal(title: string, body: string, data: Record<string, unknown> = {}, sos = false) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
      ...(Platform.OS === 'android' ? {} : { interruptionLevel: sos ? 'timeSensitive' : 'active' }),
    },
    trigger: Platform.OS === 'android' ? { channelId: sos ? 'sos' : 'default' } : null,
  });
}
