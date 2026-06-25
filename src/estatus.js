const PLAZAS = ['MTY', 'CDMX'];

const ACCIONES = {
  INGRESO: 'INGRESO', // se registra la guia en la bodega de origen
  SALIDA: 'SALIDA', // sale el camion hacia la plaza destino
  LLEGADA: 'LLEGADA', // el camion llego a la plaza destino
};

function otraPlaza(plaza) {
  return plaza === 'MTY' ? 'CDMX' : 'MTY';
}

function estatusIngreso(origen) {
  return `EN_BODEGA_${origen}`;
}

function estatusSalida(destino) {
  return `EN_CAMINO_${destino}`;
}

function estatusLlegada(destino) {
  return `LLEGO_${destino}`;
}

const MENSAJES = {
  EN_BODEGA_MTY: (g) => `Tu guia ${g} esta en nuestra bodega de Monterrey, lista para salir hacia CDMX.`,
  EN_BODEGA_CDMX: (g) => `Tu guia ${g} esta en nuestra bodega de CDMX, lista para salir hacia Monterrey.`,
  EN_CAMINO_CDMX: (g) => `Tu guia ${g} va en camino a Ciudad de Mexico.`,
  EN_CAMINO_MTY: (g) => `Tu guia ${g} va en camino a Monterrey.`,
  LLEGO_CDMX: (g) => `Tu guia ${g} ya llego a Ciudad de Mexico.`,
  LLEGO_MTY: (g) => `Tu guia ${g} ya llego a Monterrey.`,
};

function mensajeEstatus(numeroGuia, estatus) {
  const fn = MENSAJES[estatus];
  return fn ? fn(numeroGuia) : `Tu guia ${numeroGuia} tiene estatus: ${estatus}.`;
}

module.exports = { PLAZAS, ACCIONES, otraPlaza, estatusIngreso, estatusSalida, estatusLlegada, mensajeEstatus };
