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

export interface DatosUsuario {
  email?: string; nombre?: string; password?: string; rol?: string; puesto?: string;
  telefono?: string; zona?: string; equipo_id?: number | null; meta_mensual?: number;
  activo?: boolean; avatar_tono?: number;
}

export function usarCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosUsuario) => api.post<Usuario>('/auth/usuarios', datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}

export function usarActualizarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosUsuario }) =>
      api.put<Usuario>(`/auth/usuarios/${id}`, datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}

export function usarRestablecerPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      api.put<{ ok: boolean; mensaje: string }>(`/auth/usuarios/${id}/password`, { password }),
  });
}

export function usarCrearEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { nombre: string; zona?: string }) =>
      api.post<{ id: number; nombre: string; zona: string | null }>('/auth/equipos', datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipos'] }),
  });
}

export function usarEliminarEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/auth/equipos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipos'] });
      qc.invalidateQueries({ queryKey: ['usuarios'] });
    },
  });
}
