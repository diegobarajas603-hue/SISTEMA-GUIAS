/* =========================================================
   app.js — Interacciones de la interfaz (sin lógica de negocio)
   Toasts, Ctrl+K, estados de carga, panel lateral, filtros,
   orden y exportación de tablas.
   ========================================================= */

const ICONOS = {
    ok:    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    warn:  '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info:  '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    x:     '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};
function svg(nombre, tam){
    return '<svg class="ico" width="' + (tam||18) + '" height="' + (tam||18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONOS[nombre] + '</svg>';
}

// ---------- Toasts ----------
function toast(titulo, detalle, tipo, duracion){
    tipo = tipo || 'info';
    const cont = document.getElementById('toasts');
    if(!cont) return;
    const el = document.createElement('div');
    el.className = 'toast ' + tipo;
    el.innerHTML = svg(tipo) + '<div><b>' + titulo + '</b>' + (detalle ? '<small>' + detalle + '</small>' : '') + '</div>'
                 + '<button class="cerrar" aria-label="Cerrar">' + svg('x', 16) + '</button>';
    el.querySelector('.cerrar').onclick = () => quitarToast(el);
    cont.appendChild(el);
    setTimeout(() => quitarToast(el), duracion || 4200);
}
function quitarToast(el){
    if(!el || el.classList.contains('saliendo')) return;
    el.classList.add('saliendo');
    setTimeout(() => el.remove(), 200);
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

// ---------- Ctrl+K / Enter para buscar ----------
document.addEventListener('keydown', function(e){
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){
        const campo = document.getElementById('folio') || document.querySelector('[data-buscador]');
        if(campo){ e.preventDefault(); campo.focus(); campo.select && campo.select(); }
    }
    if(e.key === 'Escape') cerrarPanel();
});
if(location.hash === '#nueva'){
    const campo = document.getElementById('folio');
    if(campo) setTimeout(() => campo.focus(), 50);
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

// ---------- Tablas: buscar, filtrar, ordenar, exportar ----------
function filtrarTabla(tablaId, opciones){
    const tabla = document.getElementById(tablaId);
    if(!tabla) return;
    const texto = (opciones.texto || '').toLowerCase();
    const desde = opciones.desde || '';
    const hasta = opciones.hasta || '';
    const tipo = opciones.tipo || '';
    let visibles = 0;
    tabla.querySelectorAll('tbody tr[data-fecha]').forEach(function(fila){
        let ok = fila.textContent.toLowerCase().includes(texto);
        const f = fila.dataset.fecha || '';
        if(ok && desde && f < desde) ok = false;
        if(ok && hasta && f > hasta) ok = false;
        if(ok && tipo && fila.dataset.tipo !== tipo) ok = false;
        fila.style.display = ok ? '' : 'none';
        if(ok) visibles++;
    });
    const cont = document.getElementById(tablaId + '-conteo');
    if(cont) cont.textContent = visibles + ' registro' + (visibles === 1 ? '' : 's');
    return visibles;
}

function ordenarTabla(tablaId, th){
    const tabla = document.getElementById(tablaId);
    const clave = th.dataset.sort;
    const tbody = tabla.querySelector('tbody');
    const filas = Array.from(tbody.querySelectorAll('tr[data-fecha]'));
    const asc = !th.classList.contains('asc');
    tabla.querySelectorAll('th.ordenable').forEach(t => t.classList.remove('asc', 'desc'));
    th.classList.add(asc ? 'asc' : 'desc');
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
