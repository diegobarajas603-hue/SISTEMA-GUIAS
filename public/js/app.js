'use strict';
// Arranque de la aplicacion: login, navegacion, enrutador, busqueda
// global, menu de altas rapidas y panel operativo (dashboard).

const NAV_ITEMS = [
  { ruta: '/panel', nombre: 'Panel', icono: 'panel' },
  { ruta: '/pipeline', nombre: 'Pipeline', icono: 'pipeline' },
  { ruta: '/empresas', nombre: 'Prospectos y clientes', icono: 'empresas' },
  { ruta: '/cotizaciones', nombre: 'Cotizaciones', icono: 'cotizaciones' },
  { ruta: '/tareas', nombre: 'Tareas', icono: 'tareas' },
  { ruta: '/servicios', nombre: 'Servicios', icono: 'servicios' },
  { ruta: '/reportes', nombre: 'Reportes', icono: 'reportes' },
  { separador: 'Administracion' },
  { ruta: '/catalogos', nombre: 'Catalogos', icono: 'catalogos' },
  { ruta: '/usuarios', nombre: 'Usuarios', icono: 'usuarios', soloAdmin: true },
  { ruta: '/configuracion', nombre: 'Configuracion', icono: 'config', soloAdmin: true },
];

// ---------- Sesion ----------

function mostrarLogin() {
  $('#app').classList.add('oculto');
  $('#pantalla-login').classList.remove('oculto');
  const campoUsuario = $('#login-usuario');
  if (campoUsuario) setTimeout(() => campoUsuario.focus(), 50);
}

async function iniciarSesionDesdeForma(ev) {
  ev.preventDefault();
  const boton = $('#login-boton');
  const cajaError = $('#login-error');
  cajaError.classList.add('oculto');
  boton.disabled = true;
  boton.textContent = 'Entrando...';
  try {
    const r = await API.post('/auth/login', {
      usuario: $('#login-usuario').value.trim(),
      password: $('#login-password').value,
    });
    API.token = r.token;
    $('#login-password').value = '';
    await arrancarApp();
  } catch (err) {
    cajaError.textContent = err.message;
    cajaError.classList.remove('oculto');
  }
  boton.disabled = false;
  boton.textContent = 'Entrar';
}

async function cerrarSesion() {
  try { await API.post('/auth/logout'); } catch (err) { /* la sesion local se limpia igual */ }
  API.token = '';
  location.hash = '';
  mostrarLogin();
}

// ---------- Estructura (menu, busqueda, altas rapidas) ----------

let appMontada = false;

