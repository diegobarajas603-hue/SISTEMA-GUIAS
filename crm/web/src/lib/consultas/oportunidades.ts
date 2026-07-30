import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type {
  AnalisisIA, Archivo, Contacto, Cotizacion, EventoBitacora, Nota, Oportunidad, Producto, RespuestaLista, Actividad,
} from '@/lib/tipos';

export interface FiltrosOportunidad {
  etapa?: string; estado?: string; propietario?: number; cuenta?: number; q?: string;
  monto_min?: number; mios?: boolean; estancadas?: boolean; orden?: string; dir?: 'asc' | 'desc'; limite?: number;
}

export const usarOportunidades = (filtros: FiltrosOportunidad = {}) =>
  useQuery({
    queryKey: ['oportunidades', filtros],
    queryFn: () => api.get<RespuestaLista<Oportunidad>>(conQuery('/oportunidades', filtros as Record<string, unknown>)),
    placeholderData: (prev) => prev,
  });

export const usarResumenOportunidades = (mios = false) =>
  useQuery({
    queryKey: ['oportunidades-resumen', mios],
    queryFn: () => api.get<Array<{ etapa: string; total: number; monto: number; ponderado: number; probabilidad_media: number }>>(
      conQuery('/oportunidades/resumen', { mios: mios ? '1' : '' }),
    ),
  });

export interface LineaProducto {
  id: number; producto_id: number; nombre: string; sku: string; categoria: string; unidad: string;
  cantidad: number; precio_unitario: number; descuento_pct: number; importe: number;
}

export interface OportunidadDetalle extends Oportunidad {
  productos: LineaProducto[];
  cotizaciones: Cotizacion[];
  actividades: Actividad[];
  cronologia: EventoBitacora[];
  notas: Nota[];
  contactos: Contacto[];
  historial: Array<{ etapa_anterior: string | null; etapa_nueva: string; dias_en_anterior: number | null; creado_en: string }>;
  archivos: Archivo[];
  analisis: AnalisisIA;
  mapaPoder: { decisor: Contacto | null; campeon: Contacto | null; bloqueador: Contacto | null };
}

export const usarOportunidad = (id: number | null) =>
  useQuery({
    queryKey: ['oportunidad', id],
    queryFn: () => api.get<OportunidadDetalle>(`/oportunidades/${id}`),
    enabled: id != null,
  });

export const usarPronostico = (alcance: 'auto' | 'mio' | 'todo' = 'auto') =>
  useQuery({
    queryKey: ['pronostico', alcance],
    queryFn: () => api.get(conQuery('/oportunidades/pronostico', { alcance })),
  });

export const usarEstancadas = (dias = 14) =>
  useQuery({
    queryKey: ['oportunidades-estancadas', dias],
    queryFn: () => api.get<Array<Oportunidad & { cuenta: string; propietario: string; avatar_tono: number; dias_inactiva: number }>>(
      conQuery('/oportunidades/estancadas', { dias }),
    ),
  });

export const usarMotivosPerdida = () =>
  useQuery({
    queryKey: ['motivos-perdida'],
    queryFn: () => api.get<Array<{ motivo: string; total: number; monto: number }>>('/oportunidades/motivos-perdida'),
  });

export function usarCrearOportunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Record<string, unknown>) => api.post<Oportunidad>('/oportunidades', datos),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oportunidades'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function usarActualizarOportunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: Record<string, unknown> }) =>
      api.put<Oportunidad>(`/oportunidades/${id}`, datos),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['oportunidades'] });
      qc.invalidateQueries({ queryKey: ['oportunidad', v.id] });
    },
  });
}

export function usarMoverEtapaOportunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, etapa, motivo_perdida }: { id: number; etapa: string; motivo_perdida?: string }) =>
      api.put<Oportunidad>(`/oportunidades/${id}/etapa`, { etapa, motivo_perdida }),
    onMutate: async ({ id, etapa }) => {
      await qc.cancelQueries({ queryKey: ['oportunidades'] });
      const previos = qc.getQueriesData<RespuestaLista<Oportunidad>>({ queryKey: ['oportunidades'] });
      for (const [clave, datos] of previos) {
        if (!datos) continue;
        qc.setQueryData(clave, {
          ...datos,
          filas: datos.filas.map((o) => (o.id === id ? { ...o, etapa: etapa as Oportunidad['etapa'] } : o)),
        });
      }
      return { previos };
    },
    onError: (_e, _v, contexto) => {
      contexto?.previos.forEach(([clave, datos]) => qc.setQueryData(clave, datos));
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ['oportunidades'] });
      qc.invalidateQueries({ queryKey: ['oportunidades-resumen'] });
      qc.invalidateQueries({ queryKey: ['oportunidad', v.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['pronostico'] });
    },
  });
}

export function usarEliminarOportunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/oportunidades/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oportunidades'] }),
  });
}

export const usarProductosCatalogo = () =>
  useQuery({
    queryKey: ['catalogo-productos'],
    queryFn: () => api.get<Producto[]>('/catalogo/productos'),
    staleTime: 5 * 60_000,
  });
