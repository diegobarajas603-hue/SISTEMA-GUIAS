import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { cx } from '@/lib/utilidades';

type Color = 'gris' | 'marca' | 'exito' | 'alerta' | 'peligro' | 'ia';

const COLORES: Record<Color, string> = {
  gris: 'bg-superficie-2 text-texto-secundario border-borde',
  marca: 'bg-marca-50 text-marca-700 border-marca-200',
  exito: 'bg-exito-50 text-exito-600 border-exito-200',
  alerta: 'bg-alerta-50 text-alerta-600 border-alerta-200',
  peligro: 'bg-peligro-50 text-peligro-600 border-peligro-200',
  ia: 'bg-ia-50 text-ia-600 border-ia-200',
};

export function Insignia({
  color = 'gris', children, punto, icono, className,
}: { color?: Color; children: ReactNode; punto?: boolean; icono?: ReactNode; className?: string }) {
  return (
    <span className={cx(
      'inline-flex items-center gap-1.5 rounded-pildora border px-2 py-0.5 text-xs font-medium leading-none',
      COLORES[color], className,
    )}>
      {punto && <span className="size-1.5 rounded-full" style={{ background: 'currentColor' }} />}
      {icono}
      {children}
    </span>
  );
}

/** Insignia con gradiente e ícono de destello: el sello visual de todo lo generado por IA. */
export function InsigniaIA({ children, nuevo, className }: { children: ReactNode; nuevo?: boolean; className?: string }) {
  return (
    <span className={cx(
      'relative inline-flex items-center gap-1.5 rounded-pildora px-2 py-0.5 text-xs font-medium leading-none text-white',
      'gradiente-ia', nuevo && 'aura-destello', className,
    )}>
      <Sparkles className="size-3" />
      {children}
    </span>
  );
}
