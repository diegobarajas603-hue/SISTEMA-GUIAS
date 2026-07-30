import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cx } from '@/lib/utilidades';

type TipoAviso = 'info' | 'exito' | 'alerta' | 'error';
interface Aviso { id: number; tipo: TipoAviso; titulo: string; cuerpo?: string; }

interface ContextoAvisos { avisar: (a: Omit<Aviso, 'id'>) => void; }
const Contexto = createContext<ContextoAvisos | null>(null);

const ICONOS: Record<TipoAviso, typeof Info> = { info: Info, exito: CheckCircle2, alerta: AlertTriangle, error: XCircle };
const COLORES: Record<TipoAviso, string> = {
  info: 'text-marca-500', exito: 'text-exito-500', alerta: 'text-alerta-600', error: 'text-peligro-500',
};

let contador = 0;

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const avisar = useCallback((a: Omit<Aviso, 'id'>) => {
    const id = ++contador;
    setAvisos((prev) => [...prev, { ...a, id }]);
    setTimeout(() => setAvisos((prev) => prev.filter((x) => x.id !== id)), 5000);
  }, []);

  const quitar = (id: number) => setAvisos((prev) => prev.filter((x) => x.id !== id));

  return (
    <Contexto.Provider value={{ avisar }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
          <AnimatePresence>
            {avisos.map((a) => {
              const Icono = ICONOS[a.tipo];
              return (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, x: 40, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-borde bg-superficie p-3.5 shadow-4"
                >
                  <Icono className={cx('mt-0.5 size-4 shrink-0', COLORES[a.tipo])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-texto">{a.titulo}</p>
                    {a.cuerpo && <p className="mt-0.5 text-xs text-texto-secundario">{a.cuerpo}</p>}
                  </div>
                  <button onClick={() => quitar(a.id)} className="shrink-0 rounded p-0.5 text-texto-tenue hover:bg-superficie-2">
                    <X className="size-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </Contexto.Provider>
  );
}

export function useAvisos(): ContextoAvisos {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAvisos debe usarse dentro de <ProveedorAvisos>');
  return ctx;
}
