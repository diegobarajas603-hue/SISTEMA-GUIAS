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

const ANCHOS = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export function Modal({ abierto, onCerrar, titulo, children, ancho = 'md', pie }: Props) {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-[var(--overlay)]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onCerrar}
          />
          <motion.div
            role="dialog" aria-modal="true"
            className={cx('relative w-full rounded-2xl border border-borde bg-superficie shadow-5', ANCHOS[ancho])}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {titulo && (
              <div className="flex items-center justify-between border-b border-borde px-5 py-4">
                <h2 className="text-base font-semibold text-texto">{titulo}</h2>
                <BotonIcono etiqueta="Cerrar" onClick={onCerrar}><X className="size-4" /></BotonIcono>
              </div>
            )}
            <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
            {pie && <div className="flex items-center justify-end gap-2 border-t border-borde px-5 py-3.5">{pie}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
