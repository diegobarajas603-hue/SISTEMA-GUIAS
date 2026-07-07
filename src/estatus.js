const PLAZAS = ['MTY', 'CDMX'];

const NOMBRES_PLAZA = {
  MTY: 'Monterrey',
  CDMX: 'Ciudad de Mexico',
};

const ACCIONES = {
  SALIDA: 'SALIDA', // la guia salio de una plaza hacia la otra
  LLEGADA: 'LLEGADA', // la guia llego a la bodega de una plaza
  RUTA_ENTREGA: 'RUTA_ENTREGA', // el paquete salio a ruta de entrega a domicilio
  ENTREGA: 'ENTREGA', // el paquete fue entregado (a domicilio o en ocurre)
  ESCANEO_REPETIDO: 'ESCANEO_REPETIDO', // se escaneo de nuevo sin cambio de estatus
};

function otraPlaza(plaza) {
  return plaza === 'MTY' ? 'CDMX' : 'MTY';
}

function enTransitoA(plaza) {
  return `EN_TRANSITO_A_${plaza}`;
}

function enBodega(plaza) {
  return `EN_BODEGA_${plaza}`;
}

function enRutaEntrega(plaza) {
  return `EN_RUTA_ENTREGA_${plaza}`;
}

function entregado(plaza) {
  return `ENTREGADO_${plaza}`;
}

const MENSAJES = {
  EN_TRANSITO_A_CDMX: (g) => `Tu envio ${g} salio de bodega MTY y esta en transito hacia CDMX.`,
  EN_TRANSITO_A_MTY: (g) => `Tu envio ${g} salio de bodega CDMX y esta en transito hacia MTY.`,
  EN_BODEGA_CDMX: (g) => `Tu envio ${g} llego a bodega CDMX y esta listo.`,
  EN_BODEGA_MTY: (g) => `Tu envio ${g} llego a bodega MTY y esta listo.`,
  EN_RUTA_ENTREGA_CDMX: (g) => `Tu envio ${g} esta en ruta de entrega en CDMX.`,
  EN_RUTA_ENTREGA_MTY: (g) => `Tu envio ${g} esta en ruta de entrega en MTY.`,
  ENTREGADO_CDMX: (g) => `Tu envio ${g} fue entregado. Gracias por tu preferencia.`,
  ENTREGADO_MTY: (g) => `Tu envio ${g} fue entregado. Gracias por tu preferencia.`,
};

function mensajeEstatus(numeroGuia, estatus) {
  const fn = MENSAJES[estatus];
  return fn ? fn(numeroGuia) : `Tu envio ${numeroGuia} tiene estatus: ${estatus}.`;
}

module.exports = {
  PLAZAS,
  NOMBRES_PLAZA,
  ACCIONES,
  otraPlaza,
  enTransitoA,
  enBodega,
  enRutaEntrega,
  entregado,
  mensajeEstatus,
};
