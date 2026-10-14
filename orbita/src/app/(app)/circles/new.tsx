import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { CIRCLE_KINDS } from '@/components/CircleIcon';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { friendlyError } from '@/lib/supabase';
import { colors, fonts, palette, radius, type } from '@/lib/theme';
import { createCircle } from '@/services/circles';
import { toast } from '@/store/toast';
import type { CircleKind } from '@/types/db';

export default function NewCircle() {
  const [kind, setKind] = useState<CircleKind>('familia');
  const [name, setName] = useState('Familia');
  const [color, setColor] = useState(CIRCLE_KINDS[0].color);
  const [nameEdited, setNameEdited] = useState(false);
  const [loading, setLoading] = useState(false);

  const pickKind = (k: (typeof CIRCLE_KINDS)[number]) => {
    setKind(k.kind);
    setColor(k.color);
    if (!nameEdited) setName(k.kind === 'otro' ? '' : k.label);
  };

  const submit = async () => {
    setLoading(true);
    try {
      const circle = await createCircle({ name, kind, color, icon: kind });
      toast(`Creaste "${circle.name}". Invita a alguien para empezar.`, 'success');
      router.replace({ pathname: '/circles/[id]/invite', params: { id: circle.id } });
    } catch (e) {
      toast(friendlyError(e), 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      title="Nuevo círculo"
      subtitle="Serás el administrador. Nadie verá tu ubicación hasta aceptar tu invitación."
      footer={<Button title="Crear círculo" loading={loading} disabled={!name.trim()} onPress={submit} />}
    >
      <Text style={[type.overline, { marginLeft: 6, marginTop: 4 }]}>Tipo</Text>
      <View style={styles.grid}>
        {CIRCLE_KINDS.map((k) => {
          const active = k.kind === kind;
          const Icon = k.icon;
          return (
            <PressableScale key={k.kind} onPress={() => pickKind(k)} style={styles.kindWrap}>
              <View style={[styles.kind, active && { borderColor: k.color, backgroundColor: `${k.color}1F` }]}>
                <Icon size={22} color={active ? k.color : colors.textDim} />
                <Text style={[styles.kindLabel, active && { color: colors.text }]}>{k.label}</Text>
              </View>
            </PressableScale>
          );
        })}
      </View>

      <TextField
        label="Nombre"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setNameEdited(true);
        }}
        placeholder="Ej. Mi familia"
        maxLength={40}
      />

      <Text style={[type.overline, { marginLeft: 6, marginTop: 6 }]}>Color</Text>
      <View style={styles.colors}>
        {palette.map((c) => (
          <PressableScale key={c} onPress={() => setColor(c)} accessibilityLabel={`Color ${c}`}>
            <View style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}>{color === c ? <Check size={16} color="#fff" strokeWidth={3} /> : null}</View>
          </PressableScale>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kindWrap: { width: '31%', flexGrow: 1 },
  kind: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  kindLabel: { color: colors.textDim, fontFamily: fonts.bold, fontSize: 13 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 4 },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 3, borderColor: '#fff' },
});