function montarEstructura() {
  if (appMontada) return;
  appMontada = true;

  $('#boton-menu').append(icono('menu'));
  $('.busqueda-icono').append(icono('buscar'));
  $('#forma-login').addEventListener('submit', iniciarSesionDesdeForma);
  $('#boton-salir').addEventListener('click', cerrarSesion);
  $('#boton-menu').addEventListener('click', () => $('#app').classList.toggle('menu-abierto'));
  $('#velo').addEventListener('click', () => $('#app').classList.remove('menu-abierto'));

  // Busqueda global
  const campoBusqueda = $('#busqueda-global');
  const panelResultados = $('#resultados-busqueda');
  const cerrarResultados = () => panelResultados.classList.add('oculto');
  const buscar = debounce(async () => {
    const q = campoBusqueda.value.trim();
    if (q.length < 2) { cerrarResultados(); return; }
    try {
      const r = await API.get(`/buscar?q=${encodeURIComponent(q)}`);
      panelResultados.innerHTML = '';
      const grupos = [
        ['Empresas', r.empresas.map((f) => ({ ruta: `/empresas/${f.id}`, titulo: f.nombre, sub: [f.tipo === 'cliente' ? 'Cliente' : 'Prospecto', f.ciudad, f.telefono].filter(Boolean).join(' · ') }))],
        ['Contactos', r.contactos.map((f) => ({ ruta: `/empresas/${f.empresa_id}`, titulo: f.nombre, sub: `${f.empresa_nombre}${f.puesto ? ` · ${f.puesto}` : ''}` }))],
        ['Cotizaciones', r.cotizaciones.map((f) => ({ ruta: `/cotizaciones/${f.id}`, titulo: `${f.folio} — ${f.empresa_nombre}`, sub: `${f.origen} → ${f.destino} · ${UI.dinero(f.total, f.moneda)}` }))],
        ['Servicios', r.servicios.map((f) => ({ ruta: '/servicios', titulo: `${f.folio} — ${f.empresa_nombre}`, sub: `${f.origen} → ${f.destino}` }))],
      ];
      let hayAlgo = false;
      for (const [nombre, items] of grupos) {
        if (!items.length) continue;
        hayAlgo = true;
        panelResultados.append(el('div', { clase: 'resultado-grupo' }, nombre));
        for (const item of items) {
          panelResultados.append(el('a', {
            clase: 'resultado-item', href: `#${item.ruta}`,
            alClic: () => { cerrarResultados(); campoBusqueda.value = ''; },
          }, item.titulo, el('small', {}, item.sub)));
        }
      }
      if (!hayAlgo) panelResultados.append(el('div', { clase: 'vacio', style: 'padding:16px' }, `Nada encontrado con "${q}"`));
      panelResultados.classList.remove('oculto');
    } catch (err) { cerrarResultados(); }
  });
  campoBusqueda.addEventListener('input', buscar);
  campoBusqueda.addEventListener('focus', () => { if (panelResultados.childElementCount) panelResultados.classList.remove('oculto'); });
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.busqueda')) cerrarResultados();
    if (!ev.target.closest('#menu-rapido') && !ev.target.closest('#boton-rapido')) $('#menu-rapido').classList.add('oculto');
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrarResultados(); });

  // Menu de altas rapidas (+)
  const menuRapido = $('#menu-rapido');
  const opcionesRapidas = [
    ['empresas', 'Nuevo prospecto', () => modalEmpresa(null, (e) => irA(`/empresas/${e.id}`))],
    ['cotizaciones', 'Nueva cotizacion', () => irA('/cotizaciones/nueva')],
    ['tareas', 'Nueva tarea', () => VistasOper.modalTarea(null, null, () => rutear())],
    ['tel', 'Registrar actividad', () => {
      let empresaElegida = null;
      const botonSeguir = el('button', { clase: 'btn btn-primario', type: 'button' }, 'Continuar');
      const m = modal({
        titulo: 'Registrar actividad',
        cuerpo: campoBloque('¿Con que empresa fue la actividad?', selectorEmpresa({ valorInicial: null, permitirNueva: false, alElegir: (e) => { empresaElegida = e; } })),
        pie: [botonSeguir],
      });
      botonSeguir.addEventListener('click', () => {
        if (!empresaElegida) { toast('Elige la empresa.', 'error'); return; }
        m.cerrar();
        modalActividad(empresaElegida, () => rutear());
      });
    }],
    ['servicios', 'Nuevo servicio', () => VistasOper.modalServicio(null, () => rutear())],
  ];
  for (const [ic, nombre, accion] of opcionesRapidas) {
    menuRapido.append(el('button', { type: 'button', alClic: () => { menuRapido.classList.add('oculto'); accion(); } }, icono(ic), nombre));
  }
  $('#boton-rapido').addEventListener('click', () => menuRapido.classList.toggle('oculto'));

  window.addEventListener('hashchange', rutear);
}

function pintarNavegacion() {
  const nav = $('#navegacion');
  nav.innerHTML = '';
  for (const item of NAV_ITEMS) {
    if (item.separador) {
      nav.append(el('div', { clase: 'nav-separador' }, item.separador));
      continue;
    }
    if (item.soloAdmin && Estado.usuario.rol !== 'admin') continue;
    nav.append(el('a', {
      clase: 'nav-item', href: `#${item.ruta}`, dataset: { ruta: item.ruta },
      alClic: () => $('#app').classList.remove('menu-abierto'),
    }, icono(item.icono), item.nombre));
  }
  const zonaUsuario = $('#menu-usuario');
  zonaUsuario.innerHTML = '';
  zonaUsuario.append(
    avatar(Estado.usuario.nombre),
    el('div', { style: 'flex:1;min-width:0' },
      el('div', { clase: 'menu-usuario-nombre' }, Estado.usuario.nombre),
      el('div', { clase: 'menu-usuario-rol' }, Estado.usuario.rol)
    ),
    el('button', { clase: 'boton-icono', type: 'button', title: 'Cambiar mi contrasena', style: 'color:#c9c9cf', alClic: () => VistasAdmin.modalMiPassword() }, icono('config'))
  );
}

// ---------- Enrutador ----------

