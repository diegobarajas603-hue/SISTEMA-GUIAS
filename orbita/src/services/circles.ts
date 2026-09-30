import { supabase } from '@/lib/supabase';
import { useCirclesStore } from '@/store/circles';
import type { Circle, CircleKind, Invitation, InvitationPreview, InviteChannel } from '@/types/db';

const reload = () => useCirclesStore.getState().load().catch(() => {});

export async function createCircle(input: { name: string; kind: CircleKind; color: string; icon: string }): Promise<Circle> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('circles')
    .insert({ ...input, name: input.name.trim(), admin_id: auth.user!.id })
    .select()
    .single();
  if (error) throw error;
  await reload();
  return data as Circle;
}

export async function updateCircle(id: string, patch: Partial<Pick<Circle, 'name' | 'kind' | 'color' | 'icon'>>) {
  const { error } = await supabase.from('circles').update(patch).eq('id', id);
  if (error) throw error;
  await reload();
}

export async function deleteCircle(id: string) {
  const { error } = await supabase.from('circles').delete().eq('id', id);
  if (error) throw error;
  await reload();
}

/** Mi consentimiento dentro de un círculo. */
export async function updateMyMembership(circleId: string, patch: { sharing_enabled?: boolean; share_history?: boolean }) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('circle_members').update(patch).eq('circle_id', circleId).eq('user_id', auth.user!.id);
  if (error) throw error;
  await reload();
}

/** Salir de un círculo (o, siendo admin, quitar a alguien). */
export async function removeMember(circleId: string, userId: string) {
  const { error } = await supabase.from('circle_members').delete().eq('circle_id', circleId).eq('user_id', userId);
  if (error) throw error;
  await reload();
}

export async function createInvitation(circleId: string, channel: InviteChannel, target?: string): Promise<Invitation> {
  const { data, error } = await supabase.rpc('create_invitation', { p_circle: circleId, p_channel: channel, p_target: target ?? null });
  if (error) throw error;
  return data as Invitation;
}

export async function listCircleInvitations(circleId: string): Promise<Invitation[]> {
  const { data } = await supabase
    .from('invitations')
    .select('*')
    .eq('circle_id', circleId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  return (data as Invitation[] | null) ?? [];
}

export async function revokeInvitation(id: string) {
  const { error } = await supabase.rpc('revoke_invitation', { p_id: id });
  if (error) throw error;
}

export async function getInvitation(code: string): Promise<InvitationPreview | null> {
  const { data, error } = await supabase.rpc('get_invitation', { p_code: code });
  if (error) throw error;
  return ((data as InvitationPreview[] | null) ?? [])[0] ?? null;
}

export async function respondInvitation(code: string, accept: boolean, share: boolean) {
  const { data, error } = await supabase.rpc('respond_invitation', { p_code: code, p_accept: accept, p_share: share });
  if (error) throw error;
  await reload();
  return data as string;
}

/** Invitaciones dirigidas a mí y todavía pendientes. */
export async function listMyInvitations() {
  const { data: auth } = await supabase.auth.getUser();
  const { data } = await supabase
    .from('invitations')
    .select('*')
    .eq('invitee_user_id', auth.user!.id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  const invitations = (data as Invitation[] | null) ?? [];
  const previews = await Promise.all(invitations.map((i) => getInvitation(i.code).catch(() => null)));
  return previews.filter((p): p is InvitationPreview => !!p);
}

export async function setBlocked(viewerId: string, blocked: boolean) {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user!.id;
  const { error } = blocked
    ? await supabase.from('location_blocks').upsert({ owner_id: me, viewer_id: viewerId })
    : await supabase.from('location_blocks').delete().eq('owner_id', me).eq('viewer_id', viewerId);
  if (error) throw error;
}

export async function listBlocked(): Promise<string[]> {
  const { data } = await supabase.from('location_blocks').select('viewer_id');
  return ((data as { viewer_id: string }[] | null) ?? []).map((r) => r.viewer_id);
}
