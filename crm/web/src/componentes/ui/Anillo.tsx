import { useEffect, useRef, useState } from 'react';
import { TEMPERATURA_COLOR } from '@/lib/constantes';
import { cx } from '@/lib/utilidades';

/** Anillo de score: dibuja su arco al aparecer, coloreado según el tramo de temperatura. */
export function Anillo({
  valor, temperatura, tamano = 44, grosor = 4, className,
}: { valor: number; temperatura: string; tamano?: number; grosor?: number; className?: string }) {
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const [listo, setListo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setListo(true)));
    return () => cancelAnimationFrame(t);
  }, []);

  const color = TEMPERATURA_COLOR[temperatura] ?? 'var(--marca-500)';
  const offset = circunferencia * (1 - (listo ? valor : 0) / 100);

  return (
    <div ref={ref} className={cx('relative inline-flex items-center justify-center', className)} style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} className="-rotate-90">
        <circle cx={tamano / 2} cy={tamano / 2} r={radio} fill="none" stroke="var(--borde)" strokeWidth={grosor} />
        <circle
          cx={tamano / 2} cy={tamano / 2} r={radio} fill="none" stroke={color} strokeWidth={grosor}
          strokeLinecap="round" strokeDasharray={circunferencia} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms var(--ease-dato)' }}
        />
      </svg>
      <span className="num absolute text-xs font-bold text-texto">{valor}</span>
    </div>
  );
}
