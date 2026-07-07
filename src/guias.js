const { pool } = require('./db');
const { PLAZAS, NOMBRES_PLAZA, ACCIONES, otraPlaza, enTransitoA, enBodega } = require('./estatus');

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
    'SELECT accion, estatus, plaza, descripcion, creado_en FROM eventos WHERE numero_guia = $1 ORDER BY id DESC',
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

// Escaneo inteligente: segun la plaza donde se escanea y el estado actual de la
// guia, decide automaticamente que significa el escaneo.
//
// Estando en la plaza P (la otra plaza es Q):
//  - La guia no existe          -> se registra y sale de P hacia Q (EN_TRANSITO_A_Q)
//  - EN_TRANSITO_A_P            -> llego: queda en bodega de P (EN_BODEGA_P)
//  - EN_BODEGA_P                -> vuelve a salir de P hacia Q (EN_TRANSITO_A_Q)
//  - EN_TRANSITO_A_Q            -> escaneo repetido: ya se registro su salida, no cambia
//  - EN_BODEGA_Q                -> llego a P sin escaneo de salida en Q: queda EN_BODEGA_P
async function escanearGuia(numeroGuia, plaza) {
  if (!PLAZAS.includes(plaza)) throw new Error('Plaza invalida, usa MTY o CDMX');
  const destino = otraPlaza(plaza);
  const guia = await obtenerGuia(numeroGuia);

  if (!guia) {
    const estatus = enTransitoA(destino);
    await pool.query(
      `INSERT INTO guias (numero_guia, origen, destino, estatus, creado_en, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [numeroGuia, plaza, destino, estatus, now()]
    );
    const descripcion = `Guia registrada: salio de ${NOMBRES_PLAZA[plaza]} hacia ${NOMBRES_PLAZA[destino]}`;
    await registrarEvento(numeroGuia, ACCIONES.SALIDA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'salida', mensaje: descripcion };
  }

  if (guia.estatus === enTransitoA(plaza)) {
    const estatus = enBodega(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Llego a bodega de ${NOMBRES_PLAZA[plaza]}, lista`;
    await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'llegada', mensaje: descripcion };
  }

  if (guia.estatus === enBodega(plaza)) {
    const estatus = enTransitoA(destino);
    await pool.query(
      'UPDATE guias SET origen = $1, destino = $2, estatus = $3, actualizado_en = $4 WHERE numero_guia = $5',
      [plaza, destino, estatus, now(), numeroGuia]
    );
    const descripcion = `Salio de ${NOMBRES_PLAZA[plaza]} hacia ${NOMBRES_PLAZA[destino]}`;
    await registrarEvento(numeroGuia, ACCIONES.SALIDA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'salida', mensaje: descripcion };
  }

  if (guia.estatus === enTransitoA(destino)) {
    const descripcion = `Escaneo repetido en ${NOMBRES_PLAZA[plaza]}: la guia ya salio hacia ${NOMBRES_PLAZA[destino]}`;
    await registrarEvento(numeroGuia, ACCIONES.ESCANEO_REPETIDO, guia.estatus, plaza, descripcion);
    return { guia, tipo: 'repetido', mensaje: descripcion };
  }

  // EN_BODEGA_Q: aparecio en P sin que se escaneara su salida en Q
  const estatus = enBodega(plaza);
  await pool.query(
    'UPDATE guias SET origen = $1, destino = $2, estatus = $3, actualizado_en = $4 WHERE numero_guia = $5',
    [destino, plaza, estatus, now(), numeroGuia]
  );
  const descripcion = `Llego a bodega de ${NOMBRES_PLAZA[plaza]} (no se escaneo su salida de ${NOMBRES_PLAZA[destino]})`;
  await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, descripcion);
  return { guia: await obtenerGuia(numeroGuia), tipo: 'llegada', mensaje: descripcion };
}

async function listarGuias({ buscar, estatus, limit = 200 } = {}) {
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
  params.push(limit);
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM guias ${where} ORDER BY actualizado_en DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function resumen() {
  const { rows } = await pool.query('SELECT estatus, COUNT(*)::int AS total FROM guias GROUP BY estatus');
  const conteos = {};
  for (const r of rows) conteos[r.estatus] = r.total;
  return conteos;
}

module.exports = {
  escanearGuia,
  obtenerGuia,
  obtenerHistorial,
  listarGuias,
  resumen,
};
