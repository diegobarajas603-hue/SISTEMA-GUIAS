import { config } from '../config.js';
import { usuarioDeToken } from '../servicios/auth.js';
import { noAutenticado, sinPermiso, demasiadasPeticiones } from '../lib/errores.js';

/** Lee la cookie de sesión sin dependencias externas. */
export function leerToken(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  for (const parte of cookie.split(';')) {
    const [nombre, ...resto] = parte.trim().split('=');
    if (nombre === config.sesion.cookie) return decodeURIComponent(resto.join('='));
  }
  return null;
}

export function ponerCookie(res, token, expira) {
  const partes = [
    `${config.sesion.cookie}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expira.toUTCString()}`,
  ];
  if (config.sesion.segura) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

export function borrarCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${config.sesion.cookie}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  );
}

/** Exige sesión válida. Deja el usuario en `req.usuario`. */
export async function exigirSesion(req, _res, next) {
  try {
    const usuario = await usuarioDeToken(leerToken(req));
    if (!usuario) throw noAutenticado();
    req.usuario = usuario;
    next();
  } catch (error) {
    next(error);
  }
}

/** Exige uno de los roles indicados. `admin` siempre pasa. */
export const exigirRol = (...roles) => (req, _res, next) => {
  if (!req.usuario) return next(noAutenticado());
  if (req.usuario.rol === 'admin' || roles.includes(req.usuario.rol)) return next();
  return next(sinPermiso(`Esta acción requiere rol: ${roles.join(' o ')}.`));
};

/**
 * Límite de peticiones en memoria por IP con ventana deslizante.
 * Suficiente para una instancia; detrás de varias réplicas habría que moverlo a
 * Redis, pero no vale la pena adelantarse a ese problema.
 */
export function limitar({ ventanaMs = 60_000, maximo = 60, clave = 'general' } = {}) {
  const golpes = new Map();
  return (req, _res, next) => {
    const ahora = Date.now();
    const id = `${clave}:${req.ip}`;
    const previos = (golpes.get(id) || []).filter((t) => ahora - t < ventanaMs);
    if (previos.length >= maximo) return next(demasiadasPeticiones());
    previos.push(ahora);
    golpes.set(id, previos);
    // Poda periódica para que el mapa no crezca sin control.
    if (golpes.size > 5000) {
      for (const [k, v] of golpes) {
        if (!v.some((t) => ahora - t < ventanaMs)) golpes.delete(k);
      }
    }
    return next();
  };
}
