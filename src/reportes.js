'use strict';
// Reportes comerciales calculados con la informacion real de la base:
// panel operativo (resumen) y reporte comercial por rango de fechas.

const express = require('express');
const { get, all, run } = require('./db');
const { autenticar } = require('./auth');
const { fechaLocal, mesLocal, sumarDias, limpiarTexto, num, redondear2 } = require('./util');

const rutasReportes = express.Router();
rutasReportes.use(autenticar);

const aLocal = (iso) => (iso ? fechaLocal(new Date(iso)) : '');
const esYmd = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// ---------- Panel operativo ----------

rutasReportes.get('/resumen', (req, res) => {
  const hoy = fechaLocal();
  const mes = mesLocal();

  run("UPDATE cotizaciones SET estatus = 'vencida' WHERE estatus = 'enviada' AND vigente_hasta < ?", hoy);

  const prospectosActivos = get(
    "SELECT COUNT(*) AS n FROM empresas WHERE tipo = 'prospecto' AND etapa NOT IN ('perdido')"
  ).n;
  const clientes = get("SELECT COUNT(*) AS n FROM empresas WHERE tipo = 'cliente'").n;
  const cotAbiertas = get(
    "SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS monto FROM cotizaciones WHERE estatus IN ('borrador','enviada')"
  );

  // Ganadas del mes (aceptadas o convertidas, por fecha de resolucion)
  const resueltas = all(
    "SELECT total, resuelta_en FROM cotizaciones WHERE estatus IN ('aceptada','convertida') AND resuelta_en IS NOT NULL"
  );
  let ganadasMesN = 0;
  let ganadasMesMonto = 0;
  for (const fila of resueltas) {
    if (aLocal(fila.resuelta_en).slice(0, 7) === mes) {
      ganadasMesN += 1;
      ganadasMesMonto += fila.total;
    }
  }

  // Venta del mes: servicios no cancelados con fecha de carga en el mes
  const serviciosTodos = all(
    "SELECT monto, estatus, fecha_carga, creado_en FROM servicios WHERE estatus != 'cancelado'"
  );
  let ventaMes = 0;
  let ventaMesN = 0;
  for (const s of serviciosTodos) {
    const fecha = s.fecha_carga || aLocal(s.creado_en);
    if (String(fecha).slice(0, 7) === mes) {
      ventaMes += s.monto;
      ventaMesN += 1;
    }
  }

  const serviciosActivos = get(
    "SELECT COUNT(*) AS n FROM servicios WHERE estatus IN ('programado','en_transito')"
  ).n;

  const misTareas = all(
    `SELECT t.*, e.nombre AS empresa_nombre FROM tareas t
      LEFT JOIN empresas e ON e.id = t.empresa_id
     WHERE t.asignado_a = ? AND t.estatus = 'pendiente'
     ORDER BY COALESCE(t.vence_en, '9999-12-31') LIMIT 10`, req.usuario.id
  );
  let tareasVencidas = 0;
  let tareasHoy = 0;
  for (const t of misTareas) {
    const dia = String(t.vence_en || '').slice(0, 10);
    if (!dia) continue;
    if (dia < hoy) tareasVencidas += 1;
    else if (dia === hoy) tareasHoy += 1;
  }

  const porVencer = all(
    `SELECT q.id, q.folio, q.total, q.moneda, q.vigente_hasta, e.nombre AS empresa_nombre
       FROM cotizaciones q JOIN empresas e ON e.id = q.empresa_id
      WHERE q.estatus = 'enviada' AND q.vigente_hasta <= ?
      ORDER BY q.vigente_hasta LIMIT 6`, sumarDias(hoy, 3)
  );

  const proximosServicios = all(
    `SELECT s.id, s.folio, s.origen, s.destino, s.fecha_carga, s.estatus, e.nombre AS empresa_nombre
       FROM servicios s JOIN empresas e ON e.id = s.empresa_id
      WHERE s.estatus IN ('programado','en_transito')
      ORDER BY COALESCE(s.fecha_carga, '9999-12-31') LIMIT 6`
  );

  const pipeline = all(
    `SELECT etapa, COUNT(*) AS n FROM empresas WHERE tipo = 'prospecto' AND etapa NOT IN ('ganado','perdido') GROUP BY etapa`
  );

  const actividad = all(
    `SELECT a.tipo, a.titulo, a.descripcion, a.fecha, u.nombre AS usuario_nombre, e.nombre AS empresa_nombre, a.empresa_id
       FROM actividades a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN empresas e ON e.id = a.empresa_id
      ORDER BY a.id DESC LIMIT 12`
  );

  res.json({
    hoy,
    kpis: {
      prospectos_activos: prospectosActivos,
      clientes,
      cot_abiertas: cotAbiertas.n,
      cot_abiertas_monto: redondear2(cotAbiertas.monto),
      ganadas_mes: ganadasMesN,
      ganadas_mes_monto: redondear2(ganadasMesMonto),
      venta_mes: redondear2(ventaMes),
      venta_mes_n: ventaMesN,
      servicios_activos: serviciosActivos,
      tareas_vencidas: tareasVencidas,
      tareas_hoy: tareasHoy,
    },
    mis_tareas: misTareas,
    por_vencer: porVencer,
    proximos_servicios: proximosServicios,
    pipeline,
    actividad,
  });
});

