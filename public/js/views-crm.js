'use strict';
// Vistas de CRM: pipeline (kanban), lista de prospectos/clientes y
// expediente de empresa con contactos, historial, tareas y cotizaciones.

// ---------- Componente: selector de empresa con busqueda ----------

function selectorEmpresa({ valorInicial = null, alElegir, permitirNueva = true }) {
  const contenedor = el('div');
  let elegida = valorInicial; // {id, nombre, ...} o null

  const render = () => {
    contenedor.innerHTML = '';
    if (elegida) {
      contenedor.append(el('div', { clase: 'opcion-unidad elegida', style: 'margin-bottom:0' },
        el('div', {},
          el('b', {}, elegida.nombre),
          el('small', {}, [elegida.tipo === 'cliente' ? 'Cliente' : 'Prospecto', elegida.ciudad].filter(Boolean).join(' · '))
        ),
        el('button', { clase: 'btn btn-secundario btn-chico', type: 'button', alClic: () => { elegida = null; alElegir(null); render(); } }, 'Cambiar')
      ));
      return;
    }
    const resultados = el('div');
    const buscarAhora = debounce(async (texto) => {
      resultados.innerHTML = '';
      if (texto.length < 2) return;
      try {
        const filas = await API.get(`/empresas?buscar=${encodeURIComponent(texto)}`);
        if (!filas.length) {
          resultados.append(el('div', { clase: 'ayuda', style: 'padding:8px 2px' }, 'Sin resultados.'));
          return;
        }
        for (const fila of filas.slice(0, 8)) {
          resultados.append(el('div', {
            clase: 'opcion-unidad', style: 'margin-bottom:6px',
            alClic: () => { elegida = fila; alElegir(fila); render(); },
          },
            el('div', {},
              el('b', {}, fila.nombre),
              el('small', {}, [fila.tipo === 'cliente' ? 'Cliente' : 'Prospecto', fila.ciudad, fila.vendedor_nombre].filter(Boolean).join(' · '))
            ),
            badgeEtapa(fila.etapa)
          ));
        }
      } catch (err) { toast(err.message, 'error'); }
    });
    const entradaBusqueda = entrada({
      type: 'search', placeholder: 'Escribe el nombre del cliente o prospecto...',
      alTeclear: (ev) => buscarAhora(ev.target.value.trim()),
    });
    contenedor.append(entradaBusqueda, el('div', { style: 'margin-top:8px' }, resultados));
    if (permitirNueva) {
      contenedor.append(el('button', {
        clase: 'btn btn-secundario btn-chico', type: 'button', style: 'margin-top:4px',
        alClic: () => modalEmpresa(null, (nueva) => { elegida = nueva; alElegir(nueva); render(); }),
      }, icono('mas'), 'Registrar prospecto nuevo'));
    }
  };
  render();
  return contenedor;
}

// ---------- Modal: alta / edicion de empresa ----------

