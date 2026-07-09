const { pool } = require('./db');
const {
  PLAZAS,
  ACCIONES,
  otraPlaza,
  enTransitoA,
  enBodega,
  enRutaEntrega,
  entregado,
} = require('./estatus');

const MODOS = ['bodega', 'domicilio', 'ocurre'];

function now() {
  return new Date();
}

async function registrarEvento(numeroGuia, accion, estatus, plaza, descripcion) {
  await pool.query(
    'INSERT INTO eventos (numero_guia, accion, estatus, plaza, descripcion, creado_en) VALUES ($1, $2, $3, $4, $5, $6)',
    [numeroGuia, accion, estatus, plaza, descripcion, now()]
  );
}

async function obtenerGuia(numeroGuia) {
  const { rows } = await pool.query('SELECT * FROM guias WHERE numero_guia = $1', [numeroGuia]);
  return rows[0];
}

async function obtenerHistorial(numeroGuia) {
  const { rows } = await pool.query(
    'SELECT accion, estatus, plaza, descripcion, revertido, creado_en FROM eventos WHERE numero_guia = $1 ORDER BY id DESC',
    [numeroGuia]
  );
  return rows;
}

async function actualizarEstatus(numeroGuia, estatus) {
  await pool.query('UPDATE guias SET estatus = $1, actualizado_en = $2 WHERE numero_guia = $3', [
    estatus,
    now(),
    numeroGuia,
  ]);
}

async function marcarSalida(numeroGuia, plaza, destino) {
  const estatus = enTransitoA(destino);
  await pool.query(
    'UPDATE guias SET origen = $1, destino = $2, estatus = $3, actualizado_en = $4 WHERE numero_guia = $5',
    [plaza, destino, estatus, now(), numeroGuia]
  );
  const descripcion = `Salio de bodega ${plaza} con destino a ${destino}`;
  await registrarEvento(numeroGuia, ACCIONES.SALIDA, estatus, plaza, descripcion);
  return { guia: await obtenerGuia(numeroGuia), tipo: 'salida', mensaje: descripcion };
}

