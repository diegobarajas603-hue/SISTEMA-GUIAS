import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { AtSign, Camera, Check, Copy, Fingerprint, History, LogOut, Mail, Phone, Shield, User } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card, Divider } from '@/components/Card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListRow } from '@/components/ListRow';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { friendlyError, supabase } from '@/lib/supabase';
import { colors, fonts, palette, type } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { toast } from '@/store/toast';
import type { Profile as ProfileRow } from '@/types/db';

export default function Profile() {
  const { profile } = useAuth();
  if (!profile) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />
      </Screen>
    );
  }
  return <ProfileForm key={profile.id} profile={profile} />;
}

function ProfileForm({ profile }: { profile: ProfileRow }) {
  const { session, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(profile.full_name);
  const [username, setUsername] = useState(profile.username ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [color, setColor] = useState(profile.color);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  const dirty = (name !== profile.full_name || username !== (profile.username ?? '') || phone !== (profile.phone ?? '') || color !== profile.color);

  const save = async () => {
    setSaving(true);
    try {
      const cleanPhone = phone.replace(/[^0-9+]/g, '') || null;
      const cleanUser = username.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_.]{3,24}$/.test(cleanUser)) throw new Error('El usuario debe tener 3–24 caracteres: letras, números, "_" o ".".');
      if (cleanPhone && !/^\+?[0-9]{8,15}$/.test(cleanPhone)) throw new Error('Número telefónico no válido.');
      const { error } = await supabase.from('profiles').update({ full_name: name.trim(), username: cleanUser, phone: cleanPhone, color }).eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      toast('Perfil actualizado.', 'success');
    } catch (e) {
      toast(friendlyError(e), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const body = await (await fetch(asset.uri)).arrayBuffer();
      const path = `${profile.id}/avatar-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id);
      await refreshProfile();
      toast('Foto actualizada.', 'success');
    } catch (e) {
      toast(friendlyError(e), 'danger');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen footer={dirty ? <Button title="Guardar cambios" icon={Check} loading={saving} onPress={save} /> : undefined}>
      <View style={styles.hero}>
        <PressableScale onPress={pickPhoto} accessibilityLabel="Cambiar foto">
          <Avatar name={name} uri={profile.avatar_url} color={color} size={104} ring={color} />
          <View style={styles.camera}>{uploading ? <Text style={styles.cameraText}>…</Text> : <Camera size={16} color="#fff" />}</View>
        </PressableScale>
        <Text style={type.title}>{profile.full_name || 'Tu perfil'}</Text>
        <Text style={type.bodyDim}>@{profile.username}</Text>
      </View>

      <Card title="Datos personales">
        <View style={{ gap: 12, paddingVertical: 12 }}>
          <TextField icon={User} label="Nombre" value={name} onChangeText={setName} maxLength={80} />
          <TextField icon={AtSign} label="Nombre de usuario" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} hint="Otras personas pueden invitarte con él." />
          <TextField icon={Phone} label="Teléfono (opcional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+52 81 1234 5678" />
        </View>
      </Card>

      <Card title="Color en el mapa">
        <View style={styles.colors}>
          {palette.map((c) => (
            <PressableScale key={c} onPress={() => setColor(c)} accessibilityLabel={`Color ${c}`}>
              <View style={[styles.swatch, { backgroundColor: c }, c === color && styles.swatchActive]}>{c === color ? <Check size={14} color="#fff" strokeWidth={3} /> : null}</View>
            </PressableScale>
          ))}
        </View>
      </Card>

      <Card title="Cuenta">
        <ListRow icon={Mail} title="Correo" subtitle={session?.user.email ?? '—'} right={session?.user.email_confirmed_at ? <Text style={styles.verified}>Verificado</Text> : null} />
        <Divider />
        <ListRow
          icon={Fingerprint}
          title="ID de usuario"
          subtitle={profile.id}
          right={<Copy size={16} color={colors.textMuted} />}
          onPress={async () => {
            await Clipboard.setStringAsync(profile.id);
            toast('ID copiado.', 'success');
          }}
        />
      </Card>

      <Card title="Privacidad">
        <ListRow icon={Shield} iconColor={colors.success} title="Compartir ubicación" subtitle="Quién, dónde y por cuánto tiempo" onPress={() => router.push('/sharing')} chevron />
        <Divider />
        <ListRow icon={History} title="Historial" subtitle="Tus recorridos" onPress={() => router.push('/history')} chevron />
      </Card>

      <Button title="Cerrar sesión" icon={LogOut} variant="secondary" onPress={() => setConfirmOut(true)} />

      <ConfirmDialog
        visible={confirmOut}
        icon={LogOut}
        tone="danger"
        title="¿Cerrar sesión?"
        message="Al cerrar sesión dejarás de compartir tu ubicación en este dispositivo."
        confirmLabel="Cerrar sesión"
        onCancel={() => setConfirmOut(false)}
        onConfirm={() => {
          setConfirmOut(false);
          signOut().catch((e) => toast(friendlyError(e), 'danger'));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, paddingBottom: 8 },
  camera: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  cameraText: { color: '#fff', fontFamily: fonts.bold },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 14 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 3, borderColor: '#fff' },
  verified: { color: colors.success, fontFamily: fonts.bold, fontSize: 12 },
});
