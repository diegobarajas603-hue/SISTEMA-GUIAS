import { Building2, Clock } from 'lucide-react';
import { Anillo } from '@/componentes/ui/Anillo';
import { Avatar } from '@/componentes/ui/Avatar';
import { Insignia } from '@/componentes/ui/Insignia';
import type { Lead } from '@/lib/tipos';
import { dinero, relativo } from '@/lib/formato';
import { TEMPERATURA_TEXTO } from '@/lib/constantes';
import { cx } from '@/lib/utilidades';

export function TarjetaLead({
  lead, onClick, arrastrable, alArrastrar, sinArrastre,
}: {
  lead: Lead; onClick: () => void; arrastrable?: boolean;
  alArrastrar?: (e: React.DragEvent) => void; sinArrastre?: boolean;
}) {
  return (
    <div
      draggable={arrastrable}
      onDragStart={alArrastrar}
      onClick={onClick}
      className={cx(
        'group cursor-pointer rounded-xl border border-borde bg-superficie p-3.5 transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-borde-fuerte hover:shadow-3',
        arrastrable && !sinArrastre && 'active:cursor-grabbing',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-texto">{lead.nombre}</p>
          {lead.empresa && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-texto-tenue">
              <Building2 className="size-3 shrink-0" /> {lead.empresa}
            </p>
          )}
        </div>
        <Anillo valor={lead.score} temperatura={lead.temperatura} tamano={36} grosor={3} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Insignia color={lead.temperatura === 'ardiente' || lead.temperatura === 'caliente' ? 'peligro' : lead.temperatura === 'tibio' ? 'alerta' : 'gris'}>
          {TEMPERATURA_TEXTO[lead.temperatura]}
        </Insignia>
        {lead.valor_estimado > 0 && <span className="num text-xs font-semibold text-texto-secundario">{dinero(lead.valor_estimado)}</span>}
      </div>

      {lead.etiquetas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.etiquetas.slice(0, 3).map((e) => (
            <span key={e} className="rounded-pildora bg-superficie-2 px-1.5 py-0.5 text-[10px] text-texto-tenue">{e}</span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-borde pt-2">
        <span className="flex items-center gap-1 text-2xs text-texto-tenue">
          <Clock className="size-3" /> {relativo(lead.ultimo_contacto_en ?? lead.creado_en)}
        </span>
        {lead.propietario_nombre && <Avatar nombre={lead.propietario_nombre} tono={lead.propietario_tono} tamano="xs" />}
      </div>
    </div>
  );
}
