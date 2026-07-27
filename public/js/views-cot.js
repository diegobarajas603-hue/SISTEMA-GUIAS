'use strict';
// Cotizaciones: lista, asistente paso a paso (cliente → ruta y carga →
// servicio y unidad → costos adicionales → precio e impuestos → vista
// previa → PDF/envio), detalle, envio por correo/WhatsApp y conversion.

function calcularTotalesCot(c) {
  const n = (v) => Number(v) || 0;
  const subtotal = Math.round((n(c.tarifa) + n(c.maniobras) + n(c.seguro) + n(c.otros)) * 100) / 100;
  const iva = Math.round(subtotal * n(c.iva_pct)) / 100;
  const retencion = Math.round(subtotal * n(c.ret_pct)) / 100;
  const total = Math.round((subtotal + iva - retencion) * 100) / 100;
  return { subtotal, iva, retencion, total };
}

// ---------- Modal: enviar por correo ----------

function modalCorreoCot(cot, alExito) {
  const para = entrada({ type: 'email', value: cot.contacto_email || cot.empresa_email || '', placeholder: 'correo@cliente.com' });
  const asunto = entrada({ value: `Cotizacion ${cot.folio} - ${Estado.config.empresa_nombre || 'FLETES TAURO'}` });
  const mensaje = el('textarea', { rows: 6, placeholder: 'Deja vacio para usar el mensaje estandar con folio, ruta, total y vigencia.' });
  const botonEnviar = el('button', { clase: 'btn btn-primario', type: 'button' }, icono('correo'), 'Enviar con PDF adjunto');
  const m = modal({
    titulo: `Enviar ${cot.folio} por correo`,
    cuerpo: el('div', {},
      Estado.config.correo_configurado ? null : el('div', { clase: 'aviso aviso-alerta' },
        'El correo SMTP no esta configurado. Un administrador puede capturarlo en Configuracion → Correo.'),
      campo('Para *', para),
      campo('Asunto', asunto),
      campo('Mensaje', mensaje),
    ),
    pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonEnviar],
  });
  botonEnviar.addEventListener('click', async () => {
    if (!para.value.trim()) { toast('Escribe el correo del cliente.', 'error'); return; }
    botonEnviar.disabled = true;
    botonEnviar.textContent = 'Enviando...';
    try {
      const r = await API.post(`/cotizaciones/${cot.id}/enviar-correo`, {
        para: para.value.trim(), asunto: asunto.value.trim(), mensaje: mensaje.value.trim(),
      });
      toast(r.mensaje || 'Cotizacion enviada.');
      m.cerrar();
      if (alExito) alExito();
    } catch (err) {
      toast(err.message, 'error');
      botonEnviar.disabled = false;
      botonEnviar.textContent = 'Enviar con PDF adjunto';
    }
  });
}

// ---------- Modal: enviar por WhatsApp ----------

function modalWhatsappCot(cot, alExito) {
  const telefono = entrada({ type: 'tel', value: cot.contacto_whatsapp || cot.contacto_telefono || cot.empresa_telefono || '', placeholder: '10 digitos (se agrega +52 solo)' });
  const mensaje = el('textarea', { rows: 5, placeholder: 'Deja vacio para usar el mensaje estandar: folio, ruta, unidad, total, vigencia y liga del PDF.' });
  const botonAbrir = el('button', { clase: 'btn btn-exito', type: 'button' }, icono('whatsapp'), 'Abrir WhatsApp');
  const botonApi = Estado.config.whatsapp_api_configurada
    ? el('button', { clase: 'btn btn-oscuro', type: 'button' }, 'Enviar directo (API)')
    : null;
  const m = modal({
    titulo: `Enviar ${cot.folio} por WhatsApp`,
    cuerpo: el('div', {},
      el('div', { clase: 'aviso aviso-info' },
        'Se abre WhatsApp con el mensaje ya escrito' + (Estado.config.base_url_definida ? ' e incluye la liga para descargar el PDF.' : '. Configura la URL publica del sistema para incluir la liga del PDF.')),
      campo('Numero de WhatsApp *', telefono),
      campo('Mensaje personalizado', mensaje),
    ),
    pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonApi, botonAbrir].filter(Boolean),
  });
  const enviar = async (via) => {
    if (!telefono.value.trim()) { toast('Escribe el numero de WhatsApp.', 'error'); return; }
    botonAbrir.disabled = true;
    if (botonApi) botonApi.disabled = true;
    try {
      const r = await API.post(`/cotizaciones/${cot.id}/whatsapp`, {
        telefono: telefono.value.trim(),
        mensaje: mensaje.value.trim() || undefined,
        via,
      });
      if (via === 'api') {
        toast('Mensaje enviado por la API de WhatsApp Business.');
      } else {
        window.open(r.url, '_blank');
        toast('WhatsApp abierto con el mensaje listo.');
      }
      m.cerrar();
      if (alExito) alExito();
    } catch (err) {
      toast(err.message, 'error');
      botonAbrir.disabled = false;
      if (botonApi) botonApi.disabled = false;
    }
  };
  botonAbrir.addEventListener('click', () => enviar());
  if (botonApi) botonApi.addEventListener('click', () => enviar('api'));
}

// ---------- Modal: convertir en servicio ----------

