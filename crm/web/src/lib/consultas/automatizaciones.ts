import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Automatizacion, EjecucionFlujo, NodoCatalogo } from '@/lib/tipos';

export const usarAutomatizaciones = () =>
  useQuery({ queryKey: ['automatizaciones'], queryFn: () => api.get<Automatizacion[]>('/automatizaciones') });

export const usarCatalogoNodos = () =>
  useQuery({ queryKey: ['automatizaciones-catalogo'], queryFn: () => api.get<NodoCatalogo[]>('/automatizaciones/catalogo'), staleTime: Infinity });

export const usarMetricasAutomatizaciones = () =>
  useQuery({
    queryKey: ['automatizaciones-metricas'],
    queryFn: () => api.get<{ activas: number; totales: number; ejecuciones: number; fallos: number; ejecuciones_semana: number; en_espera: number; tareas_generadas: number; tareas_ia: number }>('/automatizaciones/metricas'),
  });

export const usarAutomatizacion = (id: number | null) =>
  useQuery({
    queryKey: ['automatizacion', id],
    queryFn: () => api.get<Automatizacion & { ejecuciones: EjecucionFlujo[] }>(`/automatizaciones/${id}`),
    enabled: id != null,
  });

export const usarEjecucionesRecientes = () =>
  useQuery({ queryKey: ['ejecuciones-recientes'], queryFn: () => api.get<EjecucionFlujo[]>('/automatizaciones/ejecuciones?limite=30') });

export function usarValidarFlujo() {
  return useMutation({
    mutationFn: (grafo: { nodos: unknown[]; aristas: unknown[] }) =>
      api.post<{ valido: boolean; errores: string[]; advertencias: string[] }>('/automatizaciones/validar', grafo),
  });
}

export function usarCrearAutomatizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) => api.post<Automatizacion>('/automatizaciones', datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automatizaciones'] }),
  });
}

export function usarActualizarAutomatizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: Record<string, unknown> }) => api.put<Automatizacion>(`/automatizaciones/${id}`, datos),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['automatizaciones'] });
      qc.invalidateQueries({ queryKey: ['automatizacion', v.id] });
    },
  });
}

export function usarAlternarAutomatizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activa }: { id: number; activa: boolean }) => api.put<Automatizacion>(`/automatizaciones/${id}/activa`, { activa }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['automatizaciones'] }); qc.invalidateQueries({ queryKey: ['automatizaciones-metricas'] }); },
  });
}

export function usarEjecutarAutomatizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, entidad_tipo, entidad_id, simulacion }: { id: number; entidad_tipo?: string; entidad_id?: number; simulacion?: boolean }) =>
      api.post<EjecucionFlujo | { simulacion: true; pasos: Array<{ nodo: string; titulo: string; tipo: string; efecto: string; ramifica: boolean }>; aviso: string }>(
        `/automatizaciones/${id}/ejecutar`, { entidad_tipo, entidad_id, simulacion },
      ),
    onSuccess: (_d, v) => {
      if (!v.simulacion) {
        qc.invalidateQueries({ queryKey: ['automatizacion', v.id] });
        qc.invalidateQueries({ queryKey: ['ejecuciones-recientes'] });
        qc.invalidateQueries({ queryKey: ['automatizaciones-metricas'] });
      }
    },
  });
}

export function usarEliminarAutomatizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/automatizaciones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automatizaciones'] }),
  });
}
