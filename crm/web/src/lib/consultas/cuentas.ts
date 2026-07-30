import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type {
  Archivo, Contacto, Cotizacion, Cuenta, EventoBitacora, Insight, MapaPoder, Nota, Oportunidad, RespuestaLista, Ticket, Actividad,
} from '@/lib/tipos';

export interface FiltrosCuenta {
  tipo?: string; industria?: string; tamano?: string; estado?: string; propietario?: number;
  q?: string; riesgo_min?: number; mios?: boolean; inactivas?: boolean; orden?: string; dir?: 'asc' | 'desc'; limite?: number;
}

export const usarCuentas = (filtros: FiltrosCuenta = {}) =>
  useQuery({
    queryKey: ['cuentas', filtros],
    queryFn: () => api.get<RespuestaLista<Cuenta>>(conQuery('/cuentas', filtros as Record<string, unknown>)),
    placeholderData: (prev) => prev,
  });

export interface Ficha360 extends Cuenta {
  contactos: Contacto[];
  oportunidades: Oportunidad[];
  cotizaciones: Cotizacion[];
  facturas: Array<{ id: number; folio: string; estado: string; total: number; emitida_en: string; vence_en?: string | null; pagada_en?: string | null }>;
  contratos: Array<{ id: number; folio: string; nombre: string; estado: string; valor: number; inicia_en: string; termina_en: string; renovacion_auto: boolean }>;
  tickets: Ticket[];
  actividades: Actividad[];
  notas: Nota[];
  archivos: Archivo[];
  cronologia: EventoBitacora[];
  insights: Insight[];
  facturacion: { ano: number; cobrado: number; por_cobrar: number; vencido: number; facturas: number; serie: Array<{ mes: string; facturado: number }> };
  productos: Array<{ id: number; sku: string; nombre: string; categoria: string; unidad: string; cantidad_total: number; operaciones: number }>;
  mapaPoder: MapaPoder;
}

export const usarCuenta = (id: number | null) =>
  useQuery({
    queryKey: ['cuenta', id],
    queryFn: () => api.get<Ficha360>(`/cuentas/${id}`),
    enabled: id != null,
  });

export const usarAnalisisCuenta = (id: number | null) =>
  useQuery({
    queryKey: ['cuenta-ia', id],
    queryFn: () => api.get<{
      churn: { riesgo: number; nivel: string; motivos: Array<{ titulo: string; detalle: string; puntos: number }> };
      salud: number;
      ventaCruzada: Array<{ sku: string; producto: string; impacto: number; confianza: number; motivo: string }>;
    }>(`/cuentas/${id}/ia`),
    enabled: id != null,
  });

export const usarFacetasCuentas = () =>
  useQuery({
    queryKey: ['cuentas-facetas'],
    queryFn: () => api.get<{
      industrias: Array<{ valor: string; total: number }>;
      etiquetas: string[];
      estados: Array<{ valor: string; total: number }>;
    }>('/cuentas/facetas'),
    staleTime: 5 * 60_000,
  });

/** Payload de escritura: usa nombres de columna de la API (`notas`), no la forma de lectura. */
export type DatosCuenta = Partial<Omit<Cuenta, 'notasLibres'>> & { notas?: string };

export function usarCrearCuenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosCuenta & { nombre: string }) => api.post<Cuenta>('/cuentas', datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cuentas'] }),
  });
}

export function usarActualizarCuenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosCuenta }) => api.put<Cuenta>(`/cuentas/${id}`, datos),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['cuentas'] });
      qc.invalidateQueries({ queryKey: ['cuenta', v.id] });
    },
  });
}

export function usarCrearContacto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cuentaId, datos }: { cuentaId: number; datos: Partial<Contacto> & { nombre: string } }) =>
      api.post<Contacto>(`/cuentas/${cuentaId}/contactos`, datos),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['cuenta', v.cuentaId] }),
  });
}

export function usarActualizarContacto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: Partial<Contacto>; cuentaId: number }) =>
      api.put<Contacto>(`/cuentas/contactos/${id}`, datos),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['cuenta', v.cuentaId] }),
  });
}

export function usarEliminarContacto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; cuentaId: number }) => api.delete(`/cuentas/contactos/${id}`),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['cuenta', v.cuentaId] }),
  });
}

export function usarCrearNota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { cuerpo: string; cuenta_id?: number; lead_id?: number; oportunidad_id?: number; contacto_id?: number; fijada?: boolean }) =>
      api.post<Nota>('/cuentas/notas', datos),
    onSuccess: (_d, v) => {
      if (v.cuenta_id) qc.invalidateQueries({ queryKey: ['cuenta', v.cuenta_id] });
      if (v.oportunidad_id) qc.invalidateQueries({ queryKey: ['oportunidad', v.oportunidad_id] });
      if (v.lead_id) qc.invalidateQueries({ queryKey: ['lead', v.lead_id] });
    },
  });
}