function modalConvertirCot(cot, alExito) {
  const fechaCarga = entrada({ type: 'date', value: UI.hoyLocal() });
  const fechaEntrega = entrada({ type: 'date' });
  const operador = entrada({ placeholder: 'Nombre del operador (opcional)' });
  const notas = el('textarea', { rows: 2 });
  const botonConvertir = el('button', { clase: 'btn btn-exito', type: 'button' }, icono('convertir'), 'Convertir en servicio');
  const m = modal({
    titulo: `Convertir ${cot.folio} en servicio`,
    cuerpo: el('div', {},
      el('div', { clase: 'aviso aviso-exito' },
        `Se crea el servicio con folio SRV, venta de ${UI.dinero(cot.subtotal, cot.moneda)} + IVA, y el ${cot.empresa_tipo === 'prospecto' ? 'prospecto pasa a ser cliente' : 'cliente queda como ganado'}.`),
      el('div', { clase: 'forma-rejilla' },
        campo('Fecha de carga *', fechaCarga),
        campo('Fecha estimada de entrega', fechaEntrega),
      ),
      campo('Operador', operador),
      campo('Notas del servicio', notas),
    ),
    pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonConvertir],
  });
  botonConvertir.addEventListener('click', async () => {
    botonConvertir.disabled = true;
    try {
      const r = await API.post(`/cotizaciones/${cot.id}/convertir`, {
        fecha_carga: fechaCarga.value, fecha_entrega: fechaEntrega.value || undefined,
        operador: operador.value.trim(), notas: notas.value.trim(),
      });
      toast(`Servicio ${r.servicio.folio} creado.`);
      m.cerrar();
      if (alExito) alExito(r);
    } catch (err) {
      toast(err.message, 'error');
      botonConvertir.disabled = false;
    }
  });
}

async function descargarPdfCot(cot) {
  try {
    toast('Generando PDF...');
    await API.descargarPdf(`/cotizaciones/${cot.id}/pdf`, `${cot.folio}.pdf`);
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Vista: lista de cotizaciones ----------

Vistas.cotizaciones = async function (contenedor) {
  contenedor.innerHTML = '';
  const filtros = { estatus: '', vendedor_id: '', buscar: '' };

  const cabecera = el('div', { clase: 'encabezado-vista' },
    el('div', {}, el('h1', {}, 'Cotizaciones'), el('div', { clase: 'sub' }, 'Folio, PDF con logotipo, envio por correo/WhatsApp y conversion a servicio')),
    el('div', { clase: 'acciones-vista' },
      el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => irA('/cotizaciones/nueva') }, icono('mas'), 'Nueva cotizacion')
    )
  );

  const chips = el('div', { clase: 'chips' });
  const opcionesEstatus = [['', 'Todas'], ['borrador', 'Borradores'], ['enviada', 'Enviadas'], ['aceptada', 'Aceptadas'], ['convertida', 'Convertidas'], ['rechazada', 'Rechazadas'], ['vencida', 'Vencidas']];
  const pintarChips = () => {
    chips.innerHTML = '';
    for (const [valor, nombre] of opcionesEstatus) {
      chips.append(el('button', {
        clase: `chip${filtros.estatus === valor ? ' activo' : ''}`, type: 'button',
        alClic: () => { filtros.estatus = valor; pintarChips(); cargar(); },
      }, nombre));
    }
  };
  pintarChips();

  const barra = el('div', { clase: 'filtros' },
    chips,
    entrada({
      type: 'search', placeholder: 'Buscar folio o cliente...',
      alTeclear: debounce((ev) => { filtros.buscar = ev.target.value.trim(); cargar(); }),
    }),
    selector([{ valor: '', texto: 'Todos los vendedores' }, ...usuariosActivos().map((u) => ({ valor: u.id, texto: u.nombre }))],
      '', { alCambiar: (ev) => { filtros.vendedor_id = ev.target.value; cargar(); } })
  );

  const zona = el('div');
  contenedor.append(cabecera, barra, zona);

  async function cargar() {
    zona.innerHTML = '';
    zona.append(cargando());
    const consulta = new URLSearchParams();
    for (const [clave, valor] of Object.entries(filtros)) if (valor) consulta.set(clave, valor);
    try {
      const filas = await API.get(`/cotizaciones?${consulta}`);
      zona.innerHTML = '';
      if (!filas.length) {
        zona.append(vacio('Sin cotizaciones con esos filtros. Crea una con "Nueva cotizacion".', '📄'));
        return;
      }
      zona.append(tabla([
        { titulo: 'Folio', clase: 'celda-principal', valor: (f) => f.folio },
        { titulo: 'Cliente', valor: (f) => f.empresa_nombre },
        { titulo: 'Ruta', valor: (f) => `${f.origen} → ${f.destino}` },
        { titulo: 'Unidad', valor: (f) => f.unidad_texto || '—' },
        { titulo: 'Total', clase: 'num', valor: (f) => el('b', {}, UI.dinero(f.total, f.moneda)) },
        { titulo: 'Estatus', valor: (f) => badgeCot(f.estatus) },
        { titulo: 'Vigencia', valor: (f) => UI.fecha(f.vigente_hasta) },
        { titulo: 'Vendedor', valor: (f) => f.vendedor_nombre || '—' },
        {
          titulo: '', valor: (f) => el('button', {
            clase: 'btn btn-secundario btn-chico', type: 'button', title: 'Descargar PDF',
            alClic: () => descargarPdfCot(f),
          }, icono('pdf'), 'PDF'),
        },
      ], filas, { alClic: (f) => irA(`/cotizaciones/${f.id}`) }));
    } catch (err) {
      zona.innerHTML = '';
      zona.append(vacio(err.message, '⚠️'));
    }
  }
  await cargar();
};

// ---------- Vista: asistente de cotizacion ----------