function modalEmpresa(empresa, alGuardar) {
  const esNueva = !empresa;
  const campos = {
    nombre: entrada({ value: empresa?.nombre || '', placeholder: 'Razon social o nombre' }),
    tipo: selector([
      { valor: 'prospecto', texto: 'Prospecto' },
      { valor: 'cliente', texto: 'Cliente' },
    ], empresa?.tipo || 'prospecto'),
    rfc: entrada({ value: empresa?.rfc || '', placeholder: 'XAXX010101000', style: 'text-transform:uppercase' }),
    giro: entrada({ value: empresa?.giro || '', placeholder: 'Ej. alimentos, acero, retail' }),
    origen_lead: entrada({ value: empresa?.origen_lead || '', placeholder: 'Ej. recomendacion, pagina web, llamada en frio' }),
    telefono: entrada({ type: 'tel', value: empresa?.telefono || '' }),
    email: entrada({ type: 'email', value: empresa?.email || '' }),
    direccion: entrada({ value: empresa?.direccion || '' }),
    ciudad: entrada({ value: empresa?.ciudad || '' }),
    estado_dir: entrada({ value: empresa?.estado_dir || '' }),
    vendedor_id: selector(
      [{ valor: '', texto: '— Sin asignar —' }, ...usuariosActivos().map((u) => ({ valor: u.id, texto: u.nombre }))],
      empresa?.vendedor_id ?? Estado.usuario.id
    ),
    notas: el('textarea', { rows: 2 }, empresa?.notas || ''),
    contacto_nombre: entrada({ placeholder: 'Nombre de la persona' }),
    contacto_puesto: entrada({ placeholder: 'Ej. Jefe de trafico' }),
    contacto_telefono: entrada({ type: 'tel', placeholder: '10 digitos' }),
    contacto_email: entrada({ type: 'email' }),
  };
  if (!esGestion()) campos.vendedor_id.disabled = true;

  const cuerpo = el('div', {},
    el('div', { clase: 'forma-rejilla' },
      el('div', { clase: 'ancho-total' }, campo('Nombre de la empresa *', campos.nombre)),
      campo('Tipo', campos.tipo),
      campo('Vendedor asignado', campos.vendedor_id),
      campo('RFC', campos.rfc),
      campo('Giro', campos.giro),
      campo('Telefono', campos.telefono),
      campo('Correo', campos.email),
      el('div', { clase: 'ancho-total' }, campo('Direccion', campos.direccion)),
      campo('Ciudad', campos.ciudad),
      campo('Estado', campos.estado_dir),
      campo('¿Como nos encontro?', campos.origen_lead),
      el('div', { clase: 'ancho-total' }, campo('Notas', campos.notas)),
    ),
    esNueva ? el('div', {},
      el('div', { clase: 'tarjeta-titulo', style: 'margin-top:4px' }, el('h2', {}, 'Contacto principal (opcional)')),
      el('div', { clase: 'forma-rejilla' },
        campo('Nombre', campos.contacto_nombre),
        campo('Puesto', campos.contacto_puesto),
        campo('Telefono / WhatsApp', campos.contacto_telefono),
        campo('Correo', campos.contacto_email),
      )
    ) : null
  );

  const botonGuardar = el('button', { clase: 'btn btn-primario', type: 'button' }, esNueva ? 'Registrar' : 'Guardar cambios');
  const m = modal({
    titulo: esNueva ? 'Nuevo prospecto / cliente' : `Editar ${empresa.nombre}`,
    cuerpo, grande: true,
    pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonGuardar],
  });

  botonGuardar.addEventListener('click', async () => {
    const datos = {
      nombre: campos.nombre.value.trim(),
      tipo: campos.tipo.value,
      rfc: campos.rfc.value.trim(),
      giro: campos.giro.value.trim(),
      origen_lead: campos.origen_lead.value.trim(),
      telefono: campos.telefono.value.trim(),
      email: campos.email.value.trim(),
      direccion: campos.direccion.value.trim(),
      ciudad: campos.ciudad.value.trim(),
      estado_dir: campos.estado_dir.value.trim(),
      vendedor_id: campos.vendedor_id.value || null,
      notas: campos.notas.value.trim(),
    };
    if (!datos.nombre) { toast('Escribe el nombre de la empresa.', 'error'); return; }
    if (esNueva) {
      datos.contacto_nombre = campos.contacto_nombre.value.trim();
      datos.contacto_puesto = campos.contacto_puesto.value.trim();
      datos.contacto_telefono = campos.contacto_telefono.value.trim();
      datos.contacto_email = campos.contacto_email.value.trim();
    }
    botonGuardar.disabled = true;
    try {
      const guardada = esNueva ? await API.post('/empresas', datos) : await API.put(`/empresas/${empresa.id}`, datos);
      toast(esNueva ? 'Prospecto registrado.' : 'Datos guardados.');
      m.cerrar();
      if (alGuardar) alGuardar(guardada);
    } catch (err) {
      toast(err.message, 'error');
      botonGuardar.disabled = false;
    }
  });
}

// ---------- Modal: contacto ----------

