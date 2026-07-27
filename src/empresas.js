'use strict';
// Prospectos, clientes, contactos, pipeline de etapas e historial de
// actividades (llamadas, mensajes, reuniones, notas, cambios y seguimientos).

const express = require('express');
const { get, all, run, registrarActividad } = require('./db');
const { autenticar, requerirRol, esAdminOGerente } = require('./auth');
const { ahora, limpiarTexto, num } = require('./util');

const ETAPAS = ['nuevo', 'contactado', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido'];
const TIPOS_ACTIVIDAD_MANUAL = ['llamada', 'whatsapp', 'correo', 'reunion', 'visita', 'nota'];

function puedeEditarEmpresa(usuario, empresa) {
  if (esAdminOGerente(usuario)) return true;
  return !empresa.vendedor_id || empresa.vendedor_id === usuario.id;
}

// ---------- Empresas (prospectos y clientes) ----------

const rutasEmpresas = express.Router();
rutasEmpresas.use(autenticar);

rutasEmpresas.get('/', (req, res) => {
  const condiciones = [];
  const params = [];
  if (req.query.tipo === 'prospecto' || req.query.tipo === 'cliente') {
    condiciones.push('e.tipo = ?');
    params.push(req.query.tipo);
  }
  if (req.query.etapa && ETAPAS.includes(req.query.etapa)) {
    condiciones.push('e.etapa = ?');
    params.push(req.query.etapa);
  }
  if (req.query.vendedor_id) {
    condiciones.push('e.vendedor_id = ?');
    params.push(Number(req.query.vendedor_id));
  }
  const buscar = limpiarTexto(req.query.buscar, 100);
  if (buscar) {
    condiciones.push('(e.nombre LIKE ? OR e.rfc LIKE ? OR e.telefono LIKE ? OR e.email LIKE ? OR e.ciudad LIKE ?)');
    const like = `%${buscar}%`;
    params.push(like, like, like, like, like);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = all(
    `SELECT e.*, u.nombre AS vendedor_nombre,
            (SELECT c.nombre FROM contactos c WHERE c.empresa_id = e.id ORDER BY c.principal DESC, c.id LIMIT 1) AS contacto_nombre,
            (SELECT COUNT(*) FROM cotizaciones q WHERE q.empresa_id = e.id AND q.estatus IN ('borrador','enviada')) AS cot_abiertas,
            (SELECT COALESCE(SUM(q.total), 0) FROM cotizaciones q WHERE q.empresa_id = e.id AND q.estatus IN ('borrador','enviada')) AS cot_abiertas_monto,
            (SELECT MAX(a.fecha) FROM actividades a WHERE a.empresa_id = e.id) AS ultima_actividad
       FROM empresas e
       LEFT JOIN usuarios u ON u.id = e.vendedor_id
       ${where}
      ORDER BY e.actualizado_en DESC
      LIMIT 500`,
    ...params
  );
  res.json(filas);
});

rutasEmpresas.post('/', (req, res) => {
  const nombre = limpiarTexto(req.body.nombre, 200);
  if (!nombre) return res.status(400).json({ error: 'El nombre de la empresa o persona es obligatorio.' });
  const tipo = req.body.tipo === 'cliente' ? 'cliente' : 'prospecto';
  const etapa = ETAPAS.includes(req.body.etapa) ? req.body.etapa : (tipo === 'cliente' ? 'ganado' : 'nuevo');
  let vendedorId = req.body.vendedor_id ? Number(req.body.vendedor_id) : null;
  if (req.usuario.rol === 'vendedor') vendedorId = req.usuario.id;
  if (!vendedorId) vendedorId = req.usuario.id;

  const fecha = ahora();
  const info = run(
    `INSERT INTO empresas (tipo, nombre, rfc, giro, origen_lead, telefono, email, direccion, ciudad, estado_dir,
                           etapa, vendedor_id, notas, creado_en, actualizado_en, convertido_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tipo, nombre,
    limpiarTexto(req.body.rfc, 20).toUpperCase(), limpiarTexto(req.body.giro, 100), limpiarTexto(req.body.origen_lead, 100),
    limpiarTexto(req.body.telefono, 30), limpiarTexto(req.body.email, 120), limpiarTexto(req.body.direccion, 300),
    limpiarTexto(req.body.ciudad, 100), limpiarTexto(req.body.estado_dir, 100),
    etapa, vendedorId, limpiarTexto(req.body.notas, 2000),
    fecha, fecha, tipo === 'cliente' ? fecha : null
  );
  const id = Number(info.lastInsertRowid);
  registrarActividad({
    empresa_id: id, usuario_id: req.usuario.id, tipo: 'sistema',
    titulo: tipo === 'cliente' ? 'Alta de cliente' : 'Alta de prospecto',
    descripcion: `Registrado por ${req.usuario.nombre}.`,
  });

  // Contacto inicial opcional en la misma alta rapida
  const contactoNombre = limpiarTexto(req.body.contacto_nombre, 120);
  if (contactoNombre) {
    run(
      `INSERT INTO contactos (empresa_id, nombre, puesto, email, telefono, whatsapp, principal, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      id, contactoNombre, limpiarTexto(req.body.contacto_puesto, 100),
      limpiarTexto(req.body.contacto_email, 120), limpiarTexto(req.body.contacto_telefono, 30),
      limpiarTexto(req.body.contacto_whatsapp || req.body.contacto_telefono, 30), ahora()
    );
  }
  res.status(201).json(get('SELECT * FROM empresas WHERE id = ?', id));
});

rutasEmpresas.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const empresa = get(
    `SELECT e.*, u.nombre AS vendedor_nombre FROM empresas e LEFT JOIN usuarios u ON u.id = e.vendedor_id WHERE e.id = ?`, id
  );
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada.' });

  const contactos = all('SELECT * FROM contactos WHERE empresa_id = ? ORDER BY principal DESC, nombre', id);
  const actividades = all(
    `SELECT a.*, u.nombre AS usuario_nombre, q.folio AS cotizacion_folio, s.folio AS servicio_folio
       FROM actividades a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN cotizaciones q ON q.id = a.cotizacion_id
       LEFT JOIN servicios s ON s.id = a.servicio_id
      WHERE a.empresa_id = ?
      ORDER BY a.fecha DESC LIMIT 200`, id
  );
  const tareas = all(
    `SELECT t.*, u.nombre AS asignado_nombre FROM tareas t
       LEFT JOIN usuarios u ON u.id = t.asignado_a
      WHERE t.empresa_id = ?
      ORDER BY t.estatus, COALESCE(t.vence_en, '9999') LIMIT 100`, id
  );
  const cotizaciones = all(
    `SELECT q.id, q.folio, q.origen, q.destino, q.unidad_texto, q.total, q.moneda, q.estatus, q.vigente_hasta, q.creado_en,
            u.nombre AS vendedor_nombre
       FROM cotizaciones q LEFT JOIN usuarios u ON u.id = q.vendedor_id
      WHERE q.empresa_id = ? ORDER BY q.id DESC LIMIT 100`, id
  );
  const servicios = all(
    `SELECT s.id, s.folio, s.origen, s.destino, s.unidad_texto, s.monto, s.moneda, s.estatus, s.fecha_carga, s.creado_en
       FROM servicios s WHERE s.empresa_id = ? ORDER BY s.id DESC LIMIT 100`, id
  );
  res.json({ ...empresa, contactos, actividades, tareas, cotizaciones, servicios });
});

