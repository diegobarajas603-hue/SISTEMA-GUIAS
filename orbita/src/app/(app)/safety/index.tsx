import { router, useFocusEffect } from 'expo-router';
import { Bell, Contact, History, Phone, Siren } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { Card, Divider } from '@/components/Card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { SosButton } from '@/components/SosButton';
import { formatDateTime, formatDuration } from '@/lib/format';
import { colors, type } from '@/lib/theme';
import { listContacts, listMySosHistory } from '@/services/safety';
import { useAlertsStore } from '@/store/alerts';
import { useSosStore } from '@/store/sos';
import type { EmergencyContact, SosEvent } from '@/types/db';

const STATUS = { active: 'Activa', cancelled: 'Cancelada', expired: 'Finalizada' } as const;

export default function Safety() {
  const active = useSosStore((s) => s.active);
  const unread = useAlertsStore((s) => s.unread);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [history, setHistory] = useState<SosEvent[]>([]);
  const [confirm, setConfirm] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listContacts().then(setContacts).catch(() => {});
      listMySosHistory().then(setHistory).catch(() => {});
    }, []),
  );

  const appContacts = contacts.filter((c) => c.contact_user_id).length;

  return (
    <Screen title="Seguridad" subtitle="En una emergencia, tus contactos sabrán dónde estás.">
      <View style={{ marginVertical: -10 }}>
        <SosButton active={!!active} onPress={() => (active ? router.push('/safety/sos') : setConfirm(true))} />
      </View>

      <Card title="Preparación">
        <ListRow
          icon={Contact}
          iconColor={colors.danger}
          title="Contactos de emergencia"
          subtitle={contacts.length ? `${contacts.length} configurados · ${appContacts} usan Órbita` : 'Agrega a quién avisar'}
          onPress={() => router.push('/safety/contacts')}
          chevron
        />
        <Divider />
        <ListRow icon={Bell} iconColor={colors.warning} title="Alertas" subtitle={unread ? `${unread} sin leer` : 'Todo al día'} onPress={() => router.push('/alerts')} chevron />
        <Divider />
        <ListRow icon={Phone} iconColor={colors.success} title="Llamar al 911" subtitle="Servicios de emergencia" onPress={() => Linking.openURL('tel:911')} chevron />
      </Card>

      <Card title="Registro de alertas SOS">
        {history.length ? (
          history.map((e, i) => (
            <View key={e.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                icon={e.status === 'active' ? Siren : History}
                iconColor={e.status === 'active' ? colors.danger : colors.textDim}
                title={`${formatDateTime(e.started_at)} · ${STATUS[e.status]}`}
                subtitle={`${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}${e.ended_at ? ` · duró ${formatDuration(new Date(e.ended_at).getTime() - new Date(e.started_at).getTime())}` : ''}`}
              />
            </View>
          ))
        ) : (
          <Text style={[type.bodyDim, { paddingVertical: 14 }]}>Aún no has activado ninguna alerta.</Text>
        )}
      </Card>

      <ConfirmDialog
        visible={confirm}
        tone="danger"
        icon={Siren}
        title="¿Activar alerta SOS?"
        message={
          appContacts
            ? `Compartiremos tu ubicación en tiempo real con tus ${appContacts} contacto(s) de emergencia durante 60 minutos y les enviaremos una alerta.`
            : 'No tienes contactos de emergencia con Órbita: avisaremos a los miembros de tus círculos y compartiremos tu ubicación con ellos durante 60 minutos.'
        }
        confirmLabel="Activar SOS"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          router.push('/safety/sos');
        }}
      />
    </Screen>
  );
}
