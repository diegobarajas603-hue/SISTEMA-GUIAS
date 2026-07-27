'use strict';
// Servicios realizados: fletes programados, en transito, entregados,
// facturados y pagados. Se crean al convertir una cotizacion o manualmente.

const express = require('express');
const { get, all, run, siguienteFolio, registrarActividad } = require('./db');
const { autenticar, esAdminOGerente, requerirRol } = require('./auth');
const { ahora, limpiarTexto, num, redondear2, dinero, fechaCorta, fechaLocal } = require('./util');

const ESTATUS = ['programado', 'en_transito', 'entregado', 'facturado', 'pagado', 'cancelado'];

const rutasServicios = express.Router();
rutasServicios.use(autenticar);

function puedeEditarSrv(usuario, servicio) {
  return esAdminOGerente(usuario) || servicio.vendedor_id === usuario.id;
}

rutasServicios.get('/', (req, res) => {
  const condiciones = [];
  const params = [];
  if (req.query.estatus && ESTATUS.includes(req.query.estatus)) {
    condiciones.push('s.estatus = ?');
    params.push(req.query.estatus);
  }
  if (req.query.activos === '1') condiciones.push("s.estatus IN ('programado','en_transito')");
  if (req.query.empresa_id) {
    condiciones.push('s.empresa_id = ?');
    params.push(Number(req.query.empresa_id));
  }
  if (req.query.vendedor_id) {
    condiciones.push('s.vendedor_id = ?');
    params.push(Number(req.query.vendedor_id));
  }
  if (req.query.mes && /^\d{4}-\d{2}$/.test(req.query.mes)) {
    condiciones.push("substr(COALESCE(s.fecha_carga, s.creado_en), 1, 7) = ?");
    params.push(req.query.mes);
  }
  const buscar = limpiarTexto(req.query.buscar, 100);
  if (buscar) {
    condiciones.push('(s.folio LIKE ? OR e.nombre LIKE ? OR s.origen LIKE ? OR s.destino LIKE ? OR s.operador LIKE ?)');
    const like = `%${buscar}%`;
    params.push(like, like, like, like, like);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  res.json(all(
    `SELECT s.*, e.nombre AS empresa_nombre, v.nombre AS vendedor_nombre, q.folio AS cotizacion_folio
       FROM servicios s
       JOIN empresas e ON e.id = s.empresa_id
       LEFT JOIN usuarios v ON v.id = s.vendedor_id
       LEFT JOIN cotizaciones q ON q.id = s.cotizacion_id
       ${where}
      ORDER BY COALESCE(s.fecha_carga, substr(s.creado_en, 1, 10)) DESC, s.id DESC
      LIMIT 500`,
    ...params
  ));
});

rutasServicios.post('/', (req, res) => {
  const empresaId = Number(req.body.empresa_id);
  if (!get('SELECT id FROM empresas WHERE id = ?', empresaId)) {
    return res.status(400).json({ error: 'Elige el cliente del servicio.' });
  }
  const origen = limpiarTexto(req.body.origen, 120);
  const destino = limpiarTexto(req.body.destino, 120);
  if (!origen || !destino) return res.status(400).json({ error: 'Origen y destino son obligatorios.' });

  const folio = siguienteFolio('SRV');
  const fecha = ahora();
  const vendedorId = (esAdminOGerente(req.usuario) && req.body.vendedor_id) ? Number(req.body.vendedor_id) : req.usuario.id;
  const info = run(
    `INSERT INTO servicios (folio, cotizacion_id, empresa_id, vendedor_id, origen, destino, unidad_texto, operador,
                            mercancia, peso_kg, fecha_carga, fecha_entrega, monto, moneda, estatus, factura, notas, creado_en, actualizado_en)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    folio, empresaId, vendedorId, origen, destino,
    limpiarTexto(req.body.unidad_texto, 120), limpiarTexto(req.body.operador, 120),
    limpiarTexto(req.body.mercancia, 300), num(req.body.peso_kg),
    limpiarTexto(req.body.fecha_carga, 10) || fechaLocal(), limpiarTexto(req.body.fecha_entrega, 10) || null,
    redondear2(num(req.body.monto)), req.body.moneda === 'USD' ? 'USD' : 'MXN',
    ESTATUS.includes(req.body.estatus) ? req.body.estatus : 'programado',
    limpiarTexto(req.body.factura, 60), limpiarTexto(req.body.notas, 2000), fecha, fecha
  );
  const id = Number(info.lastInsertRowid);
  registrarActividad({
    empresa_id: empresaId, servicio_id: id, usuario_id: req.usuario.id, tipo: 'sistema',
    titulo: `Servicio ${folio} registrado`,
    descripcion: `${origen} → ${destino} · Venta ${dinero(num(req.body.monto))} + IVA.`,
  });
  run('UPDATE empresas SET actualizado_en = ? WHERE id = ?', ahora(), empresaId);
  res.status(201).json(get(
    `SELECT s.*, e.nombre AS empresa_nombre FROM servicios s JOIN empresas e ON e.id = s.empresa_id WHERE s.id = ?`, id
  ));
});

rutasServicios.get('/:id', (req, res) => {
  const servicio = get(
    `SELECT s.*, e.nombre AS empresa_nombre, v.nombre AS vendedor_nombre, q.folio AS cotizacion_folio
       FROM servicios s
       JOIN empresas e ON e.id = s.empresa_id
       LEFT JOIN usuarios v ON v.id = s.vendedor_id
       LEFT JOIN cotizaciones q ON q.id = s.cotizacion_id
      WHERE s.id = ?`, Number(req.params.id)
  );
  if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado.' });
  res.json(servicio);
});

rutasServicios.put('/:id', (req, res) => {
  const servicio = get('SELECT * FROM servicios WHERE id = ?', Number(req.params.id));
  if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado.' });
  if (!puedeEditarSrv(req.usuario, servicio)) return res.status(403).json({ error: 'Este servicio es de otro vendedor.' });

  run(
    `UPDATE servicios SET origen = ?, destino = ?, unidad_texto = ?, operador = ?, mercancia = ?, peso_kg = ?,
            fecha_carga = ?, fecha_entrega = ?, monto = ?, moneda = ?, factura = ?, notas = ?, actualizado_en = ?
      WHERE id = ?`,
    limpiarTexto(req.body.origen, 120) || servicio.origen,
    limpiarTexto(req.body.destino, 120) || servicio.destino,
    req.body.unidad_texto === undefined ? servicio.unidad_texto : limpiarTexto(req.body.unidad_texto, 120),
    req.body.operador === undefined ? servicio.operador : limpiarTexto(req.body.operador, 120),
    req.body.mercancia === undefined ? servicio.mercancia : limpiarTexto(req.body.mercancia, 300),
    req.body.peso_kg === undefined ? servicio.peso_kg : num(req.body.peso_kg),
    req.body.fecha_carga === undefined ? servicio.fecha_carga : (limpiarTexto(req.body.fecha_carga, 10) || null),
    req.body.fecha_entrega === undefined ? servicio.fecha_entrega : (limpiarTexto(req.body.fecha_entrega, 10) || null),
    req.body.monto === undefined ? servicio.monto : redondear2(num(req.body.monto)),
    req.body.moneda === 'USD' ? 'USD' : (req.body.moneda === 'MXN' ? 'MXN' : servicio.moneda),
    req.body.factura === undefined ? servicio.factura : limpiarTexto(req.body.factura, 60),
    req.body.notas === undefined ? servicio.notas : limpiarTexto(req.body.notas, 2000),
    ahora(), servicio.id
  );
  res.json(get(
    `SELECT s.*, e.nombre AS empresa_nombre FROM servicios s JOIN empresas e ON e.id = s.empresa_id WHERE s.id = ?`, servicio.id
  ));
});

rutasServicios.put('/:id/estatus', (req, res) => {
  const servicio = get('SELECT * FROM servicios WHERE id = ?', Number(req.params.id));
  if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado.' });
  if (!puedeEditarSrv(req.usuario, servicio)) return res.status(403).json({ error: 'Este servicio es de otro vendedor.' });
  const nuevo = req.body.estatus;
  if (!ESTATUS.includes(nuevo)) return res.status(400).json({ error: 'Estatus invalido.' });
  if (nuevo === servicio.estatus) return res.json(servicio);

  const cambios = { fecha_entrega: servicio.fecha_entrega };
  if (nuevo === 'entregado' && !servicio.fecha_entrega) cambios.fecha_entrega = fechaLocal();
  run(
    'UPDATE servicios SET estatus = ?, fecha_entrega = ?, actualizado_en = ? WHERE id = ?',
    nuevo, cambios.fecha_entrega, ahora(), servicio.id
  );
  const etiquetas = {
    programado: 'programado', en_transito: 'en transito', entregado: 'entregado',
    facturado: 'facturado', pagado: 'pagado', cancelado: 'cancelado',
  };
  registrarActividad({
    empresa_id: servicio.empresa_id, servicio_id: servicio.id, usuario_id: req.usuario.id, tipo: 'cambio',
    titulo: `Servicio ${servicio.folio} ${etiquetas[nuevo]}`,
    descripcion: limpiarTexto(req.body.nota, 500) ||
      (nuevo === 'entregado' ? `Entregado el ${fechaCorta(cambios.fecha_entrega)}.` : ''),
  });
  res.json(get('SELECT * FROM servicios WHERE id = ?', servicio.id));
});

rutasServicios.delete('/:id', requerirRol('admin'), (req, res) => {
  const servicio = get('SELECT * FROM servicios WHERE id = ?', Number(req.params.id));
  if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado.' });
  run('UPDATE actividades SET servicio_id = NULL WHERE servicio_id = ?', servicio.id);
  run('DELETE FROM servicios WHERE id = ?', servicio.id);
  res.json({ ok: true });
});

module.exports = { rutasServicios };
