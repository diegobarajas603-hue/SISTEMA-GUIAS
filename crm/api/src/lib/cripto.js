import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const LONGITUD_CLAVE = 64;
const SAL_BYTES = 16;

/**
 * Hash de contraseña con scrypt, igual criterio que el sistema de guías: sal por
 * usuario y comparación en tiempo constante. Formato: `scrypt$<sal>$<clave>`.
 */
export function hashPassword(password) {
  const sal = randomBytes(SAL_BYTES).toString('hex');
  const clave = scryptSync(password, sal, LONGITUD_CLAVE).toString('hex');
  return `scrypt$${sal}$${clave}`;
}

export function verificarPassword(password, almacenado) {
  if (!almacenado) return false;
  const [algoritmo, sal, clave] = almacenado.split('$');
  if (algoritmo !== 'scrypt' || !sal || !clave) return false;
  const candidata = scryptSync(password, sal, LONGITUD_CLAVE);
  const esperada = Buffer.from(clave, 'hex');
  if (candidata.length !== esperada.length) return false;
  return timingSafeEqual(candidata, esperada);
}

/** Token de sesión: 32 bytes de entropía en base64url. */
export const tokenSesion = () => randomBytes(32).toString('base64url');

/**
 * Lo que se guarda en `sesiones` es este hash, no el token. Si alguien lee la
 * tabla, no obtiene sesiones utilizables.
 */
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export const folio = (prefijo, n) => `${prefijo}-${String(n).padStart(5, '0')}`;
