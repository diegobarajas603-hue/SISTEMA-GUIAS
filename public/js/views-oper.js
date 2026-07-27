'use strict';
// Operacion: tareas completables con recordatorios y servicios realizados.

// ---------- Tareas ----------

function filaTareaNodo(t, alCambiar) {
  const hoy = UI.hoyLocal();
  const diaVence = String(t.vence_en || '').slice(0, 10);
  const vencida = t.estatus === 'pendiente' && diaVence && diaVence < hoy;
  const esHoy = t.estatus === 'pendiente' && diaVence === hoy;

  const check = el('button', {
    clase: `tarea-check${t.estatus === 'completada' ? ' hecha' : ''}`, type: 'button',
    title: t.estatus === 'completada' ? 'Reabrir' : 'Marcar completada',
  }, icono('check'));
  check.addEventListener('click', async () => {
    try {
      await API.post(`/tareas/${t.id}/${t.estatus === 'completada' ? 'reabrir' : 'completar'}`);
      if (t.estatus !== 'completada') toast('Tarea completada. ¡Bien hecho!');
      alCambiar();
    } catch (err) { toast(err.message, 'error'); }
  });

  return el('div', { clase: `tarea-fila${t.estatus === 'completada' ? ' completada' : ''}` },
    check,
    el('div', { clase: 'tarea-cuerpo' },
      el('div', { clase: 'tarea-titulo' }, t.titulo),
      t.descripcion ? el('div', { style: 'font-size:12.5px;color:#6b6f78;margin-top:1px;white-space:pre-line' }, t.descripcion) : null,
      el('div', { clase: 'tarea-meta' },
        el('span', { clase: `prio prio-${t.prioridad}`, title: `Prioridad ${t.prioridad}` }),
        t.empresa_id ? el('a', { href: `#/empresas/${t.empresa_id}` }, t.empresa_nombre || 'Ver empresa') : null,
        t.vence_en
          ? el('span', { style: vencida ? 'color:#b0161c;font-weight:700' : (esHoy ? 'color:#b97d10;font-weight:700' : '') },
            `${vencida ? '¡Vencida! ' : (esHoy ? 'Hoy ' : '')}${UI.fecha(diaVence)}${t.vence_en.includes('T') ? ` ${t.vence_en.slice(11, 16)}` : ''}`)
          : el('span', {}, 'Sin fecha'),
        t.asignado_nombre ? el('span', {}, `· ${t.asignado_nombre}`) : null,
      )
    ),
    el('div', { style: 'display:flex;gap:4px' },
      el('button', { clase: 'boton-contacto', type: 'button', title: 'Editar', alClic: () => modalTareaForma(t, null, alCambiar) }, icono('editar')),
      el('button', {
        clase: 'boton-contacto', type: 'button', title: 'Eliminar',
        alClic: async () => {
          if (await confirmar('Eliminar tarea', `¿Eliminar "${t.titulo}"?`)) {
            try { await API.del(`/tareas/${t.id}`); alCambiar(); } catch (err) { toast(err.message, 'error'); }
          }
        },
      }, icono('borrar')),
    )
  );
}