function rutear() {
  if (!Estado.usuario) return;
  const contenido = $('#contenido');
  const hash = location.hash.replace(/^#\/?/, '');
  const [rutaCruda, consultaCruda] = hash.split('?');
  const segmentos = rutaCruda.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(consultaCruda || ''));

  let vista = Vistas.panel;
  let claveNav = '/panel';

  if (segmentos[0] === 'pipeline') { vista = Vistas.pipeline; claveNav = '/pipeline'; }
  else if (segmentos[0] === 'empresas' && segmentos[1]) { vista = Vistas.empresaDetalle; params.id = segmentos[1]; claveNav = '/empresas'; }
  else if (segmentos[0] === 'empresas') { vista = Vistas.empresas; claveNav = '/empresas'; }
  else if (segmentos[0] === 'cotizaciones' && segmentos[1] === 'nueva') { vista = Vistas.cotizacionNueva; claveNav = '/cotizaciones'; }
  else if (segmentos[0] === 'cotizaciones' && segmentos[1]) { vista = Vistas.cotizacionDetalle; params.id = segmentos[1]; claveNav = '/cotizaciones'; }
  else if (segmentos[0] === 'cotizaciones') { vista = Vistas.cotizaciones; claveNav = '/cotizaciones'; }
  else if (segmentos[0] === 'tareas') { vista = Vistas.tareas; claveNav = '/tareas'; }
  else if (segmentos[0] === 'servicios') { vista = Vistas.servicios; claveNav = '/servicios'; }
  else if (segmentos[0] === 'reportes') { vista = Vistas.reportes; claveNav = '/reportes'; }
  else if (segmentos[0] === 'catalogos') { vista = Vistas.catalogos; claveNav = '/catalogos'; }
  else if (segmentos[0] === 'usuarios' && Estado.usuario.rol === 'admin') { vista = Vistas.usuarios; claveNav = '/usuarios'; }
  else if (segmentos[0] === 'configuracion' && Estado.usuario.rol === 'admin') { vista = Vistas.configuracion; claveNav = '/configuracion'; }

  for (const nodo of $$('.nav-item')) nodo.classList.toggle('activo', nodo.dataset.ruta === claveNav);
  $('#app').classList.remove('menu-abierto');
  window.scrollTo(0, 0);
  vista(contenido, params).catch((err) => {
    contenido.innerHTML = '';
    contenido.append(vacio(err.message || 'Algo salio mal.', '⚠️'));
  });
}

// ---------- Panel operativo (dashboard) ----------