Vistas.cotizacionNueva = async function (contenedor, params = {}) {
  contenedor.innerHTML = '';
  contenedor.append(cargando('Preparando asistente...'));

  const catalogos = await cargarCatalogos();
  const cfgPub = Estado.config;

  // Estado del asistente
  const cot = {
    empresa: null, contacto_id: '', vendedor_id: Estado.usuario.id,
    origen: '', destino: '', tipo_servicio: 'sencillo', mercancia: '', peso_kg: '',
    unidad_id: '', unidad_texto: '',
    maniobras: '', seguro: '', otros: '', otros_desc: '',
    tarifa: '', moneda: 'MXN',
    iva_pct: Number(cfgPub.iva_pct || 16),
    ret_aplica: Number(cfgPub.ret_pct || 4) > 0,
    ret_pct_valor: Number(cfgPub.ret_pct || 4),
    vigencia_dias: Number(cfgPub.vigencia_dias || 15),
    condiciones: cfgPub.condiciones_default || '',
    notas: '',
  };
  let editandoId = null;
  let cotGuardada = null;
  let contactosEmpresa = [];

  // Prellenados: editar cotizacion existente o empresa desde su expediente
  if (params.editar) {
    try {
      const existente = await API.get(`/cotizaciones/${params.editar}`);
      if (!['borrador', 'enviada', 'vencida'].includes(existente.estatus)) {
        irA(`/cotizaciones/${existente.id}`);
        return;
      }
      editandoId = existente.id;
      cotGuardada = existente;
      Object.assign(cot, {
        empresa: { id: existente.empresa_id, nombre: existente.empresa_nombre, tipo: existente.empresa_tipo, ciudad: existente.empresa_ciudad },
        contacto_id: existente.contacto_id || '',
        vendedor_id: existente.vendedor_id,
        origen: existente.origen, destino: existente.destino,
        tipo_servicio: existente.tipo_servicio, mercancia: existente.mercancia,
        peso_kg: existente.peso_kg || '', unidad_id: existente.unidad_id || '',
        unidad_texto: existente.unidad_texto || '',
        maniobras: existente.maniobras || '', seguro: existente.seguro || '',
        otros: existente.otros || '', otros_desc: existente.otros_desc || '',
        tarifa: existente.tarifa || '', moneda: existente.moneda,
        iva_pct: existente.iva_pct, ret_aplica: existente.ret_pct > 0,
        ret_pct_valor: existente.ret_pct > 0 ? existente.ret_pct : Number(cfgPub.ret_pct || 4),
        vigencia_dias: existente.vigencia_dias, condiciones: existente.condiciones,
        notas: existente.notas,
      });
    } catch (err) {
      contenedor.innerHTML = '';
      contenedor.append(vacio(err.message, '⚠️'));
      return;
    }
  } else if (params.empresa) {
    try {
      const e = await API.get(`/empresas/${params.empresa}`);
      cot.empresa = e;
      contactosEmpresa = e.contactos;
      const principal = e.contactos.find((c) => c.principal) || e.contactos[0];
      if (principal) cot.contacto_id = principal.id;
    } catch (err) { /* se elige manualmente */ }
  }

  const PASOS = [
    { clave: 'cliente', titulo: 'Cliente' },
    { clave: 'ruta', titulo: 'Ruta y carga' },
    { clave: 'unidad', titulo: 'Servicio y unidad' },
    { clave: 'costos', titulo: 'Costos adicionales' },
    { clave: 'precio', titulo: 'Precio e impuestos' },
    { clave: 'previa', titulo: 'Vista previa' },
    { clave: 'envio', titulo: 'PDF y envio' },
  ];
  let pasoActual = 0;

  const validaciones = {
    0: () => (cot.empresa ? '' : 'Elige el cliente o prospecto a cotizar.'),
    1: () => (cot.origen.trim() && cot.destino.trim() ? '' : 'Captura el origen y el destino del flete.'),
    2: () => (cot.unidad_id || cot.unidad_texto.trim() ? '' : 'Elige el tipo de unidad.'),
    3: () => '',
    4: () => (Number(cot.tarifa) > 0 ? '' : 'La tarifa del flete debe ser mayor a cero.'),
    5: () => '',
  };

  const totales = () => calcularTotalesCot({ ...cot, ret_pct: cot.ret_aplica ? cot.ret_pct_valor : 0 });

  // --- Resumen lateral ---
  const cajaResumen = el('div', { clase: 'tarjeta asistente-resumen' });
  function pintarResumen() {
    const t = totales();
    cajaResumen.innerHTML = '';
    cajaResumen.append(...[
      el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, editandoId && cotGuardada ? cotGuardada.folio : 'Resumen')),
      el('div', { clase: 'resumen-linea' }, el('span', {}, 'Cliente'), el('b', { style: 'text-align:right' }, cot.empresa ? cot.empresa.nombre : '—')),
      el('div', { clase: 'resumen-linea' }, el('span', {}, 'Ruta'), el('b', { style: 'text-align:right' }, cot.origen && cot.destino ? `${cot.origen} → ${cot.destino}` : '—')),
      el('div', { clase: 'resumen-linea' }, el('span', {}, 'Unidad'), el('b', { style: 'text-align:right' }, cot.unidad_texto || '—')),
      el('hr', { style: 'border:none;border-top:1px solid #eef0f3;margin:8px 0' }),
      el('div', { clase: 'resumen-linea' }, el('span', {}, 'Flete'), el('b', {}, UI.dinero(cot.tarifa, cot.moneda))),
      Number(cot.maniobras) > 0 ? el('div', { clase: 'resumen-linea' }, el('span', {}, 'Maniobras'), el('b', {}, UI.dinero(cot.maniobras, cot.moneda))) : null,
      Number(cot.seguro) > 0 ? el('div', { clase: 'resumen-linea' }, el('span', {}, 'Seguro'), el('b', {}, UI.dinero(cot.seguro, cot.moneda))) : null,
      Number(cot.otros) > 0 ? el('div', { clase: 'resumen-linea' }, el('span', {}, cot.otros_desc || 'Otros'), el('b', {}, UI.dinero(cot.otros, cot.moneda))) : null,
      el('div', { clase: 'resumen-linea' }, el('span', {}, 'Subtotal'), el('b', {}, UI.dinero(t.subtotal, cot.moneda))),
      el('div', { clase: 'resumen-linea' }, el('span', {}, `IVA ${cot.iva_pct}%`), el('b', {}, UI.dinero(t.iva, cot.moneda))),
      cot.ret_aplica ? el('div', { clase: 'resumen-linea' }, el('span', {}, `Retencion ${cot.ret_pct_valor}%`), el('b', {}, `- ${UI.dinero(t.retencion, cot.moneda)}`)) : null,
      el('div', { clase: 'resumen-total' }, el('span', {}, 'TOTAL'), el('span', {}, UI.dinero(t.total, cot.moneda))),
      el('div', { clase: 'ayuda', style: 'margin-top:8px' }, `Vigencia: ${cot.vigencia_dias} dias`),
    ].filter(Boolean));
  }

  // --- Stepper ---
  const barraPasos = el('div', { clase: 'pasos' });
  function pintarPasos() {
    barraPasos.innerHTML = '';
    PASOS.forEach((p, i) => {
      const hecho = i < pasoActual;
      const nodo = el('div', { clase: `paso${i === pasoActual ? ' activo' : ''}${hecho ? ' hecho' : ''}` },
        el('span', { clase: 'paso-num' }, hecho ? '✓' : String(i + 1)),
        p.titulo
      );
      if (hecho) nodo.addEventListener('click', () => { pasoActual = i; render(); });
      barraPasos.append(nodo);
    });
  }

  // --- Contenido de cada paso ---
  const zonaPaso = el('div', { clase: 'tarjeta' });

  async function cargarContactos() {
    if (!cot.empresa) { contactosEmpresa = []; return; }
    try {
      const e = await API.get(`/empresas/${cot.empresa.id}`);
      contactosEmpresa = e.contactos;
    } catch (err) { contactosEmpresa = []; }
  }

  function pasoCliente(zona) {
    const zonaContacto = el('div');
    const pintarContacto = () => {
      zonaContacto.innerHTML = '';
      if (!cot.empresa) return;
      zonaContacto.append(campo('Contacto que recibe la cotizacion',
        selector(
          [{ valor: '', texto: '— Sin contacto especifico —' }, ...contactosEmpresa.map((c) => ({ valor: c.id, texto: `${c.nombre}${c.puesto ? ` (${c.puesto})` : ''}` }))],
          cot.contacto_id, { alCambiar: (ev) => { cot.contacto_id = ev.target.value; } }
        )
      ));
    };
    zona.append(
      campoBloque('Cliente o prospecto *', selectorEmpresa({
        valorInicial: cot.empresa,
        alElegir: async (e) => {
          cot.empresa = e;
          cot.contacto_id = '';
          await cargarContactos();
          const principal = contactosEmpresa.find((c) => c.principal) || contactosEmpresa[0];
          if (principal) cot.contacto_id = principal.id;
          pintarContacto();
          pintarResumen();
        },
      })),
      zonaContacto
    );
    if (esGestion()) {
      zona.append(campo('Vendedor responsable', selector(
        usuariosActivos().map((u) => ({ valor: u.id, texto: u.nombre })),
        cot.vendedor_id, { alCambiar: (ev) => { cot.vendedor_id = Number(ev.target.value); } }
      )));
    }
    cargarContactos().then(pintarContacto);
  }

  function pasoRuta(zona) {
    const listaOrigenes = el('datalist', { id: 'lista-origenes' }, [...new Set(catalogos.rutas.map((r) => r.origen))].map((o) => el('option', { value: o })));
    const listaDestinos = el('datalist', { id: 'lista-destinos' }, [...new Set(catalogos.rutas.map((r) => r.destino))].map((o) => el('option', { value: o })));
    const inOrigen = entrada({ value: cot.origen, list: 'lista-origenes', placeholder: 'Ej. Monterrey, N.L.', alTeclear: (ev) => { cot.origen = ev.target.value; pintarResumen(); } });
    const inDestino = entrada({ value: cot.destino, list: 'lista-destinos', placeholder: 'Ej. Ciudad de Mexico', alTeclear: (ev) => { cot.destino = ev.target.value; pintarResumen(); } });
    const chipsTipo = el('div', { clase: 'chips' });
    const pintarTipo = () => {
      chipsTipo.innerHTML = '';
      for (const [clave, nombre] of Object.entries(TIPOS_SERVICIO_UI)) {
        chipsTipo.append(el('button', {
          clase: `chip${cot.tipo_servicio === clave ? ' activo' : ''}`, type: 'button',
          alClic: () => { cot.tipo_servicio = clave; pintarTipo(); },
        }, nombre));
      }
    };
    pintarTipo();
    zona.append(
      listaOrigenes, listaDestinos,
      el('div', { clase: 'forma-rejilla' },
        campo('Origen *', inOrigen),
        campo('Destino *', inDestino),
      ),
      el('button', {
        clase: 'btn btn-fantasma btn-chico', type: 'button', style: 'margin:-6px 0 12px',
        alClic: () => {
          const t = cot.origen; cot.origen = cot.destino; cot.destino = t;
          inOrigen.value = cot.origen; inDestino.value = cot.destino;
          pintarResumen();
        },
      }, icono('intercambio'), 'Invertir ruta'),
      campoBloque('Tipo de servicio', chipsTipo),
      el('div', { clase: 'forma-rejilla', style: 'margin-top:12px' },
        campo('Mercancia', entrada({ value: cot.mercancia, placeholder: 'Ej. tarimas de abarrotes, rollos de acero...', alTeclear: (ev) => { cot.mercancia = ev.target.value; } })),
        campo('Peso estimado (kg)', entrada({ type: 'number', min: '0', step: '1', value: cot.peso_kg, alTeclear: (ev) => { cot.peso_kg = ev.target.value; } })),
      )
    );
  }

  const avisoTarifa = el('div');
  async function sugerirTarifa() {
    avisoTarifa.innerHTML = '';
    if (!cot.origen.trim() || !cot.destino.trim() || !cot.unidad_id) return;
    try {
      const r = await API.get(`/tarifas/sugerir?origen=${encodeURIComponent(cot.origen.trim())}&destino=${encodeURIComponent(cot.destino.trim())}&unidad_id=${cot.unidad_id}`);
      if (r.tarifa) {
        const monto = r.tarifa.monto;
        avisoTarifa.append(el('div', { clase: 'aviso aviso-exito', style: 'display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap' },
          el('span', {}, `Tarifa de catalogo para esta ruta y unidad: ${UI.dinero(monto)}`),
          el('button', {
            clase: 'btn btn-exito btn-chico', type: 'button',
            alClic: () => { cot.tarifa = monto; pintarResumen(); render(); },
          }, 'Aplicar')
        ));
        if (!Number(cot.tarifa)) { cot.tarifa = monto; pintarResumen(); }
      } else {
        avisoTarifa.append(el('div', { clase: 'aviso aviso-info' }, 'No hay tarifa de catalogo para esta ruta y unidad; captura la tarifa en el paso de precio.'));
      }
    } catch (err) { /* sin sugerencia */ }
  }

  function pasoUnidad(zona) {
    const lista = el('div');
    const pintarUnidades = () => {
      lista.innerHTML = '';
      for (const u of catalogos.unidades) {
        const excedido = Number(cot.peso_kg) > 0 && u.capacidad_kg > 0 && Number(cot.peso_kg) > u.capacidad_kg;
        lista.append(el('div', {
          clase: `opcion-unidad${String(cot.unidad_id) === String(u.id) ? ' elegida' : ''}`,
          alClic: () => {
            cot.unidad_id = u.id;
            cot.unidad_texto = u.nombre;
            pintarUnidades();
            pintarResumen();
            sugerirTarifa();
          },
        },
          el('div', {},
            el('b', {}, u.nombre),
            el('small', {}, [u.capacidad_kg ? `Hasta ${UI.numero(u.capacidad_kg)} kg` : '', u.descripcion].filter(Boolean).join(' · '))
          ),
          excedido ? badge('peso excede', 'b-rojo') : (String(cot.unidad_id) === String(u.id) ? icono('check') : null)
        ));
      }
      const esOtra = !cot.unidad_id && cot.unidad_texto;
      lista.append(el('div', {
        clase: `opcion-unidad${esOtra ? ' elegida' : ''}`,
        alClic: () => { cot.unidad_id = ''; pintarUnidades(); },
      },
        el('div', { style: 'flex:1' },
          el('b', {}, 'Otra unidad'),
          esOtra || !cot.unidad_id ? entrada({
            value: cot.unidad_id ? '' : cot.unidad_texto, placeholder: 'Describe la unidad',
            style: 'margin-top:6px',
            alClic: (ev) => ev.stopPropagation(),
            alTeclear: (ev) => { cot.unidad_texto = ev.target.value; cot.unidad_id = ''; pintarResumen(); },
          }) : el('small', {}, 'Captura una unidad fuera del catalogo')
        )
      ));
    };
    pintarUnidades();
    zona.append(lista, avisoTarifa);
    sugerirTarifa();
  }

  function campoDinero(valorActual, alCambiar) {
    return entrada({ type: 'number', min: '0', step: '0.01', value: valorActual, placeholder: '0.00', alTeclear: (ev) => { alCambiar(ev.target.value); pintarResumen(); } });
  }

  function pasoCostos(zona) {
    zona.append(
      el('div', { clase: 'aviso aviso-info' }, 'Todos son opcionales; se suman al flete antes de impuestos.'),
      el('div', { clase: 'forma-rejilla' },
        campo('Maniobras de carga y descarga', campoDinero(cot.maniobras, (v) => { cot.maniobras = v; })),
        campo('Seguro de mercancia', campoDinero(cot.seguro, (v) => { cot.seguro = v; })),
        campo('Otros cargos', campoDinero(cot.otros, (v) => { cot.otros = v; })),
        campo('Descripcion de otros cargos', entrada({ value: cot.otros_desc, placeholder: 'Ej. estadia, custodia, pension', alTeclear: (ev) => { cot.otros_desc = ev.target.value; } })),
      )
    );
  }

  function pasoPrecio(zona) {
    const checkRet = el('input', { type: 'checkbox', checked: cot.ret_aplica });
    checkRet.addEventListener('change', () => { cot.ret_aplica = checkRet.checked; pintarResumen(); });
    zona.append(
      el('div', { clase: 'forma-rejilla' },
        campo('Tarifa del flete *', campoDinero(cot.tarifa, (v) => { cot.tarifa = v; }), 'Precio base del viaje, sin impuestos'),
        campo('Moneda', selector([{ valor: 'MXN', texto: 'MXN — pesos' }, { valor: 'USD', texto: 'USD — dolares' }], cot.moneda, { alCambiar: (ev) => { cot.moneda = ev.target.value; pintarResumen(); } })),
        campo('IVA %', entrada({ type: 'number', min: '0', step: '0.5', value: cot.iva_pct, alTeclear: (ev) => { cot.iva_pct = Number(ev.target.value) || 0; pintarResumen(); } })),
        campo('Vigencia (dias)', entrada({ type: 'number', min: '1', max: '120', value: cot.vigencia_dias, alTeclear: (ev) => { cot.vigencia_dias = Number(ev.target.value) || 15; pintarResumen(); } })),
      ),
      el('label', { clase: 'interruptor' }, checkRet,
        `Aplicar retencion de IVA del ${cot.ret_pct_valor}% (fletes a personas morales)`),
      campo('Condiciones que salen en el PDF', el('textarea', { rows: 7, alTeclear: (ev) => { cot.condiciones = ev.target.value; } }, cot.condiciones)),
      campo('Notas internas (no salen en el PDF)', el('textarea', { rows: 2, alTeclear: (ev) => { cot.notas = ev.target.value; } }, cot.notas))
    );
  }

  function pasoPrevia(zona) {
    const t = totales();
    const contacto = contactosEmpresa.find((c) => String(c.id) === String(cot.contacto_id));
    zona.append(
      el('div', { clase: 'previa' },
        el('div', { clase: 'previa-encabezado' },
          el('img', { src: '/logo-tauro.png', alt: 'Fletes Tauro' }),
          el('div', { style: 'text-align:right;font-size:12px;color:#6b6f78' }, Estado.config.empresa_nombre || 'FLETES TAURO')
        ),
        el('div', { clase: 'previa-banda' },
          el('span', {}, 'COTIZACION DE SERVICIO DE TRANSPORTE'),
          el('span', {}, editandoId && cotGuardada ? cotGuardada.folio : 'Folio al guardar')
        ),
        el('div', { clase: 'previa-seccion' },
          el('h4', {}, 'Cliente'),
          el('div', {}, el('b', {}, cot.empresa ? cot.empresa.nombre : '—')),
          contacto ? el('div', { style: 'color:#6b6f78' }, `Atencion: ${contacto.nombre}`) : null
        ),
        el('div', { clase: 'previa-seccion' },
          el('h4', {}, 'Servicio'),
          el('div', {}, `${cot.origen} → ${cot.destino} · ${TIPOS_SERVICIO_UI[cot.tipo_servicio]}`),
          el('div', { style: 'color:#6b6f78' }, [cot.unidad_texto, cot.mercancia, cot.peso_kg ? `${UI.numero(cot.peso_kg)} kg` : ''].filter(Boolean).join(' · '))
        ),
        el('div', { clase: 'previa-seccion' },
          el('h4', {}, 'Importes'),
          el('table', { clase: 'previa-tabla' },
            el('tr', {}, el('td', {}, `Flete (${cot.unidad_texto || 'unidad'})`), el('td', {}, UI.dinero(cot.tarifa, cot.moneda))),
            Number(cot.maniobras) > 0 ? el('tr', {}, el('td', {}, 'Maniobras'), el('td', {}, UI.dinero(cot.maniobras, cot.moneda))) : null,
            Number(cot.seguro) > 0 ? el('tr', {}, el('td', {}, 'Seguro de mercancia'), el('td', {}, UI.dinero(cot.seguro, cot.moneda))) : null,
            Number(cot.otros) > 0 ? el('tr', {}, el('td', {}, cot.otros_desc || 'Otros cargos'), el('td', {}, UI.dinero(cot.otros, cot.moneda))) : null,
            el('tr', {}, el('td', {}, 'Subtotal'), el('td', {}, UI.dinero(t.subtotal, cot.moneda))),
            el('tr', {}, el('td', {}, `IVA ${cot.iva_pct}%`), el('td', {}, UI.dinero(t.iva, cot.moneda))),
            cot.ret_aplica ? el('tr', {}, el('td', {}, `Retencion IVA ${cot.ret_pct_valor}%`), el('td', {}, `- ${UI.dinero(t.retencion, cot.moneda)}`)) : null,
          ),
          el('div', { clase: 'previa-total' }, el('span', {}, `TOTAL ${cot.moneda}`), el('span', {}, UI.dinero(t.total, cot.moneda)))
        ),
        el('div', { clase: 'previa-seccion' },
          el('h4', {}, `Vigencia: ${cot.vigencia_dias} dias`),
          el('div', { clase: 'previa-condiciones' }, cot.condiciones)
        )
      ),
      el('div', { clase: 'aviso aviso-info', style: 'margin-top:12px' },
        editandoId ? 'Al guardar se actualiza la cotizacion con estos datos.' : 'Al guardar se genera el folio consecutivo y podras descargar el PDF y enviarla.')
    );
  }

  function pasoEnvio(zona) {
    const c = cotGuardada;
    const recargarGuardada = async () => {
      cotGuardada = await API.get(`/cotizaciones/${c.id}`);
      render();
    };
    zona.append(...[
      el('div', { style: 'text-align:center;padding:6px 0 2px' },
        el('div', { style: 'font-size:13px;color:#6b6f78' }, 'Cotizacion guardada con folio'),
        el('div', { style: 'font-size:30px;font-weight:800;letter-spacing:-.02em;margin:2px 0 6px' }, c.folio),
        badgeCot(c.estatus),
        el('div', { style: 'font-size:14px;margin-top:8px' }, el('b', {}, UI.dinero(c.total, c.moneda)), ` · vigente hasta el ${UI.fecha(c.vigente_hasta)}`)
      ),
      el('div', { style: 'display:flex;flex-wrap:wrap;gap:9px;justify-content:center;margin-top:16px' },
        el('button', { clase: 'btn btn-oscuro', type: 'button', alClic: () => descargarPdfCot(c) }, icono('pdf'), 'Descargar PDF'),
        el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => modalCorreoCot(c, recargarGuardada) }, icono('correo'), 'Enviar por correo'),
        el('button', { clase: 'btn btn-exito', type: 'button', alClic: () => modalWhatsappCot(c, recargarGuardada) }, icono('whatsapp'), 'Enviar por WhatsApp'),
        c.estatus === 'borrador' ? el('button', {
          clase: 'btn btn-secundario', type: 'button',
          alClic: async () => {
            try { await API.put(`/cotizaciones/${c.id}/estatus`, { estatus: 'enviada' }); toast('Marcada como enviada.'); recargarGuardada(); }
            catch (err) { toast(err.message, 'error'); }
          },
        }, 'Marcar como enviada') : null,
      ),
      c.liga_pdf_publica ? el('div', { style: 'text-align:center;margin-top:14px' },
        el('button', {
          clase: 'btn btn-fantasma btn-chico', type: 'button',
          alClic: () => { navigator.clipboard.writeText(c.liga_pdf_publica).then(() => toast('Liga del PDF copiada.')); },
        }, icono('copiar'), 'Copiar liga publica del PDF')
      ) : null,
      el('div', { style: 'display:flex;gap:9px;justify-content:center;margin-top:18px;flex-wrap:wrap' },
        el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => irA(`/cotizaciones/${c.id}`) }, 'Ver detalle'),
        el('button', { clase: 'btn btn-fantasma', type: 'button', alClic: () => irA('/cotizaciones') }, 'Ir a cotizaciones'),
      ),
    ].filter(Boolean));
  }

  async function guardar(botonGuardar) {
    const datos = {
      empresa_id: cot.empresa.id,
      contacto_id: cot.contacto_id || null,
      vendedor_id: cot.vendedor_id,
      origen: cot.origen.trim(), destino: cot.destino.trim(),
      tipo_servicio: cot.tipo_servicio,
      unidad_id: cot.unidad_id || null, unidad_texto: cot.unidad_texto.trim(),
      mercancia: cot.mercancia.trim(), peso_kg: Number(cot.peso_kg) || 0,
      tarifa: Number(cot.tarifa) || 0, maniobras: Number(cot.maniobras) || 0,
      seguro: Number(cot.seguro) || 0, otros: Number(cot.otros) || 0,
      otros_desc: cot.otros_desc.trim(),
      iva_pct: cot.iva_pct, ret_pct: cot.ret_aplica ? cot.ret_pct_valor : 0,
      moneda: cot.moneda, vigencia_dias: cot.vigencia_dias,
      condiciones: cot.condiciones, notas: cot.notas,
    };
    botonGuardar.disabled = true;
    botonGuardar.textContent = 'Guardando...';
    try {
      const r = editandoId
        ? await API.put(`/cotizaciones/${editandoId}`, datos)
        : await API.post('/cotizaciones', datos);
      editandoId = r.id;
      cotGuardada = await API.get(`/cotizaciones/${r.id}`);
      toast(`Cotizacion ${cotGuardada.folio} guardada.`);
      pasoActual = 6;
      render();
    } catch (err) {
      toast(err.message, 'error');
      botonGuardar.disabled = false;
      botonGuardar.textContent = 'Guardar y generar folio';
    }
  }

  function render() {
    contenedor.innerHTML = '';
    pintarPasos();
    pintarResumen();
    zonaPaso.innerHTML = '';

    const zonaCampos = el('div');
    const renders = [pasoCliente, pasoRuta, pasoUnidad, pasoCostos, pasoPrecio, pasoPrevia, pasoEnvio];
    renders[pasoActual](zonaCampos);
    zonaPaso.append(
      el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, `${pasoActual + 1}. ${PASOS[pasoActual].titulo}`)),
      zonaCampos
    );

    if (pasoActual < 6) {
      const botonAtras = el('button', { clase: 'btn btn-secundario', type: 'button', disabled: pasoActual === 0 }, icono('izq'), 'Atras');
      botonAtras.addEventListener('click', () => { pasoActual -= 1; render(); });
      let botonSiguiente;
      if (pasoActual === 5) {
        botonSiguiente = el('button', { clase: 'btn btn-primario', type: 'button' }, editandoId ? 'Guardar cambios' : 'Guardar y generar folio');
        botonSiguiente.addEventListener('click', () => guardar(botonSiguiente));
      } else {
        botonSiguiente = el('button', { clase: 'btn btn-primario', type: 'button' }, 'Continuar', icono('der'));
        botonSiguiente.addEventListener('click', () => {
          const error = validaciones[pasoActual]();
          if (error) { toast(error, 'error'); return; }
          pasoActual += 1;
          render();
        });
      }
      zonaPaso.append(el('div', { clase: 'botones-paso' }, botonAtras, botonSiguiente));
    }

    contenedor.append(
      el('div', { clase: 'encabezado-vista' },
        el('div', {},
          el('h1', {}, editandoId && cotGuardada ? `Editar cotizacion ${cotGuardada.folio}` : 'Nueva cotizacion'),
          el('div', { clase: 'sub' }, 'Cliente → ruta y carga → servicio y unidad → costos → precio e impuestos → vista previa → PDF y envio')
        )
      ),
      barraPasos,
      el('div', { clase: 'asistente' }, zonaPaso, cajaResumen)
    );
  }

  render();
};