function modalContacto(empresaId, contacto, alGuardar) {
  const esNuevo = !contacto;
  const campos = {
    nombre: entrada({ value: contacto?.nombre || '' }),
    puesto: entrada({ value: contacto?.puesto || '' }),
    telefono: entrada({ type: 'tel', value: contacto?.telefono || '' }),
    whatsapp: entrada({ type: 'tel', value: contacto?.whatsapp || '', placeholder: 'Si es distinto al telefono' }),
    email: entrada({ type: 'email', value: contacto?.email || '' }),
    notas: el('textarea', { rows: 2 }, contacto?.notas || ''),
    principal: el('input', { type: 'checkbox', checked: contacto ? Boolean(contacto.principal) : true }),
  };
  const botonGuardar = el('button', { clase: 'btn btn-primario', type: 'button' }, 'Guardar');
  const m = modal({
    titulo: esNuevo ? 'Nuevo contacto' : `Editar contacto`,
    cuerpo: el('div', {},
      el('div', { clase: 'forma-rejilla' },
        campo('Nombre *', campos.nombre),
        campo('Puesto', campos.puesto),
        campo('Telefono', campos.telefono),
        campo('WhatsApp', campos.whatsapp),
        el('div', { clase: 'ancho-total' }, campo('Correo', campos.email)),
        el('div', { clase: 'ancho-total' }, campo('Notas', campos.notas)),
      ),
      el('label', { clase: 'interruptor' }, campos.principal, 'Contacto principal')
    ),
    pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonGuardar],
  });
  botonGuardar.addEventListener('click', async () => {
    const datos = {
      nombre: campos.nombre.value.trim(),
      puesto: campos.puesto.value.trim(),
      telefono: campos.telefono.value.trim(),
      whatsapp: campos.whatsapp.value.trim(),
      email: campos.email.value.trim(),
      notas: campos.notas.value.trim(),
      principal: campos.principal.checked,
    };
    if (!datos.nombre) { toast('Escribe el nombre del contacto.', 'error'); return; }
    botonGuardar.disabled = true;
    try {
      if (esNuevo) await API.post(`/empresas/${empresaId}/contactos`, datos);
      else await API.put(`/contactos/${contacto.id}`, datos);
      toast('Contacto guardado.');
      m.cerrar();
      if (alGuardar) alGuardar();
    } catch (err) {
      toast(err.message, 'error');
      botonGuardar.disabled = false;
    }
  });
}

// ---------- Modal: registrar actividad (llamada, mensaje, seguimiento) ----------

function modalActividad(empresa, alGuardar, tipoInicial = 'llamada') {
  let tipo = tipoInicial;
  const chips = el('div', { clase: 'chips', style: 'margin-bottom:13px' });
  const pintarChips = () => {
    chips.innerHTML = '';
    for (const t of TIPOS_ACTIVIDAD_UI) {
      chips.append(el('button', {
        clase: `chip${t.clave === tipo ? ' activo' : ''}`, type: 'button',
        alClic: () => { tipo = t.clave; pintarChips(); },
      }, t.nombre));
    }
  };
  pintarChips();
  const descripcion = el('textarea', { rows: 4, placeholder: '¿Que se hablo? ¿Que sigue?' });
  const botonGuardar = el('button', { clase: 'btn btn-primario', type: 'button' }, 'Registrar');
  const m = modal({
    titulo: `Registrar actividad — ${empresa.nombre}`,
    cuerpo: el('div', {}, chips, campo('Descripcion *', descripcion)),
    pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonGuardar],
  });
  botonGuardar.addEventListener('click', async () => {
    if (!descripcion.value.trim()) { toast('Describe la actividad.', 'error'); return; }
    botonGuardar.disabled = true;
    try {
      await API.post(`/empresas/${empresa.id}/actividades`, { tipo, descripcion: descripcion.value.trim() });
      toast('Actividad registrada.');
      m.cerrar();
      if (alGuardar) alGuardar();
    } catch (err) {
      toast(err.message, 'error');
      botonGuardar.disabled = false;
    }
  });
}

// ---------- Cambio de etapa (con motivo si es perdido) ----------

