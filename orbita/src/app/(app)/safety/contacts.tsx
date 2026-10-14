import { Contact, Mail, Phone, Plus, Trash2, User } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card, Divider } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { friendlyError } from '@/lib/supabase';
import { colors, fonts, type } from '@/lib/theme';
import { addContact, deleteContact, listContacts } from '@/services/safety';
import { toast } from '@/store/toast';
import type { EmergencyContact } from '@/types/db';

export default function EmergencyContacts() {
  const [items, setItems] = useState<EmergencyContact[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => listContacts().then(setItems).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setLoading(true);
    try {
      await addContact({ name, phone, email });
      setName('');
      setPhone('');
      setEmail('');
      setAdding(false);
      await load();
      toast('Contacto agregado.', 'success');
    } catch (e) {
      toast(friendlyError(e), 'danger');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteContact(id);
      setItems((l) => l.filter((c) => c.id !== id));
    } catch (e) {
      toast(friendlyError(e), 'danger');
    }
  };

  return (
    <Screen title="Contactos de emergencia" subtitle="Recibirán tu alerta SOS y verán tu ubicación mientras esté activa.">
      {items.length ? (
        <Card>
          {items.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                left={<Avatar name={c.name} color={c.contact_user_id ? colors.primary : colors.offline} size={40} />}
                title={c.name}
                subtitle={[c.phone, c.email].filter(Boolean).join(' · ')}
                right={
                  <View style={styles.right}>
                    {c.contact_user_id ? (
                      <View style={styles.tag}>
                        <Text style={styles.tagText}>Usa Órbita</Text>
                      </View>
                    ) : null}
                    <IconButton icon={Trash2} label={`Eliminar a ${c.name}`} size={34} glass={false} color={colors.danger} onPress={() => remove(c.id)} />
                  </View>
                }
              />
            </View>
          ))}
        </Card>
      ) : !adding ? (
        <EmptyState icon={Contact} title="Sin contactos todavía" message="Agrega al menos una persona de confianza. Si usa Órbita, recibirá la alerta y tu ubicación en la app; si no, podrás mandarle un SMS." />
      ) : null}

      {adding ? (
        <Card title="Nuevo contacto">
          <View style={{ gap: 12, paddingVertical: 12 }}>
            <TextField icon={User} label="Nombre" value={name} onChangeText={setName} placeholder="Ej. Mamá" />
            <TextField icon={Phone} label="Teléfono" value={phone} onChangeText={setPhone} placeholder="+52 81 1234 5678" keyboardType="phone-pad" />
            <TextField icon={Mail} label="Correo (opcional)" value={email} onChangeText={setEmail} placeholder="persona@correo.com" keyboardType="email-address" autoCapitalize="none" />
            <Text style={type.caption}>Si su correo o teléfono coincide con una cuenta de Órbita, se vinculará automáticamente.</Text>
            <Button title="Guardar contacto" loading={loading} disabled={!name.trim() || (!phone.trim() && !email.trim())} onPress={save} />
            <Button title="Cancelar" variant="ghost" onPress={() => setAdding(false)} />
          </View>
        </Card>
      ) : (
        <Button title="Agregar contacto" icon={Plus} onPress={() => setAdding(true)} />
      )}
      <ListRow icon={Phone} iconColor={colors.success} title="Consejo" subtitle="Crea un círculo de tipo Emergencias: sus miembros también recibirán tus alertas SOS." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 11 },
});
