import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Vacio } from '@/componentes/ui/Vacio';
import { InsigniaIA } from '@/componentes/ui/Insignia';
import { dinero } from '@/lib/formato';
import type { DashboardResumen } from '@/lib/tipos';

export function WidgetOportunidadesRiesgo({ oportunidadesRiesgo }: Pick<DashboardResumen, 'oportunidadesRiesgo'>) {
  const navegar = useNavigate();
  return (
    <Panel className="col-span-full lg:col-span-2" interactivo>
      <EncabezadoPanel titulo="Oportunidades en riesgo" subtitulo="Detectadas por IA" acciones={<InsigniaIA>IA</InsigniaIA>} />
      <CuerpoPanel>
        {oportunidadesRiesgo.length === 0 ? (
          <Vacio icono={<ShieldCheck className="size-5" />} titulo="Sin riesgos detectados" descripcion="El pipeline abierto está sano." />
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {oportunidadesRiesgo.slice(0, 6).map((o) => (
              <li key={o.id} onClick={() => navegar(`/oportunidades/${o.id}`)}
                className="cursor-pointer rounded-lg border border-borde p-3 transition-colors hover:border-peligro-200 hover:bg-peligro-50/40">
                <div className="mb-1 flex items-center gap-1.5 text-peligro-500">
                  <AlertTriangle className="size-3.5" />
                  <span className="text-2xs font-semibold uppercase tracking-wide">
                    {o.dias_inactiva && o.dias_inactiva > 14 ? `${o.dias_inactiva} d inactiva` : 'Riesgo detectado'}
                  </span>
                </div>
                <p className="truncate text-sm font-medium text-texto">{o.nombre}</p>
                <p className="truncate text-xs text-texto-tenue">{o.cuenta_comercial}</p>
                <p className="num mt-1 text-sm font-semibold text-texto">{dinero(o.monto)}</p>
              </li>
            ))}
          </ul>
        )}
      </CuerpoPanel>
    </Panel>
  );
}
