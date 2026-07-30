import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCerrarAlExterior } from '@/lib/hooks';
import { cx } from '@/lib/utilidades';

interface ItemMenu { etiqueta: string; icono?: ReactNode; onClick?: () => void; peligro?: boolean; deshabilitado?: boolean; }
interface Props { disparador: ReactNode; items: Array<ItemMenu | 'separador'>; alinear?: 'izq' | 'der'; }

export function Menu({ disparador, items, alinear = 'der' }: Props) {
  const [abierto, setAbierto] = useState(false);
  const ref = useCerrarAlExterior<HTMLDivElement>(abierto, () => setAbierto(false));

  return (
    <div className="relative inline-block" ref={ref}>
      <div onClick={() => setAbierto((a) => !a)}>{disparador}</div>
      <AnimatePresence>
        {abierto && (
          <motion.div
            className={cx(
              'absolute z-40 mt-1.5 min-w-[190px] overflow-hidden rounded-lg border border-borde bg-superficie py-1 shadow-3',
              alinear === 'der' ? 'right-0' : 'left-0',
            )}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -2 }}
            transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
          >
            {items.map((item, i) =>
              item === 'separador' ? (
                <div key={i} className="my-1 h-px bg-borde" />
              ) : (
                <button
                  key={item.etiqueta}
                  disabled={item.deshabilitado}
                  onClick={() => { item.onClick?.(); setAbierto(false); }}
                  className={cx(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-100',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                    item.peligro ? 'text-peligro-500 hover:bg-peligro-50' : 'text-texto hover:bg-superficie-2',
                  )}
                >
                  {item.icono}
                  {item.etiqueta}
                </button>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
