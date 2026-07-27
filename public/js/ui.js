'use strict';
// Utilerias de interfaz: constructor de nodos, iconos, formatos, badges,
// tablas responsivas, modales, toasts y exportacion a CSV.

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

// Crea un nodo: el('div', { clase: 'x', alClic: fn, html: '...' }, hijo1, hijo2...)
function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (clave === 'clase') nodo.className = valor;
    else if (clave === 'html') nodo.innerHTML = valor; // solo para iconos/textos propios
    else if (clave === 'texto') nodo.textContent = valor;
    else if (clave === 'alClic') nodo.addEventListener('click', valor);
    else if (clave === 'alCambiar') nodo.addEventListener('change', valor);
    else if (clave === 'alTeclear') nodo.addEventListener('input', valor);
    else if (clave === 'alEnviar') nodo.addEventListener('submit', valor);
    else if (clave === 'dataset') Object.assign(nodo.dataset, valor);
    else if (clave in nodo && clave !== 'list' && typeof valor !== 'string') nodo[clave] = valor;
    else nodo.setAttribute(clave, valor);
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

// ---------- Iconos (SVG en linea) ----------

const RUTAS_ICONO = {
  panel: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
  pipeline: '<path d="M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z"/>',
  empresas: '<path d="M3 21h18M5 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M14 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3"/>',
  cotizaciones: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  tareas: '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  servicios: '<path d="M1 4h14v12H1zM15 9h4l4 4v3h-8zM5.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
  reportes: '<path d="M12 20V10M18 20V4M6 20v-4M2 20h20"/>',
  catalogos: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
  usuarios: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  config: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  buscar: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  tel: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/>',
  correo: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6"/>',
  whatsapp: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  editar: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  borrar: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15l3 3 3-3"/>',
  cerrar: '<path d="M18 6L6 18M6 6l12 12"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  izq: '<path d="M15 18l-6-6 6-6"/>',
  der: '<path d="M9 18l6-6-6-6"/>',
  alerta: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>',
  reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  intercambio: '<path d="M17 1l4 4-4 4M21 5H9M7 23l-4-4 4-4M3 19h15"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  convertir: '<path d="M4 12h12M12 6l6 6-6 6M20 4v16"/>',
};

function icono(nombre) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = RUTAS_ICONO[nombre] || RUTAS_ICONO.panel;
  return svg;
}

// ---------- Formatos ----------

