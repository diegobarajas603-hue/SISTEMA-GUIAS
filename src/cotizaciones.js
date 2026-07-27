'use strict';
// Cotizaciones: folio consecutivo, calculo de IVA y retencion, PDF con
// logotipo, envio por correo y WhatsApp, y conversion a servicio.

const express = require('express');
const { get, all, run, siguienteFolio, registrarActividad, cfg, tokenAleatorio } = require('./db');
const { autenticar, esAdminOGerente } = require('./auth');
const {
  ahora, fechaLocal, sumarDias, fechaCorta, limpiarTexto, num, redondear2, dinero, soloDigitos,
} = require('./util');
const { generarPdfCotizacion } = require('./pdf');
const { enviarCorreo } = require('./correo');

const ESTATUS = ['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida', 'convertida'];
const TIPOS_SERVICIO = ['sencillo', 'redondo', 'dedicado'];

// ---------- Calculo de importes ----------

function calcularTotales(entrada) {
  const tarifa = redondear2(num(entrada.tarifa));
  const maniobras = redondear2(num(entrada.maniobras));
  const seguro = redondear2(num(entrada.seguro));
  const otros = redondear2(num(entrada.otros));
  const subtotal = redondear2(tarifa + maniobras + seguro + otros);
  const ivaPct = entrada.iva_pct === undefined ? num(cfg('iva_pct', '16')) : num(entrada.iva_pct);
  const retPct = entrada.ret_pct === undefined ? num(cfg('ret_pct', '4')) : num(entrada.ret_pct);
  const iva = redondear2(subtotal * ivaPct / 100);
  const retencion = redondear2(subtotal * retPct / 100);
  const total = redondear2(subtotal + iva - retencion);
  return { tarifa, maniobras, seguro, otros, subtotal, iva_pct: ivaPct, iva, ret_pct: retPct, retencion, total };
}

function puedeEditarCot(usuario, cot) {
  return esAdminOGerente(usuario) || cot.vendedor_id === usuario.id;
}

function expirarVencidas() {
  run("UPDATE cotizaciones SET estatus = 'vencida' WHERE estatus = 'enviada' AND vigente_hasta < ?", fechaLocal());
}

function cotCompleta(id) {
  return get(
    `SELECT q.*,
            e.nombre AS empresa_nombre, e.rfc AS empresa_rfc, e.telefono AS empresa_telefono,
            e.email AS empresa_email, e.ciudad AS empresa_ciudad, e.estado_dir AS empresa_estado, e.tipo AS empresa_tipo,
            c.nombre AS contacto_nombre, c.email AS contacto_email, c.telefono AS contacto_telefono, c.whatsapp AS contacto_whatsapp,
            v.nombre AS vendedor_nombre, v.email AS vendedor_email, v.telefono AS vendedor_telefono
       FROM cotizaciones q
       JOIN empresas e ON e.id = q.empresa_id
       LEFT JOIN contactos c ON c.id = q.contacto_id
       LEFT JOIN usuarios v ON v.id = q.vendedor_id
      WHERE q.id = ?`, id
  );
}

function datosParaPdf(cot) {
  return {
    ...cot,
    fecha_emision: fechaLocal(new Date(cot.creado_en)),
    cfg: {
      empresa_nombre: cfg('empresa_nombre', 'FLETES TAURO'),
      empresa_razon: cfg('empresa_razon'),
      empresa_rfc: cfg('empresa_rfc'),
      empresa_direccion: cfg('empresa_direccion'),
      empresa_telefono: cfg('empresa_telefono'),
      empresa_email: cfg('empresa_email'),
      empresa_web: cfg('empresa_web'),
      pdf_leyenda: cfg('pdf_leyenda'),
    },
  };
}

function ligaPdfPublica(cot) {
  const base = String(cfg('base_url')).replace(/\/+$/, '');
  return base ? `${base}/cotizacion/${cot.publico_token}.pdf` : '';
}

// ---------- Rutas autenticadas ----------

const rutasCotizaciones = express.Router();
rutasCotizaciones.use(autenticar);

