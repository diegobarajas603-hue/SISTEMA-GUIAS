import { useState } from 'react';
import { motion } from 'framer-motion';
import { COLUMNAS_KANBAN_LEAD, ETAPAS_LEAD } from '@/lib/constantes';
import { dinero } from '@/lib/formato';
import { usarMoverEtapaLead } from '@/lib/consultas/leads';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { TarjetaLead } from './TarjetaLead';
import type { Lead } from '@/lib/tipos';
import { cx } from '@/lib/utilidades';

export function VistaKanban({ leads, onAbrir }: { leads: Lead[]; onAbrir: (id: number) => void }) {
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [sobreColumna, setSobreColumna] = useState<string | null>(null);
  const mover = usarMoverEtapaLead();
  const { avisar } = useAvisos();

  const porColumna = (etapa: string) => leads.filter((l) => l.etapa === etapa);

  function soltar(e: React.DragEvent, etapa: string) {
    e.preventDefault();
    setSobreColumna(null);
    if (arrastrando == null) return;
    const lead = leads.find((l) => l.id === arrastrando);
    if (!lead || lead.etapa === etapa) return;

    if (etapa === 'perdido') {
      const motivo = window.prompt('¿Por qué se pierde este prospecto? (opcional)') ?? undefined;
      mover.mutate({ id: arrastrando, etapa, motivo_perdida: motivo });
    } else {
      mover.mutate({ id: arrastrando, etapa }, {
        onError: () => avisar({ tipo: 'error', titulo: 'No se pudo mover el prospecto' }),
      });
    }
    setArrastrando(null);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {COLUMNAS_KANBAN_LEAD.map((etapa) => {
        const items = porColumna(etapa);
        const valor = items.reduce((s, l) => s + l.valor_estimado, 0);
        return (
          <div
            key={etapa}
            onDragOver={(e) => { e.preventDefault(); setSobreColumna(etapa); }}
            onDragLeave={() => setSobreColumna(null)}
            onDrop={(e) => soltar(e, etapa)}
            className={cx(
              'flex flex-col rounded-xl border bg-superficie-2/50 transition-colors duration-150',
              sobreColumna === etapa ? 'border-marca-500 bg-marca-50/50' : 'border-borde',
            )}
          >
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-texto">{ETAPAS_LEAD[etapa]}</span>
                <span className="rounded-pildora bg-superficie px-1.5 py-0.5 text-2xs font-semibold text-texto-tenue">{items.length}</span>
              </div>
            </div>
            {valor > 0 && <p className="num px-3 pb-2 text-xs text-texto-tenue">{dinero(valor)}</p>}

            <div className="flex-1 space-y-2.5 overflow-y-auto px-2.5 pb-3" style={{ maxHeight: 'calc(100vh - 320px)', minHeight: 120 }}>
              {items.map((lead) => (
                <motion.div
                  key={lead.id} layout
                  animate={{ opacity: arrastrando === lead.id ? 0.4 : 1, rotate: arrastrando === lead.id ? -2 : 0 }}
                  onDragEnd={() => setArrastrando(null)}
                >
                  <TarjetaLead lead={lead} onClick={() => onAbrir(lead.id)} arrastrable alArrastrar={() => setArrastrando(lead.id)} />
                </motion.div>
              ))}
              {items.length === 0 && (
                <div className="rounded-lg border border-dashed border-borde py-8 text-center text-xs text-texto-tenue">Sin prospectos aquí</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
