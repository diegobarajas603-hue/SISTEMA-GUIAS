import { Trophy } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Avatar } from '@/componentes/ui/Avatar';
import { Progreso } from '@/componentes/ui/Progreso';
import { dinero } from '@/lib/formato';
import type { DashboardResumen } from '@/lib/tipos';
import { cx } from '@/lib/utilidades';

const MEDALLA = ['text-alerta-500', 'text-texto-tenue', 'text-[#b08d57]'];

export function WidgetRanking({ ranking }: Pick<DashboardResumen, 'ranking'>) {
  return (
    <Panel className="col-span-full lg:col-span-2" interactivo>
      <EncabezadoPanel titulo="Ranking de vendedores" subtitulo="Ingresos cerrados este mes" />
      <CuerpoPanel className="space-y-2.5">
        {ranking.slice(0, 6).map((v, i) => {
          const pct = v.meta_mensual > 0 ? Math.min((v.ingresos / v.meta_mensual) * 100, 100) : 0;
          return (
            <div key={v.id} className="flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-superficie-2">
              <span className={cx('flex w-5 shrink-0 items-center justify-center text-sm font-bold', i < 3 ? MEDALLA[i] : 'text-texto-tenue')}>
                {i < 3 ? <Trophy className="size-4" /> : i + 1}
              </span>
              <Avatar nombre={v.nombre} tono={v.avatar_tono} tamano="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium text-texto">{v.nombre}</p>
                  <p className="num shrink-0 text-sm font-semibold text-texto">{dinero(v.ingresos)}</p>
                </div>
                <Progreso valor={pct} max={100} alto={5} color="var(--marca-500)" className="mt-1" />
              </div>
            </div>
          );
        })}
        {ranking.length === 0 && <p className="text-sm text-texto-tenue">Sin datos del equipo todavía.</p>}
      </CuerpoPanel>
    </Panel>
  );
}
