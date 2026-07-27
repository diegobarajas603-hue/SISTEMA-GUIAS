'use strict';
// Administracion: reportes comerciales, catalogos (rutas, unidades,
// tarifas, vendedores), usuarios del equipo y configuracion del sistema.

// ---------- Reportes ----------

function graficaBarras(datos, formato = (v) => UI.dinero(v)) {
  if (!datos.length) return vacio('Sin datos en el rango elegido.', '📊');
  const maximo = Math.max(...datos.map((d) => d.valor), 1);
  const cont = el('div', { clase: 'grafica-barras' });
  for (const d of datos) {
    const alto = Math.max(4, Math.round((d.valor / maximo) * 140));
    cont.append(el('div', { clase: 'barra-col' },
      el('div', { clase: 'barra-valor' }, d.valor ? formato(d.valor) : ''),
      el('div', { clase: 'barra-pila' }, el('div', { clase: 'barra', style: `height:${alto}px`, title: `${d.etiqueta}: ${formato(d.valor)}` })),
      el('div', { clase: 'barra-etiqueta' }, d.etiqueta)
    ));
  }
  return cont;
}

function mesBonito(ym) {
  const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const [a, m] = String(ym).split('-').map(Number);
  return `${nombres[(m || 1) - 1]} ${String(a).slice(2)}`;
}

