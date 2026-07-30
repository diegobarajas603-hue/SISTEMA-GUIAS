import { useState } from 'react';
import { motion } from 'framer-motion';
import { COLUMNAS_KANBAN_OP, ETAPAS_OPORTUNIDAD } from '@/lib/constantes';
import { dinero } from '@/lib/formato';
import { usarMoverEtapaOportunidad } from '@/lib/consultas/oportunidades';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { TarjetaOportunidad } from './TarjetaOportunidad';
import type { Oportunidad } from '@/lib/tipos';
import { cx } from '@/lib/utilidades';

export function VistaTablero({ oportunidades, onAbrir }: { oportunidades: Oportunidad[]; onAbrir: (id: number) => void }) {
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [sobreColumna, setSobreColumna] = useState<string | null>(null);
  const mover = usarMoverEtapaOportunidad();
  const { avisar } = useAvisos();

  const porColumna = (etapa: string) => oportunidades.filter((o) => o.etapa === etapa);

  function soltar(e: React.DragEvent, etapa: string) {
    e.preventDefault();
    setSobreColumna(null);
    if (arrastrando == null) return;
    const op = oportunidades.find((o) => o.id === arrastrando);
    if (!op || op.etapa === etapa) return;

    if (etapa === 'perdido') {
      const motivo = window.prompt('¿Por qué se pierde esta oportunidad?');
      if (!motivo) { setArrastrando(null); return; }
      mover.mutate({ id: arrastrando, etapa, motivo_perdida: motivo });
    } else {
      mover.mutate({ id: arrastrando, etapa }, { onError: () => avisar({ tipo: 'error', titulo: 'No se pudo mover la oportunidad' }) });
    }
    setArrastrando(null);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {COLUMNAS_KANBAN_OP.map((etapa) => {
        const items = porColumna(etapa);
        const monto = items.reduce((s, o) => s + o.monto, 0);
        return (
          <div key={etapa}
            onDragOver={(e) => { e.preventDefault(); setSobreColumna(etapa); }}
            onDragLeave={() => setSobreColumna(null)}
            onDrop={(e) => soltar(e, etapa)}
            className={cx('flex flex-col rounded-xl border bg-superficie-2/50 transition-colors', sobreColumna === etapa ? 'border-marca-500 bg-marca-50/50' : 'border-borde')}
          >
            <div className="px-3 pt-3 pb-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-texto">{ETAPAS_OPORTUNIDAD[etapa]}</span>
                <span className="rounded-pildora bg-superficie px-1.5 py-0.5 text-2xs font-semibold text-texto-tenue">{items.length}</span>
              </div>
              <p className="num mt-0.5 text-xs text-texto-tenue">{dinero(monto)}</p>
            </div>
            <div className="flex-1 space-y-2.5 overflow-y-auto px-2.5 pb-3 pt-2" style={{ maxHeight: 'calc(100vh - 330px)', minHeight: 120 }}>
              {items.map((op) => (
                <motion.div key={op.id} layout animate={{ opacity: arrastrando === op.id ? 0.4 : 1 }}>
                  <TarjetaOportunidad op={op} onClick={() => onAbrir(op.id)} arrastrable alArrastrar={() => setArrastrando(op.id)} />
                </motion.div>
              ))}
              {items.length === 0 && <div className="rounded-lg border border-dashed border-borde py-8 text-center text-xs text-texto-tenue">Vacío</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
