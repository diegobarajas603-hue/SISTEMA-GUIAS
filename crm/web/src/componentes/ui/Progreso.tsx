import { useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/utilidades';

export function Progreso({
  valor, max = 100, color = 'var(--marca-500)', alto = 8, className, mostrarSobrepaso = true,
}: { valor: number; max?: number; color?: string; alto?: number; className?: string; mostrarSobrepaso?: boolean }) {
  const pct = Math.max(0, Math.min(100, (valor / (max || 1)) * 100));
  const sobrepaso = mostrarSobrepaso && valor > max;
  const ref = useRef<HTMLDivElement>(null);
  const [animado, setAnimado] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimado(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div ref={ref} className={cx('riel-hundido w-full overflow-hidden rounded-pildora', className)} style={{ height: alto }}>
      <div
        className="h-full rounded-pildora transition-[width] duration-700 ease-[var(--ease-dato)]"
        style={{ width: `${animado ? pct : 0}%`, background: sobrepaso ? 'var(--exito-500)' : color }}
      />
    </div>
  );
}
