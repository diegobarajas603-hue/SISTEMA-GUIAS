/**
 * Formato para textos generados en el servidor (copiloto, correos, propuestas).
 * La interfaz tiene su propio módulo de formato; este existe porque el backend
 * también redacta prosa y necesita las mismas convenciones.
 */

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0,
});

const MXN_EXACTO = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
});

/** Centavos → «$1,250,000». Los montos comerciales no se leen con centavos. */
export const formatearMXN = (centavos) => MXN.format(Math.round(Number(centavos ?? 0) / 100));

/** Centavos → «$12,500.00». Para documentos donde el centavo importa. */
export const formatearMXNExacto = (centavos) => MXN_EXACTO.format(Number(centavos ?? 0) / 100);

/** «1.2 M» / «850 k» para etiquetas donde no cabe la cifra completa. */
export function formatearCompacto(centavos) {
  const pesos = Number(centavos ?? 0) / 100;
  if (Math.abs(pesos) >= 1_000_000) return `$${(pesos / 1_000_000).toFixed(1)} M`;
  if (Math.abs(pesos) >= 1_000) return `$${Math.round(pesos / 1_000)} k`;
  return `$${Math.round(pesos)}`;
}

const FECHA_LARGA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
const FECHA_CORTA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

export const formatearFecha = (fecha) => (fecha ? FECHA_LARGA.format(new Date(fecha)) : '—');
export const formatearFechaCorta = (fecha) => (fecha ? FECHA_CORTA.format(new Date(fecha)) : '—');

export const formatearNumero = (n) => new Intl.NumberFormat('es-MX').format(Number(n ?? 0));

export const formatearPorcentaje = (n, decimales = 0) =>
  `${Number(n ?? 0).toFixed(decimales)} %`;
