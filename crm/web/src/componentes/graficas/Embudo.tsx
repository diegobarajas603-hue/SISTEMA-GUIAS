import { motion } from 'framer-motion';
import type { EtapaEmbudo } from '@/lib/tipos';
import { numero } from '@/lib/formato';
import { cx } from '@/lib/utilidades';

const COLORES = ['var(--serie-1)', 'var(--serie-2)', 'var(--marca-600)', 'var(--serie-4)', 'var(--serie-5)', 'var(--exito-500)'];

/** Embudo de barras horizontales decrecientes, con conversión etapa a etapa. */
export function Embudo({ etapas }: { etapas: EtapaEmbudo[] }) {
  return (
    <div className="flex flex-col gap-2">
      {etapas.map((e, i) => (
        <div key={e.clave} className="group">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-medium text-texto">{e.titulo}</span>
            <span className="num text-texto-tenue">
              {numero(e.alcanzaron)}
              {i > 0 && <span className={cx('ml-1.5 font-semibold', e.porcentajePaso >= 60 ? 'text-exito-600' : e.porcentajePaso >= 30 ? 'text-alerta-600' : 'text-peligro-500')}>
                {e.porcentajePaso}%
              </span>}
            </span>
          </div>
          <div className="h-7 w-full overflow-hidden rounded-md bg-superficie-2">
            <motion.div
              className="flex h-full items-center rounded-md px-2.5"
              style={{ background: COLORES[i % COLORES.length] }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(e.porcentajeTotal, 3)}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }}
            >
              {e.monto !== undefined && e.porcentajeTotal > 18 && (
                <span className="num truncate text-2xs font-semibold text-white/90">{numero(e.enEtapa)} activos</span>
              )}
            </motion.div>
          </div>
        </div>
      ))}
    </div>
  );
}
