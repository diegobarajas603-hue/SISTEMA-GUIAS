import { Sparkles } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Medidor } from '@/componentes/graficas/Medidor';
import { usarPronostico } from '@/lib/consultas/oportunidades';
import { dinero } from '@/lib/formato';
import { InsigniaIA } from '@/componentes/ui/Insignia';

export function PanelPronostico() {
  const { data: p, isLoading } = usarPronostico();

  if (isLoading || !p) return <Panel className="h-64 animate-pulse" />;

  return (
    <Panel>
      <EncabezadoPanel titulo="Pronóstico del mes" acciones={<InsigniaIA>IA</InsigniaIA>} />
      <CuerpoPanel className="flex flex-col items-center">
        {p.probabilidadMeta !== null ? <Medidor valor={p.probabilidadMeta} etiqueta="prob. de meta" tamano={130} /> : <p className="py-4 text-sm text-texto-tenue">Sin meta definida</p>}
        <div className="mt-3 grid w-full grid-cols-2 gap-2 text-center">
          <div><p className="num text-sm font-bold">{dinero(p.cerrado)}</p><p className="text-2xs text-texto-tenue">Cerrado</p></div>
          <div><p className="num text-sm font-bold">{dinero(p.proyeccion)}</p><p className="text-2xs text-texto-tenue">Proyección</p></div>
        </div>
        <div className="mt-3 w-full space-y-1.5 border-t border-borde pt-3">
          <BarraTramoLeyenda color="var(--exito-500)" etiqueta="Comprometido" valor={p.tramos.comprometido} />
          <BarraTramoLeyenda color="var(--alerta-500)" etiqueta="Probable" valor={p.tramos.probable} />
          <BarraTramoLeyenda color="var(--texto-tenue)" etiqueta="Optimista" valor={p.tramos.optimista} />
        </div>
        {p.faltante > 0 && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-marca-50 p-2.5 text-xs text-marca-700">
            <Sparkles className="mt-0.5 size-3 shrink-0" />
            Faltan {dinero(p.faltante)}. Necesitas {dinero(p.ritmo.requeridoDiario)}/día en los {p.ritmo.diasRestantes} días restantes.
          </p>
        )}
      </CuerpoPanel>
    </Panel>
  );
}

function BarraTramoLeyenda({ color, etiqueta, valor }: { color: string; etiqueta: string; valor: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-texto-secundario"><span className="size-2 rounded-full" style={{ background: color }} />{etiqueta}</span>
      <span className="num font-medium text-texto">{dinero(valor)}</span>
    </div>
  );
}
