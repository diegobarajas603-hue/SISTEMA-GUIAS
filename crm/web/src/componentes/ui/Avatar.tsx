import { iniciales, tonoAvatar } from '@/lib/formato';
import { cx } from '@/lib/utilidades';

const TAMANOS = { xs: 'size-5 text-[9px]', sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-11 text-sm' };

export function Avatar({
  nombre, tono, tamano = 'md', className,
}: { nombre: string; tono?: number | null; tamano?: keyof typeof TAMANOS; className?: string }) {
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', TAMANOS[tamano], className)}
      style={{ background: tonoAvatar(tono) }}
      title={nombre}
    >
      {iniciales(nombre)}
    </span>
  );
}

/** Fila de avatares apilados, para mostrar equipo o participantes sin ocupar espacio. */
export function PilaAvatares({ personas, maximo = 4 }: { personas: Array<{ nombre: string; tono?: number | null }>; maximo?: number }) {
  const visibles = personas.slice(0, maximo);
  const restantes = personas.length - visibles.length;
  return (
    <div className="flex -space-x-2">
      {visibles.map((p, i) => (
        <Avatar key={i} nombre={p.nombre} tono={p.tono} tamano="sm" className="ring-2 ring-superficie" />
      ))}
      {restantes > 0 && (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-superficie-2 text-[10px] font-semibold text-texto-secundario ring-2 ring-superficie">
          +{restantes}
        </span>
      )}
    </div>
  );
}
