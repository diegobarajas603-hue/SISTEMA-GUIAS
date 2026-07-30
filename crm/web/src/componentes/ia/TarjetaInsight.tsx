import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import type { Insight } from '@/lib/tipos';
import { SEVERIDAD_COLOR, TIPO_INSIGHT_TEXTO } from '@/lib/constantes';
import { dinero } from '@/lib/formato';
import { cx } from '@/lib/utilidades';

const RUTAS: Record<string, string> = { cuenta: '/clientes', oportunidad: '/oportunidades', lead: '/prospectos' };

export function TarjetaInsight({ insight, compacta }: { insight: Insight; compacta?: boolean }) {
  const navegar = useNavigate();
  const ruta = RUTAS[insight.entidad_tipo];

  return (
    <div
      onClick={() => ruta && navegar(`${ruta}/${insight.entidad_id}`)}
      className={cx(
        'shrink-0 cursor-pointer rounded-xl border border-borde bg-superficie p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-3',
        compacta ? 'w-64' : 'w-full',
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide" style={{ color: SEVERIDAD_COLOR[insight.severidad] }}>
          <Sparkles className="size-3" /> {TIPO_INSIGHT_TEXTO[insight.tipo]}
        </span>
        {insight.impacto > 0 && <span className="num text-2xs font-semibold text-texto-tenue">{dinero(insight.impacto)}</span>}
      </div>
      <p className="line-clamp-2 text-sm font-medium text-texto">{insight.titulo}</p>
      <p className="mt-1 line-clamp-2 text-xs text-texto-tenue">{insight.explicacion}</p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-superficie-2">
        <div className="h-full rounded-full bg-ia-500" style={{ width: `${insight.confianza}%` }} />
      </div>
    </div>
  );
}