// Escaneo inteligente: segun la plaza donde se escanea, el modo de operacion y
// el estado actual de la guia, decide automaticamente que significa el escaneo.
//
// Modo "bodega" (transito MTY <-> CDMX), estando en la plaza P (la otra es Q):
//  - La guia no existe          -> se registra y sale de P hacia Q (EN_TRANSITO_A_Q)
//  - EN_TRANSITO_A_P            -> llego: queda en bodega de P (EN_BODEGA_P)
//  - EN_BODEGA_P                -> vuelve a salir de P hacia Q (EN_TRANSITO_A_Q)
//  - EN_RUTA_ENTREGA_P          -> regreso de un intento de entrega (EN_BODEGA_P)
//  - ENTREGADO_*                -> nuevo embarque: sale de P hacia Q (EN_TRANSITO_A_Q)
//  - EN_TRANSITO_A_Q            -> escaneo repetido: ya se registro su salida, no cambia
//  - EN_BODEGA_Q                -> llego a P sin escaneo de salida en Q: queda EN_BODEGA_P
//
// Modo "domicilio" (entrega a domicilio), estando en la plaza P:
//  - EN_BODEGA_P                -> paquete en ruta de entrega (EN_RUTA_ENTREGA_P)
//  - EN_RUTA_ENTREGA_P          -> entregado a domicilio (ENTREGADO_P)
//  - EN_TRANSITO_A_P            -> registra la llegada y lo pone en ruta en un solo paso
//
// Modo "ocurre" (el cliente recoge en bodega), estando en la plaza P:
//  - EN_BODEGA_P                -> entregado en ocurre (ENTREGADO_P)
//  - EN_TRANSITO_A_P            -> registra la llegada y lo entrega en un solo paso
async function escanearGuia(numeroGuia, plaza, modo = 'bodega') {
  if (!PLAZAS.includes(plaza)) throw new Error('Plaza invalida, usa MTY o CDMX');
  if (!MODOS.includes(modo)) throw new Error('Modo invalido, usa bodega, domicilio u ocurre');
  if (modo !== 'bodega') return escanearEntrega(numeroGuia, plaza, modo);

  const destino = otraPlaza(plaza);
  const guia = await obtenerGuia(numeroGuia);

  if (!guia) {
    const estatus = enTransitoA(destino);
    await pool.query(
      `INSERT INTO guias (numero_guia, origen, destino, estatus, creado_en, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [numeroGuia, plaza, destino, estatus, now()]
    );
    const descripcion = `Salio de bodega ${plaza} con destino a ${destino}`;
    await registrarEvento(numeroGuia, ACCIONES.SALIDA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'salida', mensaje: descripcion };
  }

  if (guia.estatus === enTransitoA(plaza)) {
    const estatus = enBodega(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Llego a bodega ${plaza}`;
    await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'llegada', mensaje: descripcion };
  }

  if (guia.estatus === enBodega(plaza) || guia.estatus === entregado(plaza) || guia.estatus === entregado(destino)) {
    return marcarSalida(numeroGuia, plaza, destino);
  }

  if (guia.estatus === enRutaEntrega(plaza)) {
    const estatus = enBodega(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Regreso a bodega ${plaza} (entrega no completada)`;
    await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'llegada', mensaje: descripcion };
  }

  if (guia.estatus === enTransitoA(destino)) {
    const descripcion = `Escaneo repetido en bodega ${plaza}: el envio ya salio con destino a ${destino}`;
    await registrarEvento(numeroGuia, ACCIONES.ESCANEO_REPETIDO, guia.estatus, plaza, descripcion);
    return { guia, tipo: 'repetido', mensaje: descripcion };
  }

  // EN_BODEGA_Q o EN_RUTA_ENTREGA_Q: aparecio en P sin los escaneos previos en Q
  const estatus = enBodega(plaza);
  await pool.query(
    'UPDATE guias SET origen = $1, destino = $2, estatus = $3, actualizado_en = $4 WHERE numero_guia = $5',
    [destino, plaza, estatus, now(), numeroGuia]
  );
  const descripcion = `Llego a bodega ${plaza} (sin registro de salida de bodega ${destino})`;
  await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, descripcion);
  return { guia: await obtenerGuia(numeroGuia), tipo: 'llegada', mensaje: descripcion };
}

// Escaneos de entrega (a domicilio o en ocurre) en la plaza donde esta el paquete
async function escanearEntrega(numeroGuia, plaza, modo) {
  let guia = await obtenerGuia(numeroGuia);
  if (!guia) throw new Error('Guia no registrada; escaneala primero en modo bodega');

  // Venia en transito hacia esta plaza: registra la llegada y continua
  if (guia.estatus === enTransitoA(plaza)) {
    const estatus = enBodega(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, `Llego a bodega ${plaza}`);
    guia = await obtenerGuia(numeroGuia);
  }

  if (guia.estatus === entregado(plaza) || guia.estatus === entregado(otraPlaza(plaza))) {
    const descripcion = 'Escaneo repetido: el envio ya fue entregado';
    await registrarEvento(numeroGuia, ACCIONES.ESCANEO_REPETIDO, guia.estatus, plaza, descripcion);
    return { guia, tipo: 'repetido', mensaje: descripcion };
  }

  if (modo === 'domicilio' && guia.estatus === enBodega(plaza)) {
    const estatus = enRutaEntrega(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Paquete en ruta de entrega en ${plaza}`;
    await registrarEvento(numeroGuia, ACCIONES.RUTA_ENTREGA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'ruta', mensaje: descripcion };
  }

  if (modo === 'domicilio' && guia.estatus === enRutaEntrega(plaza)) {
    const estatus = entregado(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Entregado a domicilio en ${plaza}`;
    await registrarEvento(numeroGuia, ACCIONES.ENTREGA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'entregado', mensaje: descripcion };
  }

  if (modo === 'ocurre' && (guia.estatus === enBodega(plaza) || guia.estatus === enRutaEntrega(plaza))) {
    const estatus = entregado(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Entregado en ocurre (bodega ${plaza})`;
    await registrarEvento(numeroGuia, ACCIONES.ENTREGA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'entregado', mensaje: descripcion };
  }

  throw new Error(`La guia no esta disponible para entrega en ${plaza} (estatus actual: ${guia.estatus})`);
}

// Revierte el ultimo escaneo que cambio el estatus de la guia, regresandola
// al estatus que tenia antes (accion de administrador). El escaneo revertido
// no se borra del historial: se agrega un evento CORRECCION que documenta
// quien lo revirtio y que quedo deshecho.
async function revertirUltimoEscaneo(numeroGuia, usuario) {
  const guia = await obtenerGuia(numeroGuia);
  if (!guia) throw new Error('Guia no encontrada');

  const { rows: eventos } = await pool.query(
    'SELECT id, accion, estatus, plaza, descripcion FROM eventos WHERE numero_guia = $1 ORDER BY id ASC',
    [numeroGuia]
  );

  // Reconstruye la pila de escaneos vigentes: cada escaneo agrega un estado y
  // cada correccion previa ya deshizo el ultimo, de modo que revertir varias
  // veces sigue caminando hacia atras en el historial (no rebota).
  const pila = [];
  for (const ev of eventos) {
    if (ev.accion === ACCIONES.ESCANEO_REPETIDO) continue;
    if (ev.accion === ACCIONES.CORRECCION) pila.pop();
    else pila.push(ev);
  }
  if (pila.length < 2) {
    throw new Error('No hay un estatus anterior: ese fue el escaneo con el que se registro la guia');
  }
  const ultimo = pila[pila.length - 1];

  // Marca el escaneo deshecho para que deje de mostrarse al cliente
  await pool.query('UPDATE eventos SET revertido = TRUE WHERE id = $1', [ultimo.id]);

  // El estatus indica en/hacia que plaza esta la guia; de ahi se reconstruye
  // la ruta (en este flujo MTY <-> CDMX el destino siempre es esa plaza)
  const estatus = pila[pila.length - 2].estatus;
  const plazaDelEstatus = estatus.endsWith('_MTY') ? 'MTY' : 'CDMX';
  await pool.query(
    'UPDATE guias SET origen = $1, destino = $2, estatus = $3, actualizado_en = $4 WHERE numero_guia = $5',
    [otraPlaza(plazaDelEstatus), plazaDelEstatus, estatus, now(), numeroGuia]
  );

  const descripcion = `Correccion de ${usuario}: se revirtio "${ultimo.descripcion || ultimo.accion}" y la guia regreso a su estatus anterior`;
  await registrarEvento(numeroGuia, ACCIONES.CORRECCION, estatus, ultimo.plaza, descripcion);
  return { guia: await obtenerGuia(numeroGuia), tipo: 'correccion', mensaje: descripcion };
}

// Migracion idempotente al arrancar: marca como revertidos los escaneos que
// fueron deshechos por correcciones hechas antes de existir la columna
// "revertido", para que tampoco se muestren al cliente.
async function marcarRevertidosHistoricos() {
  const { rows } = await pool.query('SELECT DISTINCT numero_guia FROM eventos WHERE accion = $1', [
    ACCIONES.CORRECCION,
  ]);
  for (const { numero_guia } of rows) {
    const { rows: eventos } = await pool.query(
      'SELECT id, accion, revertido FROM eventos WHERE numero_guia = $1 ORDER BY id ASC',
      [numero_guia]
    );
    const pila = [];
    const deshechos = [];
    for (const ev of eventos) {
      if (ev.accion === ACCIONES.ESCANEO_REPETIDO) continue;
      if (ev.accion === ACCIONES.CORRECCION) {
        const p = pila.pop();
        if (p && !p.revertido) deshechos.push(p.id);
      } else {
        pila.push(ev);
      }
    }
    if (deshechos.length) {
      await pool.query('UPDATE eventos SET revertido = TRUE WHERE id = ANY($1)', [deshechos]);
    }
  }
}

async function listarGuias({ buscar, estatus, plaza, limit = 200 } = {}) {
  const condiciones = [];
  const params = [];
  if (buscar) {
    params.push(`%${buscar}%`);
    condiciones.push(`numero_guia ILIKE $${params.length}`);
  }
  if (estatus) {
    params.push(estatus);
    condiciones.push(`estatus = $${params.length}`);
  }
  if (plaza && PLAZAS.includes(plaza)) {
    // Guias "de" una plaza: por llegar, en bodega, en reparto o entregadas ahi
    params.push([enTransitoA(plaza), enBodega(plaza), enRutaEntrega(plaza), entregado(plaza)]);
    condiciones.push(`estatus = ANY($${params.length})`);
  }
  params.push(limit);
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM guias ${where} ORDER BY actualizado_en DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function listarEventos({ limit = 50 } = {}) {
  const { rows } = await pool.query(
    'SELECT numero_guia, accion, estatus, plaza, descripcion, revertido, creado_en FROM eventos ORDER BY id DESC LIMIT $1',
    [limit]
  );
  return rows;
}

async function resumen() {
  const { rows } = await pool.query('SELECT estatus, COUNT(*)::int AS total FROM guias GROUP BY estatus');
  const porEstatus = {};
  let totalGuias = 0;
  for (const r of rows) {
    porEstatus[r.estatus] = r.total;
    totalGuias += r.total;
  }
  const { rows: ev } = await pool.query(
    `SELECT COUNT(*)::int AS eventos, COUNT(*) FILTER (WHERE accion = 'ENTREGA')::int AS entregas
     FROM eventos WHERE creado_en >= now() - interval '24 hours'`
  );
  return { porEstatus, totalGuias, eventos24h: ev[0].eventos, entregas24h: ev[0].entregas };
}

module.exports = {
  escanearGuia,
  revertirUltimoEscaneo,
  marcarRevertidosHistoricos,
  obtenerGuia,
  obtenerHistorial,
  listarGuias,
  listarEventos,
  resumen,
};
