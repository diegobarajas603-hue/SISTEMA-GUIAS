import { Building2, MapPin } from 'lucide-react';
import { Panel } from '@/componentes/ui/Panel';
import { Avatar } from '@/componentes/ui/Avatar';
import { Insignia } from '@/componentes/ui/Insignia';
import { Progreso } from '@/componentes/ui/Progreso';
import { dinero } from '@/lib/formato';
import { TIPO_CUENTA_TEXTO } from '@/lib/constantes';
import type { Cuenta } from '@/lib/tipos';

export function TarjetaCuenta({ cuenta, onClick }: { cuenta: Cuenta & { propietario?: string }; onClick: () => void }) {
  const riesgo = cuenta.riesgo_churn >= 55;
  return (
    <Panel interactivo onClick={onClick} className="cursor-pointer p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-texto">{cuenta.nombre_comercial || cuenta.nombre}</p>
          <p className="flex items-center gap-1 truncate text-xs text-texto-tenue">
            <Building2 className="size-3 shrink-0" /> {cuenta.industria ?? 'Sin industria'}
          </p>
        </div>
        {cuenta.propietario_nombre && <Avatar nombre={cuenta.propietario_nombre} tono={cuenta.propietario_tono} tamano="sm" />}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <Insignia color={cuenta.tipo === 'cliente' ? 'exito' : cuenta.tipo === 'prospecto' ? 'marca' : 'gris'}>{TIPO_CUENTA_TEXTO[cuenta.tipo]}</Insignia>
        {riesgo && <Insignia color="peligro">Riesgo {cuenta.riesgo_churn}</Insignia>}
        {(cuenta.ciudad || cuenta.estado) && (
          <span className="flex items-center gap-1 truncate text-2xs text-texto-tenue"><MapPin className="size-3" /> {cuenta.ciudad}</span>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-texto-tenue">Salud</span>
          <span className="num font-semibold text-texto">{cuenta.salud}/100</span>
        </div>
        <Progreso valor={cuenta.salud} color={cuenta.salud >= 70 ? 'var(--exito-500)' : cuenta.salud >= 40 ? 'var(--alerta-500)' : 'var(--peligro-500)'} alto={5} className="mt-1" />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-borde pt-2.5">
        <span className="text-2xs text-texto-tenue">Facturado en el año</span>
        <span className="num text-sm font-semibold text-texto">{dinero(cuenta.ingresos_ano)}</span>
      </div>
    </Panel>
  );
}
