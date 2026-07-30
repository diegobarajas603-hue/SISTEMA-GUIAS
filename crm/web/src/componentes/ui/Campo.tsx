import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '@/lib/utilidades';

const CLASE_CONTROL = cx(
  'w-full rounded-lg border border-borde bg-superficie px-3 text-sm text-texto placeholder:text-texto-tenue',
  'transition-[border-color,box-shadow] duration-[var(--mov-rapido)] ease-[var(--ease-casa)]',
  'focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-500/12',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

interface ContenedorProps { etiqueta?: string; error?: string; ayuda?: string; requerido?: boolean; className?: string; children: ReactNode; }

function ContenedorCampo({ etiqueta, error, ayuda, requerido, className, children }: ContenedorProps) {
  return (
    <label className={cx('block', className)}>
      {etiqueta && (
        <span className="mb-1.5 block text-xs font-medium text-texto-secundario">
          {etiqueta}{requerido && <span className="text-peligro-500"> *</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-peligro-500">{error}</span>
      ) : ayuda ? (
        <span className="mt-1.5 block text-xs text-texto-tenue">{ayuda}</span>
      ) : null}
    </label>
  );
}

interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta?: string; error?: string; ayuda?: string; requerido?: boolean; iconoIzq?: ReactNode; iconoDer?: ReactNode;
}

export const Campo = forwardRef<HTMLInputElement, PropsCampo>(function Campo(
  { etiqueta, error, ayuda, requerido, iconoIzq, iconoDer, className, ...props }, ref,
) {
  return (
    <ContenedorCampo etiqueta={etiqueta} error={error} ayuda={ayuda} requerido={requerido}>
      <div className="relative">
        {iconoIzq && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-tenue">{iconoIzq}</span>}
        <input
          ref={ref}
          className={cx(CLASE_CONTROL, 'h-9', !!iconoIzq && 'pl-9', !!iconoDer && 'pr-9',
            !!error && 'border-peligro-500 focus:border-peligro-500 focus:ring-peligro-500/12', className)}
          {...props}
        />
        {iconoDer && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-texto-tenue">{iconoDer}</span>}
      </div>
    </ContenedorCampo>
  );
});

interface PropsArea extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  etiqueta?: string; error?: string; ayuda?: string; requerido?: boolean;
}

export const AreaTexto = forwardRef<HTMLTextAreaElement, PropsArea>(function AreaTexto(
  { etiqueta, error, ayuda, requerido, className, rows = 4, ...props }, ref,
) {
  return (
    <ContenedorCampo etiqueta={etiqueta} error={error} ayuda={ayuda} requerido={requerido}>
      <textarea
        ref={ref}
        rows={rows}
        className={cx(CLASE_CONTROL, 'resize-none py-2 leading-relaxed',
          error && 'border-peligro-500 focus:border-peligro-500 focus:ring-peligro-500/12', className)}
        {...props}
      />
    </ContenedorCampo>
  );
});

interface PropsSelector extends SelectHTMLAttributes<HTMLSelectElement> {
  etiqueta?: string; error?: string; ayuda?: string; requerido?: boolean;
}

export const Selector = forwardRef<HTMLSelectElement, PropsSelector>(function Selector(
  { etiqueta, error, ayuda, requerido, className, children, ...props }, ref,
) {
  return (
    <ContenedorCampo etiqueta={etiqueta} error={error} ayuda={ayuda} requerido={requerido}>
      <div className="relative">
        <select
          ref={ref}
          className={cx(CLASE_CONTROL, 'h-9 appearance-none pr-8',
            error && 'border-peligro-500 focus:border-peligro-500 focus:ring-peligro-500/12', className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-texto-tenue" />
      </div>
    </ContenedorCampo>
  );
});
