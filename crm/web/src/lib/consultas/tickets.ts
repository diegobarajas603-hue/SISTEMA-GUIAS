import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type { ArticuloKB, MensajeTicket, RespuestaLista, Ticket } from '@/lib/tipos';

export interface FiltrosTicket {
  estado?: string; prioridad?: string; canal?: string; categoria?: string; cuenta?: number; asignado?: number;
  q?: string; mios?: boolean; abiertos?: boolean; sla_vencido?: boolean; limite?: number;
}

export const usarTickets = (filtros: FiltrosTicket = {}) =>
  useQuery({
    queryKey: ['tickets', filtros],
    queryFn: () => api.get<RespuestaLista<Ticket>>(conQuery('/tickets', filtros as Record<string, unknown>)),
    placeholderData: (prev) => prev,
  });

export const usarMetricasTickets = () =>
  useQuery({
    queryKey: ['tickets-metricas'],
    queryFn: () => api.get<{
      abiertos: number; nuevos: number; sla_incumplido: number; urgentes: number; resueltos_semana: number;
      resueltos_ia: number; horas_primera_respuesta: number; horas_resolucion: number; csat: number; cumplimiento_sla: number;
    }>('/tickets/metricas'),
    refetchInterval: 60_000,
  });

export const usarFacetasTickets = () =>
  useQuery({
    queryKey: ['tickets-facetas'],
    queryFn: () => api.get<{
      categorias: Array<{ valor: string; total: number }>;
      canales: Array<{ valor: string; total: number }>;
      agentes: Array<{ id: number; nombre: string; avatar_tono: number; abiertos: number }>;
    }>('/tickets/facetas'),
  });

export const usarTicket = (id: number | null) =>
  useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api.get<Ticket & { mensajes: MensajeTicket[]; sugerencias: ArticuloKB[]; otrosDeLaCuenta: Array<{ id: number; folio: string; asunto: string; estado: string; creado_en: string }> }>(`/tickets/${id}`),
    enabled: id != null,
  });

export const usarBaseConocimiento = (q?: string) =>
  useQuery({
    queryKey: ['kb', q],
    queryFn: () => api.get<ArticuloKB[]>(conQuery('/tickets/conocimiento', { q })),
  });

function invalidarTickets(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['tickets'] });
  qc.invalidateQueries({ queryKey: ['tickets-metricas'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}

export function usarCrearTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) => api.post<Ticket>('/tickets', datos),
    onSuccess: () => invalidarTickets(qc),
  });
}

export function usarActualizarTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: Record<string, unknown> }) => api.put<Ticket>(`/tickets/${id}`, datos),
    onSuccess: (_d, v) => { invalidarTickets(qc); qc.invalidateQueries({ queryKey: ['ticket', v.id] }); },
  });
}

export function usarCambiarEstadoTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado, csat }: { id: number; estado: string; csat?: number }) =>
      api.put<Ticket>(`/tickets/${id}/estado`, { estado, csat }),
    onSuccess: (_d, v) => { invalidarTickets(qc); qc.invalidateQueries({ queryKey: ['ticket', v.id] }); },
  });
}

export function usarResponderTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cuerpo, autor_tipo, interno }: { id: number; cuerpo: string; autor_tipo?: string; interno?: boolean }) =>
      api.post<MensajeTicket>(`/tickets/${id}/mensajes`, { cuerpo, autor_tipo, interno }),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['ticket', v.id] }); invalidarTickets(qc); },
  });
}

export function usarSugerirRespuesta() {
  return useMutation({
    mutationFn: (id: number) => api.post<{ disponible: boolean; borrador?: string; fuente?: { id: number; titulo: string }; motivo?: string; aviso?: string }>(`/tickets/${id}/sugerir`),
  });
}
