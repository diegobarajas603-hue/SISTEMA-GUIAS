'use strict';
// Tareas completables con vencimiento, prioridad y recordatorios
// (vencidas / para hoy) ligadas opcionalmente a una empresa.

const express = require('express');
const { get, all, run, registrarActividad } = require('./db');
const { autenticar, esAdminOGerente } = require('./auth');
const { ahora, limpiarTexto, fechaLocal } = require('./util');

const PRIORIDADES = ['alta', 'media', 'baja'];

const rutasTareas = express.Router();
rutasTareas.use(autenticar);

function puedeTocarTarea(usuario, tarea) {
  return esAdminOGerente(usuario) || tarea.asignado_a === usuario.id || tarea.creado_por === usuario.id;
}

rutasTareas.get('/', (req, res) => {
  const condiciones = [];
  const params = [];
  if (req.query.asignado_a) {
    condiciones.push('t.asignado_a = ?');
    params.push(Number(req.query.asignado_a));
  }
  if (req.query.empresa_id) {
    condiciones.push('t.empresa_id = ?');
    params.push(Number(req.query.empresa_id));
  }
  if (req.query.estatus === 'pendiente' || req.query.estatus === 'completada') {
    condiciones.push('t.estatus = ?');
    params.push(req.query.estatus);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = all(
    `SELECT t.*, e.nombre AS empresa_nombre, u.nombre AS asignado_nombre, c.nombre AS creador_nombre
       FROM tareas t
       LEFT JOIN empresas e ON e.id = t.empresa_id
       LEFT JOIN usuarios u ON u.id = t.asignado_a
       LEFT JOIN usuarios c ON c.id = t.creado_por
       ${where}
      ORDER BY t.estatus ASC, COALESCE(t.vence_en, '9999-12-31') ASC,
               CASE t.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END
      LIMIT 500`,
    ...params
  );
  res.json({ hoy: fechaLocal(), tareas: filas });
});

rutasTareas.post('/', (req, res) => {
  const titulo = limpiarTexto(req.body.titulo, 200);
  if (!titulo) return res.status(400).json({ error: 'Escribe el titulo de la tarea.' });
  const asignado = req.body.asignado_a ? Number(req.body.asignado_a) : req.usuario.id;
  if (!get('SELECT id FROM usuarios WHERE id = ? AND activo = 1', asignado)) {
    return res.status(400).json({ error: 'El usuario asignado no existe o esta inactivo.' });
  }
  const empresaId = req.body.empresa_id ? Number(req.body.empresa_id) : null;
  if (empresaId && !get('SELECT id FROM empresas WHERE id = ?', empresaId)) {
    return res.status(400).json({ error: 'La empresa ligada no existe.' });
  }
  const prioridad = PRIORIDADES.includes(req.body.prioridad) ? req.body.prioridad : 'media';
  const venceEn = limpiarTexto(req.body.vence_en, 20) || null; // 'YYYY-MM-DDTHH:MM' hora local

  const info = run(
    `INSERT INTO tareas (titulo, descripcion, empresa_id, asignado_a, creado_por, vence_en, prioridad, estatus, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
    titulo, limpiarTexto(req.body.descripcion, 2000), empresaId, asignado, req.usuario.id, venceEn, prioridad, ahora()
  );
  const id = Number(info.lastInsertRowid);
  if (empresaId) {
    registrarActividad({
      empresa_id: empresaId, tarea_id: id, usuario_id: req.usuario.id, tipo: 'sistema',
      titulo: `Seguimiento programado: ${titulo}`,
      descripcion: venceEn ? `Vence el ${venceEn.replace('T', ' a las ')}.` : '',
    });
  }
  res.status(201).json(get(
    `SELECT t.*, e.nombre AS empresa_nombre, u.nombre AS asignado_nombre FROM tareas t
      LEFT JOIN empresas e ON e.id = t.empresa_id LEFT JOIN usuarios u ON u.id = t.asignado_a WHERE t.id = ?`, id
  ));
});

rutasTareas.put('/:id', (req, res) => {
  const tarea = get('SELECT * FROM tareas WHERE id = ?', Number(req.params.id));
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada.' });
  if (!puedeTocarTarea(req.usuario, tarea)) return res.status(403).json({ error: 'Esta tarea no es tuya.' });

  const asignado = req.body.asignado_a === undefined ? tarea.asignado_a : Number(req.body.asignado_a);
  run(
    'UPDATE tareas SET titulo = ?, descripcion = ?, empresa_id = ?, asignado_a = ?, vence_en = ?, prioridad = ? WHERE id = ?',
    limpiarTexto(req.body.titulo, 200) || tarea.titulo,
    req.body.descripcion === undefined ? tarea.descripcion : limpiarTexto(req.body.descripcion, 2000),
    req.body.empresa_id === undefined ? tarea.empresa_id : (req.body.empresa_id ? Number(req.body.empresa_id) : null),
    asignado,
    req.body.vence_en === undefined ? tarea.vence_en : (limpiarTexto(req.body.vence_en, 20) || null),
    PRIORIDADES.includes(req.body.prioridad) ? req.body.prioridad : tarea.prioridad,
    tarea.id
  );
  res.json(get(
    `SELECT t.*, e.nombre AS empresa_nombre, u.nombre AS asignado_nombre FROM tareas t
      LEFT JOIN empresas e ON e.id = t.empresa_id LEFT JOIN usuarios u ON u.id = t.asignado_a WHERE t.id = ?`, tarea.id
  ));
});

rutasTareas.post('/:id/completar', (req, res) => {
  const tarea = get('SELECT * FROM tareas WHERE id = ?', Number(req.params.id));
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada.' });
  if (!puedeTocarTarea(req.usuario, tarea)) return res.status(403).json({ error: 'Esta tarea no es tuya.' });
  if (tarea.estatus === 'completada') return res.json(tarea);
  run("UPDATE tareas SET estatus = 'completada', completada_en = ? WHERE id = ?", ahora(), tarea.id);
  if (tarea.empresa_id) {
    registrarActividad({
      empresa_id: tarea.empresa_id, tarea_id: tarea.id, usuario_id: req.usuario.id, tipo: 'sistema',
      titulo: `Tarea completada: ${tarea.titulo}`,
      descripcion: limpiarTexto(req.body.nota, 500),
    });
  }
  res.json(get('SELECT * FROM tareas WHERE id = ?', tarea.id));
});

rutasTareas.post('/:id/reabrir', (req, res) => {
  const tarea = get('SELECT * FROM tareas WHERE id = ?', Number(req.params.id));
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada.' });
  if (!puedeTocarTarea(req.usuario, tarea)) return res.status(403).json({ error: 'Esta tarea no es tuya.' });
  run("UPDATE tareas SET estatus = 'pendiente', completada_en = NULL WHERE id = ?", tarea.id);
  res.json(get('SELECT * FROM tareas WHERE id = ?', tarea.id));
});

rutasTareas.delete('/:id', (req, res) => {
  const tarea = get('SELECT * FROM tareas WHERE id = ?', Number(req.params.id));
  if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada.' });
  if (!puedeTocarTarea(req.usuario, tarea)) return res.status(403).json({ error: 'Esta tarea no es tuya.' });
  run('DELETE FROM tareas WHERE id = ?', tarea.id);
  res.json({ ok: true });
});

module.exports = { rutasTareas };
