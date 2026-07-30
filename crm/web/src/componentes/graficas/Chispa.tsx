import { motion } from 'framer-motion';

/** Sparkline minúscula: tendencia de un vistazo dentro de una tarjeta de KPI. */
export function Chispa({ valores, ancho = 72, alto = 24, color = 'var(--marca-500)' }: { valores: number[]; ancho?: number; alto?: number; color?: string }) {
  if (valores.length < 2) return <div style={{ width: ancho, height: alto }} />;
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const paso = ancho / (valores.length - 1);
  const puntos = valores.map((v, i) => [i * paso, alto - ((v - min) / (max - min || 1)) * (alto - 4) - 2] as const);
  const d = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]},${p[1]}`).join(' ');

  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`}>
      <motion.path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.6 }} />
      <circle cx={puntos.at(-1)![0]} cy={puntos.at(-1)![1]} r={2} fill={color} />
    </svg>
  );
}
