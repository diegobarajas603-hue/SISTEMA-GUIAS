import { useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { dineroCompacto } from '@/lib/formato';

export interface PuntoArea { etiqueta: string; valor: number; secundario?: number; }

/**
 * Gráfica de área con línea sobre relleno degradado, guía vertical sincronizada con
 * el cursor y trazo que se dibuja una sola vez al montar. Sin librería externa: a
 * este tamaño de necesidad, una librería de gráficas añade una estética reconocible
 * que el encargo pide evitar, además de varias decenas de kB.
 */
export function GraficaArea({
  datos, alto = 220, formatoY = dineroCompacto, colorLinea = 'var(--marca-500)', etiquetaSecundaria,
}: { datos: PuntoArea[]; alto?: number; formatoY?: (n: number) => string; colorLinea?: string; etiquetaSecundaria?: string }) {
  const idGradiente = useId();
  const [activo, setActivo] = useState<number | null>(null);
  const ancho = 640;
  const margen = { arriba: 16, abajo: 26, izq: 4, der: 4 };

  const { puntos, puntosSec } = useMemo(() => {
    const valores = datos.map((d) => d.valor);
    const secundarios = datos.map((d) => d.secundario ?? 0);
    const todos = [...valores, ...secundarios, 0];
    const maxY = Math.max(...todos, 1);
    const minY = Math.min(...todos, 0);
    const w = ancho - margen.izq - margen.der;
    const h = alto - margen.arriba - margen.abajo;
    const paso = datos.length > 1 ? w / (datos.length - 1) : 0;
    const escalaY = (v: number) => margen.arriba + h - ((v - minY) / (maxY - minY || 1)) * h;
    return {
      maxY, minY,
      puntos: datos.map((d, i) => [margen.izq + i * paso, escalaY(d.valor)] as const),
      puntosSec: datos.some((d) => d.secundario !== undefined) ? datos.map((d, i) => [margen.izq + i * paso, escalaY(d.secundario ?? 0)] as const) : null,
    };
  }, [datos, alto]);

  const lineaSVG = (pts: readonly (readonly [number, number])[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]},${p[1]}`).join(' ');
  const areaSVG = (pts: readonly (readonly [number, number])[]) => {
    const base = alto - margen.abajo;
    return `M ${pts[0][0]},${base} ${pts.map((p) => `L ${p[0]},${p[1]}`).join(' ')} L ${pts.at(-1)![0]},${base} Z`;
  };

  if (!datos.length) return null;

  return (
    <div className="relative w-full select-none">
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full overflow-visible" preserveAspectRatio="none" style={{ height: alto }}>
        <defs>
          <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorLinea} stopOpacity="0.22" />
            <stop offset="100%" stopColor={colorLinea} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Rejilla horizontal al 6%, nunca vertical */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={margen.izq} x2={ancho - margen.der}
            y1={margen.arriba + (alto - margen.arriba - margen.abajo) * f}
            y2={margen.arriba + (alto - margen.arriba - margen.abajo) * f}
            stroke="var(--borde)" strokeOpacity={0.6} strokeWidth={1} />
        ))}

        <motion.path d={areaSVG(puntos)} fill={`url(#${idGradiente})`}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
        <motion.path d={lineaSVG(puntos)} fill="none" stroke={colorLinea} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} vectorEffect="non-scaling-stroke" />

        {puntosSec && (
          <motion.path d={lineaSVG(puntosSec)} fill="none" stroke="var(--texto-tenue)" strokeWidth={1.5} strokeDasharray="4 3" strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.9, delay: 0.15 }} vectorEffect="non-scaling-stroke" />
        )}

        {activo !== null && (
          <line x1={puntos[activo][0]} x2={puntos[activo][0]} y1={margen.arriba} y2={alto - margen.abajo} stroke="var(--texto-tenue)" strokeWidth={1} strokeDasharray="3 3" />
        )}
        {puntos.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={activo === i ? 4 : 0} fill={colorLinea} className="transition-all duration-150" />
            <rect x={x - (puntos.length > 1 ? (puntos[1][0] - puntos[0][0]) / 2 : 20)} y={0} width={puntos.length > 1 ? puntos[1][0] - puntos[0][0] : 40} height={alto}
              fill="transparent" onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)} />
          </g>
        ))}

        {datos.map((d, i) => (
          <text key={d.etiqueta} x={puntos[i][0]} y={alto - 6} textAnchor="middle" fontSize={10} className="fill-[var(--texto-tenue)] num" opacity={datos.length > 8 && i % 2 !== 0 ? 0 : 1}>
            {d.etiqueta}
          </text>
        ))}
      </svg>

      {activo !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-xs shadow-3"
          style={{ left: `${(puntos[activo][0] / ancho) * 100}%`, top: 0 }}
        >
          <div className="font-medium text-texto">{datos[activo].etiqueta}</div>
          <div className="num text-texto-secundario">{formatoY(datos[activo].valor)}</div>
          {etiquetaSecundaria && datos[activo].secundario !== undefined && (
            <div className="num text-texto-tenue">{etiquetaSecundaria}: {formatoY(datos[activo].secundario!)}</div>
          )}
        </div>
      )}
    </div>
  );
}
