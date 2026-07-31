import { Plus, Trash2, Lock, Package } from 'lucide-react';
import { calcularRenglon, ALTURA_NO_ESTIBABLE, renglonVacio } from '@aura/compartido';
import { Boton } from '@/componentes/ui/Boton';
import { Interruptor } from '@/componentes/ui/Interruptor';
import { cx } from '@/lib/utilidades';

export type Renglon = ReturnType<typeof renglonVacio>;

const kg = (n: number) =>
  `${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

/**
 * Captura de tarimas con cubicaje en vivo.
 *
 * Cada tecla recalcula el peso volumétrico y marca cuál de los dos pesos se va a
 * cobrar. La altura se bloquea en 1.80 m cuando la mercancía no es estibable:
 * ocupa ese espacio aunque mida menos, porque nadie puede poner nada encima.
 */
export function EditorMercancia({ renglones, onCambiar }: {
  renglones: Renglon[];
  onCambiar: (r: Renglon[]) => void;
}) {
  const poner = (i: number, campo: string, valor: unknown) => {
    const copia = renglones.map((r, k) => (k === i ? { ...r, [campo]: valor } : r));
    onCambiar(copia);
  };

  return (
    <div className="space-y-2.5">
      {renglones.map((r, i) => {
        const c = calcularRenglon(r as Record<string, unknown>);
        const porVolumen = c.cobra_por === 'volumetrico';
        const hayMedidas = c.largo > 0 && c.ancho > 0;

        return (
          <div key={i} className="rounded-xl border border-borde bg-superficie p-3.5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">
                <Package className="size-3.5" /> Renglón {i + 1}
              </span>
              {renglones.length > 1 && (
                <button
                  onClick={() => onCambiar(renglones.filter((_, k) => k !== i))}
                  aria-label={`Quitar el renglón ${i + 1}`}
                  className="rounded-md p-1 text-texto-tenue hover:bg-peligro-50 hover:text-peligro-500"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <Numero etiqueta="Cantidad" valor={r.cantidad} paso="1"
                onCambiar={(v) => poner(i, 'cantidad', v)} />
              <Numero etiqueta="Peso real (kg)" valor={r.peso_real} paso="0.01"
                ayuda="de todo el renglón" onCambiar={(v) => poner(i, 'peso_real', v)} />
              <Numero etiqueta="Largo (m)" valor={r.largo} paso="0.01"
                onCambiar={(v) => poner(i, 'largo', v)} />
              <Numero etiqueta="Ancho (m)" valor={r.ancho} paso="0.01"
                onCambiar={(v) => poner(i, 'ancho', v)} />
              <Numero
                etiqueta="Alto (m)"
                valor={r.estibable ? r.alto : ALTURA_NO_ESTIBABLE}
                paso="0.01"
                bloqueado={!r.estibable}
                ayuda={r.estibable ? undefined : 'fijo por no estibable'}
                onCambiar={(v) => poner(i, 'alto', v)}
              />
              <label className="flex flex-col justify-between">
                <span className="mb-1.5 block text-xs font-medium text-texto-secundario">Estibable</span>
                <div className="flex h-9 items-center gap-2">
                  <Interruptor
                    activo={!!r.estibable}
                    etiqueta={`Renglón ${i + 1} estibable`}
                    onCambiar={(v) => poner(i, 'estibable', v)}
                  />
                  <span className="text-xs text-texto-secundario">{r.estibable ? 'Sí' : 'No'}</span>
                </div>
              </label>
            </div>

            {hayMedidas && (
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-borde pt-2.5 text-xs">
                <Cifra etiqueta="Peso real" valor={kg(c.peso_real)} resaltado={!porVolumen} />
                <Cifra etiqueta="Peso volumétrico" valor={kg(c.peso_volumetrico)} resaltado={porVolumen} />
                <span className="ml-auto inline-flex items-center gap-1.5">
                  <span className="text-texto-tenue">Se cobra</span>
                  <span className="num font-semibold text-texto">{kg(c.peso_cobrable)}</span>
                  <span className={cx(
                    'rounded-pildora px-1.5 py-0.5 text-[10px] font-medium',
                    porVolumen ? 'bg-marca-50 text-marca-700' : 'bg-superficie-2 text-texto-secundario',
                  )}>
                    {porVolumen ? 'por volumen' : 'por peso real'}
                  </span>
                </span>
              </div>
            )}
          </div>
        );
      })}

      <Boton
        variante="secundario" tamano="sm" iconoIzq={<Plus className="size-3.5" />}
        onClick={() => onCambiar([...renglones, renglonVacio() as Renglon])}
      >
        Agregar tarima o bulto
      </Boton>
    </div>
  );
}

function Numero({ etiqueta, valor, paso, bloqueado, ayuda, onCambiar }: {
  etiqueta: string; valor: unknown; paso: string;
  bloqueado?: boolean; ayuda?: string; onCambiar: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-texto-secundario">
        {etiqueta}
        {bloqueado && <Lock className="size-2.5 text-texto-tenue" />}
      </span>
      <input
        type="number" min="0" step={paso} inputMode="decimal"
        value={valor === null || valor === undefined ? '' : String(valor)}
        disabled={bloqueado}
        onChange={(e) => onCambiar(e.target.value)}
        aria-label={etiqueta}
        className={cx(
          'num h-9 w-full rounded-lg border px-2.5 text-sm text-texto',
          'focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-500/12',
          bloqueado ? 'cursor-not-allowed border-borde bg-superficie-2 text-texto-tenue' : 'border-borde bg-superficie',
        )}
      />
      {ayuda && <span className="mt-1 block text-[10px] text-texto-tenue">{ayuda}</span>}
    </label>
  );
}

function Cifra({ etiqueta, valor, resaltado }: { etiqueta: string; valor: string; resaltado: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-texto-tenue">{etiqueta}</span>
      <span className={cx('num', resaltado ? 'font-semibold text-texto' : 'text-texto-secundario')}>{valor}</span>
    </span>
  );
}
