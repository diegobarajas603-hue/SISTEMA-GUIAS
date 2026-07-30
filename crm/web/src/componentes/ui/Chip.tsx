import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '@/lib/utilidades';

export function Chip({
  children, activo, onClick, onQuitar, className,
}: { children: ReactNode; activo?: boolean; onClick?: () => void; onQuitar?: () => void; className?: string }) {
  const Elemento = onClick ? 'button' : 'span';
  return (
    <Elemento
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1 rounded-pildora border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
        activo ? 'border-marca-500 bg-marca-50 text-marca-700' : 'border-borde bg-superficie text-texto-secundario hover:border-borde-fuerte',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
      {onQuitar && (
        <span
          role="button"
          aria-label={`Quitar ${children}`}
          onClick={(e) => { e.stopPropagation(); onQuitar(); }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
        >
          <X className="size-3" />
        </span>
      )}
    </Elemento>
  );
}
