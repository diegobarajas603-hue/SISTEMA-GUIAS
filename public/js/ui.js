/* ============================================================================
   FLETES TAURO — HELPERS DE UI
   Render de primitivos. Sin dependencias, sin build. Expone window.UI.
   ==========================================================================*/

(function () {
  'use strict';

  const reduceMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Escape ---------- */

  function esc(t) {
    const d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  /* ---------- Estatus ----------
     Traduce un estatus del backend a su familia visual. Los nombres de
     estatus son los del sistema y no se tocan. */

  const ETIQUETAS = {
    EN_TRANSITO_A_CDMX: 'En transito a CDMX',
    EN_TRANSITO_A_MTY: 'En transito a MTY',
    EN_BODEGA_CDMX: 'En bodega CDMX',
    EN_BODEGA_MTY: 'En bodega MTY',
    EN_RUTA_ENTREGA_CDMX: 'En ruta de entrega CDMX',
    EN_RUTA_ENTREGA_MTY: 'En ruta de entrega MTY',
    ENTREGADO_CDMX: 'Entregado CDMX',
    ENTREGADO_MTY: 'Entregado MTY',
  };

  function statusKind(estatus) {
    const e = String(estatus || '');
    if (e.startsWith('EN_TRANSITO')) return 'transito';
    if (e.startsWith('EN_BODEGA')) return 'bodega';
    if (e.startsWith('EN_RUTA_ENTREGA')) return 'reparto';
    if (e.startsWith('ENTREGADO')) return 'entregado';
    if (e.startsWith('CANCELAD')) return 'cancelada';
    if (e.startsWith('ELIMINAD')) return 'eliminada';
    return 'neutro';
  }

  function etiqueta(estatus) {
    return ETIQUETAS[estatus] || estatus;
  }

  /** Badge de estatus: punto + texto, nunca solo color. */
  function badge(estatus, opciones) {
    const o = opciones || {};
    const clases = ['badge', 'badge--' + statusKind(estatus)];
    if (o.lg) clases.push('badge--lg');
    return `<span class="${clases.join(' ')}">${esc(o.texto || etiqueta(estatus))}</span>`;
  }

  /** Punto de estatus suelto, para filas de diagrama. */
  function dot(estatus) {
    return `<span class="dot dot--${statusKind(estatus)}"></span>`;
  }

  /* ---------- Formato ---------- */

  // Reloj de 24 h en toda la app: en operacion logistica se lee mas rapido,
  // no admite ambiguedad y ocupa menos ancho en las columnas de tabla.
  function fmtFecha(f) {
    return new Date(f).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  function fmtHora(f) {
    return new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function fmtRelativo(f) {
    const seg = (Date.now() - new Date(f).getTime()) / 1000;
    if (seg < 60) return 'hace un momento';
    if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
    if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
    if (seg < 604800) return `hace ${Math.floor(seg / 86400)} d`;
    return fmtFecha(f);
  }

  /* ---------- Avatar de iniciales ---------- */

  function initials(nombre) {
    const partes = String(nombre || '?').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2);
    return partes[0][0] + partes[partes.length - 1][0];
  }

  /** Hue estable derivada del nombre, para que cada persona tenga su color. */
  function avatarHue(nombre) {
    const s = String(nombre || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }

  function avatar(nombre, opciones) {
    const o = opciones || {};
    const clase = 'avatar' + (o.sm ? ' avatar--sm' : '');
    return `<span class="${clase}" style="--avatar-h:${avatarHue(nombre)}" aria-hidden="true">${esc(initials(nombre))}</span>`;
  }

  /* ---------- Contador animado (0 → valor, una sola vez) ---------- */

  function countUp(el, valor, duracion) {
    const destino = Number(valor) || 0;
    if (reduceMotion() || destino === 0) {
      el.textContent = String(destino);
      return;
    }
    const ms = duracion || 600;
    const inicio = performance.now();
    function paso(ahora) {
      const t = Math.min((ahora - inicio) / ms, 1);
      // easeOutExpo: arranca rapido y aterriza suave en el valor final
      const p = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = String(Math.round(destino * p));
      if (t < 1) requestAnimationFrame(paso);
      else el.textContent = String(destino);
    }
    requestAnimationFrame(paso);
  }

  /* ---------- Segmented control ----------
     Marca: <div class="seg"><div class="seg__thumb"></div>
              <button class="seg__option" data-value="MTY">MTY</button> ... </div> */

  function segmented(contenedor, onChange) {
    if (!contenedor) return null;
    const thumb = contenedor.querySelector('.seg__thumb');
    const opciones = [...contenedor.querySelectorAll('.seg__option')];

    function mover() {
      const activo = contenedor.querySelector('.seg__option[aria-selected="true"]');
      if (!activo || !thumb) return;
      thumb.style.setProperty('--seg-w', activo.offsetWidth + 'px');
      thumb.style.setProperty('--seg-x', activo.offsetLeft - 3 + 'px');
    }

    function seleccionar(valor, avisar) {
      opciones.forEach((b) =>
        b.setAttribute('aria-selected', String(b.dataset.value === String(valor)))
      );
      mover();
      if (avisar && onChange) onChange(valor);
    }

    opciones.forEach((b) => {
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => seleccionar(b.dataset.value, true));
      // Navegacion con flechas entre opciones
      b.addEventListener('keydown', (e) => {
        const i = opciones.indexOf(b);
        let destino = null;
        if (e.key === 'ArrowRight') destino = opciones[(i + 1) % opciones.length];
        if (e.key === 'ArrowLeft') destino = opciones[(i - 1 + opciones.length) % opciones.length];
        if (destino) {
          e.preventDefault();
          destino.focus();
          seleccionar(destino.dataset.value, true);
        }
      });
    });

    contenedor.setAttribute('role', 'tablist');
    // El thumb necesita medidas reales: re-mide al cambiar el tamaño
    if (window.ResizeObserver) new ResizeObserver(mover).observe(contenedor);
    window.addEventListener('resize', mover);
    requestAnimationFrame(mover);

    return { seleccionar: (v) => seleccionar(v, false), mover };
  }

  /* ---------- Skeleton ---------- */

  function skeleton(clase, estilo) {
    return `<div class="skeleton ${clase || 'skeleton--text'}"${estilo ? ` style="${estilo}"` : ''}></div>`;
  }

  /** Bloque de skeletons con la forma de N filas de tabla. */
  function skeletonRows(n, cols) {
    let out = '';
    for (let i = 0; i < (n || 5); i++) {
      out += '<tr>';
      for (let c = 0; c < (cols || 5); c++) {
        out += `<td>${skeleton('skeleton--text', `width:${45 + ((i * 7 + c * 13) % 45)}%`)}</td>`;
      }
      out += '</tr>';
    }
    return out;
  }

  /* ---------- Empty state / error ---------- */

  const ICONOS = {
    vacio: '<path d="M4 7h24v18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 7l3-4h18l3 4M12 14h8"/>',
    busqueda: '<circle cx="14" cy="14" r="9"/><path d="M21 21l7 7"/>',
    error: '<circle cx="16" cy="16" r="12"/><path d="M16 10v8M16 22h.01"/>',
    candado: '<rect x="7" y="14" width="18" height="14" rx="2"/><path d="M11 14v-4a5 5 0 0 1 10 0v4"/>',
  };

  function emptyState(o) {
    const op = o || {};
    const icono = ICONOS[op.icono || 'vacio'] || ICONOS.vacio;
    return `<div class="empty ${op.error ? 'empty--error' : ''}">
      <svg class="empty__icon" viewBox="0 0 32 32" fill="none" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icono}</svg>
      <div class="empty__title">${esc(op.titulo || 'Sin resultados')}</div>
      ${op.descripcion ? `<p class="empty__desc">${esc(op.descripcion)}</p>` : ''}
      ${op.accion ? `<div class="empty__action"><button class="btn btn--secondary btn--sm" data-empty-action>${esc(op.accion)}</button></div>` : ''}
    </div>`;
  }

  function errorState(mensaje, onReintentar) {
    const html = emptyState({
      icono: 'error',
      error: true,
      titulo: 'No se pudo cargar',
      descripcion: mensaje,
      accion: onReintentar ? 'Reintentar' : null,
    });
    return html;
  }

  /* ---------- Toast ---------- */

  function toastRegion() {
    let r = document.getElementById('toastRegion');
    if (!r) {
      r = document.createElement('div');
      r.id = 'toastRegion';
      r.className = 'toast-region';
      r.setAttribute('role', 'status');
      r.setAttribute('aria-live', 'polite');
      document.body.appendChild(r);
    }
    return r;
  }

  function toast(o) {
    const op = typeof o === 'string' ? { titulo: o } : o || {};
    const el = document.createElement('div');
    el.className = 'toast toast--' + (op.tipo || 'info');
    el.innerHTML = `
      <div class="toast__body">
        <div class="toast__title">${esc(op.titulo || '')}</div>
        ${op.descripcion ? `<div class="toast__desc">${esc(op.descripcion)}</div>` : ''}
      </div>
      <button class="toast__close" type="button" aria-label="Cerrar aviso">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M6 6l8 8M14 6l-8 8"/>
        </svg>
      </button>`;

    function cerrar() {
      if (!el.isConnected) return;
      el.classList.add('is-leaving');
      const quitar = () => el.remove();
      if (reduceMotion()) quitar();
      else el.addEventListener('animationend', quitar, { once: true });
    }

    el.querySelector('.toast__close').addEventListener('click', cerrar);
    toastRegion().appendChild(el);
    const ms = op.duracion === 0 ? 0 : op.duracion || 4500;
    if (ms) setTimeout(cerrar, ms);
    return cerrar;
  }

  /* ---------- Modal de confirmacion ----------
     Devuelve Promise<boolean>. Las acciones destructivas pasan siempre por aqui. */

  function confirmar(o) {
    const op = o || {};
    return new Promise((resolve) => {
      const scrim = document.createElement('div');
      scrim.className = 'modal-scrim';
      scrim.innerHTML = `
        <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modalTitulo">
          <div class="modal-panel__header">
            <h2 class="modal-panel__title" id="modalTitulo">${esc(op.titulo || '¿Confirmar?')}</h2>
            ${op.descripcion ? `<p class="modal-panel__desc">${esc(op.descripcion)}</p>` : ''}
          </div>
          ${op.cuerpo ? `<div class="modal-panel__body">${op.cuerpo}</div>` : ''}
          <div class="modal-panel__footer">
            <button class="btn btn--secondary" data-accion="cancelar">${esc(op.cancelar || 'Cancelar')}</button>
            <button class="btn ${op.peligro ? 'btn--danger' : 'btn--primary'}" data-accion="confirmar">${esc(op.confirmar || 'Confirmar')}</button>
          </div>
        </div>`;

      const antesDelModal = document.activeElement;
      const panel = scrim.querySelector('.modal-panel');
      const focusables = () =>
        [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
          .filter((el) => !el.disabled && el.offsetParent !== null);

      function cerrar(valor) {
        // alCerrar puede transformar el resultado (por ejemplo, leer un
        // campo del cuerpo) mientras el panel sigue en el DOM
        const resultado = op.alCerrar ? op.alCerrar(panel, valor) : valor;
        document.removeEventListener('keydown', onKey, true);
        scrim.remove();
        if (antesDelModal && antesDelModal.focus) antesDelModal.focus();
        resolve(resultado);
      }

      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cerrar(false);
          return;
        }
        // Foco atrapado dentro del modal
        if (e.key === 'Tab') {
          const f = focusables();
          if (!f.length) return;
          const primero = f[0];
          const ultimo = f[f.length - 1];
          if (e.shiftKey && document.activeElement === primero) {
            e.preventDefault();
            ultimo.focus();
          } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault();
            primero.focus();
          }
        }
      }

      scrim.addEventListener('click', (e) => {
        if (e.target === scrim) cerrar(false);
      });
      panel.querySelector('[data-accion="cancelar"]').addEventListener('click', () => cerrar(false));
      panel.querySelector('[data-accion="confirmar"]').addEventListener('click', () => cerrar(true));
      document.addEventListener('keydown', onKey, true);

      document.body.appendChild(scrim);
      if (op.alAbrir) op.alAbrir(panel);
      else panel.querySelector('[data-accion="confirmar"]').focus();
    });
  }

  /** Modal con un campo de texto. Devuelve Promise<string|null>.
      Sustituye a prompt(), que no se puede estilizar ni atrapa el foco. */
  function pedir(o) {
    const op = o || {};
    const id = 'campoModal';
    const cuerpo = `<label class="field">
        <span class="field__label">${esc(op.etiqueta || '')}</span>
        <input class="input" type="${op.tipo || 'text'}" id="${id}"
               placeholder="${esc(op.placeholder || '')}" autocomplete="off" />
      </label>`;

    return new Promise((resolve) => {
      confirmar({
        titulo: op.titulo,
        descripcion: op.descripcion,
        cuerpo,
        confirmar: op.confirmar,
        cancelar: op.cancelar,
        peligro: op.peligro,
        alAbrir: (panel) => {
          const campo = panel.querySelector('#' + id);
          campo.focus();
          // Enter confirma sin tener que llegar al boton
          campo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              panel.querySelector('[data-accion="confirmar"]').click();
            }
          });
        },
        alCerrar: (panel, ok) => (ok ? panel.querySelector('#' + id).value : null),
      }).then(resolve);
    });
  }

  window.UI = {
    esc,
    ETIQUETAS,
    statusKind,
    etiqueta,
    badge,
    dot,
    fmtFecha,
    fmtHora,
    fmtRelativo,
    initials,
    avatarHue,
    avatar,
    countUp,
    segmented,
    skeleton,
    skeletonRows,
    emptyState,
    errorState,
    toast,
    confirmar,
    pedir,
    reduceMotion,
  };
})();
