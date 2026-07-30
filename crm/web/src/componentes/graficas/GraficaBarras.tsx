import { useState } from 'react';
import { motion } from 'framer-motion';
import { dineroCompacto } from '@/lib/formato';
import { cx } from '@/lib/utilidades';

export interface BarraDato { etiqueta: string; valor: number; color?: string; resaltado?: boolean; }

/** Barras verticales, eje Y siempre desde cero, con la etiqueta directa sobre el valor. */
export function GraficaBarras({
  datos, alto = 200, formato = dineroCompacto, colorBase = 'var(--marca-500)', horizontal = false,
}: { datos: BarraDato[]; alto?: number; formato?: (n: number) => string; colorBase?: string; horizontal?: boolean }) {
  const [activo, setActivo] = useState<number | null>(null);
  const max = Math.max(...datos.map((d) => d.valor), 1);

  if (horizontal) {
    return (
      <div className="flex flex-col gap-2.5">
        {datos.map((d, i) => (
          <div key={d.etiqueta} className="flex items-center gap-3">
            <div className="w-28 shrink-0 truncate text-right text-xs text-texto-secundario" title={d.etiqueta}>{d.etiqueta}</div>
            <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-superficie-2">
              <motion.div
                className="h-full rounded-md"
                style={{ background: d.color ?? colorBase }}
                initial={{ width: 0 }}
                animate={{ width: `${(d.valor / max) * 100}%` }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: i * 0.03 }}
              />
            </div>
            <div className="num w-20 shrink-0 text-xs font-medium text-texto">{formato(d.valor)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2" style={{ height: alto }}>
      {datos.map((d, i) => (
        <div key={d.etiqueta} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)}>
          {activo === i && <div className="num rounded-md bg-superficie px-1.5 py-0.5 text-xs font-medium text-texto shadow-2">{formato(d.valor)}</div>}
          <motion.div
            className={cx('w-full rounded-t-md transition-opacity', activo !== null && activo !== i && 'opacity-50')}
            style={{ background: d.color ?? (d.resaltado ? 'var(--marca-500)' : colorBase) }}
            initial={{ height: 0 }}
            animate={{ height: `${Math.max((d.valor / max) * 100, 2)}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: i * 0.04 }}
          />
          <span className="truncate text-2xs text-texto-tenue" style={{ maxWidth: 48 }}>{d.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}