rutasEmpresas.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const empresa = get('SELECT * FROM empresas WHERE id = ?', id);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada.' });
  if (!puedeEditarEmpresa(req.usuario, empresa)) {
    return res.status(403).json({ error: 'Esta empresa esta asignada a otro vendedor.' });
  }

  const campos = ['nombre', 'rfc', 'giro', 'origen_lead', 'telefono', 'email', 'direccion', 'ciudad', 'estado_dir', 'notas'];
  const nuevos = { ...empresa };
  const cambios = [];
  for (const campo of campos) {
    if (req.body[campo] === undefined) continue;
    let valor = limpiarTexto(req.body[campo], campo === 'notas' ? 2000 : (campo === 'direccion' ? 300 : 200));
    if (campo === 'rfc') valor = valor.toUpperCase();
    if (valor !== String(empresa[campo] || '')) {
      cambios.push(campo.replace('_dir', '').replace('origen_lead', 'origen del prospecto'));
      nuevos[campo] = valor;
    }
  }
  if (req.body.tipo && (req.body.tipo === 'cliente' || req.body.tipo === 'prospecto') && req.body.tipo !== empresa.tipo) {
    nuevos.tipo = req.body.tipo;
    nuevos.convertido_en = req.body.tipo === 'cliente' ? ahora() : null;
    cambios.push(`tipo (${empresa.tipo} → ${req.body.tipo})`);
  }
  if (req.body.vendedor_id !== undefined) {
    const nuevoVendedor = req.body.vendedor_id ? Number(req.body.vendedor_id) : null;
    if (nuevoVendedor !== empresa.vendedor_id) {
      if (!esAdminOGerente(req.usuario) && nuevoVendedor !== req.usuario.id) {
        return res.status(403).json({ error: 'Solo un gerente o administrador puede reasignar a otro vendedor.' });
      }
      const nombreVendedor = nuevoVendedor ? (get('SELECT nombre FROM usuarios WHERE id = ?', nuevoVendedor) || {}).nombre : 'sin asignar';
      nuevos.vendedor_id = nuevoVendedor;
      cambios.push(`vendedor (${nombreVendedor})`);
    }
  }

  run(
    `UPDATE empresas SET tipo = ?, nombre = ?, rfc = ?, giro = ?, origen_lead = ?, telefono = ?, email = ?,
            direccion = ?, ciudad = ?, estado_dir = ?, vendedor_id = ?, notas = ?, convertido_en = ?, actualizado_en = ?
      WHERE id = ?`,
    nuevos.tipo, nuevos.nombre, nuevos.rfc, nuevos.giro, nuevos.origen_lead, nuevos.telefono, nuevos.email,
    nuevos.direccion, nuevos.ciudad, nuevos.estado_dir, nuevos.vendedor_id, nuevos.notas, nuevos.convertido_en, ahora(), id
  );
  if (cambios.length) {
    registrarActividad({
      empresa_id: id, usuario_id: req.usuario.id, tipo: 'cambio',
      titulo: 'Datos actualizados', descripcion: `Campos: ${cambios.join(', ')}.`,
    });
  }
  res.json(get('SELECT e.*, u.nombre AS vendedor_nombre FROM empresas e LEFT JOIN usuarios u ON u.id = e.vendedor_id WHERE e.id = ?', id));
});

