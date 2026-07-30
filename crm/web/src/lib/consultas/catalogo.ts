import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type { Producto, RespuestaBusqueda } from '@/lib/tipos';

export const usarBusquedaGlobal = (q: string, activo: boolean) =>
  useQuery({
    queryKey: ['buscar-global', q],
    queryFn: () => api.get<RespuestaBusqueda>(conQuery('/catalogo/buscar', { q })),
    enabled: activo && q.trim().length >= 2,
    staleTime: 10_000,
  });

export const usarProductos = (todos = false) =>
  useQuery({
    queryKey: ['productos', todos],
    queryFn: () => api.get<Producto[]>(conQuery('/catalogo/productos', { todos: todos || undefined })),
  });

export interface DatosProducto {
  sku?: string; nombre?: string; descripcion?: string; categoria?: string; unidad?: string;
  precio_base?: number; costo_base?: number; margen_meta?: number;
  volumen_mensual?: number; recurrente?: boolean; activo?: boolean;
}

export function usarCrearProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosProducto) => api.post<Producto>('/catalogo/productos', datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  });
}

export function usarActualizarProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosProducto }) =>
      api.put<Producto>(`/catalogo/productos/${id}`, datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  });
}
