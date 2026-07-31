import { lazy, type ComponentType } from 'react';

/** Marca en sessionStorage para no entrar en un bucle de recargas. */
const CLAVE = 'aura.recarga-despliegue';
const VENTANA_MS = 15_000;

/**
 * `lazy` con recuperación ante despliegues.
 *
 * Las páginas se cargan bajo demanda y cada una es un archivo con hash en el
 * nombre. Cuando se despliega una versión nueva, los archivos de la anterior
 * dejan de existir: cualquier pestaña que llevara rato abierta pide un chunk que
 * ya no está y React Router muestra «Failed to fetch dynamically imported
 * module». No es un error del usuario ni algo que pueda resolver.
 *
 * Aquí se detecta ese caso y se recarga la página una sola vez, que es lo que
 * hace falta para traerse el `index.html` nuevo. Si tras recargar vuelve a
 * fallar dentro de la ventana, ya no se insiste: entonces sí es un fallo real
 * —sin red, archivo corrupto— y se deja subir al `errorElement`.
 */
export function perezoso<T extends ComponentType<Record<string, never>>>(
  cargar: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const modulo = await cargar();
      // Cargó bien: se limpia la marca para que un despliegue futuro pueda
      // volver a recuperarse.
      sessionStorage.removeItem(CLAVE);
      return modulo;
    } catch (error) {
      const ultimaRecarga = Number(sessionStorage.getItem(CLAVE) ?? 0);
      if (Date.now() - ultimaRecarga > VENTANA_MS) {
        sessionStorage.setItem(CLAVE, String(Date.now()));
        window.location.reload();
        // La página se está recargando: no resolver evita que parpadee un error
        // durante el instante que tarda.
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
