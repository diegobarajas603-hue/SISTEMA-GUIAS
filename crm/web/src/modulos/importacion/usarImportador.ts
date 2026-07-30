import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analizarClientes, enviarLote, finalizarImportacion, iniciarImportacion,
  type AnalisisPrevio,
} from '@/lib/consultas/importacion';
import type {
  ArchivoAnalizado, ClientePreparado, ConteoImportacion, EstrategiaDuplicado,
  PeticionWorker, ResultadoFila, RespuestaWorker, ResumenAgrupado,
} from './tipos';

export type Paso = 'archivo' | 'mapeo' | 'revision' | 'importando' | 'resumen';
export type EstrategiaGlobal = EstrategiaDuplicado | 'caso_por_caso';

/** Tamaño de lote: suficientemente grande para ir rápido, suficientemente pequeño
 *  para que la barra de progreso se mueva y el cuerpo HTTP no se dispare. */
const TAMANO_LOTE = 200;
const LOTE_ANALISIS = 2000;

export interface EstadoProgreso {
  procesados: number;
  total: number;
  conteo: ConteoImportacion;
  iniciadoEn: number;
  msRestantes: number | null;
}

const CONTEO_CERO: ConteoImportacion = { creados: 0, actualizados: 0, omitidos: 0, fallidos: 0, contactos: 0 };

/**
 * Orquesta el asistente completo: worker para lo pesado, API para lo que escribe.
 * La página solo pinta; toda la máquina de estados vive aquí.
 */
