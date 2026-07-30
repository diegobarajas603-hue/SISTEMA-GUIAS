import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type { Insight, MensajeIA, RespuestaCopiloto } from '@/lib/tipos';

export interface ContextoCopiloto { ruta?: string; entidad_tipo?: string; entidad_id?: number; }

export const usarEstadoIA = () =>
  useQuery({
    queryKey: ['ia-estado'],
    queryFn: () => api.get<{ generativa: boolean; modelo: string | null; motor_determinista: boolean; nota: string }>('/ia/estado'),
    staleTime: 5 * 60_000,
  });

export const usarSugerenciasCopiloto = (contexto: ContextoCopiloto) =>
  useQuery({
    queryKey: ['ia-sugerencias', contexto],
    queryFn: () => api.get<string[]>(conQuery('/ia/sugerencias', contexto as Record<string, unknown>)),
  });

export const usarConversacionesIA = () =>
  useQuery({
    queryKey: ['ia-conversaciones'],
    queryFn: () => api.get<Array<{ id: number; titulo: string; actualizado_en: string; mensajes: number }>>('/ia/conversaciones'),
  });

export const usarMensajesConversacion = (id: number | null) =>
  useQuery({
    queryKey: ['ia-mensajes', id],
    queryFn: () => api.get<MensajeIA[]>(`/ia/conversaciones/${id}`),
    enabled: id != null,
  });

export function usarPreguntar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { pregunta: string; conversacion_id?: number | null; contexto?: ContextoCopiloto }) =>
      api.post<RespuestaCopiloto>('/ia/preguntar', v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ia-conversaciones'] }),
  });
}

export const usarInsights = (tipo?: string) =>
  useQuery({
    queryKey: ['ia-insights', tipo],
    queryFn: () => api.get<Insight[]>(conQuery('/ia/insights', { tipo })),
  });

export function usarActualizarInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) => api.put<Insight>(`/ia/insights/${id}`, { estado }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ia-insights'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
}

export const usarSiguienteAccion = () =>
  useQuery({
    queryKey: ['ia-siguiente-accion'],
    queryFn: () => api.get<{ total: number; acciones: Array<{ tipo: string; titulo: string; detalle: string; entidad: { tipo: string; id: number }; urgencia: string; accion: string; prioridad: number }> }>('/ia/siguiente-accion'),
  });

export const usarScoreLead = (leadId: number | null) =>
  useQuery({
    queryKey: ['ia-score', leadId],
    queryFn: () => api.get(`/ia/score/${leadId}`),
    enabled: leadId != null,
  });

export function usarRedactarCorreo() {
  return useMutation({
    mutationFn: (datos: { tipo: string; lead_id?: number; cuenta_id?: number; oportunidad_id?: number; instrucciones?: string }) =>
      api.post<{ asunto: string; cuerpo: string; destinatario: string | null; generado_por: string; aviso: string }>('/ia/redactar-correo', datos),
  });
}

export function usarGenerarPropuesta() {
  return useMutation({
    mutationFn: (datos: { oportunidad_id: number; instrucciones?: string }) => api.post('/ia/generar-propuesta', datos),
  });
}

export function usarAnalizarConversacion() {
  return useMutation({
    mutationFn: (texto: string) => api.post<{
      resumen: string; sentimiento: string; intencion_de_compra: string; temas: string[];
      objeciones: string[]; compromisos: Array<{ quien: string; que: string; cuando: string | null }>;
      siguiente_accion: string; señales_de_riesgo: string[]; generado_por: string; limitacion?: string;
    }>('/ia/analizar-conversacion', { texto }),
  });
}

export function usarRecalcularIA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ oportunidades: number; cuentas: number; insights: number; ms: number }>('/ia/recalcular'),
    onSuccess: () => qc.invalidateQueries(),
  });
}
