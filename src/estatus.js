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
  CORRECCION: 'CORRECCION', // un administrador revirtio un escaneo equivocado
  CAMBIO_NUMERO: 'CAMBIO_NUMERO', // la guia se cancelo y se reemplazo su numero por uno nuevo
  COMPLEMENTO: 'COMPLEMENTO', // se registro un numero de complemento; la guia conserva ambos
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

// Mensajes que ve el cliente (rastreo publico y WhatsApp)
const MENSAJES = {
  EN_TRANSITO_A_CDMX: (g) => `Tu envío ${g} se encuentra en ruta hacia nuestro centro de distribución.`,
  EN_TRANSITO_A_MTY: (g) => `Tu envío ${g} se encuentra en ruta hacia nuestro centro de distribución.`,
  EN_BODEGA_CDMX: (g) => `Tu envío ${g} fue recibido en nuestra sucursal y está siendo preparado para su siguiente etapa.`,
  EN_BODEGA_MTY: (g) => `Tu envío ${g} fue recibido en nuestra sucursal y está siendo preparado para su siguiente etapa.`,
  EN_RUTA_ENTREGA_CDMX: (g) => `Tu envío ${g} se encuentra en ruta hacia la dirección de entrega.`,
  EN_RUTA_ENTREGA_MTY: (g) => `Tu envío ${g} se encuentra en ruta hacia la dirección de entrega.`,
  ENTREGADO_CDMX: (g) => `Tu envío ${g} fue entregado correctamente. Gracias por confiar en Fletes Tauro.`,
  ENTREGADO_MTY: (g) => `Tu envío ${g} fue entregado correctamente. Gracias por confiar en Fletes Tauro.`,
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
