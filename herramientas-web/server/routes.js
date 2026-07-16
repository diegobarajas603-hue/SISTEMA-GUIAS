const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mysql = require('mysql2/promise');
const unzipper = require('unzipper');

const { pool, asegurarColumnas, ahoraMx, UPLOADS_DIR } = require('./db');
const { firmar, setCookie, clearCookie, requireAuth, requireAdmin } = require('./auth');
const { responsiva, salidaAlmacen } = require('./pdf');

const r = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- subida de fotos de herramientas ---------- */
const EXT_IMG = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.jfif'];
const fotoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const limpio = path.basename(file.originalname).replace(/[^A-Za-z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${limpio}`);
    }
  }),
  fileFilter: (req, file, cb) => cb(null, EXT_IMG.includes(path.extname(file.originalname).toLowerCase())),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const sqlUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const zipUpload = multer({
  storage: multer.diskStorage({ destination: (req, f, cb) => cb(null, os.tmpdir()) }),
  limits: { fileSize: 600 * 1024 * 1024 }
});

/* ==================== AUTH ==================== */

r.post('/login', wrap(async (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) return res.status(400).json({ error: 'Faltan datos' });
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE usuario=? AND activo=1', [usuario.trim()]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].hash))) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const u = rows[0];
  setCookie(res, firmar(u));
  res.json({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol });
}));

r.post('/logout', (req, res) => { clearCookie(res); res.json({ ok: true }); });

r.get('/me', requireAuth, (req, res) => res.json(req.user));

r.post('/password', requireAuth, wrap(async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!nueva || nueva.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE id=?', [req.user.id]);
  if (!rows.length || !(await bcrypt.compare(actual || '', rows[0].hash))) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  await pool.query('UPDATE usuarios SET hash=? WHERE id=?', [await bcrypt.hash(nueva, 10), req.user.id]);
  res.json({ ok: true });
}));

/* todo lo que sigue requiere sesión */
r.use(requireAuth);

/* ==================== DASHBOARD ==================== */

r.get('/dashboard', wrap(async (req, res) => {
  const [[h]] = await pool.query('SELECT COUNT(*) t FROM herramientas');
  const [[e]] = await pool.query('SELECT COUNT(*) t FROM empleados WHERE activo=1');
  const [[a]] = await pool.query('SELECT COALESCE(SUM(cantidad),0) t FROM asignaciones WHERE activa=1');
  const [[d]] = await pool.query(`
    SELECT COUNT(*) t FROM herramientas h
    LEFT JOIN asignaciones x ON h.id_herramienta=x.herramienta_id AND x.activa=1
    WHERE x.id_asignacion IS NULL`);
  const [[s]] = await pool.query('SELECT COUNT(*) t FROM salidas_almacen');
  const [movs] = await pool.query(`
    SELECT a.id_asignacion, a.cantidad, a.activa, a.fecha_asignacion, a.fecha_fin,
           e.nombre empleado, h.nombre herramienta, h.imagen
    FROM asignaciones a
    JOIN empleados e ON a.empleado_id=e.id_empleado
    JOIN herramientas h ON a.herramienta_id=h.id_herramienta
    ORDER BY GREATEST(COALESCE(a.fecha_fin,'1970-01-01'), COALESCE(a.fecha_asignacion,'1970-01-01')) DESC
    LIMIT 8`);
  const [salidas] = await pool.query('SELECT id_salida, folio, nombre, created_at FROM salidas_almacen ORDER BY id_salida DESC LIMIT 5');
  res.json({ herramientas: h.t, empleados: e.t, asignadas: a.t, disponibles: d.t, salidas: s.t, movimientos: movs, ultimasSalidas: salidas });
}));

/* ==================== DEPARTAMENTOS / CATEGORÍAS ==================== */

r.get('/departamentos', wrap(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT d.*, COUNT(e.id_empleado) empleados
    FROM departamentos d
    LEFT JOIN empleados e ON e.departamento_id=d.id_departamento
    GROUP BY d.id_departamento ORDER BY d.nombre`);
  res.json(rows);
}));

r.post('/departamentos', wrap(async (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre' });
  const [dup] = await pool.query('SELECT 1 FROM departamentos WHERE nombre=?', [nombre]);
  if (dup.length) return res.status(409).json({ error: 'Ya existe ese departamento' });
  const [ins] = await pool.query('INSERT INTO departamentos(nombre) VALUES(?)', [nombre]);
  res.json({ id: ins.insertId });
}));

r.put('/departamentos/:id', wrap(async (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre' });
  await pool.query('UPDATE departamentos SET nombre=? WHERE id_departamento=?', [nombre, +req.params.id]);
  res.json({ ok: true });
}));

