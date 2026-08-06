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

// Todos los estatus que puede tener una guia. Se usa para dejar elegir a mano
// el estatus con el que arranca una guia nueva cuando se cancela la anterior.
const ESTATUS = [];
for (const plaza of PLAZAS) {
  ESTATUS.push(enTransitoA(plaza), enBodega(plaza), enRutaEntrega(plaza), entregado(plaza));
}

// Plaza a la que apunta un estatus: donde esta la guia o hacia donde va
function plazaDeEstatus(estatus) {
  return estatus.endsWith('_MTY') ? 'MTY' : 'CDMX';
}

// Escaneo equivalente a un estatus fijado a mano. Permite dejar en el historial
// el movimiento que corresponde a ese estatus, para que el rastreo del cliente
// y las correcciones posteriores sigan siendo coherentes.
function eventoDeEstatus(estatus) {
  const plaza = plazaDeEstatus(estatus);
  if (estatus.startsWith('EN_TRANSITO_A_')) {
    const origen = otraPlaza(plaza);
    return {
      accion: ACCIONES.SALIDA,
      plaza: origen,
      descripcion: `Salio de bodega ${origen} con destino a ${plaza}`,
    };
  }
  if (estatus.startsWith('EN_BODEGA_')) {
    return { accion: ACCIONES.LLEGADA, plaza, descripcion: `Llego a bodega ${plaza}` };
  }
  if (estatus.startsWith('EN_RUTA_ENTREGA_')) {
    return { accion: ACCIONES.RUTA_ENTREGA, plaza, descripcion: `Paquete en ruta de entrega en ${plaza}` };
  }
  return { accion: ACCIONES.ENTREGA, plaza, descripcion: `Entregado en ${plaza}` };
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
  ESTATUS,
  plazaDeEstatus,
  eventoDeEstatus,
  otraPlaza,
  enTransitoA,
  enBodega,
  enRutaEntrega,
  entregado,
  mensajeEstatus,
};
