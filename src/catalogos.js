'use strict';
// Catalogos: rutas, tipos de unidad y tarifas por ruta+unidad.
// Lectura para todo el equipo; altas y cambios para admin y gerente.

const express = require('express');
const { get, all, run } = require('./db');
const { autenticar, requerirRol } = require('./auth');
const { ahora, limpiarTexto, num, redondear2 } = require('./util');

const soloGestion = requerirRol('admin', 'gerente');

// ---------- Rutas ----------

const rutasRutas = express.Router();
rutasRutas.use(autenticar);

rutasRutas.get('/', (req, res) => {
  const incluirInactivas = req.query.todas === '1';
  res.json(all(`SELECT * FROM rutas ${incluirInactivas ? '' : 'WHERE activa = 1'} ORDER BY origen, destino`));
});

rutasRutas.post('/', soloGestion, (req, res) => {
  const origen = limpiarTexto(req.body.origen, 120);
  const destino = limpiarTexto(req.body.destino, 120);
  if (!origen || !destino) return res.status(400).json({ error: 'Origen y destino son obligatorios.' });
  if (get('SELECT id FROM rutas WHERE origen = ? AND destino = ?', origen, destino)) {
    return res.status(400).json({ error: 'Esa ruta ya existe.' });
  }
  const info = run(
    'INSERT INTO rutas (origen, destino, km, horas, activa) VALUES (?, ?, ?, ?, 1)',
    origen, destino, num(req.body.km), num(req.body.horas)
  );
  res.status(201).json(get('SELECT * FROM rutas WHERE id = ?', info.lastInsertRowid));
});