// ---------- Reporte comercial por rango ----------

rutasReportes.get('/comercial', (req, res) => {
  const hoy = fechaLocal();
  const desde = esYmd(req.query.desde) ? req.query.desde : `${hoy.slice(0, 7)}-01`;
  const hasta = esYmd(req.query.hasta) ? req.query.hasta : hoy;
  const vendedorId = req.query.vendedor_id ? Number(req.query.vendedor_id) : null;
  const enRango = (ymd) => ymd && ymd >= desde && ymd <= hasta;

  run("UPDATE cotizaciones SET estatus = 'vencida' WHERE estatus = 'enviada' AND vigente_hasta < ?", hoy);

  // --- Cotizaciones emitidas en el rango ---
  const cotizaciones = all(
    `SELECT q.id, q.folio, q.total, q.subtotal, q.estatus, q.creado_en, q.resuelta_en, q.vendedor_id, q.origen, q.destino,
            v.nombre AS vendedor_nombre
       FROM cotizaciones q LEFT JOIN usuarios v ON v.id = q.vendedor_id`
  ).filter((q) => enRango(aLocal(q.creado_en)) && (!vendedorId || q.vendedor_id === vendedorId));

  const porEstatus = {};
  let montoEmitido = 0;
  for (const q of cotizaciones) {
    porEstatus[q.estatus] = (porEstatus[q.estatus] || 0) + 1;
    montoEmitido += q.total;
  }
  const ganadas = cotizaciones.filter((q) => ['aceptada', 'convertida'].includes(q.estatus));
  const decididas = cotizaciones.filter((q) => !['borrador'].includes(q.estatus));
  const montoGanado = ganadas.reduce((suma, q) => suma + q.total, 0);
  const tasaConversion = decididas.length ? Math.round((ganadas.length / decididas.length) * 100) : 0;

  // --- Servicios (venta real) en el rango ---
  const servicios = all(
    `SELECT s.id, s.folio, s.monto, s.estatus, s.fecha_carga, s.creado_en, s.vendedor_id, s.empresa_id, s.origen, s.destino,
            e.nombre AS empresa_nombre, v.nombre AS vendedor_nombre
       FROM servicios s JOIN empresas e ON e.id = s.empresa_id LEFT JOIN usuarios v ON v.id = s.vendedor_id
      WHERE s.estatus != 'cancelado'`
  ).filter((s) => enRango(s.fecha_carga || aLocal(s.creado_en)) && (!vendedorId || s.vendedor_id === vendedorId));

  const ventaTotal = servicios.reduce((suma, s) => suma + s.monto, 0);

  // Venta por mes
  const meses = {};
  for (const s of servicios) {
    const mes = String(s.fecha_carga || aLocal(s.creado_en)).slice(0, 7);
    meses[mes] = meses[mes] || { mes, n: 0, monto: 0 };
    meses[mes].n += 1;
    meses[mes].monto = redondear2(meses[mes].monto + s.monto);
  }
  const ventaPorMes = Object.values(meses).sort((a, b) => a.mes.localeCompare(b.mes));

  // --- Desempeno por vendedor ---
  const vendedores = {};
  const asegurarVendedor = (id, nombre) => {
    const clave = id || 0;
    vendedores[clave] = vendedores[clave] || {
      vendedor_id: id, nombre: nombre || 'Sin asignar',
      cot_emitidas: 0, cot_monto: 0, cot_ganadas: 0, monto_ganado: 0, servicios: 0, venta: 0,
    };
    return vendedores[clave];
  };
  for (const q of cotizaciones) {
    const v = asegurarVendedor(q.vendedor_id, q.vendedor_nombre);
    v.cot_emitidas += 1;
    v.cot_monto = redondear2(v.cot_monto + q.total);
    if (['aceptada', 'convertida'].includes(q.estatus)) {
      v.cot_ganadas += 1;
      v.monto_ganado = redondear2(v.monto_ganado + q.total);
    }
  }
  for (const s of servicios) {
    const v = asegurarVendedor(s.vendedor_id, s.vendedor_nombre);
    v.servicios += 1;
    v.venta = redondear2(v.venta + s.monto);
  }
  const porVendedor = Object.values(vendedores).sort((a, b) => b.venta - a.venta || b.monto_ganado - a.monto_ganado);

  // --- Top clientes por venta ---
  const clientes = {};
  for (const s of servicios) {
    clientes[s.empresa_id] = clientes[s.empresa_id] || { empresa_id: s.empresa_id, nombre: s.empresa_nombre, n: 0, monto: 0 };
    clientes[s.empresa_id].n += 1;
    clientes[s.empresa_id].monto = redondear2(clientes[s.empresa_id].monto + s.monto);
  }
  const topClientes = Object.values(clientes).sort((a, b) => b.monto - a.monto).slice(0, 10);

  // --- Rutas mas vendidas ---
  const rutas = {};
  for (const s of servicios) {
    const clave = `${s.origen} → ${s.destino}`;
    rutas[clave] = rutas[clave] || { ruta: clave, n: 0, monto: 0 };
    rutas[clave].n += 1;
    rutas[clave].monto = redondear2(rutas[clave].monto + s.monto);
  }
  const porRuta = Object.values(rutas).sort((a, b) => b.monto - a.monto).slice(0, 10);

  // --- Prospectos y conversion en el rango ---
  const empresas = all('SELECT id, tipo, etapa, creado_en, convertido_en, vendedor_id FROM empresas')
    .filter((e) => !vendedorId || e.vendedor_id === vendedorId);
  const prospectosNuevos = empresas.filter((e) => enRango(aLocal(e.creado_en))).length;
  const convertidos = empresas.filter((e) => e.convertido_en && enRango(aLocal(e.convertido_en))).length;

  const pipeline = {};
  for (const e of empresas) {
    if (e.tipo !== 'prospecto' || ['ganado', 'perdido'].includes(e.etapa)) continue;
    pipeline[e.etapa] = (pipeline[e.etapa] || 0) + 1;
  }

  res.json({
    rango: { desde, hasta },
    cotizaciones: {
      emitidas: cotizaciones.length,
      monto_emitido: redondear2(montoEmitido),
      ganadas: ganadas.length,
      monto_ganado: redondear2(montoGanado),
      tasa_conversion: tasaConversion,
      por_estatus: porEstatus,
    },
    venta: { total: redondear2(ventaTotal), servicios: servicios.length, por_mes: ventaPorMes },
    por_vendedor: porVendedor,
    top_clientes: topClientes,
    por_ruta: porRuta,
    prospectos: { nuevos: prospectosNuevos, convertidos, pipeline },
  });
});

