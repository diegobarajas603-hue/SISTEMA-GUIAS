import * as Iconos from 'lucide-react';
import { TIPO_ACTIVIDAD_ICONO, TIPO_ACTIVIDAD_TEXTO } from '@/lib/constantes';
import { fechaLarga, hora } from '@/lib/formato';
import { Vacio } from '@/componentes/ui/Vacio';
import type { Actividad } from '@/lib/tipos';

type NombreIcono = keyof typeof Iconos;
function IconoTipo({ tipo }: { tipo: string }) {
  const nombre = TIPO_ACTIVIDAD_ICONO[tipo] ?? 'circle';
  const Comp = Iconos[(nombre.replace(/(^\w|-\w)/g, (m) => m.replace('-', '').toUpperCase())) as NombreIcono] as Iconos.LucideIcon | undefined;
  return Comp ? <Comp className="size-4" /> : null;
}

export function VistaLista({ eventos, onAbrir }: { eventos: Actividad[]; onAbrir: (id: number) => void }) {
  const grupos = new Map<string, Actividad[]>();
  for (const e of [...eventos].sort((a, b) => +new Date(a.vence_en ?? 0) - +new Date(b.vence_en ?? 0))) {
    const clave = fechaLarga(e.vence_en);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(e);
  }

  if (eventos.length === 0) return <Vacio titulo="Sin actividades en este rango" />;

  return (
    <div className="space-y-6">
      {[...grupos.entries()].map(([fecha, items]) => (
        <div key={fecha}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-tenue capitalize">{fecha}</h3>
          <div className="space-y-1.5">
            {items.map((e) => (
              <button key={e.id} onClick={() => onAbrir(e.id)}
                className="fila-hover flex w-full items-center gap-3 rounded-lg border border-borde bg-superficie px-3 py-2.5 text-left">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-superficie-2 text-texto-secundario"><IconoTipo tipo={e.tipo} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-texto">{e.asunto}</p>
                  <p className="truncate text-xs text-texto-tenue">{TIPO_ACTIVIDAD_TEXTO[e.tipo]} · {e.cuenta_nombre ?? e.lead_nombre ?? e.oportunidad_nombre ?? '—'}</p>
                </div>
                <span className="num shrink-0 text-xs text-texto-tenue">{hora(e.vence_en)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