rutasRutas.put('/:id', soloGestion, (req, res) => {
  const ruta = get('SELECT * FROM rutas WHERE id = ?', Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  run(
    'UPDATE rutas SET origen = ?, destino = ?, km = ?, horas = ?, activa = ? WHERE id = ?',
    limpiarTexto(req.body.origen, 120) || ruta.origen,
    limpiarTexto(req.body.destino, 120) || ruta.destino,
    req.body.km === undefined ? ruta.km : num(req.body.km),
    req.body.horas === undefined ? ruta.horas : num(req.body.horas),
    req.body.activa === undefined ? ruta.activa : (req.body.activa ? 1 : 0),
    ruta.id
  );
  res.json(get('SELECT * FROM rutas WHERE id = ?', ruta.id));
});

rutasRutas.delete('/:id', soloGestion, (req, res) => {
  const ruta = get('SELECT * FROM rutas WHERE id = ?', Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  run('DELETE FROM rutas WHERE id = ?', ruta.id); // sus tarifas se borran en cascada
  res.json({ ok: true });
});

// ---------- Unidades ----------

const rutasUnidades = express.Router();
rutasUnidades.use(autenticar);

rutasUnidades.get('/', (req, res) => {
  const incluirInactivas = req.query.todas === '1';
  res.json(all(`SELECT * FROM unidades ${incluirInactivas ? '' : 'WHERE activa = 1'} ORDER BY capacidad_kg, nombre`));
});

rutasUnidades.post('/', soloGestion, (req, res) => {
  const nombre = limpiarTexto(req.body.nombre, 120);
  if (!nombre) return res.status(400).json({ error: 'El nombre de la unidad es obligatorio.' });
  if (get('SELECT id FROM unidades WHERE nombre = ?', nombre)) {
    return res.status(400).json({ error: 'Esa unidad ya existe.' });
  }
  const info = run(
    'INSERT INTO unidades (nombre, capacidad_kg, descripcion, activa) VALUES (?, ?, ?, 1)',
    nombre, num(req.body.capacidad_kg), limpiarTexto(req.body.descripcion, 300)
  );
  res.status(201).json(get('SELECT * FROM unidades WHERE id = ?', info.lastInsertRowid));
});

rutasUnidades.put('/:id', soloGestion, (req, res) => {
  const unidad = get('SELECT * FROM unidades WHERE id = ?', Number(req.params.id));
  if (!unidad) return res.status(404).json({ error: 'Unidad no encontrada.' });
  run(
    'UPDATE unidades SET nombre = ?, capacidad_kg = ?, descripcion = ?, activa = ? WHERE id = ?',
    limpiarTexto(req.body.nombre, 120) || unidad.nombre,
    req.body.capacidad_kg === undefined ? unidad.capacidad_kg : num(req.body.capacidad_kg),
    req.body.descripcion === undefined ? unidad.descripcion : limpiarTexto(req.body.descripcion, 300),
    req.body.activa === undefined ? unidad.activa : (req.body.activa ? 1 : 0),
    unidad.id
  );
  res.json(get('SELECT * FROM unidades WHERE id = ?', unidad.id));
});

rutasUnidades.delete('/:id', soloGestion, (req, res) => {
  const unidad = get('SELECT * FROM unidades WHERE id = ?', Number(req.params.id));
  if (!unidad) return res.status(404).json({ error: 'Unidad no encontrada.' });
  try {
    run('DELETE FROM unidades WHERE id = ?', unidad.id);
    res.json({ ok: true });
  } catch (err) {
    // hay cotizaciones que la referencian: mejor desactivarla
    run('UPDATE unidades SET activa = 0 WHERE id = ?', unidad.id);
    res.json({ ok: true, desactivada: true });
  }
});

// ---------- Tarifas (ruta + unidad -> precio base) ----------

const rutasTarifas = express.Router();
rutasTarifas.use(autenticar);

rutasTarifas.get('/', (req, res) => {
  res.json(all(
    `SELECT t.*, r.origen, r.destino, u.nombre AS unidad_nombre
       FROM tarifas t
       JOIN rutas r ON r.id = t.ruta_id
       JOIN unidades u ON u.id = t.unidad_id
      ORDER BY r.origen, r.destino, u.capacidad_kg`
  ));
});

// Sugerencia de tarifa para el asistente de cotizacion
rutasTarifas.get('/sugerir', (req, res) => {
  const origen = limpiarTexto(req.query.origen, 120);
  const destino = limpiarTexto(req.query.destino, 120);
  const unidadId = num(req.query.unidad_id);
  if (!origen || !destino || !unidadId) return res.json({ tarifa: null });
  const fila = get(
    `SELECT t.monto, t.notas, t.actualizado_en, r.origen, r.destino, u.nombre AS unidad_nombre
       FROM tarifas t
       JOIN rutas r ON r.id = t.ruta_id
       JOIN unidades u ON u.id = t.unidad_id
      WHERE t.activa = 1 AND t.unidad_id = ?
        AND lower(r.origen) = lower(?) AND lower(r.destino) = lower(?)`,
    unidadId, origen, destino
  );
  res.json({ tarifa: fila || null });
});

rutasTarifas.post('/', soloGestion, (req, res) => {
  const rutaId = num(req.body.ruta_id);
  const unidadId = num(req.body.unidad_id);
  const monto = redondear2(num(req.body.monto));
  if (!rutaId || !unidadId) return res.status(400).json({ error: 'Elige la ruta y la unidad.' });
  if (monto <= 0) return res.status(400).json({ error: 'La tarifa debe ser mayor a cero.' });
  if (!get('SELECT id FROM rutas WHERE id = ?', rutaId)) return res.status(400).json({ error: 'La ruta no existe.' });
  if (!get('SELECT id FROM unidades WHERE id = ?', unidadId)) return res.status(400).json({ error: 'La unidad no existe.' });
  run(
    `INSERT INTO tarifas (ruta_id, unidad_id, monto, notas, activa, actualizado_en) VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT(ruta_id, unidad_id) DO UPDATE SET monto = excluded.monto, notas = excluded.notas, activa = 1, actualizado_en = excluded.actualizado_en`,
    rutaId, unidadId, monto, limpiarTexto(req.body.notas, 300), ahora()
  );
  const fila = get(
    `SELECT t.*, r.origen, r.destino, u.nombre AS unidad_nombre FROM tarifas t
      JOIN rutas r ON r.id = t.ruta_id JOIN unidades u ON u.id = t.unidad_id
     WHERE t.ruta_id = ? AND t.unidad_id = ?`, rutaId, unidadId
  );
  res.status(201).json(fila);
});

rutasTarifas.put('/:id', soloGestion, (req, res) => {
  const tarifa = get('SELECT * FROM tarifas WHERE id = ?', Number(req.params.id));
  if (!tarifa) return res.status(404).json({ error: 'Tarifa no encontrada.' });
  const monto = req.body.monto === undefined ? tarifa.monto : redondear2(num(req.body.monto));
  if (monto <= 0) return res.status(400).json({ error: 'La tarifa debe ser mayor a cero.' });
  run(
    'UPDATE tarifas SET monto = ?, notas = ?, activa = ?, actualizado_en = ? WHERE id = ?',
    monto,
    req.body.notas === undefined ? tarifa.notas : limpiarTexto(req.body.notas, 300),
    req.body.activa === undefined ? tarifa.activa : (req.body.activa ? 1 : 0),
    ahora(), tarifa.id
  );
  res.json(get(
    `SELECT t.*, r.origen, r.destino, u.nombre AS unidad_nombre FROM tarifas t
      JOIN rutas r ON r.id = t.ruta_id JOIN unidades u ON u.id = t.unidad_id WHERE t.id = ?`, tarifa.id
  ));
});

rutasTarifas.delete('/:id', soloGestion, (req, res) => {
  if (!get('SELECT id FROM tarifas WHERE id = ?', Number(req.params.id))) {
    return res.status(404).json({ error: 'Tarifa no encontrada.' });
  }
  run('DELETE FROM tarifas WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

module.exports = { rutasRutas, rutasUnidades, rutasTarifas };
