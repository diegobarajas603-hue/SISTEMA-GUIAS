import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/utilidades';

interface Props extends HTMLAttributes<HTMLDivElement> {
  elevado?: boolean;
  interactivo?: boolean;
}

/** Contenedor base de tarjeta: una sola sombra de reposo, un solo radio, en todo el sistema. */
export function Panel({ elevado, interactivo, className, children, ...props }: Props) {
  return (
    <div
      className={cx(
        'rounded-xl border border-borde bg-superficie',
        elevado ? 'shadow-2' : 'shadow-1',
        interactivo && 'transition-[box-shadow,transform,border-color] duration-[var(--mov-medio)] ease-[var(--ease-casa)] hover:-translate-y-0.5 hover:border-borde-fuerte hover:shadow-3',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function EncabezadoPanel({
  titulo, subtitulo, acciones, className,
}: { titulo: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-texto-tenue">{titulo}</h3>
        {subtitulo && <p className="mt-0.5 text-sm text-texto-secundario">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-1.5">{acciones}</div>}
    </div>
  );
}

export function CuerpoPanel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('px-5 pb-5', className)}>{children}</div>;
}
