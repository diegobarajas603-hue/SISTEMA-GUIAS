import { peticionInvalida } from './errores.js';

/**
 * Validación mínima y explícita, sin dependencias. Un CRM tiene decenas de
 * endpoints; lo que importa es que ninguna clave del cliente llegue al SQL sin
 * pasar por una lista blanca, y eso se resuelve aquí y en `armarUpdate`.
 */

export function texto(valor, campo, { requerido = false, max = 500, min = 0 } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw peticionInvalida(`El campo «${campo}» es obligatorio.`);
    return undefined;
  }
  const s = String(valor).trim();
  if (s.length < min) throw peticionInvalida(`«${campo}» debe tener al menos ${min} caracteres.`);
  if (s.length > max) throw peticionInvalida(`«${campo}» excede ${max} caracteres.`);
  return s;
}

export function entero(valor, campo, { requerido = false, min = -Infinity, max = Infinity } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw peticionInvalida(`El campo «${campo}» es obligatorio.`);
    return undefined;
  }
  const n = Number(valor);
  if (!Number.isFinite(n)) throw peticionInvalida(`«${campo}» debe ser numérico.`);
  const r = Math.round(n);
  if (r < min || r > max) throw peticionInvalida(`«${campo}» debe estar entre ${min} y ${max}.`);
  return r;
}

export function unoDe(valor, campo, opciones, { requerido = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw peticionInvalida(`El campo «${campo}» es obligatorio.`);
    return undefined;
  }
  const s = String(valor);
  if (!opciones.includes(s)) {
    throw peticionInvalida(`«${campo}» debe ser uno de: ${opciones.join(', ')}.`);
  }
  return s;
}

export function correo(valor, campo = 'email', { requerido = false } = {}) {
  const s = texto(valor, campo, { requerido, max: 200 });
  if (s === undefined) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) {
    throw peticionInvalida('El correo no tiene un formato válido.');
  }
  return s.toLowerCase();
}

export function fecha(valor, campo, { requerido = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw peticionInvalida(`El campo «${campo}» es obligatorio.`);
    return undefined;
  }
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw peticionInvalida(`«${campo}» no es una fecha válida.`);
  return d;
}

export function listaTexto(valor, campo, { max = 30 } = {}) {
  if (valor === undefined || valor === null) return undefined;
  const arr = Array.isArray(valor) ? valor : String(valor).split(',');
  const limpio = arr.map((v) => String(v).trim()).filter(Boolean).slice(0, max);
  return limpio;
}

export function booleano(valor) {
  if (valor === undefined || valor === null || valor === '') return undefined;
  return ['1', 'true', 'si', 'yes', 'on'].includes(String(valor).toLowerCase());
}

/** Paginación con techo, para que nadie pida 100 000 filas. */
export function paginacion(query, { limitePorDefecto = 50, limiteMax = 200 } = {}) {
  const limite = Math.min(entero(query.limite ?? limitePorDefecto, 'limite', { min: 1, max: limiteMax }), limiteMax);
  const pagina = entero(query.pagina ?? 1, 'pagina', { min: 1, max: 10_000 });
  return { limite, desplazamiento: (pagina - 1) * limite, pagina };
}

/**
 * Ordenamiento seguro: la columna se resuelve contra una lista blanca, nunca por
 * interpolación de lo que envíe el cliente.
 */
export function orden(query, permitidas, porDefecto) {
  const columna = permitidas.includes(query.orden) ? query.orden : porDefecto;
  const direccion = String(query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { columna, direccion, sql: `${columna} ${direccion}` };
}
