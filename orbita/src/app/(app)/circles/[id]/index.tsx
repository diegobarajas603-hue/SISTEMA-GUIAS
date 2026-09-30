import { router, useLocalSearchParams } from 'expo-router';
import { History, LogOut, Pencil, Radio, Trash2, UserMinus, UserPlus, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card, Divider } from '@/components/Card';
import { CircleIcon, kindInfo } from '@/components/CircleIcon';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IconButton } from '@/components/IconButton';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useNow } from '@/hooks/useNow';
import { freshness, freshnessColor, memberStatusText, timeAgo } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import { colors, fonts, type } from '@/lib/theme';
import { useAuth } from '@/services/auth';
import { deleteCircle, listCircleInvitations, removeMember, revokeInvitation, updateCircle, updateMyMembership } from '@/services/circles';
import { useCirclesStore } from '@/store/circles';
import { useSharingStore } from '@/store/sharing';
import { toast } from '@/store/toast';
import type { DirectoryMember, Invitation } from '@/types/db';

type Pending = { kind: 'leave' } | { kind: 'delete' } | { kind: 'remove'; member: DirectoryMember } | null;

const CHANNEL_LABEL = { link: 'Enlace', code: 'Código', email: 'Correo', phone: 'Teléfono', username: 'Usuario' } as const;

