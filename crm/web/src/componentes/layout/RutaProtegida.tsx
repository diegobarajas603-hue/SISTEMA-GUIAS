import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSesion } from '@/estado/sesion';
import { Cargando } from '@/componentes/ui/Cargando';

export function RutaProtegida({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useSesion();
  if (cargando) return <div className="flex h-screen items-center justify-center"><Cargando etiqueta="Verificando sesión…" /></div>;
  if (!usuario) return <Navigate to="/entrar" replace />;
  return <>{children}</>;
}
