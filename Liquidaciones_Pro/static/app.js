/* =========================================================
   app.js — Interacciones de la interfaz (sin lógica de negocio)
   Tema claro/oscuro, reloj, toasts, Ctrl+K, estados de carga,
   panel lateral, filtros, orden, exportación de tablas y
   navegación con teclado en listas.
   ========================================================= */

const ICONOS = {
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};
function svg(nombre, tam){
    return '<svg class="ico" width="' + (tam||18) + '" height="' + (tam||18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + ICONOS[nombre] + '</svg>';
}

// ---------- Tema (oscuro por defecto) ----------
function temaActual(){
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
function pintarBotonTema(){
    const btn = document.getElementById('btn-tema');
    if(btn) btn.dataset.tip = temaActual() === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
}
function cambiarTema(){
    const nuevo = temaActual() === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nuevo);
    try { localStorage.setItem('lq-tema', nuevo); } catch(e){}
    pintarBotonTema();
}
pintarBotonTema();

// ---------- Reloj de la barra superior: "Martes 06 oct · 11:37" ----------
(function(){
    const el = document.getElementById('reloj');
    if(!el) return;
    const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const dos = n => String(n).padStart(2, '0');
    function pintar(){
        const d = new Date();
        el.textContent = DIAS[d.getDay()] + ' ' + dos(d.getDate()) + ' ' + MES[d.getMonth()] + ' · ' + dos(d.getHours()) + ':' + dos(d.getMinutes());
    }
    pintar();
    setInterval(pintar, 15000);
})();

// ---------- Toasts ----------
function toast(titulo, detalle, tipo, duracion){
    tipo = tipo || 'info';
    const cont = document.getElementById('toasts');
    if(!cont) return;
    const el = document.createElement('div');
    el.className = 'toast ' + tipo;
    el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    el.innerHTML = '<span class="toast-punto"></span><div class="toast-texto"><b></b>' + (detalle ? '<small></small>' : '') + '</div>'
                 + '<button type="button" class="cerrar" aria-label="Cerrar">' + svg('x', 14) + '</button>';
    el.querySelector('b').textContent = titulo;
    if(detalle) el.querySelector('small').textContent = detalle;
    el.querySelector('.cerrar').onclick = () => quitarToast(el);
    cont.appendChild(el);
    setTimeout(() => quitarToast(el), duracion || 4000);
}
function quitarToast(el){
    if(!el || el.classList.contains('saliendo')) return;
    el.classList.add('saliendo');
    setTimeout(() => el.remove(), 180);
}

// Mensajes que llegan por la URL (?mensaje=...&tipo=ok)
(function(){
    const p = new URLSearchParams(location.search);
    const m = p.get('mensaje');
    if(m){
        toast(m, '', p.get('tipo') || (p.get('pdf') ? 'ok' : 'warn'));
        p.delete('mensaje'); p.delete('tipo');
        const q = p.toString();
        history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    }
    const t = document.body.dataset.toast;
    if(t) toast(t, document.body.dataset.toastDetalle || '', document.body.dataset.toastTipo || 'ok');
})();

// ---------- Estados de carga en formularios ----------
document.addEventListener('submit', function(e){
    const form = e.target;
    if(!(form instanceof HTMLFormElement)) return;
    const btn = form.querySelector('button[type="submit"], .btn[type="submit"]');
    if(btn && !btn.classList.contains('cargando')){
        btn.classList.add('cargando');
        if(!btn.querySelector('.spinner')){
            const sp = document.createElement('span'); sp.className = 'spinner';
            btn.prepend(sp);
        }
        // Seguridad: si algo evita la navegación, se libera el botón
        setTimeout(() => btn.classList.remove('cargando'), 8000);
    }
});

// ---------- Ctrl+K para buscar · Esc ----------
function enfocarFolio(){
    const campo = document.getElementById('folio') || document.querySelector('[data-buscador]');
    if(campo){ campo.focus(); campo.select && campo.select(); }
    return !!campo;
}
document.addEventListener('keydown', function(e){
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){
        e.preventDefault();
        enfocarFolio();
    }
    if(e.key === 'Escape'){
        const abierto = document.querySelector('.panel-lateral.abierto');
        if(abierto){ cerrarPanel(); return; }
        if(typeof window.alEscape === 'function') window.alEscape(e);
    }
});

// "Nueva liquidación": en el panel enfoca el buscador de folio; en otra pantalla lleva al panel.
function irANueva(e){
    if(location.pathname === '/'){
        if(e) e.preventDefault();
        enfocarFolio();
        toast('Escribe el folio de salida', 'O elige uno de la lista "Por liquidar".', 'info', 2500);
        return false;
    }
    return true;
}
if(location.hash === '#nueva'){
    setTimeout(enfocarFolio, 50);
}

// ---------- Panel lateral ----------
function abrirPanel(id){
    const panel = document.getElementById(id);
    const overlay = document.getElementById('overlay');
    if(!panel) return;
    document.querySelectorAll('.panel-lateral.abierto').forEach(p => p.classList.remove('abierto'));
    panel.classList.add('abierto');
    overlay && overlay.classList.add('abierto');
    const primero = panel.querySelector('input, button');
    if(primero) setTimeout(() => primero.focus(), 120);
}
function cerrarPanel(){
    document.querySelectorAll('.panel-lateral.abierto').forEach(p => p.classList.remove('abierto'));
    const overlay = document.getElementById('overlay');
    overlay && overlay.classList.remove('abierto');
}

