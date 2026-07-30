import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cx } from '@/lib/utilidades';

interface Opcion { valor: string; etiqueta: ReactNode; }

/** Conmutador segmentado con riel hundido (el único otro uso de neomorfismo del sistema). */
export function Segmentado({
  opciones, valor, onCambiar, className,
}: { opciones: Opcion[]; valor: string; onCambiar: (v: string) => void; className?: string }) {
  return (
    <div className={cx('riel-hundido inline-flex gap-0.5 rounded-lg p-1', className)}>
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            onClick={() => onCambiar(o.valor)}
            className="relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150"
          >
            {activo && (
              <motion.span
                layoutId="fondo-segmentado"
                className="absolute inset-0 rounded-md bg-superficie shadow-2"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className={cx('relative z-10', activo ? 'text-texto' : 'text-texto-tenue')}>{o.etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}