// ---------- Busqueda global ----------

const rutasBuscar = express.Router();
rutasBuscar.use(autenticar);

rutasBuscar.get('/', (req, res) => {
  const q = limpiarTexto(req.query.q, 80);
  if (q.length < 2) return res.json({ empresas: [], contactos: [], cotizaciones: [], servicios: [] });
  const like = `%${q}%`;
  res.json({
    empresas: all(
      `SELECT id, nombre, tipo, etapa, ciudad, telefono FROM empresas
        WHERE nombre LIKE ? OR rfc LIKE ? OR telefono LIKE ? OR email LIKE ?
        ORDER BY actualizado_en DESC LIMIT 6`, like, like, like, like
    ),
    contactos: all(
      `SELECT c.id, c.nombre, c.puesto, c.telefono, c.empresa_id, e.nombre AS empresa_nombre
         FROM contactos c JOIN empresas e ON e.id = c.empresa_id
        WHERE c.nombre LIKE ? OR c.email LIKE ? OR c.telefono LIKE ?
        ORDER BY c.id DESC LIMIT 6`, like, like, like
    ),
    cotizaciones: all(
      `SELECT q.id, q.folio, q.origen, q.destino, q.total, q.moneda, q.estatus, e.nombre AS empresa_nombre
         FROM cotizaciones q JOIN empresas e ON e.id = q.empresa_id
        WHERE q.folio LIKE ? OR e.nombre LIKE ?
        ORDER BY q.id DESC LIMIT 6`, like, like
    ),
    servicios: all(
      `SELECT s.id, s.folio, s.origen, s.destino, s.estatus, s.fecha_carga, e.nombre AS empresa_nombre
         FROM servicios s JOIN empresas e ON e.id = s.empresa_id
        WHERE s.folio LIKE ? OR e.nombre LIKE ?
        ORDER BY s.id DESC LIMIT 6`, like, like
    ),
  });
});

module.exports = { rutasReportes, rutasBuscar };
