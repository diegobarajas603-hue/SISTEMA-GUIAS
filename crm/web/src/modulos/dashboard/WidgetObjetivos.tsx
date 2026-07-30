import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Progreso } from '@/componentes/ui/Progreso';
import { dinero, numero } from '@/lib/formato';
import type { DashboardResumen } from '@/lib/tipos';

export function WidgetObjetivos({ objetivos }: Pick<DashboardResumen, 'objetivos'>) {
  if (!objetivos.items.length) {
    return (
      <Panel className="col-span-full lg:col-span-1">
        <EncabezadoPanel titulo="Objetivos del mes" />
        <CuerpoPanel><p className="text-sm text-texto-tenue">Aún no hay metas configuradas para este periodo.</p></CuerpoPanel>
      </Panel>
    );
  }

  return (
    <Panel className="col-span-full lg:col-span-1" interactivo>
      <EncabezadoPanel titulo="Objetivos del mes" />
      <CuerpoPanel className="space-y-4">
        {objetivos.items.map((it) => {
          const pct = it.porcentaje ?? 0;
          const cumplido = pct >= 100;
          return (
            <div key={it.clave}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="font-medium text-texto">{it.titulo}</span>
                <span className="num text-texto-tenue">
                  {it.formato === 'dinero' ? dinero(it.actual) : numero(it.actual)} / {it.formato === 'dinero' ? dinero(it.meta) : numero(it.meta)}
                </span>
              </div>
              <Progreso valor={it.actual} max={it.meta} color={cumplido ? 'var(--exito-500)' : 'var(--marca-500)'} />
              <p className={`num mt-0.5 text-2xs font-semibold ${cumplido ? 'text-exito-600' : 'text-texto-tenue'}`}>{pct}%</p>
            </div>
          );
        })}
      </CuerpoPanel>
    </Panel>
  );
}
