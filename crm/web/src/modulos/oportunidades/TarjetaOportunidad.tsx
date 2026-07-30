import { AlertTriangle, Clock } from 'lucide-react';
import { Avatar } from '@/componentes/ui/Avatar';
import { dinero } from '@/lib/formato';
import type { Oportunidad } from '@/lib/tipos';
import { cx } from '@/lib/utilidades';

export function TarjetaOportunidad({
  op, onClick, arrastrable, alArrastrar,
}: { op: Oportunidad; onClick: () => void; arrastrable?: boolean; alArrastrar?: (e: React.DragEvent) => void }) {
  const p = op.ia_probabilidad ?? op.probabilidad;
  const discrepancia = Math.abs((op.ia_probabilidad ?? p) - op.probabilidad) >= 20;
  const diasInactiva = op.dias_inactiva ?? 0;
  const enRiesgo = diasInactiva > 14 || (op.ia_riesgos && op.ia_riesgos.length > 0);

  return (
    <div
      draggable={arrastrable}
      onDragStart={alArrastrar}
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-borde bg-superficie p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-borde-fuerte hover:shadow-3 active:cursor-grabbing"
    >
      <p className="truncate text-sm font-semibold text-texto">{op.nombre}</p>
      <p className="truncate text-xs text-texto-tenue">{op.cuenta_comercial || op.cuenta_nombre}</p>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="num text-base font-bold text-texto">{dinero(op.monto)}</span>
        <span className={cx('num rounded-pildora px-1.5 py-0.5 text-2xs font-bold', p >= 60 ? 'bg-exito-50 text-exito-600' : p >= 30 ? 'bg-alerta-50 text-alerta-600' : 'bg-superficie-2 text-texto-tenue')}>
          {p}%
        </span>
      </div>

      {discrepancia && (
        <p className="mt-1 text-2xs text-ia-600">IA difiere {Math.round(Math.abs(p - op.probabilidad))} pts del vendedor</p>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-borde pt-2">
        <span className={cx('flex items-center gap-1 text-2xs', enRiesgo ? 'text-peligro-500' : 'text-texto-tenue')}>
          {enRiesgo ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
          {diasInactiva > 0 ? `${diasInactiva} d inactiva` : 'Activa'}
        </span>
        {op.propietario_nombre && <Avatar nombre={op.propietario_nombre} tono={op.propietario_tono} tamano="xs" />}
      </div>
    </div>
  );
}
