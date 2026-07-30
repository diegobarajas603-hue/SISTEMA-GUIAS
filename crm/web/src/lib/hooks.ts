import { useEffect, useRef, useState, useCallback } from 'react';

/** Retrasa la propagación de un valor (búsquedas, filtros de texto). */
export function useDespacio<T>(valor: T, ms = 300): T {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}

/** Estado sincronizado con localStorage, con hidratación segura para SSR-less Vite. */
export function useAlmacenLocal<T>(clave: string, porDefecto: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      const guardado = localStorage.getItem(clave);
      return guardado !== null ? (JSON.parse(guardado) as T) : porDefecto;
    } catch {
      return porDefecto;
    }
  });

  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValor((prev) => {
      const siguiente = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      try { localStorage.setItem(clave, JSON.stringify(siguiente)); } catch { /* almacenamiento no disponible */ }
      return siguiente;
    });
  }, [clave]);

  return [valor, set];
}

/** Cierra un panel/menú al hacer clic fuera o presionar Escape. */
export function useCerrarAlExterior<T extends HTMLElement>(activo: boolean, alCerrar: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!activo) return;
    const onClic = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) alCerrar();
    };
    const onTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar(); };
    document.addEventListener('mousedown', onClic);
    document.addEventListener('keydown', onTecla);
    return () => {
      document.removeEventListener('mousedown', onClic);
      document.removeEventListener('keydown', onTecla);
    };
  }, [activo, alCerrar]);
  return ref;
}

/** Registra un atajo de teclado global mientras el componente está montado. */
export function useAtajo(combinacion: string, manejador: (e: KeyboardEvent) => void, activo = true) {
  useEffect(() => {
    if (!activo) return;
    const partes = combinacion.toLowerCase().split('+');
    const tecla = partes.at(-1);
    const necesitaMeta = partes.includes('mod');
    const onTecla = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (necesitaMeta && !meta) return;
      if (!necesitaMeta && meta) return;
      if (e.key.toLowerCase() !== tecla) return;
      manejador(e);
    };
    window.addEventListener('keydown', onTecla);
    return () => window.removeEventListener('keydown', onTecla);
  }, [combinacion, manejador, activo]);
}

/** Anima un número hacia su valor final con `easeOutExpo`. */
export function useContador(valorFinal: number, duracionMs = 900): number {
  const [valor, setValor] = useState(0);
  const inicio = useRef<number | null>(null);
  const desde = useRef(0);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValor(valorFinal);
      return;
    }
    desde.current = valor;
    inicio.current = null;
    let cuadro: number;
    const paso = (marca: number) => {
      if (inicio.current === null) inicio.current = marca;
      const progreso = Math.min((marca - inicio.current) / duracionMs, 1);
      const suavizado = 1 - Math.pow(1 - progreso, 4);
      setValor(Math.round(desde.current + (valorFinal - desde.current) * suavizado));
      if (progreso < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorFinal, duracionMs]);

  return valor;
}

export function useMediaQuery(consulta: string): boolean {
  const [coincide, setCoincide] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const escuchar = () => setCoincide(mq.matches);
    escuchar();
    mq.addEventListener('change', escuchar);
    return () => mq.removeEventListener('change', escuchar);
  }, [consulta]);
  return coincide;
}
