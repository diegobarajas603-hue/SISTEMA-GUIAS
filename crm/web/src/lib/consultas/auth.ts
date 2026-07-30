import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Usuario } from '@/lib/tipos';

export const usarUsuarios = () =>
  useQuery({ queryKey: ['usuarios'], queryFn: () => api.get<Usuario[]>('/auth/usuarios'), staleTime: 5 * 60_000 });

export const usarEquipos = () =>
  useQuery({
    queryKey: ['equipos'],
    queryFn: () => api.get<Array<{ id: number; nombre: string; zona: string | null; miembros: number }>>('/auth/equipos'),
    staleTime: 5 * 60_000,
  });

export function usarGuardarPreferencias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Record<string, unknown>) => api.put<{ preferencias: Record<string, unknown> }>('/auth/preferencias', prefs),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sesion'] }),
  });
}

export function usarCambiarPassword() {
  return useMutation({
    mutationFn: (v: { actual: string; nueva: string }) => api.put('/auth/password', v),
  });
}
