import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CatalogoImportacion, ClientePreparado, ConteoImportacion, DuplicadoDetectado,
  Importacion, ResultadoFila,
} from '@/modulos/importacion/tipos';

export const usarCatalogoImportacion = () =>
  useQuery({
    queryKey: ['importacion-campos'],
    queryFn: () => api.get<CatalogoImportacion>('/importacion/campos'),
    staleTime: 10 * 60_000,
  });

export const usarHistorialImportaciones = () =>
  useQuery({
    queryKey: ['importaciones'],
    queryFn: () => api.get<Importacion[]>('/importacion?limite=30'),
  });

export const usarImportacion = (id: number | null) =>
  useQuery({
    queryKey: ['importacion', id],
    queryFn: () => api.get<Importacion>(`/importacion/${id}`),
    enabled: id != null,
  });

export interface AnalisisPrevio {
  total: number;
  duplicados: DuplicadoDetectado[];
  totalDuplicados: number;
  avisos: Record<string, string[]>;
  ejecutivosDesconocidos: string[];
}

export const analizarClientes = (clientes: unknown[]) =>
  api.post<AnalisisPrevio>('/importacion/analizar', { clientes });

export const iniciarImportacion = (datos: {
  archivo: string; tamano_bytes: number; estrategia: string;
  total_filas: number; total_clientes: number; mapeo: Record<string, string>;
}) => api.post<Importacion>('/importacion', datos);

export const enviarLote = (id: number, clientes: ClientePreparado[], estrategia: string) =>
  api.post<{ resultados: ResultadoFila[]; conteo: ConteoImportacion }>(
    `/importacion/${id}/lote`, { clientes, estrategia },
  );

export const finalizarImportacion = (id: number, estado: string) =>
  api.post<Importacion>(`/importacion/${id}/finalizar`, { estado });

/** Invalida todo lo que una importación deja obsoleto en pantalla. */
export function usarRefrescarTrasImportar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => undefined,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cuentas'] });
      qc.invalidateQueries({ queryKey: ['cuentas-facetas'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['importaciones'] });
    },
  });
}
