import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function Vacio({
  icono, titulo, descripcion, accion,
}: { icono?: ReactNode; titulo: string; descripcion?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-borde px-6 py-14 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-superficie-2 text-texto-tenue">
        {icono ?? <Inbox className="size-5" />}
      </div>
      <div>
        <p className="text-sm font-medium text-texto">{titulo}</p>
        {descripcion && <p className="mx-auto mt-1 max-w-xs text-sm text-texto-tenue">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}
