import { colors } from './theme';

export type Freshness = 'live' | 'recent' | 'stale' | 'none';

const MINUTE = 60_000;

/** Qué tan reciente es una ubicación: 🟢 < 2 min, 🟡 < 30 min, ⚫ más vieja o ausente. */
export function freshness(iso: string | null | undefined, now = Date.now()): Freshness {
  if (!iso) return 'none';
  const age = now - new Date(iso).getTime();
  if (age < 2 * MINUTE) return 'live';
  if (age < 30 * MINUTE) return 'recent';
  return 'stale';
}

export const freshnessColor: Record<Freshness, string> = {
  live: colors.success,
  recent: colors.warning,
  stale: colors.offline,
  none: colors.offline,
};

/** "justo ahora", "hace 15 segundos", "hace 8 minutos", "hace 3 h", "ayer a las 18:30"… */
export function timeAgo(iso: string | number | null | undefined, now = Date.now()): string {
  if (iso === null || iso === undefined) return 'sin datos';
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'justo ahora';
  if (s < 60) return `hace ${s} segundos`;
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? 'hace 1 minuto' : `hace ${m} minutos`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? 'hace 1 hora' : `hace ${h} horas`;
  const date = new Date(t);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `ayer a las ${formatTime(date)}`;
  return `${formatDate(date)} ${formatTime(date)}`;
}

/** Texto de estado de una persona en un círculo, como en la lista de "Mis círculos". */
export function memberStatusText(opts: {
  updatedAt: string | null | undefined;
  shareStatus: 'off' | 'active' | 'paused';
  sharingInCircle: boolean;
  now?: number;
}): string {
  const { updatedAt, shareStatus, sharingInCircle, now = Date.now() } = opts;
  if (shareStatus === 'paused') return 'Ubicación en pausa';
  if (shareStatus === 'off' || !sharingInCircle) return 'No está compartiendo';
  if (!updatedAt) return 'Ubicación no disponible';
  const f = freshness(updatedAt, now);
  if (f === 'live' && now - new Date(updatedAt).getTime() < 10_000) return 'Ubicación actualizada';
  return `Actualizada ${timeAgo(updatedAt, now)}`;
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string | number): string {
  const d = new Date(iso);
  return d.toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatCoord(value: number | null | undefined, digits = 6): string {
  return value === null || value === undefined ? '—' : value.toFixed(digits);
}

export function formatAccuracy(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '—';
  if (meters >= 1000) return `±${(meters / 1000).toFixed(1)} km`;
  return `±${Math.round(meters)} m`;
}

/** m/s → km/h; velocidades negativas significan "desconocida". */
export function formatSpeed(mps: number | null | undefined): string {
  if (mps === null || mps === undefined || mps < 0) return '—';
  const kmh = mps * 3.6;
  return kmh < 1 ? 'Detenido' : `${kmh.toFixed(kmh < 10 ? 1 : 0)} km/h`;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export function formatHeading(deg: number | null | undefined): string {
  if (deg === null || deg === undefined || deg < 0) return '—';
  return `${CARDINALS[Math.round(deg / 45) % 8]} · ${Math.round(deg)}°`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'Sin nombre';
}