Vistas.panel = async function (contenedor) {
  contenedor.innerHTML = '';
  contenedor.append(cargando('Cargando panel...'));
  let r;
  try {
    r = await API.get('/reportes/resumen');
  } catch (err) {
    contenedor.innerHTML = '';
    contenedor.append(vacio(err.message, '⚠️'));
    return;
  }
  contenedor.innerHTML = '';
  const k = r.kpis;
  const recargar = () => Vistas.panel(contenedor);

  const saludo = (() => {
    const hora = new Date().getHours();
    const momento = hora < 12 ? 'Buenos dias' : (hora < 19 ? 'Buenas tardes' : 'Buenas noches');
    return `${momento}, ${Estado.usuario.nombre.split(' ')[0]}`;
  })();

  contenedor.append(
    el('div', { clase: 'encabezado-vista' },
      el('div', {}, el('h1', {}, saludo),
        el('div', { clase: 'sub' }, `Asi va la operacion comercial hoy ${UI.fecha(r.hoy)}`)),
      el('div', { clase: 'acciones-vista' },
        el('button', { clase: 'btn btn-primario', type: 'button', alClic: () => irA('/cotizaciones/nueva') }, icono('mas'), 'Cotizar')
      )
    ),
    el('div', { clase: 'kpis' },
      el('div', { clase: 'kpi kpi-azul', alClic: () => irA('/pipeline') },
        el('div', { clase: 'kpi-valor' }, String(k.prospectos_activos)),
        el('div', { clase: 'kpi-nombre' }, 'Prospectos activos'),
        el('div', { clase: 'kpi-extra' }, `${k.clientes} cliente(s)`)),
      el('div', { clase: 'kpi', alClic: () => irA('/cotizaciones') },
        el('div', { clase: 'kpi-valor' }, UI.dinero(k.cot_abiertas_monto)),
        el('div', { clase: 'kpi-nombre' }, 'Cotizaciones abiertas'),
        el('div', { clase: 'kpi-extra' }, `${k.cot_abiertas} por cerrar`)),
      el('div', { clase: 'kpi kpi-verde', alClic: () => irA('/reportes') },
        el('div', { clase: 'kpi-valor' }, UI.dinero(k.ganadas_mes_monto)),
        el('div', { clase: 'kpi-nombre' }, 'Ganado este mes'),
        el('div', { clase: 'kpi-extra' }, `${k.ganadas_mes} cotizacion(es)`)),
      el('div', { clase: 'kpi kpi-negro', alClic: () => irA('/servicios') },
        el('div', { clase: 'kpi-valor' }, UI.dinero(k.venta_mes)),
        el('div', { clase: 'kpi-nombre' }, 'Venta del mes (sin IVA)'),
        el('div', { clase: 'kpi-extra' }, `${k.venta_mes_n} servicio(s) · ${k.servicios_activos} en curso`)),
      el('div', { clase: `kpi ${k.tareas_vencidas ? 'kpi-ambar' : 'kpi-verde'}`, alClic: () => irA('/tareas') },
        el('div', { clase: 'kpi-valor' }, `${k.tareas_hoy + k.tareas_vencidas}`),
        el('div', { clase: 'kpi-nombre' }, 'Mis pendientes'),
        el('div', { clase: 'kpi-extra' }, k.tareas_vencidas ? `¡${k.tareas_vencidas} vencida(s)!` : 'al corriente')),
    )
  );

  // Mis tareas + por vencer / proximos servicios
  const colIzquierda = el('div', {},
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'tarjeta-titulo' },
        el('h2', {}, 'Mis tareas y recordatorios'),
        el('button', { clase: 'btn btn-secundario btn-chico', type: 'button', alClic: () => VistasOper.modalTarea(null, null, recargar) }, icono('mas'), 'Nueva')
      ),
      r.mis_tareas.length
        ? r.mis_tareas.map((t) => VistasOper.filaTarea(t, recargar))
        : el('div', { clase: 'ayuda' }, 'Sin pendientes. Agenda el siguiente seguimiento para no soltar a tus prospectos.')
    ),
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, 'Cotizaciones por vencer')),
      r.por_vencer.length
        ? r.por_vencer.map((c) => el('div', { clase: 'contacto-fila', style: 'cursor:pointer', alClic: () => irA(`/cotizaciones/${c.id}`) },
          el('div', { clase: 'contacto-info' },
            el('b', {}, `${c.folio} — ${c.empresa_nombre}`),
            el('small', {}, `${UI.dinero(c.total, c.moneda)} · vence el ${UI.fecha(c.vigente_hasta)}`)
          ),
          icono('alerta')
        ))
        : el('div', { clase: 'ayuda' }, 'Ninguna cotizacion enviada esta por vencer.')
    ),
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, 'Proximos servicios')),
      r.proximos_servicios.length
        ? r.proximos_servicios.map((s) => el('div', { clase: 'contacto-fila', style: 'cursor:pointer', alClic: () => irA('/servicios') },
          el('div', { clase: 'contacto-info' },
            el('b', {}, `${s.folio} — ${s.empresa_nombre}`),
            el('small', {}, `${s.origen} → ${s.destino} · carga ${UI.fecha(s.fecha_carga)}`)
          ),
          badgeSrv(s.estatus)
        ))
        : el('div', { clase: 'ayuda' }, 'No hay servicios programados.')
    )
  );

  // Embudo + actividad reciente
  const maximoEtapa = Math.max(...r.pipeline.map((p) => p.n), 1);
  const colDerecha = el('div', {},
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'tarjeta-titulo' },
        el('h2', {}, 'Embudo de prospectos'),
        el('a', { href: '#/pipeline', clase: 'extra' }, 'ver pipeline')
      ),
      ETAPAS_UI.filter((e) => !['ganado', 'perdido'].includes(e.clave)).map((e) => {
        const fila = r.pipeline.find((p) => p.etapa === e.clave);
        const n = fila ? fila.n : 0;
        return el('div', { clase: 'embudo-fila' },
          el('span', {}, e.nombre),
          el('div', { clase: 'embudo-barra', style: `width:${Math.max(3, (n / maximoEtapa) * 100)}%` }),
          el('b', {}, String(n))
        );
      })
    ),
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'tarjeta-titulo' }, el('h2', {}, 'Actividad reciente del equipo')),
      r.actividad.length
        ? el('div', { clase: 'linea-tiempo' }, r.actividad.map((a) => el('div', { clase: `evento e-${a.tipo}` },
          el('div', { clase: 'evento-titulo' }, a.titulo),
          el('div', { clase: 'evento-meta' },
            `${a.usuario_nombre || 'Sistema'}${a.empresa_nombre ? ` · ` : ''}`,
            a.empresa_nombre ? el('a', { href: `#/empresas/${a.empresa_id}` }, a.empresa_nombre) : '',
            ` · ${UI.relativo(a.fecha)}`
          )
        )))
        : el('div', { clase: 'ayuda' }, 'Aqui va a aparecer todo lo que registre el equipo: llamadas, cotizaciones, cambios de etapa...')
    )
  );

  contenedor.append(el('div', { clase: 'rejilla-2' }, colIzquierda, colDerecha));
};

// ---------- Arranque ----------

async function arrancarApp() {
  try {
    Estado.usuario = await API.get('/auth/me');
  } catch (err) {
    mostrarLogin();
    return;
  }
  try {
    const [usuarios, config] = await Promise.all([API.get('/usuarios'), API.get('/configuracion')]);
    Estado.usuarios = usuarios;
    Estado.config = config;
  } catch (err) {
    Estado.usuarios = [];
    Estado.config = {};
  }
  $('#pantalla-login').classList.add('oculto');
  $('#app').classList.remove('oculto');
  pintarNavegacion();
  rutear();
}

document.addEventListener('DOMContentLoaded', () => {
  montarEstructura();
  API.alExpirar = mostrarLogin;
  if (API.token) arrancarApp();
  else mostrarLogin();
});