export default function CircleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow(5000);
  const { session } = useAuth();
  const myId = session?.user.id;
  const circle = useCirclesStore((s) => s.circles.find((c) => c.id === id));
  const locations = useCirclesStore((s) => s.locations);
  const mySettings = useSharingStore((s) => s.settings);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(circle?.name ?? '');

  const me = circle?.members.find((m) => m.user_id === myId);
  const isAdmin = me?.role === 'admin';

  const loadInvites = useCallback(() => {
    if (id) listCircleInvitations(id).then(setInvites).catch(() => {});
  }, [id]);
  useEffect(loadInvites, [loadInvites]);

  if (!circle) {
    return (
      <Screen title="Círculo">
        <Text style={type.bodyDim}>Este círculo ya no existe o saliste de él.</Text>
      </Screen>
    );
  }

  const act = async (fn: () => Promise<void>, ok: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, 'success');
      after?.();
    } catch (e) {
      toast(friendlyError(e), 'danger');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const info = kindInfo(circle.kind);

  return (
    <Screen right={isAdmin ? <IconButton icon={editing ? X : Pencil} label="Editar" onPress={() => setEditing((e) => !e)} /> : undefined}>
      <View style={styles.hero}>
        <CircleIcon kind={circle.kind} color={circle.color} size={72} />
        {editing ? (
          <View style={{ alignSelf: 'stretch', gap: 10 }}>
            <TextField value={name} onChangeText={setName} maxLength={40} autoFocus />
            <Button
              title="Guardar nombre"
              size="md"
              disabled={!name.trim()}
              onPress={() => act(() => updateCircle(circle.id, { name: name.trim() }), 'Nombre actualizado.', () => setEditing(false))}
            />
          </View>
        ) : (
          <>
            <Text style={type.display}>{circle.name}</Text>
            <Text style={type.bodyDim}>
              {info.label} · {circle.members.length} {circle.members.length === 1 ? 'miembro' : 'miembros'}
            </Text>
          </>
        )}
      </View>

      <Button title="Invitar a un miembro" icon={UserPlus} onPress={() => router.push({ pathname: '/circles/[id]/invite', params: { id: circle.id } })} />

      <Card title="Miembros">
        {circle.members.map((m, i) => {
          const isMe = m.user_id === myId;
          const status = isMe ? (mySettings?.status ?? 'off') : m.share_status;
          const updatedAt = locations[m.user_id]?.recorded_at;
          const visible = !!updatedAt && status === 'active' && m.sharing_enabled;
          const dot = status === 'paused' ? colors.warning : visible ? freshnessColor[freshness(updatedAt, now)] : colors.offline;
          return (
            <View key={m.user_id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                left={
                  <View>
                    <Avatar name={m.full_name} uri={m.avatar_url} color={m.color} size={40} />
                    <View style={[styles.dot, { backgroundColor: dot }]} />
                  </View>
                }
                title={`${isMe ? 'Tú' : m.full_name || 'Sin nombre'}${m.role === 'admin' ? ' · Admin' : ''}`}
                subtitle={memberStatusText({ updatedAt, shareStatus: status, sharingInCircle: m.sharing_enabled, now })}
                onPress={isMe ? undefined : () => router.push({ pathname: '/member/[id]', params: { id: m.user_id } })}
                chevron={!isMe}
                right={
                  isAdmin && !isMe ? (
                    <IconButton icon={UserMinus} label={`Quitar a ${m.full_name}`} size={36} glass={false} color={colors.danger} onPress={() => setPending({ kind: 'remove', member: m })} />
                  ) : null
                }
              />
            </View>
          );
        })}
      </Card>

      <Card title="Mi privacidad en este círculo">
        <ListRow
          icon={Radio}
          iconColor={colors.success}
          title="Compartir mi ubicación aquí"
          subtitle="Si lo apagas, este círculo no te verá aunque compartas con otros"
          toggle={{ value: !!me?.sharing_enabled, onChange: (v) => act(() => updateMyMembership(circle.id, { sharing_enabled: v }), v ? 'Compartiendo con este círculo.' : 'Ya no compartes con este círculo.') }}
        />
        <Divider />
        <ListRow
          icon={History}
          title="Permitir ver mi historial"
          subtitle="Consentimiento aparte: los miembros podrán ver tus recorridos guardados"
          toggle={{ value: !!me?.share_history, onChange: (v) => act(() => updateMyMembership(circle.id, { share_history: v }), v ? 'Tu historial es visible en este círculo.' : 'Tu historial vuelve a ser privado.') }}
        />
      </Card>

      {invites.length ? (
        <Card title="Invitaciones pendientes">
          {invites.map((inv, i) => (
            <View key={inv.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                icon={UserPlus}
                iconColor={colors.accent}
                title={inv.invitee_email ?? inv.invitee_phone ?? `Código ${inv.code}`}
                subtitle={`${CHANNEL_LABEL[inv.channel]} · creada ${timeAgo(inv.created_at, now)}`}
                right={
                  inv.inviter_id === myId || isAdmin ? (
                    <IconButton
                      icon={X}
                      label="Revocar invitación"
                      size={34}
                      glass={false}
                      color={colors.textDim}
                      onPress={() => act(() => revokeInvitation(inv.id), 'Invitación revocada.', loadInvites)}
                    />
                  ) : null
                }
              />
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <ListRow icon={LogOut} iconColor={colors.danger} title="Salir del círculo" destructive onPress={() => setPending({ kind: 'leave' })} />
        {isAdmin ? (
          <>
            <Divider />
            <ListRow icon={Trash2} iconColor={colors.danger} title="Eliminar círculo" subtitle="Para todos los miembros" destructive onPress={() => setPending({ kind: 'delete' })} />
          </>
        ) : null}
      </Card>

      <ConfirmDialog
        visible={!!pending}
        tone="danger"
        icon={pending?.kind === 'remove' ? UserMinus : pending?.kind === 'delete' ? Trash2 : LogOut}
        title={pending?.kind === 'remove' ? `¿Quitar a ${pending.member.full_name}?` : pending?.kind === 'delete' ? '¿Eliminar el círculo?' : '¿Salir del círculo?'}
        message={
          pending?.kind === 'remove'
            ? 'Dejará de ver a los miembros y ellos dejarán de verle.'
            : pending?.kind === 'delete'
              ? 'Todos los miembros dejarán de compartir entre sí en este círculo. No se puede deshacer.'
              : isAdmin && circle.members.length > 1
                ? 'Dejarás de compartir tu ubicación con este círculo. El miembro más antiguo será el nuevo administrador.'
                : 'Dejarás de compartir tu ubicación con este círculo.'
        }
        confirmLabel={pending?.kind === 'remove' ? 'Quitar' : pending?.kind === 'delete' ? 'Eliminar' : 'Salir'}
        loading={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'remove') act(() => removeMember(circle.id, pending.member.user_id), 'Miembro eliminado.');
          else if (pending.kind === 'delete') act(() => deleteCircle(circle.id), 'Círculo eliminado.', () => router.back());
          else act(() => removeMember(circle.id, myId!), 'Saliste del círculo.', () => router.back());
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2.5, borderColor: colors.bg },
  label: { color: colors.textDim, fontFamily: fonts.medium },
});