function modalTareaForma(tarea, contexto, alGuardar) {
  const esNueva = !tarea;
  const campos = {
    titulo: entrada({ value: tarea?.titulo || '', placeholder: 'Ej. Llamar para dar seguimiento a la cotizacion' }),
    descripcion: el('textarea', { rows: 2 }, tarea?.descripcion || ''),
    vence_fecha: entrada({ type: 'date', value: tarea?.vence_en ? String(tarea.vence_en).slice(0, 10) : UI.hoyLocal() }),
    vence_hora: entrada({ type: 'time', value: tarea?.vence_en && String(tarea.vence_en).includes('T') ? String(tarea.vence_en).slice(11, 16) : '' }),
    prioridad: selector([
      { valor: 'alta', texto: 'Alta' }, { valor: 'media', texto: 'Media' }, { valor: 'baja', texto: 'Baja' },
    ], tarea?.prioridad || 'media'),
    asignado_a: selector(usuariosActivos().map((u) => ({ valor: u.id, texto: u.nombre })), tarea?.asignado_a || Estado.usuario.id),
  };

  let empresaElegida = null;
  if (tarea?.empresa_id) empresaElegida = { id: tarea.empresa_id, nombre: tarea.empresa_nombre };
  else if (contexto?.empresa_id) empresaElegida = { id: contexto.empresa_id, nombre: contexto.empresa_nombre };
  const zonaEmpresa = contexto?.empresa_id || tarea?.empresa_id
    ? el('div', { clase: 'ayuda', style: 'margin-bottom:12px' }, `Ligada a: ${empresaElegida.nombre}`)
    : campoBloque('Ligar a empresa (opcional)', selectorEmpresa({
      valorInicial: null, permitirNueva: false,
      alElegir: (e) => { empresaElegida = e; },
    }));

  const botonGuardar = el('button', { clase: 'btn btn-primario', type: 'button' }, esNueva ? 'Crear tarea' : 'Guardar');
  const m = modal({
    titulo: esNueva ? 'Nueva tarea' : 'Editar tarea',
    cuerpo: el('div', {},
      campo('Titulo *', campos.titulo),
      campo('Detalle', campos.descripcion),
      el('div', { clase: 'forma-rejilla' },
        campo('Vence el', campos.vence_fecha),
        campo('Hora', campos.vence_hora),
        campo('Prioridad', campos.prioridad),
        campo('Asignada a', campos.asignado_a),
      ),
      zonaEmpresa
    ),
    pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonGuardar],
  });
  botonGuardar.addEventListener('click', async () => {
    if (!campos.titulo.value.trim()) { toast('Escribe el titulo de la tarea.', 'error'); return; }
    const venceEn = campos.vence_fecha.value
      ? `${campos.vence_fecha.value}${campos.vence_hora.value ? `T${campos.vence_hora.value}` : ''}`
      : '';
    const datos = {
      titulo: campos.titulo.value.trim(),
      descripcion: campos.descripcion.value.trim(),
      vence_en: venceEn,
      prioridad: campos.prioridad.value,
      asignado_a: Number(campos.asignado_a.value),
      empresa_id: empresaElegida ? empresaElegida.id : null,
    };
    botonGuardar.disabled = true;
    try {
      if (esNueva) await API.post('/tareas', datos);
      else await API.put(`/tareas/${tarea.id}`, datos);
      toast('Tarea guardada.');
      m.cerrar();
      if (alGuardar) alGuardar();
    } catch (err) {
      toast(err.message, 'error');
      botonGuardar.disabled = false;
    }
  });
}

