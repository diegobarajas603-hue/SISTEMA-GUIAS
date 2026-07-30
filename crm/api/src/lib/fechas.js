const DIA_MS = 86_400_000;

export const DIA = DIA_MS;

export const aFecha = (valor) => (valor instanceof Date ? valor : new Date(valor));

export const dias = (n) => n * DIA_MS;

/** Días transcurridos entre dos instantes (positivo si `hasta` es posterior). */
export function diasEntre(desde, hasta = new Date()) {
  if (!desde) return null;
  return (aFecha(hasta).getTime() - aFecha(desde).getTime()) / DIA_MS;
}

export const sumarDias = (fecha, n) => new Date(aFecha(fecha).getTime() + dias(n));
export const sumarHoras = (fecha, n) => new Date(aFecha(fecha).getTime() + n * 3_600_000);

export function inicioDia(fecha = new Date()) {
  const d = aFecha(fecha);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function inicioMes(fecha = new Date()) {
  const d = aFecha(fecha);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function finMes(fecha = new Date()) {
  const d = aFecha(fecha);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function sumarMeses(fecha, n) {
  const d = aFecha(fecha);
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28));
}

/** Días laborables (lun-vie) entre dos fechas. El pipeline se mueve en días hábiles. */
export function diasHabiles(desde, hasta) {
  let total = 0;
  const cursor = inicioDia(desde);
  const fin = inicioDia(hasta);
  while (cursor < fin) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

/** `2026-07` para agrupar por mes en SQL y en el cliente. */
export const claveMes = (fecha) => {
  const d = aFecha(fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const iso = (fecha) => aFecha(fecha).toISOString();
export const isoFecha = (fecha) => aFecha(fecha).toISOString().slice(0, 10);
