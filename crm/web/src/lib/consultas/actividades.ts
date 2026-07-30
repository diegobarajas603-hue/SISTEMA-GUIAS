import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type { Actividad, RespuestaLista } from '@/lib/tipos';

export interface FiltrosActividad {
  tipo?: string; estado?: string; usuario?: number; cuenta?: number; oportunidad?: number; lead?: number;
  mios?: boolean; vencidas?: boolean; hoy?: boolean; limite?: number;
}

export const usarActividades = (filtros: FiltrosActividad = {}) =>
  useQuery({
    queryKey: ['actividades', filtros],
    queryFn: () => api.get<RespuestaLista<Actividad>>(conQuery('/actividades', filtros as Record<string, unknown>)),
    placeholderData: (prev) => prev,
  });

export const usarActividadesHoy = () =>
  useQuery({
    queryKey: ['actividades-hoy'],
    queryFn: () => api.get<Record<string, number>>('/actividades/hoy'),
  });

export const usarAgenda = (desde: string, hasta: string, mios = true, usuarioId?: number) =>
  useQuery({
    queryKey: ['agenda', desde, hasta, mios, usuarioId],
    queryFn: () => api.get<{ eventos: Actividad[]; porDia: Array<{ dia: string; total: number; pendientes: number; reuniones: number }> }>(
      conQuery('/actividades/agenda', { desde, hasta, mios: mios ? '1' : '0', usuario: usuarioId }),
    ),
  });

function invalidarTodo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['actividades'] });
  qc.invalidateQueries({ queryKey: ['actividades-hoy'] });
  qc.invalidateQueries({ queryKey: ['agenda'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}

export function usarCrearActividad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) => api.post<Actividad>('/actividades', datos),
    onSuccess: (d) => {
      invalidarTodo(qc);
      if (d.cuenta_id) qc.invalidateQueries({ queryKey: ['cuenta', d.cuenta_id] });
      if (d.oportunidad_id) qc.invalidateQueries({ queryKey: ['oportunidad', d.oportunidad_id] });
      if (d.lead_id) qc.invalidateQueries({ queryKey: ['lead', d.lead_id] });
    },
  });
}

export function usarCompletarActividad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resultado, duracion_min }: { id: number; resultado?: string; duracion_min?: number }) =>
      api.put<Actividad>(`/actividades/${id}/completar`, { resultado, duracion_min }),
    onSuccess: (d) => {
      invalidarTodo(qc);
      if (d.cuenta_id) qc.invalidateQueries({ queryKey: ['cuenta', d.cuenta_id] });
      if (d.oportunidad_id) qc.invalidateQueries({ queryKey: ['oportunidad', d.oportunidad_id] });
      if (d.lead_id) qc.invalidateQueries({ queryKey: ['lead', d.lead_id] });
    },
  });
}

export function usarEliminarActividad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/actividades/${id}`),
    onSuccess: () => invalidarTodo(qc),
  });
}
