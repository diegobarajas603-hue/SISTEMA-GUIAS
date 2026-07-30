import { Anillo } from '@/componentes/ui/Anillo';
import { dinero, fechaLarga, mesAno } from '@/lib/formato';
import type { Lead } from '@/lib/tipos';

/** Vista cronológica: prospectos agrupados por mes de llegada, más reciente primero. */
export function VistaCronologia({ leads, onAbrir }: { leads: Lead[]; onAbrir: (id: number) => void }) {
  const grupos = new Map<string, Lead[]>();
  for (const l of [...leads].sort((a, b) => +new Date(b.creado_en) - +new Date(a.creado_en))) {
    const clave = mesAno(l.creado_en);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(l);
  }

  return (
    <div className="space-y-8">
      {[...grupos.entries()].map(([mes, items]) => (
        <div key={mes}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-texto-tenue capitalize">{mes}</h3>
          <div className="relative space-y-0 border-l-2 border-borde pl-5">
            {items.map((l) => (
              <div key={l.id} onClick={() => onAbrir(l.id)}
                className="relative cursor-pointer rounded-lg py-2.5 pl-2 pr-2 transition-colors hover:bg-superficie-2">
                <span className="absolute -left-[26px] top-4 size-2.5 rounded-full border-2 border-superficie bg-marca-500" />
                <div className="flex items-center gap-3">
                  <Anillo valor={l.score} temperatura={l.temperatura} tamano={30} grosor={3} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-texto">{l.nombre}{l.empresa ? ` · ${l.empresa}` : ''}</p>
                    <p className="text-xs text-texto-tenue">{fechaLarga(l.creado_en)} · {l.origen ?? 'origen desconocido'}</p>
                  </div>
                  {l.valor_estimado > 0 && <span className="num shrink-0 text-sm font-semibold text-texto-secundario">{dinero(l.valor_estimado)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
