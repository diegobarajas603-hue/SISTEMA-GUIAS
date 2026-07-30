import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAlmacenLocal } from '@/lib/hooks';

type Tema = 'claro' | 'oscuro' | 'sistema';

interface ContextoTema { tema: Tema; setTema: (t: Tema) => void; efectivo: 'claro' | 'oscuro'; }

const Contexto = createContext<ContextoTema | null>(null);

function temaSistema(): 'claro' | 'oscuro' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

export function ProveedorTema({ children }: { children: ReactNode }) {
  const [tema, setTema] = useAlmacenLocal<Tema>('aura.tema', 'sistema');
  const efectivo = tema === 'sistema' ? temaSistema() : tema;

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.setAttribute('data-theme', efectivo === 'oscuro' ? 'dark' : 'light');
  }, [efectivo]);

  useEffect(() => {
    if (tema !== 'sistema') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const escuchar = () => document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', escuchar);
    return () => mq.removeEventListener('change', escuchar);
  }, [tema]);

  return <Contexto.Provider value={{ tema, setTema, efectivo }}>{children}</Contexto.Provider>;
}

export function useTema(): ContextoTema {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useTema debe usarse dentro de <ProveedorTema>');
  return ctx;
}