const UI = {
  dinero(n, moneda = 'MXN') {
    const v = Number(n) || 0;
    const texto = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${v < 0 ? '-' : ''}$${texto}${moneda === 'USD' ? ' USD' : ''}`;
  },
  numero(n) { return (Number(n) || 0).toLocaleString('en-US'); },
  fecha(valor) {
    if (!valor) return '—';
    const ymd = String(valor).slice(0, 10);
    const [a, m, d] = ymd.split('-');
    if (!a || !m || !d) return String(valor);
    return `${d}/${m}/${a}`;
  },
  fechaHora(iso) {
    if (!iso) return '—';
    const f = new Date(iso);
    if (Number.isNaN(f.getTime())) return UI.fecha(iso);
    return f.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  },
  relativo(iso) {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms)) return UI.fecha(iso);
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `hace ${d} d`;
    return UI.fecha(iso);
  },
  hoyLocal() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  },
  iniciales(nombre) {
    return String(nombre || '?').split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();
  },
};

// ---------- Etiquetas y colores ----------

const ETAPAS_UI = [
  { clave: 'nuevo', nombre: 'Nuevo', color: 'b-gris' },
  { clave: 'contactado', nombre: 'Contactado', color: 'b-azul' },
  { clave: 'calificado', nombre: 'Calificado', color: 'b-morado' },
  { clave: 'propuesta', nombre: 'Propuesta', color: 'b-ambar' },
  { clave: 'negociacion', nombre: 'Negociacion', color: 'b-negro' },
  { clave: 'ganado', nombre: 'Ganado', color: 'b-verde' },
  { clave: 'perdido', nombre: 'Perdido', color: 'b-rojo' },
];
const ETAPA_POR_CLAVE = Object.fromEntries(ETAPAS_UI.map((e) => [e.clave, e]));

const ESTATUS_COT_UI = {
  borrador: { nombre: 'Borrador', color: 'b-gris' },
  enviada: { nombre: 'Enviada', color: 'b-azul' },
  aceptada: { nombre: 'Aceptada', color: 'b-verde' },
  rechazada: { nombre: 'Rechazada', color: 'b-rojo' },
  vencida: { nombre: 'Vencida', color: 'b-ambar' },
  convertida: { nombre: 'Convertida', color: 'b-morado' },
};

const ESTATUS_SRV_UI = {
  programado: { nombre: 'Programado', color: 'b-gris' },
  en_transito: { nombre: 'En transito', color: 'b-ambar' },
  entregado: { nombre: 'Entregado', color: 'b-azul' },
  facturado: { nombre: 'Facturado', color: 'b-morado' },
  pagado: { nombre: 'Pagado', color: 'b-verde' },
  cancelado: { nombre: 'Cancelado', color: 'b-rojo' },
};

const TIPOS_SERVICIO_UI = { sencillo: 'Viaje sencillo', redondo: 'Viaje redondo', dedicado: 'Dedicado' };

const TIPOS_ACTIVIDAD_UI = [
  { clave: 'llamada', nombre: 'Llamada', icono: 'tel' },
  { clave: 'whatsapp', nombre: 'WhatsApp', icono: 'whatsapp' },
  { clave: 'correo', nombre: 'Correo', icono: 'correo' },
  { clave: 'reunion', nombre: 'Reunion', icono: 'usuarios' },
  { clave: 'visita', nombre: 'Visita', icono: 'empresas' },
  { clave: 'nota', nombre: 'Nota', icono: 'editar' },
];

function badge(texto, color) {
  return el('span', { clase: `badge ${color || 'b-gris'}` }, texto);
}
function badgeEtapa(clave) {
  const e = ETAPA_POR_CLAVE[clave] || { nombre: clave, color: 'b-gris' };
  return badge(e.nombre, e.color);
}
function badgeCot(clave) {
  const e = ESTATUS_COT_UI[clave] || { nombre: clave, color: 'b-gris' };
  return badge(e.nombre, e.color);
}
function badgeSrv(clave) {
  const e = ESTATUS_SRV_UI[clave] || { nombre: clave, color: 'b-gris' };
  return badge(e.nombre, e.color);
}
function avatar(nombre, chico) {
  return el('span', { clase: `avatar${chico ? ' chico' : ''}`, title: nombre || '' }, UI.iniciales(nombre));
}

// ---------- Campos de formulario ----------

function campo(etiqueta, nodo, ayuda) {
  return el('label', { clase: 'campo' },
    el('span', {}, etiqueta),
    nodo,
    ayuda ? el('div', { clase: 'ayuda' }, ayuda) : null
  );
}

// Igual que campo() pero con <div>: para componentes con botones internos
// (selectores con resultados, chips), donde un <label> re-dispararia clics.
function campoBloque(etiqueta, nodo, ayuda) {
  return el('div', { clase: 'campo' },
    el('span', {}, etiqueta),
    nodo,
    ayuda ? el('div', { clase: 'ayuda' }, ayuda) : null
  );
}

function entrada(atributos = {}) {
  return el('input', { type: 'text', ...atributos });
}

function selector(opciones, valorActual, atributos = {}) {
  const sel = el('select', atributos);
  for (const op of opciones) {
    sel.append(el('option', { value: String(op.valor), selected: String(op.valor) === String(valorActual ?? '') }, op.texto));
  }
  return sel;
}

// ---------- Tabla responsiva ----------

function tabla(columnas, filas, opciones = {}) {
  const cuerpo = el('tbody');
  for (const fila of filas) {
    const tr = el('tr');
    if (opciones.alClic) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button, a, select, input')) return;
        opciones.alClic(fila);
      });
    }
    for (const col of columnas) {
      const contenido = col.valor(fila);
      const td = el('td', { clase: col.clase || '' });
      if (col.titulo) td.dataset.etiqueta = col.etiqueta || col.titulo;
      else td.classList.add('sin-etiqueta');
      if (contenido !== null && contenido !== undefined) td.append(contenido.nodeType ? contenido : String(contenido));
      tr.append(td);
    }
    cuerpo.append(tr);
  }
  const nodoTabla = el('table', { clase: 'tabla' },
    el('thead', {}, el('tr', {}, columnas.map((c) => el('th', { clase: c.clase || '' }, c.titulo)))),
    cuerpo
  );
  return el('div', { clase: 'tabla-envoltura' }, nodoTabla);
}

// ---------- Estados vacios / carga ----------

function vacio(mensaje, emoji = '📋') {
  return el('div', { clase: 'vacio' }, el('div', { clase: 'vacio-icono' }, emoji), mensaje);
}
function cargando(mensaje = 'Cargando...') {
  return el('div', { clase: 'cargando' }, el('div', { clase: 'girando' }), mensaje);
}

// ---------- Modales ----------

function modal({ titulo, cuerpo, pie, grande, alCerrar }) {
  const zona = $('#zona-modales');
  const caja = el('div', { clase: `modal-caja${grande ? ' grande' : ''}` });
  const velo = el('div', { clase: 'modal-velo' }, caja);

  const cerrar = () => {
    velo.remove();
    document.removeEventListener('keydown', alTeclaEsc);
    if (alCerrar) alCerrar();
  };
  const alTeclaEsc = (ev) => { if (ev.key === 'Escape') cerrar(); };

  caja.append(
    el('div', { clase: 'modal-encabezado' },
      el('h2', {}, titulo),
      el('button', { clase: 'boton-icono', type: 'button', alClic: cerrar, 'aria-label': 'Cerrar' }, icono('cerrar'))
    ),
    el('div', { clase: 'modal-cuerpo' }, cuerpo),
    pie ? el('div', { clase: 'modal-pie' }, pie) : null
  );
  velo.addEventListener('mousedown', (ev) => { if (ev.target === velo) cerrar(); });
  document.addEventListener('keydown', alTeclaEsc);
  zona.append(velo);
  const primero = caja.querySelector('input, select, textarea');
  if (primero) setTimeout(() => primero.focus(), 60);
  return { cerrar, caja };
}

function confirmar(titulo, mensaje, { textoBoton = 'Eliminar', clase = 'btn-peligro' } = {}) {
  return new Promise((resolver) => {
    const botonSi = el('button', { clase: `btn ${clase}`, type: 'button' }, textoBoton);
    const botonNo = el('button', { clase: 'btn btn-secundario', type: 'button' }, 'Cancelar');
    const m = modal({
      titulo,
      cuerpo: el('p', { style: 'margin:0' }, mensaje),
      pie: [botonNo, botonSi],
      alCerrar: () => resolver(false),
    });
    botonSi.addEventListener('click', () => { resolver(true); m.alCerrarSilencio = true; m.cerrar(); });
    botonNo.addEventListener('click', () => m.cerrar());
  });
}

// ---------- Toasts ----------

function toast(mensaje, tipo = 'exito') {
  const nodo = el('div', { clase: `toast ${tipo}` }, mensaje);
  $('#zona-toasts').append(nodo);
  setTimeout(() => {
    nodo.style.transition = 'opacity .3s';
    nodo.style.opacity = '0';
    setTimeout(() => nodo.remove(), 320);
  }, 3600);
}

// ---------- Varios ----------

function debounce(fn, ms = 280) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), ms);
  };
}

function exportarCSV(nombreArchivo, encabezados, filas) {
  const escapar = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [encabezados.map(escapar).join(',')];
  for (const fila of filas) lineas.push(fila.map(escapar).join(','));
  const blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const liga = el('a', { href: url, download: nombreArchivo });
  document.body.append(liga);
  liga.click();
  liga.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function irA(ruta) {
  location.hash = ruta.startsWith('#') ? ruta : `#${ruta}`;
}

// Espacio global de vistas; cada archivo de vistas registra las suyas
const Vistas = {};
const Estado = {
  usuario: null,
  usuarios: [],
  config: {},
  catalogos: null, // { rutas, unidades, tarifas }
};

function usuariosActivos() {
  return Estado.usuarios.filter((u) => u.activo);
}
function esGestion() {
  return Estado.usuario && (Estado.usuario.rol === 'admin' || Estado.usuario.rol === 'gerente');
}

async function cargarCatalogos(forzar) {
  if (Estado.catalogos && !forzar) return Estado.catalogos;
  const [rutas, unidades, tarifas] = await Promise.all([
    API.get('/rutas'), API.get('/unidades'), API.get('/tarifas'),
  ]);
  Estado.catalogos = { rutas, unidades, tarifas };
  return Estado.catalogos;
}
