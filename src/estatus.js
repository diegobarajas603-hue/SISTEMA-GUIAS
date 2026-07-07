const PLAZAS = ['MTY', 'CDMX'];

const NOMBRES_PLAZA = {
  MTY: 'Monterrey',
  CDMX: 'Ciudad de Mexico',
};

const ACCIONES = {
  SALIDA: 'SALIDA', // la guia salio de una plaza hacia la otra
  LLEGADA: 'LLEGADA', // la guia llego a la bodega de una plaza
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

const MENSAJES = {
  EN_TRANSITO_A_CDMX: (g) => `Tu envio ${g} salio de bodega MTY y esta en transito hacia CDMX.`,
  EN_TRANSITO_A_MTY: (g) => `Tu envio ${g} salio de bodega CDMX y esta en transito hacia MTY.`,
  EN_BODEGA_CDMX: (g) => `Tu envio ${g} llego a bodega CDMX y esta listo.`,
  EN_BODEGA_MTY: (g) => `Tu envio ${g} llego a bodega MTY y esta listo.`,
};

function mensajeEstatus(numeroGuia, estatus) {
  const fn = MENSAJES[estatus];
  return fn ? fn(numeroGuia) : `Tu guia ${numeroGuia} tiene estatus: ${estatus}.`;
}

module.exports = {
  PLAZAS,
  NOMBRES_PLAZA,
  ACCIONES,
  otraPlaza,
  enTransitoA,
  enBodega,
  mensajeEstatus,
};
