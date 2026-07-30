import { ErrorHTTP } from '../lib/errores.js';
import { config } from '../config.js';

export function noEncontradoRuta(req, _res, next) {
  next(new ErrorHTTP(404, 'ruta_no_encontrada', `No existe ${req.method} ${req.path}.`));
}

/** Traduce cualquier fallo a la forma { error: { codigo, mensaje, detalles? } }. */
export function manejadorErrores(error, _req, res, _next) {
  if (error instanceof ErrorHTTP) {
    return res.status(error.estado).json({
      error: { codigo: error.codigo, mensaje: error.message, detalles: error.detalles },
    });
  }

  // Violaciones de integridad de Postgres traducidas a mensajes útiles.
  if (error?.code === '23505') {
    return res.status(409).json({
      error: { codigo: 'duplicado', mensaje: 'Ya existe un registro con ese valor único.' },
    });
  }
  if (error?.code === '23514') {
    return res.status(400).json({
      error: { codigo: 'valor_invalido', mensaje: 'Alguno de los valores enviados no es válido.' },
    });
  }
  if (error?.code === '23503') {
    return res.status(400).json({
      error: { codigo: 'referencia_invalida', mensaje: 'Se hace referencia a un registro que no existe.' },
    });
  }
  if (error?.code === '23502') {
    return res.status(400).json({
      error: { codigo: 'campo_requerido', mensaje: `Falta un campo obligatorio (${error.column}).` },
    });
  }
  console.error('[api] error no controlado:', error);
  return res.status(500).json({
    error: {
      codigo: 'error_interno',
      mensaje: 'Ocurrió un error inesperado. Vuelve a intentarlo.',
      // El detalle técnico solo se expone fuera de producción.
      detalles: config.esProduccion ? undefined : String(error?.message || error),
    },
  });
}