Vistas.tareas = async function (contenedor) {
  contenedor.innerHTML = '';
  const filtros = { estatus: 'pendiente', asignado_a: String(Estado.usuario.id) };

  const cabecera = el('div', { clase: 'encabezado-vista' },
    el('div', {}, el('h1', {}, 'Tareas y recordatorios'), el('div', { clase: 'sub' }, 'Seguimientos, llamadas pendientes y compromisos del equipo')),
    el('div', { clase: 'acciones-vista' },
      el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => modalTareaForma(null, null, cargar) }, icono('mas'), 'Nueva tarea')
    )
  );

  const chips = el('div', { clase: 'chips' });
  const pintarChips = () => {
    chips.innerHTML = '';
    for (const [valor, nombre] of [['pendiente', 'Pendientes'], ['completada', 'Completadas'], ['', 'Todas']]) {
      chips.append(el('button', {
        clase: `chip${filtros.estatus === valor ? ' activo' : ''}`, type: 'button',
        alClic: () => { filtros.estatus = valor; pintarChips(); cargar(); },
      }, nombre));
    }
  };
  pintarChips();

  const barra = el('div', { clase: 'filtros' },
    chips,
    selector(
      [{ valor: '', texto: 'Todo el equipo' }, ...usuariosActivos().map((u) => ({ valor: u.id, texto: u.id === Estado.usuario.id ? `${u.nombre} (yo)` : u.nombre }))],
      filtros.asignado_a, { alCambiar: (ev) => { filtros.asignado_a = ev.target.value; cargar(); } }
    )
  );

  const zona = el('div');
  contenedor.append(cabecera, barra, zona);

  async function cargar() {
    zona.innerHTML = '';
    zona.append(cargando());
    const consulta = new URLSearchParams();
    if (filtros.estatus) consulta.set('estatus', filtros.estatus);
    if (filtros.asignado_a) consulta.set('asignado_a', filtros.asignado_a);
    try {
      const r = await API.get(`/tareas?${consulta}`);
      zona.innerHTML = '';
      if (!r.tareas.length) {
        zona.append(vacio('Nada por aqui. Crea una tarea o recordatorio con el boton de arriba.', '✅'));
        return;
      }
      const hoy = r.hoy;
      const grupos = { vencidas: [], hoy: [], proximas: [], sinFecha: [], completadas: [] };
      for (const t of r.tareas) {
        if (t.estatus === 'completada') { grupos.completadas.push(t); continue; }
        const dia = String(t.vence_en || '').slice(0, 10);
        if (!dia) grupos.sinFecha.push(t);
        else if (dia < hoy) grupos.vencidas.push(t);
        else if (dia === hoy) grupos.hoy.push(t);
        else grupos.proximas.push(t);
      }
      const seccion = (titulo, lista, claseExtra = '') => {
        if (!lista.length) return null;
        return el('div', {},
          el('div', { clase: `tarea-grupo-titulo ${claseExtra}` }, `${titulo} (${lista.length})`),
          lista.map((t) => filaTareaNodo(t, cargar))
        );
      };
      zona.append(...[
        seccion('Vencidas', grupos.vencidas, 'vencidas'),
        seccion('Para hoy', grupos.hoy),
        seccion('Proximas', grupos.proximas),
        seccion('Sin fecha', grupos.sinFecha),
        seccion('Completadas', grupos.completadas),
      ].filter(Boolean));
    } catch (err) {
      zona.innerHTML = '';
      zona.append(vacio(err.message, '⚠️'));
    }
  }
  await cargar();
};

// ---------- Servicios ----------

