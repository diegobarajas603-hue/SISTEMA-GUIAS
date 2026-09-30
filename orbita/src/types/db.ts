export type ShareStatus = 'off' | 'active' | 'paused';
export type ShareMode = 'always' | '1h' | '8h' | 'until_off';
export type CircleKind = 'familia' | 'amigos' | 'trabajo' | 'pareja' | 'emergencias' | 'otro';
export type CircleRole = 'admin' | 'member';
export type InviteChannel = 'link' | 'code' | 'email' | 'phone' | 'username';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface Profile {
  id: string;
  full_name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  color: string;
  created_at: string;
}

export interface SharingSettings {
  user_id: string;
  status: ShareStatus;
  mode: ShareMode;
  expires_at: string | null;
  save_history: boolean;
  updated_at: string;
}

export interface Circle {
  id: string;
  name: string;
  kind: CircleKind;
  icon: string;
  color: string;
  admin_id: string;
  created_at: string;
}

export interface CircleMembership {
  circle_id: string;
  user_id: string;
  role: CircleRole;
  sharing_enabled: boolean;
  share_history: boolean;
  joined_at: string;
}

/** Fila devuelta por la RPC circle_directory. */
export interface DirectoryMember {
  user_id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  color: string;
  role: CircleRole;
  sharing_enabled: boolean;
  share_history: boolean;
  share_status: ShareStatus;
  share_expires_at: string | null;
  joined_at: string;
}

export interface LiveLocation {
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  is_approximate: boolean;
  battery_level: number | null;
  recorded_at: string;
  updated_at: string;
}

export interface HistoryPoint {
  id: number;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  recorded_at: string;
}

export interface Invitation {
  id: string;
  code: string;
  circle_id: string;
  inviter_id: string;
  channel: InviteChannel;
  invitee_user_id: string | null;
  invitee_email: string | null;
  invitee_phone: string | null;
  status: InviteStatus;
  created_at: string;
  expires_at: string;
}

/** Fila devuelta por la RPC get_invitation. */
export interface InvitationPreview {
  code: string;
  status: InviteStatus;
  expires_at: string;
  is_expired: boolean;
  circle_id: string;
  circle_name: string;
  circle_kind: CircleKind;
  circle_color: string;
  circle_icon: string;
  member_count: number;
  inviter_name: string;
  inviter_avatar: string | null;
  already_member: boolean;
}

export interface EmergencyContact {
  id: string;
  owner_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  contact_user_id: string | null;
  created_at: string;
}

export interface SosEvent {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  message: string | null;
  status: 'active' | 'cancelled' | 'expired';
  started_at: string;
  expires_at: string;
  ended_at: string | null;
}

export type AlertKind = 'sos' | 'sos_ended' | 'invite' | 'member_joined' | 'invite_declined';

export interface AlertItem {
  id: string;
  user_id: string;
  kind: AlertKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}