rutasEmpresas.put('/:id/etapa', (req, res) => {
  const id = Number(req.params.id);
  const empresa = get('SELECT * FROM empresas WHERE id = ?', id);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada.' });
  if (!puedeEditarEmpresa(req.usuario, empresa)) {
    return res.status(403).json({ error: 'Esta empresa esta asignada a otro vendedor.' });
  }
  const etapa = req.body.etapa;
  if (!ETAPAS.includes(etapa)) return res.status(400).json({ error: 'Etapa invalida.' });
  if (etapa === empresa.etapa) return res.json(empresa);

  let { tipo, convertido_en } = empresa;
  if (etapa === 'ganado' && empresa.tipo === 'prospecto') {
    tipo = 'cliente';
    convertido_en = ahora();
  }
  const motivo = etapa === 'perdido' ? limpiarTexto(req.body.motivo, 300) : '';
  run(
    'UPDATE empresas SET etapa = ?, tipo = ?, convertido_en = ?, motivo_perdida = ?, actualizado_en = ? WHERE id = ?',
    etapa, tipo, convertido_en, motivo, ahora(), id
  );
  registrarActividad({
    empresa_id: id, usuario_id: req.usuario.id, tipo: 'cambio',
    titulo: `Etapa: ${empresa.etapa} → ${etapa}`,
    descripcion: motivo ? `Motivo: ${motivo}` : (tipo !== empresa.tipo ? 'El prospecto se convirtio en cliente.' : ''),
  });
  res.json(get('SELECT * FROM empresas WHERE id = ?', id));
});

rutasEmpresas.delete('/:id', requerirRol('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!get('SELECT id FROM empresas WHERE id = ?', id)) return res.status(404).json({ error: 'Empresa no encontrada.' });
  try {
    run('DELETE FROM empresas WHERE id = ?', id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'No se puede eliminar: tiene cotizaciones o servicios ligados. Marcala como perdida o desactivala.' });
  }
});

// ---------- Contactos ----------

