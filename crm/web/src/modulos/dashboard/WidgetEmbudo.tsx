import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Embudo } from '@/componentes/graficas/Embudo';
import type { EtapaEmbudo } from '@/lib/tipos';

export function WidgetEmbudo({ embudo }: { embudo: EtapaEmbudo[] }) {
  const conversionTotal = embudo.length ? embudo.at(-1)!.porcentajeTotal : 0;
  return (
    <Panel className="col-span-full lg:col-span-2" interactivo>
      <EncabezadoPanel
        titulo="Embudo de ventas"
        subtitulo="Lead → Contacto → Calificado → Propuesta → Negociación → Ganado"
        acciones={<span className="text-xs font-semibold text-texto-secundario">{conversionTotal}% conversión total</span>}
      />
      <CuerpoPanel><Embudo etapas={embudo} /></CuerpoPanel>
    </Panel>
  );
}