Vistas.reportes = async function (contenedor) {
  contenedor.innerHTML = '';
  const hoy = UI.hoyLocal();
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const finMes = (ym) => {
    const [a, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  };
  const filtros = { desde: inicioMes, hasta: finMes(hoy.slice(0, 7)), vendedor_id: '' };

  const presets = [
    { nombre: 'Este mes', calcular: () => [inicioMes, finMes(hoy.slice(0, 7))] },
    {
      nombre: 'Mes anterior',
      calcular: () => {
        const [a, m] = hoy.slice(0, 7).split('-').map(Number);
        const anterior = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
        return [`${anterior}-01`, finMes(anterior)];
      },
    },
    {
      nombre: 'Ultimos 3 meses',
      calcular: () => {
        const [a, m] = hoy.slice(0, 7).split('-').map(Number);
        const fecha = new Date(Date.UTC(a, m - 3, 1));
        return [fecha.toISOString().slice(0, 10), finMes(hoy.slice(0, 7))];
      },
    },
    { nombre: 'Este año', calcular: () => [`${hoy.slice(0, 4)}-01-01`, `${hoy.slice(0, 4)}-12-31`] },
  ];
  let presetActivo = 'Este mes';

  const inDesde = entrada({ type: 'date', value: filtros.desde, alCambiar: (ev) => { filtros.desde = ev.target.value; presetActivo = ''; pintarPresets(); cargar(); } });
  const inHasta = entrada({ type: 'date', value: filtros.hasta, alCambiar: (ev) => { filtros.hasta = ev.target.value; presetActivo = ''; pintarPresets(); cargar(); } });

  const chipsPresets = el('div', { clase: 'chips' });
  const pintarPresets = () => {
    chipsPresets.innerHTML = '';
    for (const p of presets) {
      chipsPresets.append(el('button', {
        clase: `chip${presetActivo === p.nombre ? ' activo' : ''}`, type: 'button',
        alClic: () => {
          presetActivo = p.nombre;
          [filtros.desde, filtros.hasta] = p.calcular();
          inDesde.value = filtros.desde;
          inHasta.value = filtros.hasta;
          pintarPresets();
          cargar();
        },
      }, p.nombre));
    }
  };
  pintarPresets();

  const barra = el('div', { clase: 'filtros' },
    chipsPresets, inDesde, el('span', { style: 'color:#6b6f78' }, 'a'), inHasta,
    selector([{ valor: '', texto: 'Todo el equipo' }, ...usuariosActivos().map((u) => ({ valor: u.id, texto: u.nombre }))],
      '', { alCambiar: (ev) => { filtros.vendedor_id = ev.target.value; cargar(); } })
  );

  const zona = el('div');
  contenedor.append(
    el('div', { clase: 'encabezado-vista' },
      el('div', {}, el('h1', {}, 'Reportes comerciales'), el('div', { clase: 'sub' }, 'Calculados en vivo con la informacion real del sistema'))
    ),
    barra, zona
  );

  async function cargar() {
    zona.innerHTML = '';
    zona.append(cargando('Calculando...'));
    try {
      const r = await API.get(`/reportes/comercial?desde=${filtros.desde}&hasta=${filtros.hasta}${filtros.vendedor_id ? `&vendedor_id=${filtros.vendedor_id}` : ''}`);
      zona.innerHTML = '';

      zona.append(el('div', { clase: 'kpis' },
        el('div', { clase: 'kpi kpi-negro', alClic: () => irA('/cotizaciones') },
          el('div', { clase: 'kpi-valor' }, String(r.cotizaciones.emitidas)),
          el('div', { clase: 'kpi-nombre' }, 'Cotizaciones emitidas'),
          el('div', { clase: 'kpi-extra' }, UI.dinero(r.cotizaciones.monto_emitido))),
        el('div', { clase: 'kpi kpi-verde' },
          el('div', { clase: 'kpi-valor' }, String(r.cotizaciones.ganadas)),
          el('div', { clase: 'kpi-nombre' }, 'Cotizaciones ganadas'),
          el('div', { clase: 'kpi-extra' }, UI.dinero(r.cotizaciones.monto_ganado))),
        el('div', { clase: 'kpi kpi-ambar' },
          el('div', { clase: 'kpi-valor' }, `${r.cotizaciones.tasa_conversion}%`),
          el('div', { clase: 'kpi-nombre' }, 'Tasa de conversion'),
          el('div', { clase: 'kpi-extra' }, 'ganadas vs. decididas')),
        el('div', { clase: 'kpi', alClic: () => irA('/servicios') },
          el('div', { clase: 'kpi-valor' }, UI.dinero(r.venta.total)),
          el('div', { clase: 'kpi-nombre' }, 'Venta (sin IVA)'),
          el('div', { clase: 'kpi-extra' }, `${r.venta.servicios} servicio(s)`)),
        el('div', { clase: 'kpi kpi-azul', alClic: () => irA('/pipeline') },
          el('div', { clase: 'kpi-valor' }, `${r.prospectos.nuevos} / ${r.prospectos.convertidos}`),
          el('div', { clase: 'kpi-nombre' }, 'Prospectos nuevos / convertidos'),
          el('div', { clase: 'kpi-extra' }, 'en el rango elegido')),
      ));

      const porEstatus = Object.entries(r.cotizaciones.por_estatus)
        .map(([clave, n]) => `${(ESTATUS_COT_UI[clave] || { nombre: clave }).nombre}: ${n}`).join(' · ');

      zona.append(el('div', { clase: 'rejilla-2' },
        el('div', { clase: 'tarjeta' },
          el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, 'Venta por mes (sin IVA)')),
          graficaBarras(r.venta.por_mes.map((m) => ({ etiqueta: mesBonito(m.mes), valor: m.monto })),
            (v) => `$${Math.round(v / 1000)}k`),
        ),
        el('div', { clase: 'tarjeta' },
          el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, 'Embudo de prospectos (hoy)')),
          (() => {
            const etapas = ETAPAS_UI.filter((e) => !['ganado', 'perdido'].includes(e.clave));
            const maximo = Math.max(...etapas.map((e) => r.prospectos.pipeline[e.clave] || 0), 1);
            const nodo = el('div');
            for (const e of etapas) {
              const n = r.prospectos.pipeline[e.clave] || 0;
              nodo.append(el('div', { clase: 'embudo-fila' },
                el('span', {}, e.nombre),
                el('div', { clase: 'embudo-barra', style: `width:${Math.max(3, (n / maximo) * 100)}%` }),
                el('b', {}, String(n))
              ));
            }
            nodo.append(el('div', { clase: 'ayuda', style: 'margin-top:8px' }, porEstatus ? `Cotizaciones del rango — ${porEstatus}` : ''));
            return nodo;
          })()
        )
      ));

      const tarjetaTabla = (titulo, columnas, filas, csv) => el('div', { clase: 'tarjeta' },
        el('div', { clase: 'tarjeta-titulo' },
          el('h2', {}, titulo),
          filas.length ? el('button', { clase: 'btn btn-fantasma btn-chico', type: 'button', alClic: csv }, 'Exportar CSV') : null
        ),
        filas.length ? tabla(columnas, filas) : el('div', { clase: 'ayuda' }, 'Sin datos en el rango.')
      );

      zona.append(tarjetaTabla('Desempeno por vendedor', [
        { titulo: 'Vendedor', clase: 'celda-principal', valor: (f) => f.nombre },
        { titulo: 'Cotizadas', clase: 'num', valor: (f) => `${f.cot_emitidas} (${UI.dinero(f.cot_monto)})` },
        { titulo: 'Ganadas', clase: 'num', valor: (f) => `${f.cot_ganadas} (${UI.dinero(f.monto_ganado)})` },
        { titulo: '% exito', clase: 'num', valor: (f) => f.cot_emitidas ? `${Math.round((f.cot_ganadas / f.cot_emitidas) * 100)}%` : '—' },
        { titulo: 'Servicios', clase: 'num', valor: (f) => String(f.servicios) },
        { titulo: 'Venta', clase: 'num', valor: (f) => el('b', {}, UI.dinero(f.venta)) },
      ], r.por_vendedor, () => exportarCSV(`vendedores_${filtros.desde}_${filtros.hasta}.csv`,
        ['Vendedor', 'Cotizadas', 'Monto cotizado', 'Ganadas', 'Monto ganado', 'Servicios', 'Venta'],
        r.por_vendedor.map((f) => [f.nombre, f.cot_emitidas, f.cot_monto, f.cot_ganadas, f.monto_ganado, f.servicios, f.venta]))));

      zona.append(el('div', { clase: 'rejilla-2' },
        tarjetaTabla('Top clientes por venta', [
          { titulo: 'Cliente', clase: 'celda-principal', valor: (f) => el('a', { href: `#/empresas/${f.empresa_id}` }, f.nombre) },
          { titulo: 'Servicios', clase: 'num', valor: (f) => String(f.n) },
          { titulo: 'Venta', clase: 'num', valor: (f) => el('b', {}, UI.dinero(f.monto)) },
        ], r.top_clientes, () => exportarCSV(`clientes_${filtros.desde}_${filtros.hasta}.csv`,
          ['Cliente', 'Servicios', 'Venta'], r.top_clientes.map((f) => [f.nombre, f.n, f.monto]))),
        tarjetaTabla('Rutas mas vendidas', [
          { titulo: 'Ruta', clase: 'celda-principal', valor: (f) => f.ruta },
          { titulo: 'Viajes', clase: 'num', valor: (f) => String(f.n) },
          { titulo: 'Venta', clase: 'num', valor: (f) => el('b', {}, UI.dinero(f.monto)) },
        ], r.por_ruta, () => exportarCSV(`rutas_${filtros.desde}_${filtros.hasta}.csv`,
          ['Ruta', 'Viajes', 'Venta'], r.por_ruta.map((f) => [f.ruta, f.n, f.monto])))
      ));
    } catch (err) {
      zona.innerHTML = '';
      zona.append(vacio(err.message, '⚠️'));
    }
  }
  await cargar();
};