export function usarImportador() {
  const workerRef = useRef<Worker | null>(null);
  const resolverRef = useRef<((r: RespuestaWorker) => void) | null>(null);
  const cancelado = useRef(false);

  const [paso, setPaso] = useState<Paso>('archivo');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisisArchivo, setAnalisisArchivo] = useState<ArchivoAnalizado | null>(null);
  const [mapeo, setMapeo] = useState<Record<number, string | null>>({});
  const [resumen, setResumen] = useState<ResumenAgrupado | null>(null);
  const [previo, setPrevio] = useState<AnalisisPrevio | null>(null);
  const [estrategia, setEstrategia] = useState<EstrategiaGlobal>('omitir');
  const [decisiones, setDecisiones] = useState<Record<string, EstrategiaDuplicado>>({});
  const [progreso, setProgreso] = useState<EstadoProgreso | null>(null);
  const [fase, setFase] = useState<{ etiqueta: string; porcentaje: number } | null>(null);
  const [resultados, setResultados] = useState<ResultadoFila[]>([]);
  const [importacionId, setImportacionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // El worker se crea una vez y se destruye al salir: crearlo por archivo
  // dejaría hilos huérfanos si el usuario prueba varios seguidos.
  useEffect(() => {
    const w = new Worker(new URL('./worker-excel.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<RespuestaWorker>) => {
      const m = e.data;
      if (m.tipo === 'progreso') {
        setFase({ etiqueta: m.fase === 'leyendo' ? 'Leyendo el archivo' : 'Agrupando clientes', porcentaje: m.porcentaje });
        return;
      }
      if (m.tipo === 'error') {
        setError(m.mensaje);
        setOcupado(false);
        setFase(null);
        resolverRef.current = null;
        return;
      }
      resolverRef.current?.(m);
      resolverRef.current = null;
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  /** Envía una petición al worker y espera su respuesta. */
  const pedir = useCallback((peticion: PeticionWorker) => new Promise<RespuestaWorker>((resolve, reject) => {
    const w = workerRef.current;
    if (!w) return reject(new Error('El procesador de archivos no está disponible.'));
    resolverRef.current = resolve;
    w.postMessage(peticion);
    return undefined;
  }), []);

  // ------------------------------------------------------------- paso 1 → 2

  const cargarArchivo = useCallback(async (f: File, hoja?: string) => {
    setError(null);
    setOcupado(true);
    setArchivo(f);
    try {
      const r = await pedir({ tipo: 'analizar', archivo: f, hoja });
      if (r.tipo !== 'analizado') return;
      setAnalisisArchivo(r.datos);
      setMapeo(Object.fromEntries(r.datos.columnas.map((c) => [c.indice, c.campo])));
      setPaso('mapeo');
    } finally {
      setOcupado(false);
      setFase(null);
    }
  }, [pedir]);

  // ------------------------------------------------------------- paso 2 → 3

  const confirmarMapeo = useCallback(async () => {
    setError(null);
    setOcupado(true);
    try {
      const r = await pedir({ tipo: 'agrupar', mapeo });
      if (r.tipo !== 'agrupado') return;
      setResumen(r.resumen);

      // Duplicados contra la base, por trozos para no pasarse del cuerpo HTTP.
      const llaves = await pedir({ tipo: 'llaves' });
      if (llaves.tipo !== 'llaves') return;

      const acumulado: AnalisisPrevio = {
        total: 0, duplicados: [], totalDuplicados: 0, avisos: {}, ejecutivosDesconocidos: [],
      };
      const desconocidos = new Set<string>();
      for (let i = 0; i < llaves.clientes.length; i += LOTE_ANALISIS) {
        setFase({
          etiqueta: 'Buscando duplicados',
          porcentaje: Math.round((i / Math.max(1, llaves.clientes.length)) * 100),
        });
        const parcial = await analizarClientes(llaves.clientes.slice(i, i + LOTE_ANALISIS));
        acumulado.total += parcial.total;
        acumulado.duplicados.push(...parcial.duplicados);
        acumulado.totalDuplicados += parcial.totalDuplicados;
        for (const d of parcial.ejecutivosDesconocidos) desconocidos.add(d);
      }
      acumulado.ejecutivosDesconocidos = [...desconocidos];
      setPrevio(acumulado);
      setPaso('revision');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar el archivo.');
    } finally {
      setOcupado(false);
      setFase(null);
    }
  }, [mapeo, pedir]);

  // ------------------------------------------------------------- paso 3 → 4

  const importar = useCallback(async () => {
    if (!archivo || !resumen) return;
    setError(null);
    cancelado.current = false;
    setPaso('importando');

    const iniciadoEn = Date.now();
    let acumulado: ConteoImportacion = { ...CONTEO_CERO };
    const todos: ResultadoFila[] = [];
    setProgreso({ procesados: 0, total: resumen.totalClientes, conteo: acumulado, iniciadoEn, msRestantes: null });

    try {
      if (estrategia === 'caso_por_caso') await pedir({ tipo: 'decisiones', decisiones });

      const mapeoLegible = Object.fromEntries(
        Object.entries(mapeo)
          .filter(([, campo]) => campo)
          .map(([i, campo]) => [analisisArchivo?.encabezados[Number(i)] ?? i, campo as string]),
      );

      const importacion = await iniciarImportacion({
        archivo: archivo.name,
        tamano_bytes: archivo.size,
        estrategia,
        total_filas: resumen.totalFilas,
        total_clientes: resumen.totalClientes,
        mapeo: mapeoLegible,
      });
      setImportacionId(importacion.id);

      for (let desde = 0; desde < resumen.totalClientes; desde += TAMANO_LOTE) {
        if (cancelado.current) {
          await finalizarImportacion(importacion.id, 'cancelada');
          setPaso('resumen');
          return;
        }

        const lote = await pedir({ tipo: 'lote', desde, cantidad: TAMANO_LOTE });
        if (lote.tipo !== 'lote') break;

        const r = await enviarLote(importacion.id, lote.clientes as ClientePreparado[], estrategia);
        todos.push(...r.resultados);
        acumulado = {
          creados: acumulado.creados + r.conteo.creados,
          actualizados: acumulado.actualizados + r.conteo.actualizados,
          omitidos: acumulado.omitidos + r.conteo.omitidos,
          fallidos: acumulado.fallidos + r.conteo.fallidos,
          contactos: acumulado.contactos + r.conteo.contactos,
        };

        const procesados = Math.min(desde + TAMANO_LOTE, resumen.totalClientes);
        const transcurrido = Date.now() - iniciadoEn;
        const msRestantes = procesados > 0
          ? Math.round((transcurrido / procesados) * (resumen.totalClientes - procesados))
          : null;
        setProgreso({ procesados, total: resumen.totalClientes, conteo: acumulado, iniciadoEn, msRestantes });
      }

      await finalizarImportacion(importacion.id, 'completada');
      setResultados(todos);
      setPaso('resumen');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La importación se interrumpió.');
      setResultados(todos);
      if (importacionId) await finalizarImportacion(importacionId, 'fallida').catch(() => {});
      setPaso('resumen');
    }
  }, [archivo, resumen, estrategia, decisiones, mapeo, analisisArchivo, pedir, importacionId]);

  const cancelar = useCallback(() => { cancelado.current = true; }, []);

  const reiniciar = useCallback(() => {
    setPaso('archivo');
    setArchivo(null);
    setAnalisisArchivo(null);
    setMapeo({});
    setResumen(null);
    setPrevio(null);
    setDecisiones({});
    setProgreso(null);
    setResultados([]);
    setImportacionId(null);
    setError(null);
  }, []);

  /** Un campo del CRM no puede recibir dos columnas del Excel. */
  const camposDuplicados = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const campo of Object.values(mapeo)) {
      if (campo) cuenta.set(campo, (cuenta.get(campo) ?? 0) + 1);
    }
    return [...cuenta.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  }, [mapeo]);

  const hayNombre = useMemo(() => Object.values(mapeo).includes('nombre'), [mapeo]);

  return {
    paso, setPaso, archivo, analisisArchivo, mapeo, setMapeo, resumen, previo,
    estrategia, setEstrategia, decisiones, setDecisiones, progreso, resultados,
    importacionId, error, setError, ocupado, fase,
    camposDuplicados, hayNombre,
    cargarArchivo, confirmarMapeo, importar, cancelar, reiniciar,
  };
}
