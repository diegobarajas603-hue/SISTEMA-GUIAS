import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ErrorAPI } from '@/lib/api';
import type { Usuario } from '@/lib/tipos';

interface ContextoSesion {
  usuario: Usuario | null;
  cargando: boolean;
  iniciarSesion: (email: string, password: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  errorLogin: string | null;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorLogin, setErrorLogin] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    api.get<{ usuario: Usuario }>('/auth/yo')
      .then((d) => setUsuario(d.usuario))
      .catch(() => setUsuario(null))
      .finally(() => setCargando(false));
  }, []);

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    setErrorLogin(null);
    try {
      const d = await api.post<{ usuario: Usuario }>('/auth/login', { email, password });
      setUsuario(d.usuario);
    } catch (e) {
      setErrorLogin(e instanceof ErrorAPI ? e.message : 'No se pudo iniciar sesión.');
      throw e;
    }
  }, []);

  const cerrarSesion = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUsuario(null);
    qc.clear();
  }, [qc]);

  return (
    <Contexto.Provider value={{ usuario, cargando, iniciarSesion, cerrarSesion, errorLogin }}>
      {children}
    </Contexto.Provider>
  );
}

export function useSesion(): ContextoSesion {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>');
  return ctx;
}
