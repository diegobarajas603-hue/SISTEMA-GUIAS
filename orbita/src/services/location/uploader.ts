import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import type { LocationObject } from 'expo-location';

import { distanceMeters } from '@/lib/geo';
import { supabase } from '@/lib/supabase';

import { PROFILES, type TrackingProfile } from './policy';

const LAST_UPLOAD_KEY = 'orbita.lastUpload';

interface LastUpload {
  at: number;
  latitude: number;
  longitude: number;
}

let lastUpload: LastUpload | null = null;
let inFlight = false;

async function readLast(): Promise<LastUpload | null> {
  if (lastUpload) return lastUpload;
  try {
    const raw = await AsyncStorage.getItem(LAST_UPLOAD_KEY);
    lastUpload = raw ? (JSON.parse(raw) as LastUpload) : null;
  } catch {
    lastUpload = null;
  }
  return lastUpload;
}

export type UploadResult = 'ok' | 'skipped' | 'not_sharing' | 'no_session' | 'error';

/**
 * Publica una lectura si vale la pena según el perfil: nunca más seguido que
 * minUploadMs, y sólo si te moviste lo suficiente o toca el latido periódico.
 * El servidor rechaza la lectura ('not_sharing') si no estás compartiendo.
 */
export async function maybeUpload(
  fix: LocationObject,
  profile: TrackingProfile,
  opts: { force?: boolean; approximate?: boolean } = {},
): Promise<UploadResult> {
  if (inFlight) return 'skipped';
  const cfg = PROFILES[profile];
  const prev = await readLast();
  const now = Date.now();

  if (!opts.force && prev) {
    const elapsed = now - prev.at;
    const moved = distanceMeters(prev, fix.coords);
    const due = elapsed >= cfg.heartbeatMs || (elapsed >= cfg.minUploadMs && moved >= cfg.minUploadMeters);
    if (!due) return 'skipped';
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return 'no_session';

  inFlight = true;
  try {
    const battery = await Battery.getBatteryLevelAsync().catch(() => -1);
    const { coords } = fix;
    const { data, error } = await supabase.rpc('push_location', {
      p_latitude: coords.latitude,
      p_longitude: coords.longitude,
      p_accuracy: coords.accuracy,
      p_altitude: coords.altitude,
      p_speed: coords.speed !== null && coords.speed >= 0 ? coords.speed : null,
      p_heading: coords.heading !== null && coords.heading >= 0 ? coords.heading : null,
      p_recorded_at: new Date(fix.timestamp).toISOString(),
      p_is_approximate: !!opts.approximate,
      p_battery_level: battery >= 0 ? battery : null,
    });
    if (error) return 'error';
    if (data === 'not_sharing') return 'not_sharing';

    lastUpload = { at: now, latitude: coords.latitude, longitude: coords.longitude };
    AsyncStorage.setItem(LAST_UPLOAD_KEY, JSON.stringify(lastUpload)).catch(() => {});
    return 'ok';
  } catch {
    return 'error';
  } finally {
    inFlight = false;
  }
}

export async function resetUploadState() {
  lastUpload = null;
  await AsyncStorage.removeItem(LAST_UPLOAD_KEY).catch(() => {});
}