async function cambiarEtapa(empresa, etapa, alTerminar) {
  if (etapa === 'perdido') {
    const motivo = el('textarea', { rows: 2, placeholder: 'Ej. precio, se fue con otra linea, ya no respondio...' });
    const botonSi = el('button', { clase: 'btn btn-peligro', type: 'button' }, 'Marcar como perdido');
    const m = modal({
      titulo: `Marcar ${empresa.nombre} como perdido`,
      cuerpo: campo('¿Por que se perdio?', motivo),
      pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonSi],
    });
    botonSi.addEventListener('click', async () => {
      try {
        await API.put(`/empresas/${empresa.id}/etapa`, { etapa, motivo: motivo.value.trim() });
        toast('Etapa actualizada.');
        m.cerrar();
        alTerminar();
      } catch (err) { toast(err.message, 'error'); }
    });
    return;
  }
  try {
    await API.put(`/empresas/${empresa.id}/etapa`, { etapa });
    toast(etapa === 'ganado' ? '¡Prospecto ganado! Ahora es cliente.' : 'Etapa actualizada.');
    alTerminar();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Vista: pipeline (kanban) ----------

Vistas.pipeline = async function (contenedor) {
  contenedor.innerHTML = '';
  const filtros = { vendedor_id: '', buscar: '' };

  const cabecera = el('div', { clase: 'encabezado-vista' },
    el('div', {}, el('h1', {}, 'Pipeline de ventas'), el('div', { clase: 'sub' }, 'Arrastra las tarjetas o usa "Mover a..." para avanzar prospectos')),
    el('div', { clase: 'acciones-vista' },
      el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => modalEmpresa(null, () => Vistas.pipeline(contenedor)) }, icono('mas'), 'Nuevo prospecto')
    )
  );

  const barraFiltros = el('div', { clase: 'filtros' },
    entrada({
      type: 'search', placeholder: 'Filtrar por nombre...',
      alTeclear: debounce((ev) => { filtros.buscar = ev.target.value.trim(); pintar(); }),
    }),
    selector(
      [{ valor: '', texto: 'Todos los vendedores' }, ...usuariosActivos().map((u) => ({ valor: u.id, texto: u.nombre }))],
      '', { alCambiar: (ev) => { filtros.vendedor_id = ev.target.value; pintar(); } }
    )
  );

  const zona = el('div');
  contenedor.append(cabecera, barraFiltros, zona);

  let empresas = [];
  const cargar = async () => {
    zona.innerHTML = '';
    zona.append(cargando());
    try {
      empresas = await API.get('/empresas');
      pintar();
    } catch (err) {
      zona.innerHTML = '';
      zona.append(vacio(err.message, '⚠️'));
    }
  };

  const pintar = () => {
    zona.innerHTML = '';
    const visibles = empresas.filter((e) =>
      (!filtros.vendedor_id || String(e.vendedor_id) === filtros.vendedor_id) &&
      (!filtros.buscar || e.nombre.toLowerCase().includes(filtros.buscar.toLowerCase()))
    );
    const board = el('div', { clase: 'kanban' });
    for (const etapa of ETAPAS_UI) {
      const tarjetas = visibles.filter((e) => e.etapa === etapa.clave);
      const columna = el('div', { clase: 'kanban-columna', dataset: { etapa: etapa.clave } });
      const montoAbierto = tarjetas.reduce((suma, e) => suma + (e.cot_abiertas_monto || 0), 0);
      columna.append(el('div', { clase: 'kanban-encabezado' },
        el('span', {}, etapa.nombre),
        el('span', { clase: 'conteo' }, String(tarjetas.length))
      ));
      if (montoAbierto > 0) {
        columna.append(el('div', { style: 'font-size:11px;color:#178a4c;font-weight:700;padding:0 4px 8px' }, `${UI.dinero(montoAbierto)} en cotizaciones`));
      }
      for (const e of tarjetas) {
        const tarjeta = el('div', { clase: 'kanban-tarjeta', draggable: true },
          el('div', { clase: 'kt-nombre' }, e.nombre),
          el('div', { clase: 'kt-datos' },
            el('span', {}, [e.tipo === 'cliente' ? 'Cliente' : 'Prospecto', e.ciudad].filter(Boolean).join(' · ')),
            e.contacto_nombre ? el('span', {}, `Contacto: ${e.contacto_nombre}`) : null,
            e.ultima_actividad ? el('span', {}, `Ultimo movimiento: ${UI.relativo(e.ultima_actividad)}`) : null,
          ),
          el('div', { clase: 'kt-pie' },
            el('div', { style: 'display:flex;align-items:center;gap:6px' },
              avatar(e.vendedor_nombre, true),
              e.cot_abiertas > 0 ? el('span', { clase: 'kt-monto' }, UI.dinero(e.cot_abiertas_monto)) : null
            ),
            selector(
              [{ valor: '', texto: 'Mover a...' }, ...ETAPAS_UI.filter((x) => x.clave !== e.etapa).map((x) => ({ valor: x.clave, texto: x.nombre }))],
              '', { alCambiar: (ev) => { if (ev.target.value) cambiarEtapa(e, ev.target.value, cargar); } }
            )
          )
        );
        tarjeta.addEventListener('click', (ev) => { if (!ev.target.closest('select')) irA(`/empresas/${e.id}`); });
        tarjeta.addEventListener('dragstart', (ev) => {
          ev.dataTransfer.setData('text/plain', String(e.id));
          tarjeta.classList.add('arrastrando');
        });
        tarjeta.addEventListener('dragend', () => tarjeta.classList.remove('arrastrando'));
        columna.append(tarjeta);
      }
      columna.addEventListener('dragover', (ev) => { ev.preventDefault(); columna.classList.add('receptora'); });
      columna.addEventListener('dragleave', () => columna.classList.remove('receptora'));
      columna.addEventListener('drop', (ev) => {
        ev.preventDefault();
        columna.classList.remove('receptora');
        const id = Number(ev.dataTransfer.getData('text/plain'));
        const empresa = empresas.find((x) => x.id === id);
        if (empresa && empresa.etapa !== etapa.clave) cambiarEtapa(empresa, etapa.clave, cargar);
      });
      board.append(columna);
    }
    zona.append(board);
  };

  await cargar();
};