async function modalServicioForma(servicio, alGuardar) {
  const catalogos = await cargarCatalogos();
  const esNuevo = !servicio;
  let empresaElegida = servicio ? { id: servicio.empresa_id, nombre: servicio.empresa_nombre } : null;

  const listaUnidades = el('datalist', { id: 'lista-unidades-srv' }, catalogos.unidades.map((u) => el('option', { value: u.nombre })));
  const campos = {
    origen: entrada({ value: servicio?.origen || '', placeholder: 'Ej. Monterrey, N.L.' }),
    destino: entrada({ value: servicio?.destino || '', placeholder: 'Ej. Ciudad de Mexico' }),
    unidad_texto: entrada({ value: servicio?.unidad_texto || '', list: 'lista-unidades-srv' }),
    operador: entrada({ value: servicio?.operador || '' }),
    mercancia: entrada({ value: servicio?.mercancia || '' }),
    peso_kg: entrada({ type: 'number', min: '0', value: servicio?.peso_kg || '' }),
    fecha_carga: entrada({ type: 'date', value: servicio?.fecha_carga || UI.hoyLocal() }),
    fecha_entrega: entrada({ type: 'date', value: servicio?.fecha_entrega || '' }),
    monto: entrada({ type: 'number', min: '0', step: '0.01', value: servicio?.monto || '' }),
    moneda: selector([{ valor: 'MXN', texto: 'MXN' }, { valor: 'USD', texto: 'USD' }], servicio?.moneda || 'MXN'),
    factura: entrada({ value: servicio?.factura || '', placeholder: 'Folio de factura' }),
    notas: el('textarea', { rows: 2 }, servicio?.notas || ''),
  };

  const botonGuardar = el('button', { clase: 'btn btn-primario', type: 'button' }, esNuevo ? 'Registrar servicio' : 'Guardar');
  const m = modal({
    titulo: esNuevo ? 'Nuevo servicio (alta directa)' : `Editar servicio ${servicio.folio}`,
    grande: true,
    cuerpo: el('div', {},
      listaUnidades,
      esNuevo
        ? campoBloque('Cliente *', selectorEmpresa({ valorInicial: empresaElegida, alElegir: (e) => { empresaElegida = e; } }))
        : el('div', { clase: 'ayuda', style: 'margin-bottom:12px' }, `Cliente: ${servicio.empresa_nombre}${servicio.cotizacion_folio ? ` · Viene de la cotizacion ${servicio.cotizacion_folio}` : ''}`),
      el('div', { clase: 'forma-rejilla' },
        campo('Origen *', campos.origen),
        campo('Destino *', campos.destino),
        campo('Unidad', campos.unidad_texto),
        campo('Operador', campos.operador),
        campo('Mercancia', campos.mercancia),
        campo('Peso (kg)', campos.peso_kg),
        campo('Fecha de carga', campos.fecha_carga),
        campo('Fecha de entrega', campos.fecha_entrega),
        campo('Venta sin IVA *', campos.monto),
        campo('Moneda', campos.moneda),
        campo('Factura', campos.factura),
        el('div', { clase: 'ancho-total' }, campo('Notas', campos.notas)),
      )
    ),
    pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonGuardar],
  });

  botonGuardar.addEventListener('click', async () => {
    if (esNuevo && !empresaElegida) { toast('Elige el cliente del servicio.', 'error'); return; }
    if (!campos.origen.value.trim() || !campos.destino.value.trim()) { toast('Captura origen y destino.', 'error'); return; }
    const datos = {
      empresa_id: empresaElegida ? empresaElegida.id : undefined,
      origen: campos.origen.value.trim(),
      destino: campos.destino.value.trim(),
      unidad_texto: campos.unidad_texto.value.trim(),
      operador: campos.operador.value.trim(),
      mercancia: campos.mercancia.value.trim(),
      peso_kg: Number(campos.peso_kg.value) || 0,
      fecha_carga: campos.fecha_carga.value,
      fecha_entrega: campos.fecha_entrega.value || undefined,
      monto: Number(campos.monto.value) || 0,
      moneda: campos.moneda.value,
      factura: campos.factura.value.trim(),
      notas: campos.notas.value.trim(),
    };
    botonGuardar.disabled = true;
    try {
      if (esNuevo) await API.post('/servicios', datos);
      else await API.put(`/servicios/${servicio.id}`, datos);
      toast('Servicio guardado.');
      m.cerrar();
      if (alGuardar) alGuardar();
    } catch (err) {
      toast(err.message, 'error');
      botonGuardar.disabled = false;
    }
  });
}

