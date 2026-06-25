const { pool } = require('./db');
const { PLAZAS, otraPlaza, estatusIngreso, estatusSalida, estatusLlegada } = require('./estatus');

function now() {
  return new Date();
}

async function registrarEvento(numeroGuia, accion, estatus) {
  await pool.query(
    'INSERT INTO eventos (numero_guia, accion, estatus, creado_en) VALUES ($1, $2, $3, $4)',
    [numeroGuia, accion, estatus, now()]
  );
}

async function obtenerGuia(numeroGuia) {
  const { rows } = await pool.query('SELECT * FROM guias WHERE numero_guia = $1', [numeroGuia]);
  return rows[0];
}

async function obtenerHistorial(numeroGuia) {
  const { rows } = await pool.query(
    'SELECT accion, estatus, creado_en FROM eventos WHERE numero_guia = $1 ORDER BY id ASC',
    [numeroGuia]
  );
  return rows;
}

// Escaneo de ingreso: la guia entra a la bodega de "origen"
async function ingresarGuia(numeroGuia, origen) {
  if (!PLAZAS.includes(origen)) throw new Error('Plaza de origen invalida');
  const destino = otraPlaza(origen);
  const estatus = estatusIngreso(origen);

  await pool.query(
    `INSERT INTO guias (numero_guia, origen, destino, estatus, creado_en, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (numero_guia) DO UPDATE
       SET origen = $2, destino = $3, estatus = $4, actualizado_en = $5`,
    [numeroGuia, origen, destino, estatus, now()]
  );
  await registrarEvento(numeroGuia, 'INGRESO', estatus);
  return obtenerGuia(numeroGuia);
}

// Escaneo de salida: el camion sale hacia destino
async function marcarSalida(numeroGuia) {
  const guia = await obtenerGuia(numeroGuia);
  if (!guia) throw new Error('Guia no encontrada, debe ingresarse primero');
  const estatus = estatusSalida(guia.destino);
  await pool.query('UPDATE guias SET estatus = $1, actualizado_en = $2 WHERE numero_guia = $3', [
    estatus,
    now(),
    numeroGuia,
  ]);
  await registrarEvento(numeroGuia, 'SALIDA', estatus);
  return obtenerGuia(numeroGuia);
}

// Escaneo de llegada: el camion llego al destino
async function marcarLlegada(numeroGuia) {
  const guia = await obtenerGuia(numeroGuia);
  if (!guia) throw new Error('Guia no encontrada, debe ingresarse primero');
  const estatus = estatusLlegada(guia.destino);
  await pool.query('UPDATE guias SET estatus = $1, actualizado_en = $2 WHERE numero_guia = $3', [
    estatus,
    now(),
    numeroGuia,
  ]);
  await registrarEvento(numeroGuia, 'LLEGADA', estatus);
  return obtenerGuia(numeroGuia);
}

async function listarGuias({ limit = 100 } = {}) {
  const { rows } = await pool.query('SELECT * FROM guias ORDER BY actualizado_en DESC LIMIT $1', [limit]);
  return rows;
}

module.exports = {
  ingresarGuia,
  marcarSalida,
  marcarLlegada,
  obtenerGuia,
  obtenerHistorial,
  listarGuias,
};
