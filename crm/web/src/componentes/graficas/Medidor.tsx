import { useEffect, useState } from 'react';

/** Medidor de semicírculo: probabilidad de alcanzar la meta, salud de cuenta, etc. */
export function Medidor({
  valor, etiqueta, tamano = 160,
}: { valor: number; etiqueta?: string; tamano?: number }) {
  const [listo, setListo] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => requestAnimationFrame(() => setListo(true))); return () => cancelAnimationFrame(t); }, []);

  const radio = tamano / 2 - 12;
  const cx = tamano / 2;
  const cy = tamano / 2;
  const circunferencia = Math.PI * radio;
  const pct = Math.max(0, Math.min(100, valor));
  const color = pct >= 70 ? 'var(--exito-500)' : pct >= 40 ? 'var(--alerta-500)' : 'var(--peligro-500)';

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: tamano }}>
      <svg width={tamano} height={tamano / 2 + 14} viewBox={`0 0 ${tamano} ${tamano / 2 + 14}`}>
        <path d={`M ${cx - radio},${cy} A ${radio},${radio} 0 0 1 ${cx + radio},${cy}`} fill="none" stroke="var(--superficie-2)" strokeWidth={12} strokeLinecap="round" />
        <path
          d={`M ${cx - radio},${cy} A ${radio},${radio} 0 0 1 ${cx + radio},${cy}`}
          fill="none" stroke={color} strokeWidth={12} strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={listo ? circunferencia * (1 - pct / 100) : circunferencia}
          style={{ transition: 'stroke-dashoffset 900ms var(--ease-dato), stroke 300ms ease' }}
        />
      </svg>
      <div className="absolute top-9 flex flex-col items-center">
        <span className="num text-2xl font-bold text-texto">{Math.round(valor)}%</span>
        {etiqueta && <span className="text-2xs text-texto-tenue">{etiqueta}</span>}
      </div>
    </div>
  );
}
