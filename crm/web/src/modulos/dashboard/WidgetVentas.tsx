import { TrendingUp } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { GraficaArea } from '@/componentes/graficas/GraficaArea';
import { useContador } from '@/lib/hooks';
import { dinero, numero } from '@/lib/formato';
import type { DashboardResumen } from '@/lib/tipos';

export function WidgetVentas({ ventasMes, serie }: Pick<DashboardResumen, 'ventasMes' | 'serie'>) {
  const animado = useContador(ventasMes.total);
  const positiva = (ventasMes.variacion ?? 0) >= 0;

  return (
    <Panel className="col-span-full lg:col-span-2" interactivo>
      <EncabezadoPanel
        titulo="Ventas del mes"
        acciones={
          ventasMes.variacion !== null && (
            <span className={`flex items-center gap-1 rounded-pildora px-2 py-0.5 text-xs font-semibold ${positiva ? 'bg-exito-50 text-exito-600' : 'bg-peligro-50 text-peligro-500'}`}>
              <TrendingUp className="size-3" /> {positiva ? '+' : ''}{ventasMes.variacion}% vs mes anterior
            </span>
          )
        }
      />
      <CuerpoPanel>
        <div className="mb-1 flex items-end gap-3">
          <span className="num text-3xl font-bold tracking-tight text-texto">{dinero(animado)}</span>
          <span className="mb-1 text-sm text-texto-tenue">· {numero(ventasMes.operaciones)} operaciones</span>
        </div>
        <p className="mb-4 text-xs text-texto-tenue">Ticket promedio {dinero(ventasMes.ticketPromedio)}</p>
        <GraficaArea datos={serie.map((s) => ({ etiqueta: s.etiqueta, valor: s.ingresos }))} formatoY={dinero} />
      </CuerpoPanel>
    </Panel>
  );
}
