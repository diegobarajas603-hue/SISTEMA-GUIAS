import { calcularCotizacion } from '@aura/compartido';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { dinero } from '@/lib/formato';
import type { Cotizacion, ItemCotizacion } from '@/lib/tipos';

const kg = (n: number) =>
  `${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

/**
 * Totales del flete. Recalcula desde los renglones en vez de leer las columnas
 * guardadas: mientras se edita, lo guardado todavía es lo anterior y el usuario
 * necesita ver a dónde va el importe antes de pulsar guardar.
 */
export function ResumenFlete({ cotizacion, items }: {
  cotizacion: Cotizacion;
  items: ItemCotizacion[];
}) {
  const t = calcularCotizacion(
    items as unknown as Record<string, unknown>[],
    cotizacion.tipo_mercancia ?? 'general',
  );
  const iva = Math.round(t.importe * 0.16);

  return (
    <Panel>
      <EncabezadoPanel titulo="Resumen del flete" subtitulo={t.tarifa_titulo} />
      <CuerpoPanel>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <dl className="space-y-2 text-sm">
            <Fila t="Piezas" v={`${t.piezas}`} />
            <Fila t="Peso real total" v={kg(t.peso_real_total)} />
            <Fila t="Peso volumétrico total" v={kg(t.peso_volumetrico_total)} />
            <div className="flex items-center justify-between gap-3 border-t border-borde pt-2">
              <dt className="font-medium text-texto">Peso total cobrable</dt>
              <dd className="num font-semibold text-marca-600">{kg(t.peso_cobrable_total)}</dd>
            </div>
            <Fila t="Tarifa aplicada" v={`$${(t.tarifa_centavos_kg / 100).toFixed(2)} por kg`} />
          </dl>

          <div className="rounded-xl bg-texto p-4 sm:w-56">
            <p className="text-2xs font-semibold uppercase tracking-wide text-superficie/70">
              Importe del flete
            </p>
            <p className="num mt-1 text-2xl font-bold tracking-tight text-superficie">{dinero(t.importe)}</p>
            <div className="mt-3 space-y-1 border-t border-superficie/20 pt-2 text-2xs text-superficie/80">
              <div className="flex justify-between"><span>IVA 16 %</span><span className="num">{dinero(iva)}</span></div>
              <div className="flex justify-between font-semibold text-superficie">
                <span>Total</span><span className="num">{dinero(t.importe + iva)}</span>
              </div>
            </div>
          </div>
        </div>
      </CuerpoPanel>
    </Panel>
  );
}

function Fila({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-texto-tenue">{t}</dt>
      <dd className="num text-texto">{v}</dd>
    </div>
  );
}
