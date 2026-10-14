import * as Location from 'expo-location';
import * as SMS from 'expo-sms';

import { mapsWebLink } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { useLocationStore } from '@/store/location';
import type { EmergencyContact, SosEvent } from '@/types/db';

export async function listContacts(): Promise<EmergencyContact[]> {
  const { data } = await supabase.from('emergency_contacts').select('*').order('created_at');
  return (data as EmergencyContact[] | null) ?? [];
}

export async function addContact(input: { name: string; phone?: string; email?: string }) {
  const { data: auth } = await supabase.auth.getUser();
  const phone = input.phone?.replace(/[^0-9+]/g, '') || null;
  const email = input.email?.trim().toLowerCase() || null;
  const { error } = await supabase.from('emergency_contacts').insert({ owner_id: auth.user!.id, name: input.name.trim(), phone, email });
  if (error) throw error;
}

export async function deleteContact(id: string) {
  const { error } = await supabase.from('emergency_contacts').delete().eq('id', id);
  if (error) throw error;
}

export async function listMySosHistory(): Promise<SosEvent[]> {
  const { data: auth } = await supabase.auth.getUser();
  const { data } = await supabase.from('sos_events').select('*').eq('user_id', auth.user!.id).order('started_at', { ascending: false }).limit(20);
  return (data as SosEvent[] | null) ?? [];
}

/** Ubicación más precisa posible en pocos segundos; si no, la última conocida. */
export async function currentPositionForSos(timeoutMs = 10_000) {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    const res = await Location.requestForegroundPermissionsAsync();
    if (res.status !== 'granted') throw new Error('Sin permiso de ubicación: no podemos enviar tu ubicación.');
  }
  const precise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }).catch(() => null);
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
  const fix = (await Promise.race([precise, timeout])) ?? useLocationStore.getState().fix ?? (await Location.getLastKnownPositionAsync());
  if (!fix) throw new Error('No pudimos obtener tu ubicación. Revisa que el GPS esté encendido.');
  useLocationStore.getState().setFix(fix);
  return fix;
}

/** Abre el compositor de SMS (el usuario lo envía) para contactos sin la app. */
export async function smsContacts(contacts: EmergencyContact[], coords: { latitude: number; longitude: number }, name: string) {
  const phones = contacts.map((c) => c.phone).filter((p): p is string => !!p);
  if (!phones.length || !(await SMS.isAvailableAsync())) return false;
  await SMS.sendSMSAsync(phones, `🚨 ${name || 'Tu contacto'} activó una alerta de emergencia en Órbita. Su ubicación: ${mapsWebLink(coords)}`);
  return true;
}
