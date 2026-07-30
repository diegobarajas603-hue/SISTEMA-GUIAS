import { IconoNodo } from './IconoNodo';
import { CATEGORIAS, ORDEN_CATEGORIAS, type Categoria } from './esquema-nodos';
import { cx } from '@/lib/utilidades';
import type { NodoCatalogo } from '@/lib/tipos';

export function PaletaNodos({ catalogo, onAgregar }: { catalogo: NodoCatalogo[]; onAgregar: (tipo: string) => void }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto rounded-xl border border-borde bg-superficie p-3">
      <p className="mb-1 px-1 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">Pasos disponibles</p>
      <p className="mb-3 px-1 text-2xs leading-relaxed text-texto-tenue">
        Arrastra al lienzo o haz clic para agregar.
      </p>

      <div className="space-y-4">
        {ORDEN_CATEGORIAS.map((categoria) => {
          const items = catalogo.filter((n) => n.categoria === categoria && n.tipo !== 'disparador');
          if (!items.length) return null;
          const cat = CATEGORIAS[categoria as Categoria];
          return (
            <div key={categoria}>
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">
                <span className="size-1.5 rounded-full" style={{ background: cat.acento }} />
                {cat.titulo}
              </p>
              <div className="space-y-1">
                {items.map((n) => (
                  <button
                    key={n.tipo}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/aura-nodo', n.tipo);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onAgregar(n.tipo)}
                    title={n.descripcion}
                    className={cx(
                      'flex w-full cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left',
                      'transition-colors duration-150 hover:border-borde hover:bg-superficie-2 active:cursor-grabbing',
                    )}
                  >
                    <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-md', cat.fondo, cat.texto)}>
                      <IconoNodo nombre={n.icono} className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-texto">{n.titulo}</span>
                      <span className="block truncate text-2xs text-texto-tenue">{n.descripcion}</span>
                    </span>
                    {n.simulado && (
                      <span className="shrink-0 rounded-pildora bg-superficie-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-texto-tenue">
                        sim
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
