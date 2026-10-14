import { router } from 'expo-router';
import { Inbox, KeyRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card, Divider } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors } from '@/lib/theme';
import { listMyInvitations } from '@/services/circles';
import type { InvitationPreview } from '@/types/db';

/** Extrae el código de un texto: "ABCD EFGH", un enlace .../invite/ABCDEFGH, etc. */
function parseCode(input: string): string {
  const fromLink = input.match(/invite\/([A-Za-z0-9]{8})/);
  return (fromLink ? fromLink[1] : input.replace(/[^A-Za-z0-9]/g, '')).toUpperCase();
}

export default function Invitations() {
  const [items, setItems] = useState<InvitationPreview[] | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    listMyInvitations().then(setItems).catch(() => setItems([]));
  }, []);

  const parsed = parseCode(code);

  return (
    <Screen title="Invitaciones" subtitle="Únete a un círculo sólo si conoces a quien te invita.">
      <Card title="Unirme con código o enlace">
        <View style={{ gap: 12, paddingVertical: 12 }}>
          <TextField icon={KeyRound} value={code} onChangeText={setCode} placeholder="ABCD EFGH o https://…/invite/…" autoCapitalize="characters" autoCorrect={false} />
          <Button
            title="Ver invitación"
            size="md"
            disabled={parsed.length !== 8}
            onPress={() => router.push({ pathname: '/invite/[code]', params: { code: parsed } })}
          />
        </View>
      </Card>

      <Card title="Recibidas">
        {items === null ? null : items.length ? (
          items.map((inv, i) => (
            <View key={inv.code}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                left={<Avatar name={inv.inviter_name} uri={inv.inviter_avatar} color={inv.circle_color} size={40} />}
                title={inv.circle_name}
                subtitle={`${inv.inviter_name || 'Alguien'} te invitó`}
                onPress={() => router.push({ pathname: '/invite/[code]', params: { code: inv.code } })}
                chevron
              />
            </View>
          ))
        ) : (
          <EmptyState icon={Inbox} title="Sin invitaciones" message="Cuando alguien te invite por correo, teléfono o usuario, aparecerá aquí." />
        )}
      </Card>
      <View style={{ height: 1, backgroundColor: colors.bg }} />
    </Screen>
  );
}
