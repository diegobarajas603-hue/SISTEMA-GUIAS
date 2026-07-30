import { motion } from 'framer-motion';
import { cx } from '@/lib/utilidades';

interface Pestana { valor: string; etiqueta: string; contador?: number; }

export function Pestanas({
  items, activa, onCambiar, className,
}: { items: Pestana[]; activa: string; onCambiar: (v: string) => void; className?: string }) {
  return (
    <div className={cx('flex items-center gap-1 border-b border-borde', className)} role="tablist">
      {items.map((p) => {
        const esActiva = p.valor === activa;
        return (
          <button
            key={p.valor}
            role="tab"
            aria-selected={esActiva}
            onClick={() => onCambiar(p.valor)}
            className={cx(
              'relative flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium transition-colors duration-150',
              esActiva ? 'text-texto' : 'text-texto-tenue hover:text-texto-secundario',
            )}
          >
            {p.etiqueta}
            {p.contador !== undefined && (
              <span className={cx('rounded-pildora px-1.5 py-0.5 text-2xs font-semibold', esActiva ? 'bg-marca-50 text-marca-700' : 'bg-superficie-2 text-texto-tenue')}>
                {p.contador}
              </span>
            )}
            {esActiva && (
              <motion.div layoutId="indicador-pestana" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-marca-500" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
