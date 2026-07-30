import { cx } from '@/lib/utilidades';

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cx('aura-esqueleto rounded-md', className)} />;
}

/** Esqueleto con la geometría real de una tabla: evita el salto de diseño al llegar los datos. */
export function EsqueletoTabla({ filas = 6, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <div className="w-full">
      {Array.from({ length: filas }).map((_, f) => (
        <div key={f} className="flex items-center gap-4 border-b border-borde px-4 py-3 last:border-0">
          {Array.from({ length: columnas }).map((_, c) => (
            <Esqueleto key={c} className={cx('h-3.5', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EsqueletoTarjetas({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-xl border border-borde bg-superficie p-4">
          <Esqueleto className="h-3 w-1/2" />
          <Esqueleto className="mt-3 h-7 w-2/3" />
          <Esqueleto className="mt-2 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