// ---------- Catalogos ----------

Vistas.catalogos = async function (contenedor) {
  contenedor.innerHTML = '';
  contenedor.append(cargando());
  await cargarCatalogos(true);
  contenedor.innerHTML = '';
  const puedeEditar = esGestion();
  let pestana = 'rutas';

  const zona = el('div');
  const pestanas = el('div', { clase: 'pestanas' });
  const definiciones = [['rutas', 'Rutas'], ['unidades', 'Unidades'], ['tarifas', 'Tarifas'], ['vendedores', 'Vendedores']];
  const pintarPestanas = () => {
    pestanas.innerHTML = '';
    for (const [clave, nombre] of definiciones) {
      pestanas.append(el('button', {
        clase: `pestana${pestana === clave ? ' activa' : ''}`, type: 'button',
        alClic: () => { pestana = clave; pintarPestanas(); pintar(); },
      }, nombre));
    }
  };

  const recargar = async () => { await cargarCatalogos(true); pintar(); };

  function modalRuta(ruta) {
    const campos = {
      origen: entrada({ value: ruta?.origen || '' }),
      destino: entrada({ value: ruta?.destino || '' }),
      km: entrada({ type: 'number', min: '0', value: ruta?.km || '' }),
      horas: entrada({ type: 'number', min: '0', step: '0.5', value: ruta?.horas || '' }),
    };
    const botonGuardar = el('button', { clase: 'btn btn-primario', type: 'button' }, 'Guardar');
    const m = modal({
      titulo: ruta ? 'Editar ruta' : 'Nueva ruta',
      cuerpo: el('div', { clase: 'forma-rejilla' },
        campo('Origen *', campos.origen), campo('Destino *', campos.destino),
        campo('Kilometros', campos.km), campo('Horas aprox.', campos.horas),
      ),
      pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonGuardar],
    });
    botonGuardar.addEventListener('click', async () => {
      const datos = { origen: campos.origen.value.trim(), destino: campos.destino.value.trim(), km: Number(campos.km.value) || 0, horas: Number(campos.horas.value) || 0 };
      if (!datos.origen || !datos.destino) { toast('Origen y destino son obligatorios.', 'error'); return; }
      try {
        if (ruta) await API.put(`/rutas/${ruta.id}`, datos);
        else await API.post('/rutas', datos);
        toast('Ruta guardada.');
        m.cerrar();
        recargar();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  function modalUnidad(unidad) {
    const campos = {
      nombre: entrada({ value: unidad?.nombre || '' }),
      capacidad_kg: entrada({ type: 'number', min: '0', value: unidad?.capacidad_kg || '' }),
      descripcion: entrada({ value: unidad?.descripcion || '' }),
    };
    const botonGuardar = el('button', { clase: 'btn btn-primario', type: 'button' }, 'Guardar');
    const m = modal({
      titulo: unidad ? 'Editar unidad' : 'Nueva unidad',
      cuerpo: el('div', {},
        campo('Nombre *', campos.nombre),
        el('div', { clase: 'forma-rejilla' },
          campo('Capacidad (kg)', campos.capacidad_kg),
          campo('Descripcion', campos.descripcion),
        )
      ),
      pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonGuardar],
    });
    botonGuardar.addEventListener('click', async () => {
      const datos = { nombre: campos.nombre.value.trim(), capacidad_kg: Number(campos.capacidad_kg.value) || 0, descripcion: campos.descripcion.value.trim() };
      if (!datos.nombre) { toast('Escribe el nombre de la unidad.', 'error'); return; }
      try {
        if (unidad) await API.put(`/unidades/${unidad.id}`, datos);
        else await API.post('/unidades', datos);
        toast('Unidad guardada.');
        m.cerrar();
        recargar();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  function modalTarifa(tarifa) {
    const { rutas, unidades } = Estado.catalogos;
    const campos = {
      ruta_id: selector(rutas.map((r) => ({ valor: r.id, texto: `${r.origen} → ${r.destino}` })), tarifa?.ruta_id),
      unidad_id: selector(unidades.map((u) => ({ valor: u.id, texto: u.nombre })), tarifa?.unidad_id),
      monto: entrada({ type: 'number', min: '0', step: '0.01', value: tarifa?.monto || '' }),
      notas: entrada({ value: tarifa?.notas || '', placeholder: 'Ej. tarifa 2026, incluye casetas' }),
    };
    if (tarifa) { campos.ruta_id.disabled = true; campos.unidad_id.disabled = true; }
    const botonGuardar = el('button', { clase: 'btn btn-primario', type: 'button' }, 'Guardar');
    const m = modal({
      titulo: tarifa ? 'Editar tarifa' : 'Nueva tarifa',
      cuerpo: el('div', {},
        campo('Ruta *', campos.ruta_id),
        campo('Unidad *', campos.unidad_id),
        el('div', { clase: 'forma-rejilla' },
          campo('Tarifa (sin IVA) *', campos.monto),
          campo('Notas', campos.notas),
        ),
        el('div', { clase: 'ayuda' }, 'El asistente de cotizacion sugiere esta tarifa cuando coinciden la ruta y la unidad.')
      ),
      pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonGuardar],
    });
    botonGuardar.addEventListener('click', async () => {
      const monto = Number(campos.monto.value) || 0;
      if (monto <= 0) { toast('La tarifa debe ser mayor a cero.', 'error'); return; }
      try {
        if (tarifa) await API.put(`/tarifas/${tarifa.id}`, { monto, notas: campos.notas.value.trim() });
        else await API.post('/tarifas', { ruta_id: Number(campos.ruta_id.value), unidad_id: Number(campos.unidad_id.value), monto, notas: campos.notas.value.trim() });
        toast('Tarifa guardada.');
        m.cerrar();
        recargar();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  const botonBorrar = (ruta, alConfirmar) => el('button', {
    clase: 'boton-contacto', type: 'button', title: 'Eliminar',
    alClic: async () => { if (await confirmar('Eliminar', '¿Seguro que quieres eliminar este registro?')) alConfirmar(); },
  }, icono('borrar'));

  function pintar() {
    zona.innerHTML = '';
    const { rutas, unidades, tarifas } = Estado.catalogos;

    if (pestana === 'rutas') {
      if (puedeEditar) zona.append(el('div', { style: 'margin-bottom:12px' }, el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => modalRuta(null) }, icono('mas'), 'Nueva ruta')));
      zona.append(tabla([
        { titulo: 'Origen', clase: 'celda-principal', valor: (f) => f.origen },
        { titulo: 'Destino', clase: 'celda-principal', valor: (f) => f.destino },
        { titulo: 'Km', clase: 'num', valor: (f) => f.km ? UI.numero(f.km) : '—' },
        { titulo: 'Horas', clase: 'num', valor: (f) => f.horas || '—' },
        {
          titulo: '', valor: (f) => puedeEditar ? el('div', { style: 'display:flex;gap:4px;justify-content:flex-end' },
            el('button', { clase: 'boton-contacto', type: 'button', title: 'Editar', alClic: () => modalRuta(f) }, icono('editar')),
            botonBorrar(f, async () => { try { await API.del(`/rutas/${f.id}`); recargar(); } catch (err) { toast(err.message, 'error'); } })
          ) : null,
        },
      ], rutas));
    } else if (pestana === 'unidades') {
      if (puedeEditar) zona.append(el('div', { style: 'margin-bottom:12px' }, el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => modalUnidad(null) }, icono('mas'), 'Nueva unidad')));
      zona.append(tabla([
        { titulo: 'Unidad', clase: 'celda-principal', valor: (f) => f.nombre },
        { titulo: 'Capacidad', clase: 'num', valor: (f) => f.capacidad_kg ? `${UI.numero(f.capacidad_kg)} kg` : '—' },
        { titulo: 'Descripcion', valor: (f) => f.descripcion || '—' },
        {
          titulo: '', valor: (f) => puedeEditar ? el('div', { style: 'display:flex;gap:4px;justify-content:flex-end' },
            el('button', { clase: 'boton-contacto', type: 'button', title: 'Editar', alClic: () => modalUnidad(f) }, icono('editar')),
            botonBorrar(f, async () => { try { await API.del(`/unidades/${f.id}`); recargar(); } catch (err) { toast(err.message, 'error'); } })
          ) : null,
        },
      ], unidades));
    } else if (pestana === 'tarifas') {
      if (puedeEditar) zona.append(el('div', { style: 'margin-bottom:12px' }, el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => modalTarifa(null) }, icono('mas'), 'Nueva tarifa')));
      zona.append(tarifas.length ? tabla([
        { titulo: 'Ruta', clase: 'celda-principal', valor: (f) => `${f.origen} → ${f.destino}` },
        { titulo: 'Unidad', valor: (f) => f.unidad_nombre },
        { titulo: 'Tarifa', clase: 'num', valor: (f) => el('b', {}, UI.dinero(f.monto)) },
        { titulo: 'Notas', valor: (f) => f.notas || '—' },
        { titulo: 'Actualizada', valor: (f) => UI.fecha(f.actualizado_en) },
        {
          titulo: '', valor: (f) => puedeEditar ? el('div', { style: 'display:flex;gap:4px;justify-content:flex-end' },
            el('button', { clase: 'boton-contacto', type: 'button', title: 'Editar', alClic: () => modalTarifa(f) }, icono('editar')),
            botonBorrar(f, async () => { try { await API.del(`/tarifas/${f.id}`); recargar(); } catch (err) { toast(err.message, 'error'); } })
          ) : null,
        },
      ], tarifas) : vacio('Aun no hay tarifas. Registra la tarifa base de cada ruta y unidad para que el asistente de cotizacion la sugiera solo.', '💰'));
    } else {
      const vendedores = Estado.usuarios.filter((u) => u.activo);
      zona.append(
        el('div', { clase: 'aviso aviso-info' },
          Estado.usuario.rol === 'admin'
            ? 'Los vendedores se administran en la seccion Usuarios (crear, roles y contrasenas).'
            : 'Solo el administrador puede dar de alta o modificar usuarios.'),
        tabla([
          { titulo: 'Nombre', clase: 'celda-principal', valor: (f) => el('div', { style: 'display:flex;align-items:center;gap:9px' }, avatar(f.nombre, true), f.nombre) },
          { titulo: 'Rol', valor: (f) => badge(f.rol, f.rol === 'admin' ? 'b-rojo' : (f.rol === 'gerente' ? 'b-morado' : 'b-azul')) },
          { titulo: 'Correo', valor: (f) => f.email || '—' },
          { titulo: 'Telefono', valor: (f) => f.telefono || '—' },
        ], vendedores)
      );
    }
  }

  pintarPestanas();
  pintar();
  contenedor.append(
    el('div', { clase: 'encabezado-vista' },
      el('div', {}, el('h1', {}, 'Catalogos'), el('div', { clase: 'sub' }, 'Rutas, tipos de unidad, tarifas base y vendedores'))
    ),
    el('div', { clase: 'tarjeta' }, pestanas, zona)
  );
};

// ---------- Usuarios ----------

function modalUsuario(usuario, alGuardar) {
  const esNuevo = !usuario;
  const campos = {
    nombre: entrada({ value: usuario?.nombre || '', placeholder: 'Nombre y apellido' }),
    usuario: entrada({ value: usuario?.usuario || '', placeholder: 'usuario de acceso (sin espacios)', disabled: !esNuevo }),
    rol: selector([
      { valor: 'vendedor', texto: 'Vendedor — captura y da seguimiento a lo suyo' },
      { valor: 'gerente', texto: 'Gerente — ve y edita todo, administra catalogos' },
      { valor: 'admin', texto: 'Administrador — todo, incluye usuarios y configuracion' },
    ], usuario?.rol || 'vendedor'),
    email: entrada({ type: 'email', value: usuario?.email || '' }),
    telefono: entrada({ type: 'tel', value: usuario?.telefono || '' }),
    password: entrada({ type: 'password', placeholder: 'Minimo 6 caracteres' }),
    activo: el('input', { type: 'checkbox', checked: usuario ? Boolean(usuario.activo) : true }),
  };
  const botonGuardar = el('button', { clase: 'btn btn-primario', type: 'button' }, esNuevo ? 'Crear usuario' : 'Guardar');
  const m = modal({
    titulo: esNuevo ? 'Nuevo usuario del equipo' : `Editar a ${usuario.nombre}`,
    cuerpo: el('div', {},
      el('div', { clase: 'forma-rejilla' },
        campo('Nombre *', campos.nombre),
        campo('Usuario de acceso *', campos.usuario),
        el('div', { clase: 'ancho-total' }, campo('Rol', campos.rol)),
        campo('Correo', campos.email),
        campo('Telefono', campos.telefono),
        esNuevo ? el('div', { clase: 'ancho-total' }, campo('Contrasena inicial *', campos.password)) : null,
      ),
      !esNuevo ? el('label', { clase: 'interruptor' }, campos.activo, 'Usuario activo (puede entrar al sistema)') : null
    ),
    pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonGuardar],
  });
  botonGuardar.addEventListener('click', async () => {
    const datos = {
      nombre: campos.nombre.value.trim(),
      rol: campos.rol.value,
      email: campos.email.value.trim(),
      telefono: campos.telefono.value.trim(),
    };
    try {
      if (esNuevo) {
        datos.usuario = campos.usuario.value.trim();
        datos.password = campos.password.value;
        if (!datos.usuario || !datos.nombre) { toast('Usuario y nombre son obligatorios.', 'error'); return; }
        await API.post('/usuarios', datos);
      } else {
        datos.activo = campos.activo.checked;
        await API.put(`/usuarios/${usuario.id}`, datos);
      }
      toast('Usuario guardado.');
      m.cerrar();
      Estado.usuarios = await API.get('/usuarios');
      if (alGuardar) alGuardar();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function modalPasswordUsuario(usuario) {
  const nueva = entrada({ type: 'password', placeholder: 'Minimo 6 caracteres' });
  const botonGuardar = el('button', { clase: 'btn btn-primario', type: 'button' }, 'Restablecer');
  const m = modal({
    titulo: `Restablecer contrasena de ${usuario.nombre}`,
    cuerpo: campo('Nueva contrasena *', nueva, 'Se cierran sus sesiones abiertas; compartesela por un medio seguro.'),
    pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonGuardar],
  });
  botonGuardar.addEventListener('click', async () => {
    try {
      await API.put(`/usuarios/${usuario.id}/password`, { nueva: nueva.value });
      toast('Contrasena restablecida.');
      m.cerrar();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function modalMiPassword() {
  const actual = entrada({ type: 'password' });
  const nueva = entrada({ type: 'password', placeholder: 'Minimo 6 caracteres' });
  const botonGuardar = el('button', { clase: 'btn btn-primario', type: 'button' }, 'Cambiar');
  const m = modal({
    titulo: 'Cambiar mi contrasena',
    cuerpo: el('div', {}, campo('Contrasena actual *', actual), campo('Nueva contrasena *', nueva)),
    pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonGuardar],
  });
  botonGuardar.addEventListener('click', async () => {
    try {
      await API.put('/auth/password', { actual: actual.value, nueva: nueva.value });
      toast('Contrasena actualizada.');
      m.cerrar();
    } catch (err) { toast(err.message, 'error'); }
  });
}

Vistas.usuarios = async function (contenedor) {
  contenedor.innerHTML = '';
  const recargar = () => Vistas.usuarios(contenedor);
  let usuarios;
  try {
    usuarios = await API.get('/usuarios');
    Estado.usuarios = usuarios;
  } catch (err) {
    contenedor.append(vacio(err.message, '⚠️'));
    return;
  }
  contenedor.append(
    el('div', { clase: 'encabezado-vista' },
      el('div', {}, el('h1', {}, 'Usuarios del equipo'), el('div', { clase: 'sub' }, `Cada quien entra con su usuario y rol. Hoy hay ${usuarios.filter((u) => u.activo).length} activo(s).`)),
      el('div', { clase: 'acciones-vista' },
        el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => modalUsuario(null, recargar) }, icono('mas'), 'Nuevo usuario')
      )
    ),
    tabla([
      { titulo: 'Nombre', clase: 'celda-principal', valor: (f) => el('div', { style: 'display:flex;align-items:center;gap:9px' }, avatar(f.nombre, true), f.nombre, f.id === Estado.usuario.id ? badge('yo', 'b-negro') : null) },
      { titulo: 'Usuario', valor: (f) => f.usuario },
      { titulo: 'Rol', valor: (f) => badge(f.rol, f.rol === 'admin' ? 'b-rojo' : (f.rol === 'gerente' ? 'b-morado' : 'b-azul')) },
      { titulo: 'Correo', valor: (f) => f.email || '—' },
      { titulo: 'Telefono', valor: (f) => f.telefono || '—' },
      { titulo: 'Estado', valor: (f) => badge(f.activo ? 'activo' : 'inactivo', f.activo ? 'b-verde' : 'b-gris') },
      {
        titulo: '', valor: (f) => el('div', { style: 'display:flex;gap:4px;justify-content:flex-end' },
          el('button', { clase: 'boton-contacto', type: 'button', title: 'Editar', alClic: () => modalUsuario(f, recargar) }, icono('editar')),
          el('button', { clase: 'boton-contacto', type: 'button', title: 'Restablecer contrasena', alClic: () => modalPasswordUsuario(f) }, icono('config')),
        ),
      },
    ], usuarios)
  );
};

// ---------- Configuracion ----------

Vistas.configuracion = async function (contenedor) {
  contenedor.innerHTML = '';
  contenedor.append(cargando());
  let cfg;
  try {
    cfg = await API.get('/configuracion');
  } catch (err) {
    contenedor.innerHTML = '';
    contenedor.append(vacio(err.message, '⚠️'));
    return;
  }
  contenedor.innerHTML = '';

  const guardarSeccion = async (datos, boton) => {
    boton.disabled = true;
    try {
      await API.put('/configuracion', datos);
      Estado.config = await API.get('/configuracion');
      toast('Configuracion guardada.');
    } catch (err) { toast(err.message, 'error'); }
    boton.disabled = false;
  };

  const seccion = (titulo, descripcion, camposNodos, obtenerDatos, extraBotones = []) => {
    const boton = el('button', { clase: 'btn btn-primario', type: 'button' }, 'Guardar');
    boton.addEventListener('click', () => guardarSeccion(obtenerDatos(), boton));
    return el('div', { clase: 'tarjeta' },
      el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, titulo), el('span', { clase: 'extra' }, descripcion)),
      camposNodos,
      el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap' }, ...extraBotones, boton)
    );
  };

  // Empresa
  const ce = {
    empresa_nombre: entrada({ value: cfg.empresa_nombre || '' }),
    empresa_razon: entrada({ value: cfg.empresa_razon || '', placeholder: 'Razon social completa' }),
    empresa_rfc: entrada({ value: cfg.empresa_rfc || '' }),
    empresa_direccion: entrada({ value: cfg.empresa_direccion || '' }),
    empresa_telefono: entrada({ value: cfg.empresa_telefono || '' }),
    empresa_email: entrada({ value: cfg.empresa_email || '' }),
    empresa_web: entrada({ value: cfg.empresa_web || '', placeholder: 'www.fletestauro.com.mx' }),
  };
  // Cotizacion
  const cc = {
    iva_pct: entrada({ type: 'number', step: '0.5', value: cfg.iva_pct }),
    ret_pct: entrada({ type: 'number', step: '0.5', value: cfg.ret_pct }),
    vigencia_dias: entrada({ type: 'number', min: '1', value: cfg.vigencia_dias }),
    condiciones_default: el('textarea', { rows: 8 }, cfg.condiciones_default || ''),
    pdf_leyenda: entrada({ value: cfg.pdf_leyenda || '' }),
  };
  // Correo
  const cm = {
    smtp_host: entrada({ value: cfg.smtp_host || '', placeholder: 'smtp.tudominio.com' }),
    smtp_port: entrada({ type: 'number', value: cfg.smtp_port || 587 }),
    smtp_secure: el('input', { type: 'checkbox', checked: String(cfg.smtp_secure) === 'true' }),
    smtp_user: entrada({ value: cfg.smtp_user || '', placeholder: 'ventas@fletestauro.com.mx' }),
    smtp_pass: entrada({ type: 'password', placeholder: cfg.smtp_pass_definida ? '•••••••• (guardada; escribe para cambiarla)' : 'Contrasena del correo' }),
    correo_de: entrada({ value: cfg.correo_de || '', placeholder: '"Fletes Tauro" <ventas@fletestauro.com.mx>' }),
  };
  const botonProbar = el('button', {
    clase: 'btn btn-secundario', type: 'button',
    alClic: () => {
      const para = entrada({ type: 'email', value: Estado.usuario.email || '' });
      const botonEnviar = el('button', { clase: 'btn btn-primario', type: 'button' }, 'Enviar prueba');
      const m = modal({
        titulo: 'Probar correo',
        cuerpo: campo('Mandar correo de prueba a *', para, 'Guarda primero la configuracion SMTP.'),
        pie: [el('button', { clase: 'btn btn-secundario', type: 'button', alClic: () => m.cerrar() }, 'Cancelar'), botonEnviar],
      });
      botonEnviar.addEventListener('click', async () => {
        botonEnviar.disabled = true;
        try {
          const r = await API.post('/configuracion/probar-correo', { para: para.value.trim() });
          toast(r.mensaje || 'Correo de prueba enviado.');
          m.cerrar();
        } catch (err) { toast(err.message, 'error'); botonEnviar.disabled = false; }
      });
    },
  }, 'Probar envio');
  // WhatsApp / sistema
  const cw = {
    base_url: entrada({ value: cfg.base_url || '', placeholder: 'https://crm.fletestauro.com.mx' }),
    whatsapp_token: entrada({ type: 'password', placeholder: cfg.whatsapp_token_definida ? '•••••••• (guardado; escribe para cambiarlo)' : 'Token permanente de Meta (opcional)' }),
    whatsapp_phone_id: entrada({ value: cfg.whatsapp_phone_id || '', placeholder: 'Phone Number ID (opcional)' }),
  };

  contenedor.append(
    el('div', { clase: 'encabezado-vista' },
      el('div', {}, el('h1', {}, 'Configuracion'), el('div', { clase: 'sub' }, 'Datos que salen en el PDF, impuestos, correo y WhatsApp'))
    ),
    seccion('Datos de la empresa', 'aparecen en el PDF de cotizacion',
      el('div', { clase: 'forma-rejilla' },
        campo('Nombre comercial', ce.empresa_nombre),
        campo('Razon social', ce.empresa_razon),
        campo('RFC', ce.empresa_rfc),
        campo('Telefono', ce.empresa_telefono),
        el('div', { clase: 'ancho-total' }, campo('Direccion', ce.empresa_direccion)),
        campo('Correo', ce.empresa_email),
        campo('Pagina web', ce.empresa_web),
      ),
      () => Object.fromEntries(Object.entries(ce).map(([k, n]) => [k, n.value.trim()]))
    ),
    seccion('Cotizaciones', 'valores por defecto del asistente',
      el('div', {},
        el('div', { clase: 'forma-rejilla' },
          campo('IVA %', cc.iva_pct),
          campo('Retencion IVA %', cc.ret_pct, 'Retencion de IVA por autotransporte (4% normalmente)'),
          campo('Vigencia (dias)', cc.vigencia_dias),
          campo('Leyenda del pie del PDF', cc.pdf_leyenda),
        ),
        campo('Condiciones por defecto (una por renglon)', cc.condiciones_default)
      ),
      () => ({
        iva_pct: cc.iva_pct.value, ret_pct: cc.ret_pct.value, vigencia_dias: cc.vigencia_dias.value,
        condiciones_default: cc.condiciones_default.value, pdf_leyenda: cc.pdf_leyenda.value.trim(),
      })
    ),
    seccion('Correo (SMTP)', 'para enviar cotizaciones con PDF adjunto',
      el('div', {},
        el('div', { clase: 'forma-rejilla' },
          campo('Servidor SMTP', cm.smtp_host),
          campo('Puerto', cm.smtp_port),
          campo('Usuario', cm.smtp_user),
          campo('Contrasena', cm.smtp_pass),
          el('div', { clase: 'ancho-total' }, campo('Remitente (De:)', cm.correo_de)),
        ),
        el('label', { clase: 'interruptor' }, cm.smtp_secure, 'Conexion segura directa (SSL, normalmente puerto 465; apagado usa STARTTLS en 587)')
      ),
      () => ({
        smtp_host: cm.smtp_host.value.trim(), smtp_port: cm.smtp_port.value,
        smtp_secure: cm.smtp_secure.checked ? 'true' : 'false',
        smtp_user: cm.smtp_user.value.trim(), smtp_pass: cm.smtp_pass.value,
        correo_de: cm.correo_de.value.trim(),
      }),
      [botonProbar]
    ),
    seccion('WhatsApp y ligas publicas', 'la liga wa.me funciona sin configurar nada',
      el('div', {},
        campo('URL publica del sistema', cw.base_url, 'Con esto la cotizacion por WhatsApp incluye la liga para descargar el PDF.'),
        el('div', { clase: 'forma-rejilla' },
          campo('Token de WhatsApp Business API', cw.whatsapp_token, 'Opcional: para enviar directo sin abrir WhatsApp'),
          campo('Phone Number ID', cw.whatsapp_phone_id),
        )
      ),
      () => ({
        base_url: cw.base_url.value.trim(),
        whatsapp_token: cw.whatsapp_token.value,
        whatsapp_phone_id: cw.whatsapp_phone_id.value.trim(),
      })
    )
  );
};

const VistasAdmin = { modalMiPassword };
