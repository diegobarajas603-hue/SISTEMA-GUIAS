import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useContador } from '@/lib/hooks';
import { Panel } from './Panel';
import { cx } from '@/lib/utilidades';

interface Props {
  etiqueta: string;
  valor: number;
  formato: (n: number) => string;
  variacion?: number | null;
  extra?: ReactNode;
  acento?: 'marca' | 'exito' | 'alerta' | 'peligro' | 'ia';
  onClick?: () => void;
}

const ACENTOS = {
  marca: 'border-t-marca-500', exito: 'border-t-exito-500', alerta: 'border-t-alerta-500',
  peligro: 'border-t-peligro-500', ia: 'border-t-ia-500',
};

export function TarjetaKPI({ etiqueta, valor, formato, variacion, extra, acento = 'marca', onClick }: Props) {
  const animado = useContador(valor);
  return (
    <Panel interactivo={!!onClick} onClick={onClick} className={cx('border-t-[3px] p-4', ACENTOS[acento], onClick && 'cursor-pointer')}>
      <p className="text-2xs font-semibold uppercase tracking-wide text-texto-tenue">{etiqueta}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className="num text-2xl font-bold tracking-tight text-texto">{formato(animado)}</span>
        {variacion !== null && variacion !== undefined && (
          <span className={cx(
            'mb-0.5 flex items-center gap-0.5 text-xs font-semibold',
            variacion >= 0 ? 'text-exito-600' : 'text-peligro-500',
          )}>
            {variacion >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {Math.abs(variacion)}%
          </span>
        )}
      </div>
      {extra}
    </Panel>
  );
}
