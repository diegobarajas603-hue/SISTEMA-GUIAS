import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type { Campana } from '@/lib/tipos';

export const usarPanoramaMarketing = () =>
  useQuery({
    queryKey: ['marketing-panorama'],
    queryFn: () => api.get<{
      resumen: { activas: number; inversion_ano: number; leads_mes: number; leads_mes_campana: number; ingresos_atribuidos: number };
      porTipo: Array<{ tipo: string; campanas: number; costo: number; leads: number; ingresos: number }>;
      porOrigen: Array<{ valor: string; leads: number; calificados: number; ingresos: number }>;
      serieLeads: Array<{ mes: string; leads: number; de_campana: number }>;
      landings: Array<{ id: number; nombre: string; slug: string; visitas: number; conversiones: number; tasa: number | null; campana: string | null }>;
      mejoresCampanas: Campana[];
    }>('/marketing'),
  });

export const usarCampanas = (filtros: { estado?: string; tipo?: string; q?: string } = {}) =>
  useQuery({
    queryKey: ['campanas', filtros],
    queryFn: () => api.get<Campana[]>(conQuery('/marketing/campanas', filtros)),
  });

export const usarCampana = (id: number | null) =>
  useQuery({
    queryKey: ['campana', id],
    queryFn: () => api.get<Campana & {
      envios: Array<{ id: number; nombre: string; asunto: string; estado: string; enviados: number; abiertos: number; clics: number; enviado_en: string | null }>;
      listaLeads: Array<{ id: number; nombre: string; empresa: string | null; score: number; etapa: string; temperatura: string; propietario: string | null }>;
      oportunidades: Array<{ id: number; nombre: string; monto: number; etapa: string; estado: string; cuenta: string }>;
      landings: Array<{ id: number; nombre: string; visitas: number; conversiones: number }>;
      porOrigen: Array<{ valor: string; total: number }>;
      serieLeads: Array<{ mes: string; leads: number }>;
      embudo: Array<{ etapa: string; total: number | null }>;
    }>(`/marketing/campanas/${id}`),
    enabled: id != null,
  });

export function usarCrearCampana() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) => api.post<Campana>('/marketing/campanas', datos),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campanas'] }); qc.invalidateQueries({ queryKey: ['marketing-panorama'] }); },
  });
}

export function usarActualizarCampana() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: Record<string, unknown> }) => api.put<Campana>(`/marketing/campanas/${id}`, datos),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['campanas'] });
      qc.invalidateQueries({ queryKey: ['campana', v.id] });
    },
  });
}

export const usarSegmentos = () =>
  useQuery({
    queryKey: ['segmentos'],
    queryFn: () => api.get<Array<{ id: number; nombre: string; descripcion: string | null; entidad: string; definicion: { reglas: unknown[] }; total_cache: number }>>('/marketing/segmentos'),
  });

export const usarEvaluarSegmento = (id: number | null) =>
  useQuery({
    queryKey: ['segmento', id],
    queryFn: () => api.get<{ segmento: { nombre: string }; total: number; filas: Array<Record<string, unknown>> }>(`/marketing/segmentos/${id}`),
    enabled: id != null,
  });

export function usarCrearSegmento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) => api.post('/marketing/segmentos', datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['segmentos'] }),
  });
}

export const usarLandings = () =>
  useQuery({
    queryKey: ['landings'],
    queryFn: () => api.get<Array<{ id: number; nombre: string; slug: string; visitas: number; conversiones: number; tasa: number | null; campana: string | null }>>('/marketing/landings'),
  });