r.delete('/departamentos/:id', wrap(async (req, res) => {
  const [emp] = await pool.query('SELECT 1 FROM empleados WHERE departamento_id=? LIMIT 1', [+req.params.id]);
  if (emp.length) return res.status(409).json({ error: 'Tiene empleados asignados; muévelos primero' });
  await pool.query('DELETE FROM departamentos WHERE id_departamento=?', [+req.params.id]);
  res.json({ ok: true });
}));

r.get('/categorias', wrap(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT c.*, COUNT(h.id_herramienta) herramientas
    FROM categorias c
    LEFT JOIN herramientas h ON h.categoria_id=c.id_categoria
    GROUP BY c.id_categoria ORDER BY c.nombre`);
  res.json(rows);
}));

r.post('/categorias', wrap(async (req, res) => {
  const nombre = (req.body.nombre || '').trim().toLowerCase();
  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre' });
  const [dup] = await pool.query('SELECT 1 FROM categorias WHERE nombre=?', [nombre]);
  if (dup.length) return res.status(409).json({ error: 'Ya existe esa categoría' });
  const [ins] = await pool.query('INSERT INTO categorias(nombre) VALUES(?)', [nombre]);
  res.json({ id: ins.insertId });
}));

r.put('/categorias/:id', wrap(async (req, res) => {
  const nombre = (req.body.nombre || '').trim().toLowerCase();
  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre' });
  await pool.query('UPDATE categorias SET nombre=? WHERE id_categoria=?', [nombre, +req.params.id]);
  res.json({ ok: true });
}));

r.delete('/categorias/:id', wrap(async (req, res) => {
  const [h] = await pool.query('SELECT 1 FROM herramientas WHERE categoria_id=? LIMIT 1', [+req.params.id]);
  if (h.length) return res.status(409).json({ error: 'Tiene herramientas; cámbialas de categoría primero' });
  await pool.query('DELETE FROM categorias WHERE id_categoria=?', [+req.params.id]);
  res.json({ ok: true });
}));

/* ==================== EMPLEADOS ==================== */

r.get('/empleados', wrap(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT e.*, d.nombre departamento,
           COALESCE(SUM(CASE WHEN a.activa=1 THEN a.cantidad ELSE 0 END),0) herramientas
    FROM empleados e
    LEFT JOIN departamentos d ON e.departamento_id=d.id_departamento
    LEFT JOIN asignaciones a ON a.empleado_id=e.id_empleado
    GROUP BY e.id_empleado
    ORDER BY d.nombre, e.activo DESC, e.nombre`);
  res.json(rows);
}));

r.post('/empleados', wrap(async (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  const depto = +req.body.departamento_id || null;
  if (!nombre || !depto) return res.status(400).json({ error: 'Faltan nombre o departamento' });
  const [dup] = await pool.query('SELECT 1 FROM empleados WHERE nombre=? AND departamento_id=?', [nombre, depto]);
  if (dup.length) return res.status(409).json({ error: 'Ya existe ese empleado en ese departamento' });
  const [ins] = await pool.query('INSERT INTO empleados(nombre, departamento_id) VALUES(?,?)', [nombre, depto]);
  res.json({ id: ins.insertId });
}));

r.put('/empleados/:id', wrap(async (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  const depto = +req.body.departamento_id || null;
  if (!nombre || !depto) return res.status(400).json({ error: 'Faltan nombre o departamento' });
  await pool.query('UPDATE empleados SET nombre=?, departamento_id=? WHERE id_empleado=?', [nombre, depto, +req.params.id]);
  res.json({ ok: true });
}));

r.post('/empleados/:id/toggle', wrap(async (req, res) => {
  await pool.query('UPDATE empleados SET activo=IF(activo=1,0,1) WHERE id_empleado=?', [+req.params.id]);
  res.json({ ok: true });
}));

r.delete('/empleados/:id', wrap(async (req, res) => {
  const id = +req.params.id;
  const [act] = await pool.query('SELECT 1 FROM asignaciones WHERE empleado_id=? AND activa=1 LIMIT 1', [id]);
  if (act.length) return res.status(409).json({ error: 'Tiene herramientas asignadas; primero devuélvelas en "Ver herramientas"' });
  await pool.query('DELETE FROM asignaciones WHERE empleado_id=?', [id]);
  await pool.query('DELETE FROM empleados WHERE id_empleado=?', [id]);
  res.json({ ok: true });
}));