rutasEmpresas.post('/:id/contactos', (req, res) => {
  const empresaId = Number(req.params.id);
  const empresa = get('SELECT * FROM empresas WHERE id = ?', empresaId);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada.' });
  const nombre = limpiarTexto(req.body.nombre, 120);
  if (!nombre) return res.status(400).json({ error: 'El nombre del contacto es obligatorio.' });

  const principal = req.body.principal ? 1 : 0;
  if (principal) run('UPDATE contactos SET principal = 0 WHERE empresa_id = ?', empresaId);
  const info = run(
    `INSERT INTO contactos (empresa_id, nombre, puesto, email, telefono, whatsapp, principal, notas, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    empresaId, nombre, limpiarTexto(req.body.puesto, 100), limpiarTexto(req.body.email, 120),
    limpiarTexto(req.body.telefono, 30), limpiarTexto(req.body.whatsapp, 30), principal,
    limpiarTexto(req.body.notas, 500), ahora()
  );
  run('UPDATE empresas SET actualizado_en = ? WHERE id = ?', ahora(), empresaId);
  res.status(201).json(get('SELECT * FROM contactos WHERE id = ?', info.lastInsertRowid));
});

// ---------- Actividades manuales (historial de seguimiento) ----------

rutasEmpresas.post('/:id/actividades', (req, res) => {
  const empresaId = Number(req.params.id);
  if (!get('SELECT id FROM empresas WHERE id = ?', empresaId)) return res.status(404).json({ error: 'Empresa no encontrada.' });
  const tipo = req.body.tipo;
  if (!TIPOS_ACTIVIDAD_MANUAL.includes(tipo)) return res.status(400).json({ error: 'Tipo de actividad invalido.' });
  const titulos = {
    llamada: 'Llamada', whatsapp: 'Mensaje de WhatsApp', correo: 'Correo',
    reunion: 'Reunion', visita: 'Visita', nota: 'Nota',
  };
  const descripcion = limpiarTexto(req.body.descripcion, 2000);
  if (!descripcion) return res.status(400).json({ error: 'Describe brevemente la actividad.' });
  registrarActividad({
    empresa_id: empresaId,
    cotizacion_id: req.body.cotizacion_id ? Number(req.body.cotizacion_id) : null,
    usuario_id: req.usuario.id,
    tipo,
    titulo: limpiarTexto(req.body.titulo, 150) || titulos[tipo],
    descripcion,
  });
  run('UPDATE empresas SET actualizado_en = ? WHERE id = ?', ahora(), empresaId);
  const ultima = get('SELECT a.*, u.nombre AS usuario_nombre FROM actividades a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE a.empresa_id = ? ORDER BY a.id DESC LIMIT 1', empresaId);
  res.status(201).json(ultima);
});

// Router aparte para editar/eliminar contactos por id directo
const rutasContactos = express.Router();
rutasContactos.use(autenticar);

rutasContactos.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const contacto = get('SELECT * FROM contactos WHERE id = ?', id);
  if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado.' });
  const principal = req.body.principal === undefined ? contacto.principal : (req.body.principal ? 1 : 0);
  if (principal && !contacto.principal) run('UPDATE contactos SET principal = 0 WHERE empresa_id = ?', contacto.empresa_id);
  run(
    'UPDATE contactos SET nombre = ?, puesto = ?, email = ?, telefono = ?, whatsapp = ?, principal = ?, notas = ? WHERE id = ?',
    limpiarTexto(req.body.nombre, 120) || contacto.nombre,
    req.body.puesto === undefined ? contacto.puesto : limpiarTexto(req.body.puesto, 100),
    req.body.email === undefined ? contacto.email : limpiarTexto(req.body.email, 120),
    req.body.telefono === undefined ? contacto.telefono : limpiarTexto(req.body.telefono, 30),
    req.body.whatsapp === undefined ? contacto.whatsapp : limpiarTexto(req.body.whatsapp, 30),
    principal,
    req.body.notas === undefined ? contacto.notas : limpiarTexto(req.body.notas, 500),
    id
  );
  res.json(get('SELECT * FROM contactos WHERE id = ?', id));
});

rutasContactos.delete('/:id', (req, res) => {
  const contacto = get('SELECT * FROM contactos WHERE id = ?', Number(req.params.id));
  if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado.' });
  run('DELETE FROM contactos WHERE id = ?', contacto.id);
  res.json({ ok: true });
});

// Bitacora general reciente (para el panel operativo)
const rutasActividades = express.Router();
rutasActividades.use(autenticar);

rutasActividades.get('/', (req, res) => {
  const limite = Math.min(num(req.query.limite, 30), 100);
  const filas = all(
    `SELECT a.*, u.nombre AS usuario_nombre, e.nombre AS empresa_nombre,
            q.folio AS cotizacion_folio, s.folio AS servicio_folio
       FROM actividades a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN empresas e ON e.id = a.empresa_id
       LEFT JOIN cotizaciones q ON q.id = a.cotizacion_id
       LEFT JOIN servicios s ON s.id = a.servicio_id
      ORDER BY a.id DESC LIMIT ?`, limite
  );
  res.json(filas);
});

module.exports = { rutasEmpresas, rutasContactos, rutasActividades, ETAPAS, puedeEditarEmpresa };