// ---------- Listas navegables con ↑ ↓ y Enter ----------
// Los elementos deben ser enfocables (botones o enlaces) dentro del contenedor.
function listaNavegable(contenedor, selector){
    if(!contenedor) return;
    contenedor.addEventListener('keydown', function(e){
        if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const items = Array.from(contenedor.querySelectorAll(selector)).filter(el => el.offsetParent !== null);
        const i = items.indexOf(document.activeElement);
        if(i === -1) return;
        e.preventDefault();
        const sig = items[e.key === 'ArrowDown' ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, 0)];
        sig && sig.focus();
    });
}

// ---------- Tablas: buscar, filtrar, ordenar, exportar ----------
function filtrarTabla(tablaId, opciones){
    const tabla = document.getElementById(tablaId);
    if(!tabla) return;
    const texto = (opciones.texto || '').toLowerCase();
    const desde = opciones.desde || '';
    const hasta = opciones.hasta || '';
    const tipo = opciones.tipo || '';
    const mes = opciones.mes || '';          // 'AAAA-MM' o vacío = todos
    let visibles = 0;
    tabla.querySelectorAll('tbody tr[data-fecha]').forEach(function(fila){
        let ok = fila.textContent.toLowerCase().includes(texto);
        const f = fila.dataset.fecha || '';
        if(ok && mes && f.slice(0, 7) !== mes) ok = false;
        if(ok && desde && f < desde) ok = false;
        if(ok && hasta && f > hasta) ok = false;
        if(ok && tipo && fila.dataset.tipo !== tipo) ok = false;
        fila.style.display = ok ? '' : 'none';
        if(ok) visibles++;
    });
    const cont = document.getElementById(tablaId + '-conteo');
    if(cont) cont.textContent = visibles + ' registro' + (visibles === 1 ? '' : 's');
    const vacio = document.getElementById(tablaId + '-vacio');
    if(vacio) vacio.hidden = visibles !== 0;
    return visibles;
}

function ordenarTabla(tablaId, th){
    const tabla = document.getElementById(tablaId);
    const clave = th.dataset.sort;
    const tbody = tabla.querySelector('tbody');
    const filas = Array.from(tbody.querySelectorAll('tr[data-fecha]'));
    const asc = !th.classList.contains('asc');
    tabla.querySelectorAll('th.ordenable').forEach(t => { t.classList.remove('asc', 'desc'); t.removeAttribute('aria-sort'); });
    th.classList.add(asc ? 'asc' : 'desc');
    th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
    filas.sort(function(a, b){
        let va = a.dataset[clave] ?? '', vb = b.dataset[clave] ?? '';
        const na = parseFloat(va), nb = parseFloat(vb);
        if(!isNaN(na) && !isNaN(nb)){ va = na; vb = nb; }
        if(va < vb) return asc ? -1 : 1;
        if(va > vb) return asc ? 1 : -1;
        return 0;
    });
    filas.forEach(f => tbody.appendChild(f));
}

function exportarTabla(tablaId, nombre){
    const tabla = document.getElementById(tablaId);
    const filas = [];
    const cab = Array.from(tabla.querySelectorAll('thead th')).map(th => th.dataset.export ?? th.textContent.trim()).filter(Boolean);
    filas.push(cab);
    tabla.querySelectorAll('tbody tr[data-fecha]').forEach(function(tr){
        if(tr.style.display === 'none') return;
        const celdas = Array.from(tr.querySelectorAll('td')).filter(td => !td.classList.contains('sin-export'))
            .map(td => '"' + td.textContent.trim().replace(/\s+/g, ' ').replace(/"/g, '""') + '"');
        filas.push(celdas);
    });
    const csv = '﻿' + filas.map(f => f.join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
    a.download = (nombre || 'exportacion') + '.csv';
    a.click();
    toast('Archivo exportado', 'Se descargó ' + a.download, 'ok');
}

// ---------- Controles segmentados (solo apariencia) ----------
// <div class="segmento" role="radiogroup"><button role="radio" aria-checked="true">…</button>…</div>
function marcarSegmento(grupo, boton){
    grupo.querySelectorAll('[role="radio"]').forEach(function(b){
        const si = b === boton;
        b.setAttribute('aria-checked', si ? 'true' : 'false');
        b.tabIndex = si ? 0 : -1;
    });
}
document.addEventListener('keydown', function(e){
    const b = e.target;
    if(!(b instanceof HTMLElement) || b.getAttribute('role') !== 'radio') return;
    const grupo = b.closest('.segmento');
    if(!grupo || !['ArrowLeft','ArrowRight'].includes(e.key)) return;
    const items = Array.from(grupo.querySelectorAll('[role="radio"]'));
    const i = items.indexOf(b);
    const sig = items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    e.preventDefault();
    sig.focus(); sig.click();
});
