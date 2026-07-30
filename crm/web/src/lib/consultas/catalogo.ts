import { useQuery } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type { RespuestaBusqueda } from '@/lib/tipos';

export const usarBusquedaGlobal = (q: string, activo: boolean) =>
  useQuery({
    queryKey: ['buscar-global', q],
    queryFn: () => api.get<RespuestaBusqueda>(conQuery('/catalogo/buscar', { q })),
    enabled: activo && q.trim().length >= 2,
    staleTime: 10_000,
  });
