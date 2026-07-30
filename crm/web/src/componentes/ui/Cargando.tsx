import { Loader2 } from 'lucide-react';
import { cx } from '@/lib/utilidades';

export function Cargando({ etiqueta = 'Cargando…', className }: { etiqueta?: string; className?: string }) {
  return (
    <div className={cx('flex items-center justify-center gap-2 py-10 text-sm text-texto-tenue', className)}>
      <Loader2 className="size-4 animate-spin" />
      {etiqueta}
    </div>
  );
}

export function Contador({ valor, formato, className }: { valor: number; formato: (n: number) => string; className?: string }) {
  return <span className={cx('num tabular-nums', className)}>{formato(valor)}</span>;
}
