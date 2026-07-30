import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cx } from '@/lib/utilidades';

export function Tooltip({
  contenido, children, posicion = 'arriba', className,
}: { contenido: ReactNode; children: ReactNode; posicion?: 'arriba' | 'abajo'; className?: string }) {
  const [visible, setVisible] = useState(false);
  if (!contenido) return <>{children}</>;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.span
            role="tooltip"
            className={cx(
              'pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-md bg-[var(--texto)] px-2.5 py-1.5 text-xs text-[var(--canvas)] shadow-3',
              posicion === 'arriba' ? 'bottom-full mb-2' : 'top-full mt-2',
              className,
            )}
            initial={{ opacity: 0, y: posicion === 'arriba' ? 4 : -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {contenido}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
