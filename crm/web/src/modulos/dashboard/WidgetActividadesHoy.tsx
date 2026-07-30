import { Phone, Mail, Users, MessageCircle, Repeat, FileText } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Progreso } from '@/componentes/ui/Progreso';
import type { DashboardResumen } from '@/lib/tipos';

export function WidgetActividadesHoy({ actividadesHoy }: Pick<DashboardResumen, 'actividadesHoy'>) {
  const a = actividadesHoy;
  const items = [
    { etiqueta: 'Llamadas', valor: a.llamadas, icono: Phone, color: 'var(--serie-1)' },
    { etiqueta: 'Correos', valor: a.correos, icono: Mail, color: 'var(--serie-2)' },
    { etiqueta: 'Reuniones', valor: a.reuniones, icono: Users, color: 'var(--ia-500)' },
    { etiqueta: 'WhatsApp', valor: a.whatsapp, icono: MessageCircle, color: 'var(--exito-500)' },
    { etiqueta: 'Seguimientos', valor: a.seguimientos, icono: Repeat, color: 'var(--alerta-500)' },
    { etiqueta: 'Cotizaciones', valor: a.cotizaciones, icono: FileText, color: 'var(--serie-5)' },
  ];
  const max = Math.max(...items.map((i) => i.valor), 1);

  return (
    <Panel className="col-span-full lg:col-span-1" interactivo>
      <EncabezadoPanel
        titulo="Actividades de hoy"
        acciones={<span className="text-xs font-semibold text-texto-secundario">{a.completadas}/{a.total} listas</span>}
      />
      <CuerpoPanel className="space-y-3">
        {items.map((it) => (
          <div key={it.etiqueta} className="flex items-center gap-2.5">
            <it.icono className="size-3.5 shrink-0" style={{ color: it.color }} />
            <span className="w-24 shrink-0 text-xs text-texto-secundario">{it.etiqueta}</span>
            <Progreso valor={it.valor} max={max} color={it.color} alto={6} className="flex-1" />
            <span className="num w-5 shrink-0 text-right text-xs font-semibold text-texto">{it.valor}</span>
          </div>
        ))}
        {a.vencidas > 0 && (
          <p className="rounded-lg bg-peligro-50 px-2.5 py-1.5 text-xs font-medium text-peligro-600">
            {a.vencidas} actividad{a.vencidas === 1 ? '' : 'es'} vencida{a.vencidas === 1 ? '' : 's'}
          </p>
        )}
      </CuerpoPanel>
    </Panel>
  );
}
