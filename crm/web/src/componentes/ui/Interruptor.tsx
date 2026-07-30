import { cx } from '@/lib/utilidades';

export function Interruptor({
  activo, onCambiar, etiqueta, deshabilitado,
}: { activo: boolean; onCambiar: (v: boolean) => void; etiqueta?: string; deshabilitado?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onCambiar(!activo)}
      className={cx(
        'relative inline-flex h-5.5 w-9.5 shrink-0 items-center rounded-pildora transition-colors duration-200',
        'disabled:cursor-not-allowed disabled:opacity-45',
        activo ? 'bg-marca-500' : 'bg-borde-fuerte',
      )}
      style={{ height: 22, width: 38 }}
    >
      <span
        className="inline-block rounded-full bg-white shadow transition-transform duration-200"
        style={{ height: 16, width: 16, transform: activo ? 'translateX(19px)' : 'translateX(3px)' }}
      />
    </button>
  );
}