rutasCotizaciones.get('/', (req, res) => {
  expirarVencidas();
  const condiciones = [];
  const params = [];
  if (req.query.estatus && ESTATUS.includes(req.query.estatus)) {
    condiciones.push('q.estatus = ?');
    params.push(req.query.estatus);
  }
  if (req.query.abiertas === '1') condiciones.push("q.estatus IN ('borrador','enviada')");
  if (req.query.vendedor_id) {
    condiciones.push('q.vendedor_id = ?');
    params.push(Number(req.query.vendedor_id));
  }
  if (req.query.empresa_id) {
    condiciones.push('q.empresa_id = ?');
    params.push(Number(req.query.empresa_id));
  }
  const buscar = limpiarTexto(req.query.buscar, 100);
  if (buscar) {
    condiciones.push('(q.folio LIKE ? OR e.nombre LIKE ? OR q.origen LIKE ? OR q.destino LIKE ?)');
    const like = `%${buscar}%`;
    params.push(like, like, like, like);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  res.json(all(
    `SELECT q.id, q.folio, q.empresa_id, q.origen, q.destino, q.unidad_texto, q.tipo_servicio,
            q.subtotal, q.total, q.moneda, q.estatus, q.vigente_hasta, q.creado_en, q.enviada_en,
            e.nombre AS empresa_nombre, v.nombre AS vendedor_nombre, q.vendedor_id
       FROM cotizaciones q
       JOIN empresas e ON e.id = q.empresa_id
       LEFT JOIN usuarios v ON v.id = q.vendedor_id
       ${where}
      ORDER BY q.id DESC LIMIT 500`,
    ...params
  ));
});

rutasCotizaciones.post('/', (req, res) => {
  const empresaId = Number(req.body.empresa_id);
  const empresa = get('SELECT * FROM empresas WHERE id = ?', empresaId);
  if (!empresa) return res.status(400).json({ error: 'Elige el cliente o prospecto a cotizar.' });
  const origen = limpiarTexto(req.body.origen, 120);
  const destino = limpiarTexto(req.body.destino, 120);
  if (!origen || !destino) return res.status(400).json({ error: 'Origen y destino son obligatorios.' });

  let contactoId = req.body.contacto_id ? Number(req.body.contacto_id) : null;
  if (contactoId && !get('SELECT id FROM contactos WHERE id = ? AND empresa_id = ?', contactoId, empresaId)) contactoId = null;

  let unidadId = req.body.unidad_id ? Number(req.body.unidad_id) : null;
  let unidadTexto = limpiarTexto(req.body.unidad_texto, 120);
  if (unidadId) {
    const unidad = get('SELECT * FROM unidades WHERE id = ?', unidadId);
    if (!unidad) unidadId = null;
    else if (!unidadTexto) unidadTexto = unidad.nombre;
  }

  const vendedorId = (esAdminOGerente(req.usuario) && req.body.vendedor_id) ? Number(req.body.vendedor_id) : req.usuario.id;
  const totales = calcularTotales(req.body);
  const vigenciaDias = Math.max(1, Math.min(120, num(req.body.vigencia_dias, num(cfg('vigencia_dias', '15')))));
  const hoy = fechaLocal();
  const folio = siguienteFolio('COT');
  const fecha = ahora();

  const info = run(
    `INSERT INTO cotizaciones (
        folio, publico_token, empresa_id, contacto_id, vendedor_id, origen, destino, tipo_servicio,
        unidad_id, unidad_texto, mercancia, peso_kg, tarifa, maniobras, seguro, otros, otros_desc,
        subtotal, iva_pct, iva, ret_pct, retencion, total, moneda, vigencia_dias, vigente_hasta,
        condiciones, estatus, notas, creado_en, actualizado_en)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    folio, tokenAleatorio(20), empresaId, contactoId, vendedorId, origen, destino,
    TIPOS_SERVICIO.includes(req.body.tipo_servicio) ? req.body.tipo_servicio : 'sencillo',
    unidadId, unidadTexto, limpiarTexto(req.body.mercancia, 300), num(req.body.peso_kg),
    totales.tarifa, totales.maniobras, totales.seguro, totales.otros, limpiarTexto(req.body.otros_desc, 150),
    totales.subtotal, totales.iva_pct, totales.iva, totales.ret_pct, totales.retencion, totales.total,
    req.body.moneda === 'USD' ? 'USD' : 'MXN', vigenciaDias, sumarDias(hoy, vigenciaDias),
    limpiarTexto(req.body.condiciones, 5000) || cfg('condiciones_default'),
    'borrador', limpiarTexto(req.body.notas, 2000), fecha, fecha
  );
  const id = Number(info.lastInsertRowid);
  registrarActividad({
    empresa_id: empresaId, cotizacion_id: id, usuario_id: req.usuario.id, tipo: 'sistema',
    titulo: `Cotizacion ${folio} creada`,
    descripcion: `${origen} → ${destino} · ${unidadTexto || 'unidad por definir'} · Total ${dinero(totales.total)} ${req.body.moneda === 'USD' ? 'USD' : 'MXN'}`,
  });
  run('UPDATE empresas SET actualizado_en = ? WHERE id = ?', ahora(), empresaId);
  res.status(201).json(cotCompleta(id));
});

rutasCotizaciones.get('/:id', (req, res) => {
  expirarVencidas();
  const cot = cotCompleta(Number(req.params.id));
  if (!cot) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  cot.liga_pdf_publica = ligaPdfPublica(cot);
  cot.actividades = all(
    `SELECT a.*, u.nombre AS usuario_nombre FROM actividades a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.cotizacion_id = ? ORDER BY a.id DESC LIMIT 50`, cot.id
  );
  res.json(cot);
});

rutasCotizaciones.put('/:id', (req, res) => {
  const cot = get('SELECT * FROM cotizaciones WHERE id = ?', Number(req.params.id));
  if (!cot) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  if (!puedeEditarCot(req.usuario, cot)) return res.status(403).json({ error: 'Esta cotizacion es de otro vendedor.' });
  if (!['borrador', 'enviada', 'vencida'].includes(cot.estatus)) {
    return res.status(400).json({ error: `Una cotizacion ${cot.estatus} ya no se puede editar. Duplicala si necesitas otra version.` });
  }

  const cuerpo = { ...cot, ...req.body };
  const totales = calcularTotales(cuerpo);
  let contactoId = req.body.contacto_id === undefined ? cot.contacto_id : (req.body.contacto_id ? Number(req.body.contacto_id) : null);
  if (contactoId && !get('SELECT id FROM contactos WHERE id = ? AND empresa_id = ?', contactoId, cot.empresa_id)) contactoId = cot.contacto_id;

  let unidadId = req.body.unidad_id === undefined ? cot.unidad_id : (req.body.unidad_id ? Number(req.body.unidad_id) : null);
  let unidadTexto = req.body.unidad_texto === undefined ? cot.unidad_texto : limpiarTexto(req.body.unidad_texto, 120);
  if (unidadId && unidadId !== cot.unidad_id) {
    const unidad = get('SELECT * FROM unidades WHERE id = ?', unidadId);
    if (!unidad) unidadId = null;
    else if (req.body.unidad_texto === undefined) unidadTexto = unidad.nombre;
  }

  const vigenciaDias = Math.max(1, Math.min(120, num(cuerpo.vigencia_dias, cot.vigencia_dias)));
  const vigenteHasta = sumarDias(fechaLocal(new Date(cot.creado_en)), vigenciaDias);

  run(
    `UPDATE cotizaciones SET
        contacto_id = ?, vendedor_id = ?, origen = ?, destino = ?, tipo_servicio = ?, unidad_id = ?, unidad_texto = ?,
        mercancia = ?, peso_kg = ?, tarifa = ?, maniobras = ?, seguro = ?, otros = ?, otros_desc = ?,
        subtotal = ?, iva_pct = ?, iva = ?, ret_pct = ?, retencion = ?, total = ?, moneda = ?,
        vigencia_dias = ?, vigente_hasta = ?, condiciones = ?, notas = ?, actualizado_en = ?
      WHERE id = ?`,
    contactoId,
    (esAdminOGerente(req.usuario) && req.body.vendedor_id) ? Number(req.body.vendedor_id) : cot.vendedor_id,
    limpiarTexto(cuerpo.origen, 120) || cot.origen,
    limpiarTexto(cuerpo.destino, 120) || cot.destino,
    TIPOS_SERVICIO.includes(cuerpo.tipo_servicio) ? cuerpo.tipo_servicio : cot.tipo_servicio,
    unidadId, unidadTexto,
    limpiarTexto(cuerpo.mercancia, 300), num(cuerpo.peso_kg),
    totales.tarifa, totales.maniobras, totales.seguro, totales.otros, limpiarTexto(cuerpo.otros_desc, 150),
    totales.subtotal, totales.iva_pct, totales.iva, totales.ret_pct, totales.retencion, totales.total,
    cuerpo.moneda === 'USD' ? 'USD' : 'MXN',
    vigenciaDias, vigenteHasta,
    limpiarTexto(cuerpo.condiciones, 5000), limpiarTexto(cuerpo.notas, 2000), ahora(), cot.id
  );
  registrarActividad({
    empresa_id: cot.empresa_id, cotizacion_id: cot.id, usuario_id: req.usuario.id, tipo: 'cambio',
    titulo: `Cotizacion ${cot.folio} actualizada`,
    descripcion: `Nuevo total: ${dinero(totales.total)}.`,
  });
  res.json(cotCompleta(cot.id));
});

rutasCotizaciones.put('/:id/estatus', (req, res) => {
  const cot = get('SELECT * FROM cotizaciones WHERE id = ?', Number(req.params.id));
  if (!cot) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  if (!puedeEditarCot(req.usuario, cot)) return res.status(403).json({ error: 'Esta cotizacion es de otro vendedor.' });
  const nuevo = req.body.estatus;
  if (!['enviada', 'aceptada', 'rechazada', 'borrador'].includes(nuevo)) {
    return res.status(400).json({ error: 'Estatus invalido.' });
  }
  if (cot.estatus === 'convertida') return res.status(400).json({ error: 'Esta cotizacion ya se convirtio en servicio.' });
  if (nuevo === cot.estatus) return res.json(cotCompleta(cot.id));

  const motivo = limpiarTexto(req.body.motivo, 500);
  const fecha = ahora();
  let enviadaEn = cot.enviada_en;
  let resueltaEn = cot.resuelta_en;
  let vigenteHasta = cot.vigente_hasta;
  if (nuevo === 'enviada') {
    enviadaEn = enviadaEn || fecha;
    if (cot.estatus === 'vencida') vigenteHasta = sumarDias(fechaLocal(), cot.vigencia_dias); // reactivar
  }
  if (nuevo === 'aceptada' || nuevo === 'rechazada') resueltaEn = fecha;
  if (nuevo === 'borrador') resueltaEn = null;

  run(
    'UPDATE cotizaciones SET estatus = ?, enviada_en = ?, resuelta_en = ?, vigente_hasta = ?, actualizado_en = ? WHERE id = ?',
    nuevo, enviadaEn, resueltaEn, vigenteHasta, fecha, cot.id
  );
  const titulos = {
    enviada: `Cotizacion ${cot.folio} marcada como enviada`,
    aceptada: `Cotizacion ${cot.folio} ACEPTADA por el cliente`,
    rechazada: `Cotizacion ${cot.folio} rechazada`,
    borrador: `Cotizacion ${cot.folio} regresada a borrador`,
  };
  registrarActividad({
    empresa_id: cot.empresa_id, cotizacion_id: cot.id, usuario_id: req.usuario.id, tipo: 'cambio',
    titulo: titulos[nuevo], descripcion: motivo ? `Motivo: ${motivo}` : '',
  });
  res.json(cotCompleta(cot.id));
});

// Duplicar como nuevo borrador (nueva version de una cotizacion cerrada)
rutasCotizaciones.post('/:id/duplicar', (req, res) => {
  const cot = get('SELECT * FROM cotizaciones WHERE id = ?', Number(req.params.id));
  if (!cot) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  const folio = siguienteFolio('COT');
  const hoy = fechaLocal();
  const fecha = ahora();
  const info = run(
    `INSERT INTO cotizaciones (
        folio, publico_token, empresa_id, contacto_id, vendedor_id, origen, destino, tipo_servicio,
        unidad_id, unidad_texto, mercancia, peso_kg, tarifa, maniobras, seguro, otros, otros_desc,
        subtotal, iva_pct, iva, ret_pct, retencion, total, moneda, vigencia_dias, vigente_hasta,
        condiciones, estatus, notas, creado_en, actualizado_en)
     SELECT ?, ?, empresa_id, contacto_id, ?, origen, destino, tipo_servicio,
        unidad_id, unidad_texto, mercancia, peso_kg, tarifa, maniobras, seguro, otros, otros_desc,
        subtotal, iva_pct, iva, ret_pct, retencion, total, moneda, vigencia_dias, ?,
        condiciones, 'borrador', notas, ?, ?
       FROM cotizaciones WHERE id = ?`,
    folio, tokenAleatorio(20), req.usuario.id, sumarDias(hoy, cot.vigencia_dias), fecha, fecha, cot.id
  );
  const id = Number(info.lastInsertRowid);
  registrarActividad({
    empresa_id: cot.empresa_id, cotizacion_id: id, usuario_id: req.usuario.id, tipo: 'sistema',
    titulo: `Cotizacion ${folio} creada como copia de ${cot.folio}`,
  });
  res.status(201).json(cotCompleta(id));
});

// ---------- PDF ----------

rutasCotizaciones.get('/:id/pdf', async (req, res) => {
  const cot = cotCompleta(Number(req.params.id));
  if (!cot) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  try {
    const pdf = await generarPdfCotizacion(datosParaPdf(cot));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cot.folio}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[pdf]', err);
    res.status(500).json({ error: 'No se pudo generar el PDF.' });
  }
});

// ---------- Envio por correo ----------

rutasCotizaciones.post('/:id/enviar-correo', async (req, res) => {
  const cot = cotCompleta(Number(req.params.id));
  if (!cot) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  const para = limpiarTexto(req.body.para, 200) || cot.contacto_email || cot.empresa_email;
  if (!para) return res.status(400).json({ error: 'El cliente no tiene correo registrado. Escribe a que correo enviarla.' });

  const asunto = limpiarTexto(req.body.asunto, 200) || `Cotizacion ${cot.folio} - ${cfg('empresa_nombre', 'FLETES TAURO')}`;
  const saludo = cot.contacto_nombre ? `Estimado(a) ${cot.contacto_nombre}:` : 'Estimado cliente:';
  const mensaje = limpiarTexto(req.body.mensaje, 3000) ||
    `${saludo}\n\nLe compartimos la cotizacion ${cot.folio} por el servicio de transporte ${cot.origen} - ${cot.destino}.\n` +
    `Total: ${dinero(cot.total, cot.moneda)} (incluye IVA${num(cot.ret_pct) > 0 ? ' y retencion' : ''}).\n` +
    `La cotizacion tiene vigencia hasta el ${fechaCorta(cot.vigente_hasta)}.\n\n` +
    'Quedamos atentos a su confirmacion.\n\nSaludos cordiales,\n' +
    `${cot.vendedor_nombre}\n${cfg('empresa_nombre', 'FLETES TAURO')}${cot.vendedor_telefono ? `\nTel. ${cot.vendedor_telefono}` : ''}`;

  try {
    const pdf = await generarPdfCotizacion(datosParaPdf(cot));
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;white-space:pre-line">${mensaje
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
    await enviarCorreo({ para, asunto, texto: mensaje, html, adjuntos: [{ filename: `${cot.folio}.pdf`, content: pdf }] });
  } catch (err) {
    return res.status(400).json({ error: `No se pudo enviar el correo: ${err.message}` });
  }

  if (cot.estatus === 'borrador') {
    run("UPDATE cotizaciones SET estatus = 'enviada', enviada_en = ?, actualizado_en = ? WHERE id = ?", ahora(), ahora(), cot.id);
  }
  registrarActividad({
    empresa_id: cot.empresa_id, cotizacion_id: cot.id, usuario_id: req.usuario.id, tipo: 'correo',
    titulo: `Cotizacion ${cot.folio} enviada por correo`,
    descripcion: `Para: ${para}`,
  });
  res.json({ ok: true, mensaje: `Cotizacion enviada a ${para}.`, cotizacion: cotCompleta(cot.id) });
});

// ---------- Envio por WhatsApp ----------

function textoWhatsapp(cot) {
  const liga = ligaPdfPublica(cot);
  const lineas = [
    `Buen dia${cot.contacto_nombre ? ` ${cot.contacto_nombre}` : ''}, le comparto la cotizacion *${cot.folio}* de ${cfg('empresa_nombre', 'FLETES TAURO')}:`,
    `• Ruta: ${cot.origen} → ${cot.destino}`,
    `• Unidad: ${cot.unidad_texto || 'por definir'}`,
    cot.mercancia ? `• Mercancia: ${cot.mercancia}` : '',
    `• Total: ${dinero(cot.total, cot.moneda)} ${cot.moneda} (incluye IVA${num(cot.ret_pct) > 0 ? ' y retencion' : ''})`,
    `• Vigencia: hasta el ${fechaCorta(cot.vigente_hasta)}`,
    liga ? `Puede descargar el PDF aqui: ${liga}` : 'En seguida le comparto el PDF.',
    'Quedo pendiente de su confirmacion. ¡Saludos!',
  ].filter(Boolean);
  return lineas.join('\n');
}

rutasCotizaciones.post('/:id/whatsapp', async (req, res) => {
  const cot = cotCompleta(Number(req.params.id));
  if (!cot) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  let telefono = soloDigitos(req.body.telefono || cot.contacto_whatsapp || cot.contacto_telefono || cot.empresa_telefono);
  if (!telefono) return res.status(400).json({ error: 'El cliente no tiene telefono registrado. Escribe el numero de WhatsApp.' });
  if (telefono.length === 10) telefono = `52${telefono}`;

  const mensaje = limpiarTexto(req.body.mensaje, 3000) || textoWhatsapp(cot);
  const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;

  // Envio directo por la API de Meta si esta configurada y se pide
  let apiEnviado = false;
  if (req.body.via === 'api') {
    const token = cfg('whatsapp_token');
    const phoneId = cfg('whatsapp_phone_id');
    if (!token || !phoneId) {
      return res.status(400).json({ error: 'La API de WhatsApp Business no esta configurada. Usa la liga de WhatsApp normal o configurala en Configuracion.' });
    }
    try {
      const liga = ligaPdfPublica(cot);
      const respuesta = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(liga ? {
          messaging_product: 'whatsapp', to: telefono, type: 'document',
          document: { link: liga, filename: `${cot.folio}.pdf`, caption: mensaje },
        } : {
          messaging_product: 'whatsapp', to: telefono, type: 'text', text: { body: mensaje },
        }),
      });
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        const detalle = cuerpo.error && cuerpo.error.message ? cuerpo.error.message : `HTTP ${respuesta.status}`;
        return res.status(400).json({ error: `La API de WhatsApp rechazo el envio: ${detalle}` });
      }
      apiEnviado = true;
    } catch (err) {
      return res.status(400).json({ error: `No se pudo llamar a la API de WhatsApp: ${err.message}` });
    }
  }

  if (cot.estatus === 'borrador') {
    run("UPDATE cotizaciones SET estatus = 'enviada', enviada_en = ?, actualizado_en = ? WHERE id = ?", ahora(), ahora(), cot.id);
  }
  registrarActividad({
    empresa_id: cot.empresa_id, cotizacion_id: cot.id, usuario_id: req.usuario.id, tipo: 'whatsapp',
    titulo: `Cotizacion ${cot.folio} enviada por WhatsApp`,
    descripcion: `Al numero +${telefono}${apiEnviado ? ' (API de WhatsApp Business)' : ''}`,
  });
  res.json({ ok: true, url, mensaje, telefono, api_enviado: apiEnviado, liga_pdf: ligaPdfPublica(cot), cotizacion: cotCompleta(cot.id) });
});

// ---------- Conversion a servicio ----------

rutasCotizaciones.post('/:id/convertir', (req, res) => {
  const cot = cotCompleta(Number(req.params.id));
  if (!cot) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  if (!puedeEditarCot(req.usuario, cot)) return res.status(403).json({ error: 'Esta cotizacion es de otro vendedor.' });
  if (cot.estatus === 'convertida') return res.status(400).json({ error: 'Esta cotizacion ya se convirtio en servicio.' });
  if (cot.estatus === 'rechazada') return res.status(400).json({ error: 'Una cotizacion rechazada no se puede convertir. Duplicala para renegociar.' });

  const folio = siguienteFolio('SRV');
  const fecha = ahora();
  const fechaCarga = limpiarTexto(req.body.fecha_carga, 10) || fechaLocal();
  const info = run(
    `INSERT INTO servicios (folio, cotizacion_id, empresa_id, vendedor_id, origen, destino, unidad_texto, operador,
                            mercancia, peso_kg, fecha_carga, fecha_entrega, monto, moneda, estatus, notas, creado_en, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'programado', ?, ?, ?)`,
    folio, cot.id, cot.empresa_id, cot.vendedor_id, cot.origen, cot.destino, cot.unidad_texto,
    limpiarTexto(req.body.operador, 120), cot.mercancia, cot.peso_kg,
    fechaCarga, limpiarTexto(req.body.fecha_entrega, 10) || null,
    cot.subtotal, cot.moneda, limpiarTexto(req.body.notas, 2000), fecha, fecha
  );
  const servicioId = Number(info.lastInsertRowid);

  run("UPDATE cotizaciones SET estatus = 'convertida', resuelta_en = COALESCE(resuelta_en, ?), actualizado_en = ? WHERE id = ?", fecha, fecha, cot.id);

  const empresa = get('SELECT * FROM empresas WHERE id = ?', cot.empresa_id);
  if (empresa.tipo === 'prospecto' || empresa.etapa !== 'ganado') {
    run(
      "UPDATE empresas SET tipo = 'cliente', etapa = 'ganado', convertido_en = COALESCE(convertido_en, ?), actualizado_en = ? WHERE id = ?",
      fecha, fecha, empresa.id
    );
  }
  registrarActividad({
    empresa_id: cot.empresa_id, cotizacion_id: cot.id, servicio_id: servicioId, usuario_id: req.usuario.id, tipo: 'sistema',
    titulo: `Cotizacion ${cot.folio} aceptada y convertida en servicio ${folio}`,
    descripcion: `Carga programada para el ${fechaCorta(fechaCarga)}. Venta: ${dinero(cot.subtotal, cot.moneda)} + IVA.`,
  });
  res.status(201).json({ ok: true, servicio: get('SELECT * FROM servicios WHERE id = ?', servicioId), cotizacion: cotCompleta(cot.id) });
});

rutasCotizaciones.delete('/:id', (req, res) => {
  const cot = get('SELECT * FROM cotizaciones WHERE id = ?', Number(req.params.id));
  if (!cot) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede eliminar cotizaciones.' });
  run('UPDATE servicios SET cotizacion_id = NULL WHERE cotizacion_id = ?', cot.id);
  run('DELETE FROM actividades WHERE cotizacion_id = ? AND empresa_id IS NULL', cot.id);
  run('UPDATE actividades SET cotizacion_id = NULL WHERE cotizacion_id = ?', cot.id);
  run('DELETE FROM cotizaciones WHERE id = ?', cot.id);
  res.json({ ok: true });
});

// ---------- PDF publico (liga para el cliente, sin login) ----------

const rutasPublico = express.Router();

rutasPublico.get('/cotizacion/:token.pdf', async (req, res) => {
  const cot = get('SELECT id FROM cotizaciones WHERE publico_token = ?', String(req.params.token));
  if (!cot) return res.status(404).send('Cotizacion no encontrada');
  const completa = cotCompleta(cot.id);
  try {
    const pdf = await generarPdfCotizacion(datosParaPdf(completa));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${completa.folio}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[pdf publico]', err);
    res.status(500).send('No se pudo generar el PDF');
  }
});

module.exports = { rutasCotizaciones, rutasPublico, calcularTotales };