r.get('/empleados/:id', wrap(async (req, res) => {
  const id = +req.params.id;
  const [emp] = await pool.query(`
    SELECT e.*, d.nombre departamento FROM empleados e
    LEFT JOIN departamentos d ON e.departamento_id=d.id_departamento
    WHERE e.id_empleado=?`, [id]);
  if (!emp.length) return res.status(404).json({ error: 'Empleado no encontrado' });
  const [items] = await pool.query(`
    SELECT a.id_asignacion, a.cantidad, a.fecha_asignacion,
           h.id_herramienta, h.nombre, h.imagen, c.nombre categoria
    FROM asignaciones a
    JOIN herramientas h ON a.herramienta_id=h.id_herramienta
    LEFT JOIN categorias c ON h.categoria_id=c.id_categoria
    WHERE a.empleado_id=? AND a.activa=1
    ORDER BY a.fecha_asignacion DESC, h.nombre`, [id]);
  res.json({ ...emp[0], asignaciones: items });
}));

/* ==================== HERRAMIENTAS ==================== */

r.get('/herramientas', wrap(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT h.*, c.nombre categoria_nombre,
           COALESCE(SUM(CASE WHEN a.activa=1 THEN a.cantidad ELSE 0 END),0) asignadas
    FROM herramientas h
    LEFT JOIN categorias c ON h.categoria_id=c.id_categoria
    LEFT JOIN asignaciones a ON a.herramienta_id=h.id_herramienta
    GROUP BY h.id_herramienta
    ORDER BY h.nombre`);
  res.json(rows);
}));

r.post('/herramientas', fotoUpload.single('foto'), wrap(async (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre' });
  const categoria = +req.body.categoria_id || null;
  const estado = ['Bueno', 'Dañado', 'En reparación'].includes(req.body.estado) ? req.body.estado : 'Bueno';
  const img = req.file ? req.file.filename : '';
  const [ins] = await pool.query(
    'INSERT INTO herramientas(nombre, descripcion, imagen, estado, categoria_id) VALUES(?,?,?,?,?)',
    [nombre, (req.body.descripcion || '').trim(), img, estado, categoria]);
  res.json({ id: ins.insertId });
}));

r.put('/herramientas/:id', fotoUpload.single('foto'), wrap(async (req, res) => {
  const id = +req.params.id;
  const nombre = (req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre' });
  const categoria = +req.body.categoria_id || null;
  const estado = ['Bueno', 'Dañado', 'En reparación'].includes(req.body.estado) ? req.body.estado : 'Bueno';
  if (req.file) {
    await pool.query('UPDATE herramientas SET nombre=?, descripcion=?, estado=?, categoria_id=?, imagen=? WHERE id_herramienta=?',
      [nombre, (req.body.descripcion || '').trim(), estado, categoria, req.file.filename, id]);
  } else {
    await pool.query('UPDATE herramientas SET nombre=?, descripcion=?, estado=?, categoria_id=? WHERE id_herramienta=?',
      [nombre, (req.body.descripcion || '').trim(), estado, categoria, id]);
  }
  res.json({ ok: true });
}));

r.delete('/herramientas/:id', wrap(async (req, res) => {
  const id = +req.params.id;
  const [act] = await pool.query('SELECT 1 FROM asignaciones WHERE herramienta_id=? AND activa=1 LIMIT 1', [id]);
  if (act.length) return res.status(409).json({ error: 'Está asignada a alguien; retírala primero' });
  await pool.query('DELETE FROM asignaciones WHERE herramienta_id=?', [id]);
  await pool.query('DELETE FROM herramientas WHERE id_herramienta=?', [id]);
  res.json({ ok: true });
}));

/* ==================== ASIGNACIONES ==================== */

r.post('/asignaciones', wrap(async (req, res) => {
  const empleado = +req.body.empleado_id;
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!empleado || !items.length) return res.status(400).json({ error: 'Elige empleado y al menos una herramienta' });

  const lote = ahoraMx().fechaHora;

  for (const it of items) {
    const hid = +it.herramienta_id;
    const cant = Math.max(1, +it.cantidad || 1);
    if (!hid) continue;
    await pool.query(
      'INSERT INTO asignaciones(empleado_id, herramienta_id, fecha_asignacion, activa, cantidad) VALUES(?,?,?,1,?)',
      [empleado, hid, lote, cant]);
  }
  res.json({ ok: true, lote });
}));

r.post('/asignaciones/:id/retirar', wrap(async (req, res) => {
  await pool.query('UPDATE asignaciones SET activa=0, fecha_fin=? WHERE id_asignacion=?', [ahoraMx().fechaHora, +req.params.id]);
  res.json({ ok: true });
}));

/* ==================== RESPONSIVA PDF ==================== */

r.get('/responsiva/:empleadoId', wrap(async (req, res) => {
  const id = +req.params.empleadoId;
  const alcance = req.query.alcance === 'ultimas' ? 'ultimas' : 'todas';

  const [emp] = await pool.query(`
    SELECT e.nombre, d.nombre departamento FROM empleados e
    LEFT JOIN departamentos d ON e.departamento_id=d.id_departamento
    WHERE e.id_empleado=?`, [id]);
  if (!emp.length) return res.status(404).json({ error: 'Empleado no encontrado' });

  let filtro = '';
  let subtitulo = '';
  const params = [id];
  if (alcance === 'ultimas') {
    const [[ult]] = await pool.query(
      "SELECT DATE_FORMAT(MAX(fecha_asignacion),'%Y-%m-%d %H:%i:%s') f FROM asignaciones WHERE empleado_id=? AND activa=1", [id]);
    if (ult.f) {
      filtro = ' AND a.fecha_asignacion=? ';
      params.push(ult.f);
      const [fe, ho] = ult.f.split(' ');
      const [y, m, dd] = fe.split('-');
      subtitulo = `Última asignación: ${dd}/${m}/${y} ${ho.slice(0, 5)}`;
    }
  }

  // agrupar por NOMBRE (no por registro): la misma herramienta puede estar
  // dada de alta varias veces en el catálogo y saldría desglosada en la lista
  const [tools] = await pool.query(`
    SELECT h.nombre, MAX(c.nombre) categoria,
           SUM(COALESCE(a.cantidad,1)) cantidad,
           DATE_FORMAT(MAX(a.fecha_asignacion),'%d/%m/%Y') fecha
    FROM asignaciones a
    JOIN herramientas h ON a.herramienta_id=h.id_herramienta
    LEFT JOIN categorias c ON h.categoria_id=c.id_categoria
    WHERE a.empleado_id=? AND a.activa=1 ${filtro}
    GROUP BY h.nombre
    ORDER BY h.nombre`, params);

  responsiva(res, emp[0],
    tools.map(t => ({ nombre: t.nombre, categoria: t.categoria, cantidad: +t.cantidad, fecha: t.fecha })),
    subtitulo);
}));

/* ==================== SALIDAS DE ALMACÉN ==================== */

r.get('/salidas', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM salidas_almacen ORDER BY id_salida DESC');
  res.json(rows);
}));

r.post('/salidas', wrap(async (req, res) => {
  const folio = (req.body.folio || '').trim();
  const nombre = (req.body.nombre || '').trim();
  const observaciones = (req.body.observaciones || '').trim();
  const departamento = (req.body.departamento || '').trim();
  const trabajo = (req.body.trabajo || '').trim();
  // la fecha la elige el usuario (para capturar salidas de días anteriores)
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.body.fecha || '') ? req.body.fecha : ahoraMx().fecha;
  if (!folio || !nombre || !observaciones || !trabajo) return res.status(400).json({ error: 'Llena todos los campos' });
  const [dup] = await pool.query('SELECT 1 FROM salidas_almacen WHERE folio=?', [folio]);
  if (dup.length) return res.status(409).json({ error: `El folio "${folio}" ya existe — la salida NO se registró` });

  const [ins] = await pool.query(
    'INSERT INTO salidas_almacen(folio, nombre, observaciones, departamento, trabajo, fecha, hora, pdf) VALUES(?,?,?,?,?,?,?,?)',
    [folio, nombre, observaciones, departamento, trabajo, fecha, ahoraMx().hora,
      folio.replace(/[^A-Za-z0-9_-]/g, '_') + '.pdf']);
  res.json({ id: ins.insertId });
}));

r.delete('/salidas/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM salidas_almacen WHERE id_salida=?', [+req.params.id]);
  res.json({ ok: true });
}));

r.get('/salidas/:id/pdf', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM salidas_almacen WHERE id_salida=?', [+req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Salida no encontrada' });
  salidaAlmacen(res, rows[0]);
}));

/* ==================== USUARIOS (solo admin) ==================== */

r.get('/usuarios', requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, usuario, nombre, rol, activo, created_at FROM usuarios ORDER BY usuario');
  res.json(rows);
}));

r.post('/usuarios', requireAdmin, wrap(async (req, res) => {
  const usuario = (req.body.usuario || '').trim().toLowerCase();
  const nombre = (req.body.nombre || '').trim();
  const password = req.body.password || '';
  const rol = req.body.rol === 'admin' ? 'admin' : 'usuario';
  if (!usuario || password.length < 6) return res.status(400).json({ error: 'Usuario y contraseña de mínimo 6 caracteres' });
  const [dup] = await pool.query('SELECT 1 FROM usuarios WHERE usuario=?', [usuario]);
  if (dup.length) return res.status(409).json({ error: 'Ese usuario ya existe' });
  const [ins] = await pool.query('INSERT INTO usuarios(usuario, nombre, hash, rol) VALUES(?,?,?,?)',
    [usuario, nombre, await bcrypt.hash(password, 10), rol]);
  res.json({ id: ins.insertId });
}));

r.post('/usuarios/:id/toggle', requireAdmin, wrap(async (req, res) => {
  if (+req.params.id === req.user.id) return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });
  await pool.query('UPDATE usuarios SET activo=IF(activo=1,0,1) WHERE id=?', [+req.params.id]);
  res.json({ ok: true });
}));

r.post('/usuarios/:id/password', requireAdmin, wrap(async (req, res) => {
  const password = req.body.password || '';
  if (password.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' });
  await pool.query('UPDATE usuarios SET hash=? WHERE id=?', [await bcrypt.hash(password, 10), +req.params.id]);
  res.json({ ok: true });
}));

/* ==================== MIGRACIÓN (solo admin) ==================== */

r.get('/migracion/estado', requireAdmin, wrap(async (req, res) => {
  const conteo = {};
  for (const t of ['departamentos', 'empleados', 'categorias', 'herramientas', 'asignaciones', 'salidas_almacen']) {
    const [[c]] = await pool.query(`SELECT COUNT(*) t FROM ${t}`);
    conteo[t] = c.t;
  }
  let fotos = 0;
  try { fotos = fs.readdirSync(UPLOADS_DIR).filter(f => EXT_IMG.includes(path.extname(f).toLowerCase())).length; } catch {}
  res.json({ ...conteo, fotos });
}));

r.post('/migracion/sql', requireAdmin, sqlUpload.single('archivo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sube el archivo base_de_datos.sql' });
  let sql = req.file.buffer.toString('utf8');

  // quitar líneas que no aplican en la base en línea (nombre de base distinto)
  sql = sql.split('\n').filter(l => {
    const t = l.trim().toUpperCase();
    return !t.startsWith('CREATE DATABASE') && !t.startsWith('USE ') && !l.trim().startsWith('/*M!999999');
  }).join('\n');

  if (!/CREATE TABLE|INSERT INTO/i.test(sql)) {
    return res.status(400).json({ error: 'Ese archivo no parece un respaldo de la base de datos' });
  }

  // los exports de phpMyAdmin no traen DROP TABLE: agregarlo para poder
  // reimportar sobre las tablas ya existentes (la de usuarios nunca se toca)
  sql = sql.replace(/^CREATE TABLE (?:IF NOT EXISTS )?`?([A-Za-z0-9_]+)`?/gim, (m, tabla) =>
    tabla.toLowerCase() === 'usuarios'
      ? m
      : 'DROP TABLE IF EXISTS `' + tabla + '`;\nCREATE TABLE `' + tabla + '`');

  const cfg = pool.pool.config.connectionConfig;
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password,
    database: cfg.database, multipleStatements: true, charset: 'utf8mb4_general_ci'
  });
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }

  // el respaldo recrea salidas_almacen con el esquema viejo: reponer columnas nuevas
  await asegurarColumnas();

  const conteo = {};
  for (const t of ['departamentos', 'empleados', 'categorias', 'herramientas', 'asignaciones', 'salidas_almacen']) {
    const [[c]] = await pool.query(`SELECT COUNT(*) t FROM ${t}`);
    conteo[t] = c.t;
  }
  res.json({ ok: true, conteo });
}));

r.post('/migracion/fotos', requireAdmin, zipUpload.single('archivo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sube el ZIP con las fotos' });
  let copiadas = 0, ignoradas = 0;
  try {
    const zip = await unzipper.Open.file(req.file.path);
    for (const entry of zip.files) {
      if (entry.type !== 'File') continue;
      const nombre = path.basename(entry.path);
      if (!EXT_IMG.includes(path.extname(nombre).toLowerCase())) { ignoradas++; continue; }
      const destino = path.join(UPLOADS_DIR, nombre);
      await new Promise((ok, bad) =>
        entry.stream().pipe(fs.createWriteStream(destino)).on('finish', ok).on('error', bad));
      copiadas++;
    }
  } finally {
    fs.unlink(req.file.path, () => {});
  }
  res.json({ ok: true, copiadas, ignoradas });
}));

module.exports = r;
