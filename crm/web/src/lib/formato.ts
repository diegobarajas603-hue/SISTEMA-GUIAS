/** Formato compartido por toda la interfaz: una sola fuente de verdad para cifras y fechas. */

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const MXN_EXACTO = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('es-MX');

/** Centavos → «$1,250,000». Así se leen los montos comerciales en toda la app. */
export const dinero = (centavos: number | null | undefined): string => MXN.format(Math.round((centavos ?? 0) / 100));
export const dineroExacto = (centavos: number | null | undefined): string => MXN_EXACTO.format((centavos ?? 0) / 100);

/** «1.2M» / «850k», para ejes de gráfica y espacios reducidos. */
export function dineroCompacto(centavos: number | null | undefined): string {
  const pesos = (centavos ?? 0) / 100;
  const signo = pesos < 0 ? '-' : '';
  const abs = Math.abs(pesos);
  if (abs >= 1_000_000) return `${signo}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${signo}$${Math.round(abs / 1_000)}k`;
  return `${signo}$${Math.round(abs)}`;
}

export const numero = (n: number | null | undefined): string => NUM.format(n ?? 0);
export const porcentaje = (n: number | null | undefined, decimales = 0): string => `${(n ?? 0).toFixed(decimales)}%`;

const FECHA_LARGA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
const FECHA_CORTA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const FECHA_HORA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const HORA = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' });
const MES_ANO = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });

export const fechaLarga = (f: string | Date | null | undefined): string => (f ? FECHA_LARGA.format(new Date(f)) : '—');
export const fechaCorta = (f: string | Date | null | undefined): string => (f ? FECHA_CORTA.format(new Date(f)) : '—');
export const fechaHora = (f: string | Date | null | undefined): string => (f ? FECHA_HORA.format(new Date(f)) : '—');
export const hora = (f: string | Date | null | undefined): string => (f ? HORA.format(new Date(f)) : '—');
export const mesAno = (f: string | Date | null | undefined): string => (f ? MES_ANO.format(new Date(f)) : '—');

/** «hace 3 h» / «en 2 d». La unidad más humana de leer sin hacer cuentas. */
export function relativo(f: string | Date | null | undefined): string {
  if (!f) return '—';
  const diffMs = new Date(f).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const min = 60_000; const hr = 3_600_000; const dia = 86_400_000;
  let valor: number; let unidad: string;
  if (abs < hr) { valor = Math.round(abs / min); unidad = 'min'; }
  else if (abs < dia) { valor = Math.round(abs / hr); unidad = 'h'; }
  else if (abs < dia * 30) { valor = Math.round(abs / dia); unidad = 'd'; }
  else { valor = Math.round(abs / (dia * 30)); unidad = 'mes'; }
  if (valor === 0) return 'ahora';
  return diffMs < 0 ? `hace ${valor} ${unidad}` : `en ${valor} ${unidad}`;
}

export const iniciales = (nombre: string): string =>
  nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

/** Paleta de 8 tonos para avatares, indexada por `avatar_tono` del usuario. */
export const TONOS_AVATAR = [
  'var(--marca-500)', 'var(--serie-2)', 'var(--ia-500)', 'var(--serie-5)',
  'var(--serie-6)', 'var(--alerta-600)', 'var(--marca-700)', 'var(--peligro-500)',
];
export const tonoAvatar = (tono: number | null | undefined): string => TONOS_AVATAR[(tono ?? 0) % TONOS_AVATAR.length];

export const claseEtiquetaTexto = (s: string): string =>
  s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
