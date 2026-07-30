import { useNavigate } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Vacio } from '@/componentes/ui/Vacio';
import { TIPO_ACTIVIDAD_ICONO, TIPO_ACTIVIDAD_TEXTO } from '@/lib/constantes';
import { fechaHora } from '@/lib/formato';
import type { DashboardResumen } from '@/lib/tipos';
import { iconoPorNombre } from '@/lib/iconos';

function IconoTipo({ tipo }: { tipo: string }) {
  const nombre = TIPO_ACTIVIDAD_ICONO[tipo] ?? 'circle';
  const Comp = iconoPorNombre(nombre);
  return Comp ? <Comp className="size-3.5" /> : null;
}

export function WidgetProximasActividades({ proximasActividades }: Pick<DashboardResumen, 'proximasActividades'>) {
  const navegar = useNavigate();
  return (
    <Panel className="col-span-full lg:col-span-1" interactivo>
      <EncabezadoPanel titulo="Próximas actividades" subtitulo="Próximos 10 días" />
      <CuerpoPanel>
        {proximasActividades.length === 0 ? (
          <Vacio icono={<CalendarClock className="size-5" />} titulo="Agenda despejada" />
        ) : (
          <ul className="space-y-2.5">
            {proximasActividades.slice(0, 6).map((a) => (
              <li key={a.id} onClick={() => navegar('/agenda')} className="fila-hover -mx-1 flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-superficie-2 text-texto-secundario">
                  <IconoTipo tipo={a.tipo} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-texto">{a.asunto}</p>
                  <p className="truncate text-xs text-texto-tenue">
                    {TIPO_ACTIVIDAD_TEXTO[a.tipo]} · {a.cuenta ?? a.lead ?? a.oportunidad ?? '—'}
                  </p>
                </div>
                <span className="num shrink-0 text-2xs text-texto-tenue">{fechaHora(a.vence_en)}</span>
              </li>
            ))}
          </ul>
        )}
      </CuerpoPanel>
    </Panel>
  );
}
