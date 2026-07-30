import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { BotonIcono } from './Boton';
import { cx } from '@/lib/utilidades';

interface Props {
  abierto: boolean; onCerrar: () => void; titulo?: ReactNode; children: ReactNode;
  ancho?: 'sm' | 'md' | 'lg' | 'xl'; pie?: ReactNode;
}

const ANCHOS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' };

/** Panel deslizante desde la derecha: detalle de registro, formularios largos, el copiloto. */
export function PanelLateral({ abierto, onCerrar, titulo, children, ancho = 'md', pie }: Props) {
  useEffect(() => {
    if (!abierto) return;
    const onTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', onTecla);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onTecla); document.body.style.overflow = ''; };
  }, [abierto, onCerrar]);

  return createPortal(
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            className="absolute inset-0 bg-[var(--overlay)]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onCerrar}
          />
          <motion.div
            role="dialog" aria-modal="true"
            className={cx('relative flex h-full w-full flex-col border-l border-borde bg-superficie shadow-5', ANCHOS[ancho])}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
            {titulo && (
              <div className="flex shrink-0 items-center justify-between border-b border-borde px-5 py-4">
                <div className="text-base font-semibold text-texto">{titulo}</div>
                <BotonIcono etiqueta="Cerrar" onClick={onCerrar}><X className="size-4" /></BotonIcono>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {pie && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-borde px-5 py-3.5">{pie}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