// ---------- Vista: detalle de cotizacion ----------

Vistas.cotizacionDetalle = async function (contenedor, params) {
  contenedor.innerHTML = '';
  contenedor.append(cargando());
  let c;
  try {
    c = await API.get(`/cotizaciones/${params.id}`);
  } catch (err) {
    contenedor.innerHTML = '';
    contenedor.append(vacio(err.message, '⚠️'));
    return;
  }
  contenedor.innerHTML = '';
  const recargar = () => Vistas.cotizacionDetalle(contenedor, params);

  const cambiarEstatus = async (estatus, motivo) => {
    try {
      await API.put(`/cotizaciones/${c.id}/estatus`, { estatus, motivo });
      toast('Estatus actualizado.');
      recargar();
    } catch (err) { toast(err.message, 'error'); }
  };

  const acciones = [];
  const puedeEditar = ['borrador', 'enviada', 'vencida'].includes(c.estatus);
  acciones.push(el('button', { clase: 'btn btn-oscuro', type: 'button', alClic: () => descargarPdfCot(c) }, icono('pdf'), 'PDF'));
  if (c.estatus !== 'convertida' && c.estatus !== 'rechazada') {
    acciones.push(el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => modalCorreoCot(c, recargar) }, icono('correo'), 'Correo'));
    acciones.push(el('button', { clase: 'btn btn-exito', type: 'button', alClic: () => modalWhatsappCot(c, recargar) }, icono('whatsapp'), 'WhatsApp'));
  }
  if (puedeEditar) {
    acciones.push(el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => irA(`/cotizaciones/nueva?editar=${c.id}`) }, icono('editar'), 'Editar'));
  }
  if (c.estatus === 'borrador') {
    acciones.push(el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => cambiarEstatus('enviada') }, 'Marcar enviada'));
  }
  if (['borrador', 'enviada'].includes(c.estatus)) {
    acciones.push(el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => cambiarEstatus('aceptada') }, icono('check'), 'Aceptada'));
    acciones.push(el('button', {
      clase: 'btn btn-fantasma', type: 'button',
      alClic: () => {
        const motivo = el('textarea', { rows: 2, placeholder: 'Ej. precio alto, eligio otra linea...' });
        const botonSi = el('button', { clase: 'btn btn-peligro', type: 'button' }, 'Marcar rechazada');
        const m = modal({
          titulo: `Rechazo de ${c.folio}`,
          cuerpo: campo('¿Por que la rechazo el cliente?', motivo),
          pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonSi],
        });
        botonSi.addEventListener('click', () => { m.cerrar(); cambiarEstatus('rechazada', motivo.value.trim()); });
      },
    }, 'Rechazada'));
  }
  if (['aceptada', 'enviada', 'borrador'].includes(c.estatus)) {
    acciones.push(el('button', { clase: 'btn btn-exito', type: 'button', alClic: () => modalConvertirCot(c, () => recargar()) }, icono('convertir'), 'Convertir en servicio'));
  }
  if (['rechazada', 'vencida', 'convertida'].includes(c.estatus)) {
    acciones.push(el('button', {
      clase: 'btn btn-secundario', type: 'button',
      alClic: async () => {
        try {
          const nueva = await API.post(`/cotizaciones/${c.id}/duplicar`);
          toast(`Copia creada: ${nueva.folio}.`);
          irA(`/cotizaciones/nueva?editar=${nueva.id}`);
        } catch (err) { toast(err.message, 'error'); }
      },
    }, icono('copiar'), 'Duplicar'));
  }
  if (Estado.usuario.rol === 'admin') {
    acciones.push(el('button', {
      clase: 'btn btn-fantasma', type: 'button', title: 'Eliminar',
      alClic: async () => {
        if (await confirmar('Eliminar cotizacion', `¿Eliminar ${c.folio} definitivamente?`)) {
          try { await API.del(`/cotizaciones/${c.id}`); toast('Cotizacion eliminada.'); irA('/cotizaciones'); }
          catch (err) { toast(err.message, 'error'); }
        }
      },
    }, icono('borrar')));
  }

  const t = { subtotal: c.subtotal, iva: c.iva, retencion: c.retencion, total: c.total };

  contenedor.append(
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'cabecera-detalle' },
        el('div', {},
          el('h1', {}, c.folio, badgeCot(c.estatus)),
          el('div', { clase: 'sub', style: 'margin-top:4px;color:#6b6f78;font-size:13px' },
            `Creada el ${UI.fecha(c.creado_en)} por ${c.vendedor_nombre || '—'} · Vigente hasta el ${UI.fecha(c.vigente_hasta)}`)
        ),
        el('div', { clase: 'acciones-vista' }, acciones)
      )
    ),
    el('div', { clase: 'rejilla-2' },
      el('div', { clase: 'tarjeta' },
        el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, 'Cliente')),
        el('div', { clase: 'lista-datos' },
          el('div', { clase: 'dato' }, el('span', {}, 'Empresa'), el('b', {}, el('a', { href: `#/empresas/${c.empresa_id}` }, c.empresa_nombre))),
          el('div', { clase: 'dato' }, el('span', {}, 'RFC'), el('b', {}, c.empresa_rfc || '—')),
          el('div', { clase: 'dato' }, el('span', {}, 'Atencion'), el('b', {}, c.contacto_nombre || '—')),
          el('div', { clase: 'dato' }, el('span', {}, 'Telefono'), el('b', {}, c.contacto_telefono || c.empresa_telefono || '—')),
          el('div', { clase: 'dato' }, el('span', {}, 'Correo'), el('b', {}, c.contacto_email || c.empresa_email || '—')),
        )
      ),
      el('div', { clase: 'tarjeta' },
        el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, 'Servicio')),
        el('div', { clase: 'lista-datos' },
          el('div', { clase: 'dato' }, el('span', {}, 'Origen'), el('b', {}, c.origen)),
          el('div', { clase: 'dato' }, el('span', {}, 'Destino'), el('b', {}, c.destino)),
          el('div', { clase: 'dato' }, el('span', {}, 'Tipo'), el('b', {}, TIPOS_SERVICIO_UI[c.tipo_servicio] || c.tipo_servicio)),
          el('div', { clase: 'dato' }, el('span', {}, 'Unidad'), el('b', {}, c.unidad_texto || '—')),
          el('div', { clase: 'dato' }, el('span', {}, 'Mercancia'), el('b', {}, c.mercancia || '—')),
          el('div', { clase: 'dato' }, el('span', {}, 'Peso'), el('b', {}, c.peso_kg ? `${UI.numero(c.peso_kg)} kg` : '—')),
        )
      )
    ),
    el('div', { clase: 'rejilla-2' },
      el('div', { clase: 'tarjeta' },
        el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, 'Importes')),
        el('table', { clase: 'previa-tabla', style: 'width:100%' },
          el('tr', {}, el('td', {}, `Flete ${c.origen} → ${c.destino}`), el('td', {}, UI.dinero(c.tarifa, c.moneda))),
          c.maniobras > 0 ? el('tr', {}, el('td', {}, 'Maniobras'), el('td', {}, UI.dinero(c.maniobras, c.moneda))) : null,
          c.seguro > 0 ? el('tr', {}, el('td', {}, 'Seguro de mercancia'), el('td', {}, UI.dinero(c.seguro, c.moneda))) : null,
          c.otros > 0 ? el('tr', {}, el('td', {}, c.otros_desc || 'Otros'), el('td', {}, UI.dinero(c.otros, c.moneda))) : null,
          el('tr', {}, el('td', {}, el('b', {}, 'Subtotal')), el('td', {}, el('b', {}, UI.dinero(t.subtotal, c.moneda)))),
          el('tr', {}, el('td', {}, `IVA ${c.iva_pct}%`), el('td', {}, UI.dinero(t.iva, c.moneda))),
          c.ret_pct > 0 ? el('tr', {}, el('td', {}, `Retencion IVA ${c.ret_pct}%`), el('td', {}, `- ${UI.dinero(t.retencion, c.moneda)}`)) : null,
        ),
        el('div', { clase: 'previa-total' }, el('span', {}, `TOTAL ${c.moneda}`), el('span', {}, UI.dinero(t.total, c.moneda))),
        c.liga_pdf_publica ? el('button', {
          clase: 'btn btn-fantasma btn-chico', type: 'button', style: 'margin-top:10px',
          alClic: () => navigator.clipboard.writeText(c.liga_pdf_publica).then(() => toast('Liga del PDF copiada.')),
        }, icono('copiar'), 'Copiar liga publica del PDF') : null,
        c.notas ? el('div', { clase: 'aviso aviso-alerta', style: 'margin-top:10px' }, `Notas internas: ${c.notas}`) : null
      ),
      el('div', { clase: 'tarjeta' },
        el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, 'Historial de esta cotizacion')),
        c.actividades.length
          ? el('div', { clase: 'linea-tiempo' }, c.actividades.map((a) => el('div', { clase: `evento e-${a.tipo}` },
            el('div', { clase: 'evento-titulo' }, a.titulo),
            a.descripcion ? el('div', { clase: 'evento-desc' }, a.descripcion) : null,
            el('div', { clase: 'evento-meta' }, `${a.usuario_nombre || 'Sistema'} · ${UI.fechaHora(a.fecha)}`)
          )))
          : el('div', { clase: 'ayuda' }, 'Sin movimientos todavia.')
      )
    )
  );
};

const VistasCot = { modalCorreoCot, modalWhatsappCot, modalConvertirCot, descargarPdfCot };
