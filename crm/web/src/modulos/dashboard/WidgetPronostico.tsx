import { Sparkles } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Medidor } from '@/componentes/graficas/Medidor';
import { dinero } from '@/lib/formato';
import type { Pronostico } from '@/lib/tipos';
import { InsigniaIA } from '@/componentes/ui/Insignia';

/** El widget insignia del pliego: «tienes un X% de probabilidad de superar tu objetivo». */
export function WidgetPronostico({ pronostico }: { pronostico: Pronostico }) {
  const p = pronostico.probabilidadMeta;
  const frase = p === null
    ? 'Define una meta mensual para que la IA calcule tu probabilidad de alcanzarla.'
    : p >= 70
      ? `Tienes un ${p}% de probabilidad de superar tu objetivo este mes. Vas por buen camino.`
      : p >= 40
        ? `Tienes un ${p}% de probabilidad de alcanzar tu objetivo este mes. Está en la balanza.`
        : `Tienes un ${p}% de probabilidad de alcanzar tu objetivo este mes. Necesitas acelerar el ritmo.`;

  return (
    <Panel className="col-span-full lg:col-span-1" interactivo>
      <EncabezadoPanel titulo="Pronóstico de ventas" acciones={<InsigniaIA>IA</InsigniaIA>} />
      <CuerpoPanel className="flex flex-col items-center">
        {p !== null ? (
          <Medidor valor={p} etiqueta="prob. de meta" />
        ) : (
          <div className="flex h-24 items-center text-sm text-texto-tenue">Sin meta definida</div>
        )}
        <p className="mt-1 flex items-start gap-1.5 text-center text-xs leading-relaxed text-texto-secundario">
          <Sparkles className="mt-0.5 size-3 shrink-0 text-ia-500" />
          {frase}
        </p>
        <div className="mt-4 grid w-full grid-cols-2 gap-2 border-t border-borde pt-3 text-center">
          <div>
            <p className="num text-sm font-semibold text-texto">{dinero(pronostico.proyeccion)}</p>
            <p className="text-2xs text-texto-tenue">Proyección</p>
          </div>
          <div>
            <p className="num text-sm font-semibold text-texto">{dinero(pronostico.rango.bajo)}–{dinero(pronostico.rango.alto)}</p>
            <p className="text-2xs text-texto-tenue">Rango 80%</p>
          </div>
        </div>
      </CuerpoPanel>
    </Panel>
  );
}