// ---------- Vista: lista de empresas ----------

Vistas.empresas = async function (contenedor, params = {}) {
  contenedor.innerHTML = '';
  const filtros = { tipo: params.tipo || '', etapa: '', vendedor_id: '', buscar: '' };

  const cabecera = el('div', { clase: 'encabezado-vista' },
    el('div', {}, el('h1', {}, 'Prospectos y clientes'), el('div', { clase: 'sub' }, 'Registro completo de empresas y personas con las que vendemos')),
    el('div', { clase: 'acciones-vista' },
      el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => modalEmpresa(null, (e) => irA(`/empresas/${e.id}`)) }, icono('mas'), 'Nueva empresa')
    )
  );

  const chipsTipo = el('div', { clase: 'chips' });
  const pintarChips = () => {
    chipsTipo.innerHTML = '';
    for (const [valor, nombre] of [['', 'Todos'], ['prospecto', 'Prospectos'], ['cliente', 'Clientes']]) {
      chipsTipo.append(el('button', {
        clase: `chip${filtros.tipo === valor ? ' activo' : ''}`, type: 'button',
        alClic: () => { filtros.tipo = valor; pintarChips(); cargar(); },
      }, nombre));
    }
  };
  pintarChips();

  const barraFiltros = el('div', { clase: 'filtros' },
    chipsTipo,
    entrada({
      type: 'search', placeholder: 'Buscar por nombre, RFC, telefono...',
      alTeclear: debounce((ev) => { filtros.buscar = ev.target.value.trim(); cargar(); }),
    }),
    selector([{ valor: '', texto: 'Todas las etapas' }, ...ETAPAS_UI.map((e) => ({ valor: e.clave, texto: e.nombre }))],
      '', { alCambiar: (ev) => { filtros.etapa = ev.target.value; cargar(); } }),
    selector([{ valor: '', texto: 'Todos los vendedores' }, ...usuariosActivos().map((u) => ({ valor: u.id, texto: u.nombre }))],
      '', { alCambiar: (ev) => { filtros.vendedor_id = ev.target.value; cargar(); } })
  );

  const zona = el('div');
  contenedor.append(cabecera, barraFiltros, zona);

  async function cargar() {
    zona.innerHTML = '';
    zona.append(cargando());
    const consulta = new URLSearchParams();
    for (const [clave, valor] of Object.entries(filtros)) if (valor) consulta.set(clave, valor);
    try {
      const filas = await API.get(`/empresas?${consulta}`);
      zona.innerHTML = '';
      if (!filas.length) {
        zona.append(vacio('No hay empresas con esos filtros. Registra tu primer prospecto con el boton "Nueva empresa".', '🏢'));
        return;
      }
      zona.append(tabla([
        { titulo: 'Nombre', clase: 'celda-principal', valor: (f) => el('div', {}, el('div', {}, f.nombre), el('small', { style: 'color:#6b6f78;font-weight:400' }, [f.ciudad, f.giro].filter(Boolean).join(' · '))) },
        { titulo: 'Tipo', valor: (f) => badge(f.tipo === 'cliente' ? 'Cliente' : 'Prospecto', f.tipo === 'cliente' ? 'b-verde' : 'b-azul') },
        { titulo: 'Etapa', valor: (f) => badgeEtapa(f.etapa) },
        { titulo: 'Vendedor', valor: (f) => f.vendedor_nombre || '—' },
        { titulo: 'Telefono', valor: (f) => f.telefono || '—' },
        { titulo: 'Cot. abiertas', clase: 'num', valor: (f) => f.cot_abiertas ? `${f.cot_abiertas} (${UI.dinero(f.cot_abiertas_monto)})` : '—' },
        { titulo: 'Ultimo mov.', valor: (f) => UI.relativo(f.ultima_actividad) },
      ], filas, { alClic: (f) => irA(`/empresas/${f.id}`) }));
    } catch (err) {
      zona.innerHTML = '';
      zona.append(vacio(err.message, '⚠️'));
    }
  }
  await cargar();
};

