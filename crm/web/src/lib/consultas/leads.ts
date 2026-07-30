import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type { Actividad, EventoBitacora, Lead, Nota, RespuestaLista } from '@/lib/tipos';

export interface SenalLead { id: number; tipo: string; detalle: string | null; creado_en: string; }

export interface LeadDetalle extends Lead {
  senales: SenalLead[];
  actividades: Actividad[];
  cronologia: EventoBitacora[];
  notas: Nota[];
  score_desglose: Record<string, number>;
}

export interface FiltrosLead {
  etapa?: string; temperatura?: string; propietario?: number; origen?: string; industria?: string;
  q?: string; score_min?: number; score_max?: number; mios?: boolean; sin_contactar?: boolean;
  orden?: string; dir?: 'asc' | 'desc'; limite?: number;
}

export const usarLeads = (filtros: FiltrosLead = {}) =>
  useQuery({
    queryKey: ['leads', filtros],
    queryFn: () => api.get<RespuestaLista<Lead>>(conQuery('/leads', filtros as Record<string, unknown>)),
    placeholderData: (prev) => prev,
  });

export const usarResumenLeads = (mios = false) =>
  useQuery({
    queryKey: ['leads-resumen', mios],
    queryFn: () => api.get<Array<{ etapa: string; total: number; valor: number; score_medio: number }>>(
      conQuery('/leads/resumen', { mios: mios ? '1' : '' }),
    ),
  });

export const usarFacetasLeads = () =>
  useQuery({
    queryKey: ['leads-facetas'],
    queryFn: () => api.get<{
      origenes: Array<{ valor: string; total: number }>;
      industrias: Array<{ valor: string; total: number }>;
      etiquetas: string[];
      propietarios: Array<{ id: number; nombre: string; avatar_tono: number; total: number }>;
    }>('/leads/facetas'),
    staleTime: 5 * 60_000,
  });

export const usarLead = (id: number | null) =>
  useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.get<LeadDetalle>(`/leads/${id}`),
    enabled: id != null,
  });

export function usarCrearLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Partial<Lead> & { nombre: string }) => api.post<Lead>('/leads', datos),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads-resumen'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function usarActualizarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: Partial<Lead> }) => api.put<Lead>(`/leads/${id}`, datos),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead', v.id] });
    },
  });
}

export function usarMoverEtapaLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, etapa, motivo_perdida }: { id: number; etapa: string; motivo_perdida?: string }) =>
      api.put<Lead>(`/leads/${id}/etapa`, { etapa, motivo_perdida }),
    onMutate: async ({ id, etapa }) => {
      await qc.cancelQueries({ queryKey: ['leads'] });
      const previos = qc.getQueriesData<RespuestaLista<Lead>>({ queryKey: ['leads'] });
      for (const [clave, datos] of previos) {
        if (!datos) continue;
        qc.setQueryData(clave, {
          ...datos,
          filas: datos.filas.map((l) => (l.id === id ? { ...l, etapa: etapa as Lead['etapa'] } : l)),
        });
      }
      return { previos };
    },
    onError: (_e, _v, contexto) => {
      contexto?.previos.forEach(([clave, datos]) => qc.setQueryData(clave, datos));
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['leads-resumen'] });
      qc.invalidateQueries({ queryKey: ['lead', v.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function usarConvertirLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, opciones }: { id: number; opciones: Record<string, unknown> }) =>
      api.post<{ lead: Lead; cuenta: { id: number }; contacto: { id: number }; oportunidad: { id: number } }>(
        `/leads/${id}/convertir`, opciones,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['cuentas'] });
      qc.invalidateQueries({ queryKey: ['oportunidades'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function usarRegistrarSenal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tipo, detalle }: { id: number; tipo: string; detalle?: string }) =>
      api.post(`/leads/${id}/senales`, { tipo, detalle }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['lead', v.id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function usarEliminarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/leads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}
