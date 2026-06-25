const db = require('./db');
const { PLAZAS, otraPlaza, estatusIngreso, estatusSalida, estatusLlegada } = require('./estatus');

function now() {
  return new Date().toISOString();
}

function registrarEvento(numeroGuia, accion, estatus) {
  db.prepare(
    'INSERT INTO eventos (numero_guia, accion, estatus, creado_en) VALUES (?, ?, ?, ?)'
  ).run(numeroGuia, accion, estatus, now());
}

function obtenerGuia(numeroGuia) {
  return db.prepare('SELECT * FROM guias WHERE numero_guia = ?').get(numeroGuia);
}

function obtenerHistorial(numeroGuia) {
  return db
    .prepare('SELECT accion, estatus, creado_en FROM eventos WHERE numero_guia = ? ORDER BY id ASC')
    .all(numeroGuia);
}

// Escaneo de ingreso: la guia entra a la bodega de "origen"
function ingresarGuia(numeroGuia, origen) {
  if (!PLAZAS.includes(origen)) throw new Error('Plaza de origen invalida');
  const destino = otraPlaza(origen);
  const estatus = estatusIngreso(origen);
  const existente = obtenerGuia(numeroGuia);

  if (existente) {
    db.prepare(
      'UPDATE guias SET origen = ?, destino = ?, estatus = ?, actualizado_en = ? WHERE numero_guia = ?'
    ).run(origen, destino, estatus, now(), numeroGuia);
  } else {
    db.prepare(
      'INSERT INTO guias (numero_guia, origen, destino, estatus, creado_en, actualizado_en) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(numeroGuia, origen, destino, estatus, now(), now());
  }
  registrarEvento(numeroGuia, 'INGRESO', estatus);
  return obtenerGuia(numeroGuia);
}

// Escaneo de salida: el camion sale hacia destino
function marcarSalida(numeroGuia) {
  const guia = obtenerGuia(numeroGuia);
  if (!guia) throw new Error('Guia no encontrada, debe ingresarse primero');
  const estatus = estatusSalida(guia.destino);
  db.prepare('UPDATE guias SET estatus = ?, actualizado_en = ? WHERE numero_guia = ?').run(
    estatus,
    now(),
    numeroGuia
  );
  registrarEvento(numeroGuia, 'SALIDA', estatus);
  return obtenerGuia(numeroGuia);
}

// Escaneo de llegada: el camion llego al destino
function marcarLlegada(numeroGuia) {
  const guia = obtenerGuia(numeroGuia);
  if (!guia) throw new Error('Guia no encontrada, debe ingresarse primero');
  const estatus = estatusLlegada(guia.destino);
  db.prepare('UPDATE guias SET estatus = ?, actualizado_en = ? WHERE numero_guia = ?').run(
    estatus,
    now(),
    numeroGuia
  );
  registrarEvento(numeroGuia, 'LLEGADA', estatus);
  return obtenerGuia(numeroGuia);
}

function listarGuias({ limit = 100 } = {}) {
  return db.prepare('SELECT * FROM guias ORDER BY actualizado_en DESC LIMIT ?').all(limit);
}

module.exports = {
  ingresarGuia,
  marcarSalida,
  marcarLlegada,
  obtenerGuia,
  obtenerHistorial,
  listarGuias,
};