// ---------- Vista: expediente de empresa ----------

Vistas.empresaDetalle = async function (contenedor, params) {
  contenedor.innerHTML = '';
  contenedor.append(cargando());
  let empresa;
  try {
    empresa = await API.get(`/empresas/${params.id}`);
  } catch (err) {
    contenedor.innerHTML = '';
    contenedor.append(vacio(err.message, '⚠️'));
    return;
  }
  contenedor.innerHTML = '';
  const recargar = () => Vistas.empresaDetalle(contenedor, params);

  // Encabezado
  const chipsEtapa = el('div', { clase: 'chips', style: 'margin-top:10px' });
  for (const e of ETAPAS_UI) {
    chipsEtapa.append(el('button', {
      clase: `chip${empresa.etapa === e.clave ? ' activo' : ''}`, type: 'button',
      alClic: () => { if (empresa.etapa !== e.clave) cambiarEtapa(empresa, e.clave, recargar); },
    }, e.nombre));
  }

  const cabecera = el('div', { clase: 'tarjeta' },
    el('div', { clase: 'cabecera-detalle' },
      el('div', {},
        el('h1', {}, empresa.nombre,
          badge(empresa.tipo === 'cliente' ? 'Cliente' : 'Prospecto', empresa.tipo === 'cliente' ? 'b-verde' : 'b-azul'),
          badgeEtapa(empresa.etapa)
        ),
        el('div', { clase: 'sub', style: 'margin-top:4px;color:#6b6f78;font-size:13px' },
          [empresa.giro, [empresa.ciudad, empresa.estado_dir].filter(Boolean).join(', '), empresa.origen_lead ? `Origen: ${empresa.origen_lead}` : '']
            .filter(Boolean).join(' · ') || 'Sin datos adicionales'),
        empresa.motivo_perdida && empresa.etapa === 'perdido'
          ? el('div', { clase: 'aviso aviso-alerta', style: 'margin-top:8px' }, `Motivo de perdida: ${empresa.motivo_perdida}`) : null,
      ),
      el('div', { clase: 'acciones-vista' },
        el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => irA(`/cotizaciones/nueva?empresa=${empresa.id}`) }, icono('cotizaciones'), 'Cotizar'),
        el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => modalActividad(empresa, recargar) }, icono('tel'), 'Registrar actividad'),
        el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => VistasOper.modalTarea(null, { empresa_id: empresa.id, empresa_nombre: empresa.nombre }, recargar) }, icono('tareas'), 'Tarea'),
        el('button', { clase: 'btn btn-fantasma', type: 'button', alClic: () => modalEmpresa(empresa, recargar) }, icono('editar'), 'Editar'),
        Estado.usuario.rol === 'admin' ? el('button', {
          clase: 'btn btn-fantasma', type: 'button',
          alClic: async () => {
            if (await confirmar('Eliminar empresa', `¿Eliminar "${empresa.nombre}" y todo su historial? Esta accion no se puede deshacer.`)) {
              try { await API.del(`/empresas/${empresa.id}`); toast('Empresa eliminada.'); irA('/empresas'); }
              catch (err) { toast(err.message, 'error'); }
            }
          },
        }, icono('borrar')) : null,
      )
    ),
    el('div', { clase: 'lista-datos', style: 'margin-top:14px' },
      el('div', { clase: 'dato' }, el('span', {}, 'RFC'), el('b', {}, empresa.rfc || '—')),
      el('div', { clase: 'dato' }, el('span', {}, 'Telefono'), el('b', {}, empresa.telefono || '—')),
      el('div', { clase: 'dato' }, el('span', {}, 'Correo'), el('b', {}, empresa.email || '—')),
      el('div', { clase: 'dato' }, el('span', {}, 'Vendedor'), el('b', {}, empresa.vendedor_nombre || 'Sin asignar')),
      el('div', { clase: 'dato' }, el('span', {}, 'Alta'), el('b', {}, UI.fecha(empresa.creado_en))),
      empresa.convertido_en ? el('div', { clase: 'dato' }, el('span', {}, 'Cliente desde'), el('b', {}, UI.fecha(empresa.convertido_en))) : null,
    ),
    empresa.notas ? el('div', { style: 'margin-top:10px;font-size:13px;color:#6b6f78;white-space:pre-line' }, `Notas: ${empresa.notas}`) : null,
    chipsEtapa
  );

  // Columna izquierda: contactos + tareas
  const listaContactos = el('div');
  if (!empresa.contactos.length) listaContactos.append(el('div', { clase: 'ayuda' }, 'Sin contactos registrados.'));
  for (const c of empresa.contactos) {
    const wa = (c.whatsapp || c.telefono || '').replace(/\D+/g, '');
    listaContactos.append(el('div', { clase: 'contacto-fila' },
      el('div', { clase: 'contacto-info' },
        el('b', {}, c.nombre, c.principal ? badge('principal', 'b-negro') : null),
        el('small', {}, [c.puesto, c.telefono, c.email].filter(Boolean).join(' · ') || '—')
      ),
      el('div', { clase: 'contacto-acciones' },
        c.telefono ? el('a', { clase: 'boton-contacto', href: `tel:${c.telefono}`, title: 'Llamar' }, icono('tel')) : null,
        wa ? el('a', { clase: 'boton-contacto', href: `https://wa.me/${wa.length === 10 ? '52' + wa : wa}`, target: '_blank', title: 'WhatsApp' }, icono('whatsapp')) : null,
        c.email ? el('a', { clase: 'boton-contacto', href: `mailto:${c.email}`, title: 'Correo' }, icono('correo')) : null,
        el('button', { clase: 'boton-contacto', type: 'button', title: 'Editar', alClic: () => modalContacto(empresa.id, c, recargar) }, icono('editar')),
        el('button', {
          clase: 'boton-contacto', type: 'button', title: 'Eliminar',
          alClic: async () => {
            if (await confirmar('Eliminar contacto', `¿Eliminar a ${c.nombre}?`)) {
              try { await API.del(`/contactos/${c.id}`); recargar(); } catch (err) { toast(err.message, 'error'); }
            }
          },
        }, icono('borrar')),
      )
    ));
  }
  const tarjetaContactos = el('div', { clase: 'tarjeta' },
    el('div', { clase: 'tarjeta-titulo' },
      el('h2', {}, 'Contactos'),
      el('button', { clase: 'btn btn-secundario btn-chico', type: 'button', alClic: () => modalContacto(empresa.id, null, recargar) }, icono('mas'), 'Agregar')
    ),
    listaContactos
  );

  const pendientes = empresa.tareas.filter((t) => t.estatus === 'pendiente');
  const tarjetaTareas = el('div', { clase: 'tarjeta' },
    el('div', { clase: 'tarjeta-titulo' },
      el('h2', {}, 'Tareas pendientes'),
      el('span', { clase: 'extra' }, `${pendientes.length}`)
    ),
    pendientes.length
      ? pendientes.map((t) => VistasOper.filaTarea(t, recargar))
      : el('div', { clase: 'ayuda' }, 'Nada pendiente con esta empresa.')
  );

  // Columna derecha: pestanas
  const zonaPestana = el('div');
  let pestanaActiva = 'actividad';
  const pintarPestana = () => {
    zonaPestana.innerHTML = '';
    if (pestanaActiva === 'actividad') {
      if (!empresa.actividades.length) { zonaPestana.append(vacio('Aun no hay actividad registrada.', '📞')); return; }
      const lt = el('div', { clase: 'linea-tiempo' });
      for (const a of empresa.actividades) {
        lt.append(el('div', { clase: `evento e-${a.tipo}` },
          el('div', { clase: 'evento-titulo' }, a.titulo),
          a.descripcion ? el('div', { clase: 'evento-desc' }, a.descripcion) : null,
          el('div', { clase: 'evento-meta' }, `${a.usuario_nombre || 'Sistema'} · ${UI.fechaHora(a.fecha)}${a.cotizacion_folio ? ` · ${a.cotizacion_folio}` : ''}`)
        ));
      }
      zonaPestana.append(lt);
    } else if (pestanaActiva === 'cotizaciones') {
      if (!empresa.cotizaciones.length) { zonaPestana.append(vacio('Sin cotizaciones. Crea la primera con el boton "Cotizar".', '📄')); return; }
      zonaPestana.append(tabla([
        { titulo: 'Folio', clase: 'celda-principal', valor: (f) => f.folio },
        { titulo: 'Ruta', valor: (f) => `${f.origen} → ${f.destino}` },
        { titulo: 'Total', clase: 'num', valor: (f) => UI.dinero(f.total, f.moneda) },
        { titulo: 'Estatus', valor: (f) => badgeCot(f.estatus) },
        { titulo: 'Vigencia', valor: (f) => UI.fecha(f.vigente_hasta) },
      ], empresa.cotizaciones, { alClic: (f) => irA(`/cotizaciones/${f.id}`) }));
    } else {
      if (!empresa.servicios.length) { zonaPestana.append(vacio('Sin servicios registrados todavia.', '🚛')); return; }
      zonaPestana.append(tabla([
        { titulo: 'Folio', clase: 'celda-principal', valor: (f) => f.folio },
        { titulo: 'Ruta', valor: (f) => `${f.origen} → ${f.destino}` },
        { titulo: 'Fecha carga', valor: (f) => UI.fecha(f.fecha_carga) },
        { titulo: 'Venta', clase: 'num', valor: (f) => UI.dinero(f.monto, f.moneda) },
        { titulo: 'Estatus', valor: (f) => badgeSrv(f.estatus) },
      ], empresa.servicios, { alClic: () => irA('/servicios') }));
    }
  };
  const pestanas = el('div', { clase: 'pestanas' });
  const definiciones = [
    ['actividad', `Historial (${empresa.actividades.length})`],
    ['cotizaciones', `Cotizaciones (${empresa.cotizaciones.length})`],
    ['servicios', `Servicios (${empresa.servicios.length})`],
  ];
  const pintarPestanas = () => {
    pestanas.innerHTML = '';
    for (const [clave, nombre] of definiciones) {
      pestanas.append(el('button', {
        clase: `pestana${pestanaActiva === clave ? ' activa' : ''}`, type: 'button',
        alClic: () => { pestanaActiva = clave; pintarPestanas(); pintarPestana(); },
      }, nombre));
    }
  };
  pintarPestanas();
  pintarPestana();

  contenedor.append(
    cabecera,
    el('div', { clase: 'rejilla-2', style: 'grid-template-columns: 340px 1fr; align-items:start' },
      el('div', {}, tarjetaContactos, tarjetaTareas),
      el('div', { clase: 'tarjeta' }, pestanas, zonaPestana)
    )
  );
  // en pantallas chicas la rejilla se apila via CSS (media query pisa el inline grid)
  if (window.matchMedia('(max-width: 960px)').matches) {
    const rejilla = contenedor.querySelector('.rejilla-2');
    rejilla.style.gridTemplateColumns = '1fr';
  }
};

const VistasCRM = { modalEmpresa, modalContacto, modalActividad, selectorEmpresa };
