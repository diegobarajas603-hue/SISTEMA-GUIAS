import { Avatar } from '@/componentes/ui/Avatar';
import { Insignia } from '@/componentes/ui/Insignia';
import { dinero, fechaCorta } from '@/lib/formato';
import { ETAPAS_OPORTUNIDAD } from '@/lib/constantes';
import type { Oportunidad } from '@/lib/tipos';

export function VistaTablaOportunidades({ oportunidades, onAbrir }: { oportunidades: Oportunidad[]; onAbrir: (id: number) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-borde bg-superficie">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">
              <th className="px-4 py-2.5 text-left">Oportunidad</th><th className="px-4 py-2.5 text-left">Cuenta</th>
              <th className="px-4 py-2.5 text-left">Etapa</th><th className="px-4 py-2.5 text-right">Monto</th>
              <th className="px-4 py-2.5 text-right">Prob. IA</th><th className="px-4 py-2.5 text-left">Cierre</th>
              <th className="px-4 py-2.5 text-left">Propietario</th>
            </tr>
          </thead>
          <tbody>
            {oportunidades.map((o) => (
              <tr key={o.id} onClick={() => onAbrir(o.id)} className="fila-hover cursor-pointer border-b border-borde last:border-0">
                <td className="px-4 py-2.5 font-medium text-texto">{o.nombre}</td>
                <td className="px-4 py-2.5 text-texto-secundario">{o.cuenta_comercial || o.cuenta_nombre}</td>
                <td className="px-4 py-2.5"><Insignia color={o.estado === 'ganada' ? 'exito' : o.estado === 'perdida' ? 'peligro' : 'marca'}>{ETAPAS_OPORTUNIDAD[o.etapa]}</Insignia></td>
                <td className="num px-4 py-2.5 text-right font-semibold text-texto">{dinero(o.monto)}</td>
                <td className="num px-4 py-2.5 text-right text-texto-secundario">{o.ia_probabilidad ?? o.probabilidad}%</td>
                <td className="px-4 py-2.5 text-texto-tenue">{fechaCorta(o.cierre_estimado)}</td>
                <td className="px-4 py-2.5">{o.propietario_nombre ? <Avatar nombre={o.propietario_nombre} tono={o.propietario_tono} tamano="xs" /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
