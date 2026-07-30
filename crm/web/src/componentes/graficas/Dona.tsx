import { useState } from 'react';
import { motion } from 'framer-motion';

export interface SegmentoDona { etiqueta: string; valor: number; color: string; }

export function Dona({
  datos, tamano = 140, grosor = 18, centro,
}: { datos: SegmentoDona[]; tamano?: number; grosor?: number; centro?: { valor: string; etiqueta: string } }) {
  const [activo, setActivo] = useState<number | null>(null);
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const total = datos.reduce((s, d) => s + d.valor, 0) || 1;

  let acumulado = 0;
  const segmentos = datos.map((d) => {
    const fraccion = d.valor / total;
    const inicio = acumulado;
    acumulado += fraccion;
    return { ...d, fraccion, inicio };
  });

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} className="-rotate-90">
        <circle cx={tamano / 2} cy={tamano / 2} r={radio} fill="none" stroke="var(--superficie-2)" strokeWidth={grosor} />
        {segmentos.map((s, i) => (
          <motion.circle
            key={s.etiqueta}
            cx={tamano / 2} cy={tamano / 2} r={radio} fill="none"
            stroke={s.color} strokeWidth={activo === i ? grosor + 3 : grosor} strokeLinecap="butt"
            strokeDasharray={circunferencia}
            initial={{ strokeDashoffset: circunferencia }}
            animate={{ strokeDashoffset: circunferencia * (1 - s.fraccion) }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }}
            style={{ transform: `rotate(${s.inicio * 360}deg)`, transformOrigin: '50% 50%', transition: 'stroke-width 150ms ease' }}
            onMouseEnter={() => setActivo(i)}
            onMouseLeave={() => setActivo(null)}
          />
        ))}
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        {activo !== null ? (
          <>
            <span className="num text-lg font-bold text-texto">{Math.round(segmentos[activo].fraccion * 100)}%</span>
            <span className="max-w-20 truncate text-2xs text-texto-tenue">{segmentos[activo].etiqueta}</span>
          </>
        ) : centro ? (
          <>
            <span className="num text-lg font-bold text-texto">{centro.valor}</span>
            <span className="text-2xs text-texto-tenue">{centro.etiqueta}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