Vistas.servicios = async function (contenedor) {
  contenedor.innerHTML = '';
  const filtros = { estatus: '', activos: '', mes: '', buscar: '' };

  const cabecera = el('div', { clase: 'encabezado-vista' },
    el('div', {}, el('h1', {}, 'Servicios'), el('div', { clase: 'sub' }, 'Fletes programados, en transito, entregados, facturados y pagados')),
    el('div', { clase: 'acciones-vista' },
      el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => modalServicioForma(null, cargar) }, icono('mas'), 'Nuevo servicio')
    )
  );

  const chips = el('div', { clase: 'chips' });
  const opciones = [['', '', 'Todos'], ['', '1', 'En curso'], ['entregado', '', 'Entregados'], ['facturado', '', 'Facturados'], ['pagado', '', 'Pagados'], ['cancelado', '', 'Cancelados']];
  const pintarChips = () => {
    chips.innerHTML = '';
    for (const [estatus, activos, nombre] of opciones) {
      const activo = filtros.estatus === estatus && filtros.activos === activos;
      chips.append(el('button', {
        clase: `chip${activo ? ' activo' : ''}`, type: 'button',
        alClic: () => { filtros.estatus = estatus; filtros.activos = activos; pintarChips(); cargar(); },
      }, nombre));
    }
  };
  pintarChips();

  const barra = el('div', { clase: 'filtros' },
    chips,
    entrada({ type: 'month', alCambiar: (ev) => { filtros.mes = ev.target.value; cargar(); } }),
    entrada({
      type: 'search', placeholder: 'Buscar folio, cliente, operador...',
      alTeclear: debounce((ev) => { filtros.buscar = ev.target.value.trim(); cargar(); }),
    })
  );

  const zona = el('div');
  contenedor.append(cabecera, barra, zona);

  async function cargar() {
    zona.innerHTML = '';
    zona.append(cargando());
    const consulta = new URLSearchParams();
    for (const [clave, valor] of Object.entries(filtros)) if (valor) consulta.set(clave, valor);
    try {
      const filas = await API.get(`/servicios?${consulta}`);
      zona.innerHTML = '';
      if (!filas.length) {
        zona.append(vacio('Sin servicios con esos filtros. Los servicios se crean al convertir una cotizacion aceptada o con alta directa.', '🚛'));
        return;
      }
      const total = filas.reduce((suma, f) => suma + (f.estatus !== 'cancelado' ? f.monto : 0), 0);
      zona.append(
        el('div', { clase: 'aviso aviso-info', style: 'display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px' },
          el('span', {}, `${filas.length} servicio(s) en la vista`),
          el('b', {}, `Venta (sin IVA): ${UI.dinero(total)}`)
        ),
        tabla([
          { titulo: 'Folio', clase: 'celda-principal', valor: (f) => el('div', {}, el('div', {}, f.folio), f.cotizacion_folio ? el('small', { style: 'color:#6b6f78;font-weight:400' }, `de ${f.cotizacion_folio}`) : null) },
          { titulo: 'Cliente', valor: (f) => el('a', { href: `#/empresas/${f.empresa_id}` }, f.empresa_nombre) },
          { titulo: 'Ruta', valor: (f) => `${f.origen} → ${f.destino}` },
          { titulo: 'Carga', valor: (f) => UI.fecha(f.fecha_carga) },
          { titulo: 'Unidad', valor: (f) => f.unidad_texto || '—' },
          { titulo: 'Venta', clase: 'num', valor: (f) => el('b', {}, UI.dinero(f.monto, f.moneda)) },
          {
            titulo: 'Estatus', valor: (f) => selector(
              Object.entries(ESTATUS_SRV_UI).map(([clave, e]) => ({ valor: clave, texto: e.nombre })),
              f.estatus,
              {
                alCambiar: async (ev) => {
                  try {
                    await API.put(`/servicios/${f.id}/estatus`, { estatus: ev.target.value });
                    toast('Estatus actualizado.');
                    cargar();
                  } catch (err) { toast(err.message, 'error'); cargar(); }
                },
              }
            ),
          },
          { titulo: '', valor: (f) => el('button', { clase: 'boton-contacto', type: 'button', title: 'Editar', alClic: () => modalServicioForma(f, cargar) }, icono('editar')) },
        ], filas)
      );
    } catch (err) {
      zona.innerHTML = '';
      zona.append(vacio(err.message, '⚠️'));
    }
  }
  await cargar();
};

const VistasOper = {
  modalTarea: modalTareaForma,
  filaTarea: filaTareaNodo,
  modalServicio: modalServicioForma,
};
