import { useQuery } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type { DashboardResumen } from '@/lib/tipos';

export const usarDashboard = (alcance: 'auto' | 'mio' | 'todo' = 'auto') =>
  useQuery({
    queryKey: ['dashboard', alcance],
    queryFn: () => api.get<DashboardResumen>(conQuery('/dashboard', { alcance })),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

export const usarNotificaciones = (soloNoLeidas = false) =>
  useQuery({
    queryKey: ['notificaciones', soloNoLeidas],
    queryFn: () => api.get<Array<{ id: number; tipo: string; titulo: string; cuerpo: string | null; enlace: string | null; leida: boolean; creado_en: string }>>(
      conQuery('/dashboard/notificaciones', { no_leidas: soloNoLeidas ? '1' : '' }),
    ),
    refetchInterval: 60_000,
  });
