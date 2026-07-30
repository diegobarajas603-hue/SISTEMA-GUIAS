/**
 * Única forma de fallar deliberadamente en la API. Cualquier otra excepción se
 * trata como error interno y no se filtra al cliente.
 */
export class ErrorHTTP extends Error {
  constructor(estado, codigo, mensaje, detalles) {
    super(mensaje);
    this.name = 'ErrorHTTP';
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

export const noEncontrado = (que = 'recurso') =>
  new ErrorHTTP(404, 'no_encontrado', `No se encontró el ${que}.`);

export const peticionInvalida = (mensaje, detalles) =>
  new ErrorHTTP(400, 'peticion_invalida', mensaje, detalles);

export const noAutenticado = (mensaje = 'Inicia sesión para continuar.') =>
  new ErrorHTTP(401, 'no_autenticado', mensaje);

export const sinPermiso = (mensaje = 'No tienes permiso para esta acción.') =>
  new ErrorHTTP(403, 'sin_permiso', mensaje);

export const conflicto = (mensaje, detalles) =>
  new ErrorHTTP(409, 'conflicto', mensaje, detalles);

export const demasiadasPeticiones = (mensaje = 'Demasiadas peticiones. Espera un momento.') =>
  new ErrorHTTP(429, 'limite_excedido', mensaje);

/** Envuelve un handler async para que los rechazos lleguen al middleware de errores. */
export const asincrono = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
