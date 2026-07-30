import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '@/lib/utilidades';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'ia';
type Tamano = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: Tamano;
  cargando?: boolean;
  iconoIzq?: ReactNode;
  iconoDer?: ReactNode;
}

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca-500 text-white hover:bg-marca-600 shadow-1 hover:shadow-2 border border-transparent',
  secundario: 'bg-superficie text-texto border border-borde hover:border-borde-fuerte hover:bg-superficie-2',
  fantasma: 'bg-transparent text-texto-secundario hover:bg-superficie-2 hover:text-texto border border-transparent',
  peligro: 'bg-peligro-500 text-white hover:bg-peligro-600 shadow-1 border border-transparent',
  ia: 'gradiente-ia text-white shadow-2 hover:brightness-110 border border-transparent',
};

const TAMANOS: Record<Tamano, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-base gap-2.5 rounded-lg',
};

export const Boton = forwardRef<HTMLButtonElement, Props>(function Boton(
  { variante = 'secundario', tamano = 'md', cargando, iconoIzq, iconoDer, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || cargando}
      className={cx(
        'clic-activo inline-flex select-none items-center justify-center font-medium',
        'transition-[background-color,border-color,box-shadow,color,filter] duration-[var(--mov-rapido)] ease-[var(--ease-casa)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTES[variante], TAMANOS[tamano], className,
      )}
      {...props}
    >
      {cargando ? <Loader2 className="size-4 animate-spin" /> : iconoIzq}
      {children}
      {!cargando && iconoDer}
    </button>
  );
});

export function BotonIcono({
  etiqueta, variante = 'fantasma', tamano = 'md', className, children, ...props
}: {
  etiqueta: string; variante?: Variante; tamano?: Tamano;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const TAM_ICONO: Record<Tamano, string> = { sm: 'size-7', md: 'size-8', lg: 'size-10' };
  return (
    <button
      aria-label={etiqueta}
      title={etiqueta}
      className={cx(
        'clic-activo inline-flex items-center justify-center rounded-lg',
        'transition-[background-color,border-color,color] duration-[var(--mov-rapido)] ease-[var(--ease-casa)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTES[variante], TAM_ICONO[tamano], className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
