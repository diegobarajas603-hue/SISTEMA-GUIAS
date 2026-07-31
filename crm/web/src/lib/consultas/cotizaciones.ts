import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type { Cotizacion, ItemCotizacion, RespuestaLista } from '@/lib/tipos';

export interface FiltrosCotizacion {
  estado?: string; cuenta?: number; propietario?: number; q?: string; mios?: boolean; sin_respuesta?: boolean; limite?: number;
}

export const usarCotizaciones = (filtros: FiltrosCotizacion = {}) =>
  useQuery({
    queryKey: ['cotizaciones', filtros],
    queryFn: () => api.get<RespuestaLista<Cotizacion> & { resumen: Array<{ estado: string; total: number; monto: number }> }>(
      conQuery('/cotizaciones', filtros as Record<string, unknown>),
    ),
    placeholderData: (prev) => prev,
  });

export const usarCotizacion = (id: number | null) =>
  useQuery({
    queryKey: ['cotizacion', id],
    queryFn: () => api.get<Cotizacion>(`/cotizaciones/${id}`),
    enabled: id != null,
  });

export const usarEmbudoCotizaciones = () =>
  useQuery({
    queryKey: ['cotizaciones-embudo'],
    queryFn: () => api.get<{ enviadas: number; vistas: number; aceptadas: number; rechazadas: number; monto_aceptado: number; monto_en_juego: number; dias_promedio_respuesta: number }>('/cotizaciones/embudo'),
  });

export const urlPdfCotizacion = (id: number) => `/api/v1/cotizaciones/${id}/pdf`;

export function usarCalcularTotales() {
  return useMutation({
    mutationFn: (items: ItemCotizacion[]) => api.post<{ items: ItemCotizacion[]; subtotal: number; descuento: number; impuestos: number; total: number }>('/cotizaciones/calcular', { items }),
  });
}

export function usarCrearCotizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) => api.post<Cotizacion>('/cotizaciones', datos),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function usarActualizarCotizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: Record<string, unknown> }) => api.put<Cotizacion>(`/cotizaciones/${id}`, datos),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      qc.invalidateQueries({ queryKey: ['cotizacion', v.id] });
    },
  });
}

export function usarCambiarEstadoCotizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) => api.put<Cotizacion>(`/cotizaciones/${id}/estado`, { estado }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      qc.invalidateQueries({ queryKey: ['cotizacion', v.id] });
      qc.invalidateQueries({ queryKey: ['oportunidades'] });
      qc.invalidateQueries({ queryKey: ['cotizaciones-embudo'] });
    },
  });
}

export function usarEliminarCotizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/cotizaciones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cotizaciones'] }),
  });
}
