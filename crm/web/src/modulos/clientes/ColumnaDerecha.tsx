import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, TrendingUp, ShieldAlert } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Pestanas } from '@/componentes/ui/Pestanas';
import { Insignia, InsigniaIA } from '@/componentes/ui/Insignia';
import { Vacio } from '@/componentes/ui/Vacio';
import { dinero, fechaCorta } from '@/lib/formato';
import { ESTADO_COTIZACION_COLOR, ESTADO_COTIZACION_TEXTO, ESTADO_TICKET_COLOR, ESTADO_TICKET_TEXTO, ETAPAS_OPORTUNIDAD } from '@/lib/constantes';
import { usarAnalisisCuenta } from '@/lib/consultas/cuentas';
import type { Ficha360 } from '@/lib/consultas/cuentas';

export function ColumnaDerecha({ cuenta }: { cuenta: Ficha360 }) {
  const [pestana, setPestana] = useState('oportunidades');
  const navegar = useNavigate();
  const { data: analisis } = usarAnalisisCuenta(cuenta.id);

  return (
    <div className="space-y-4">
      <Panel>
        <EncabezadoPanel titulo="Inteligencia comercial" acciones={<InsigniaIA>IA</InsigniaIA>} />
        <CuerpoPanel className="space-y-3">
          {analisis?.churn.riesgo && analisis.churn.riesgo >= 40 && (
            <div className="rounded-lg border border-peligro-200 bg-peligro-50 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-peligro-600"><ShieldAlert className="size-3.5" /> Riesgo de fuga: {analisis.churn.riesgo}/100</p>
              <ul className="space-y-1">
                {analisis.churn.motivos.slice(0, 3).map((m, i) => <li key={i} className="text-xs text-peligro-600/90">· {m.titulo}: {m.detalle}</li>)}
              </ul>
            </div>
          )}
          {(analisis?.ventaCruzada ?? []).slice(0, 2).map((v, i) => (
            <div key={i} className="rounded-lg border border-ia-200 bg-ia-50 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ia-600"><TrendingUp className="size-3.5" /> Venta cruzada: {v.producto}</p>
              <p className="text-xs text-ia-600/90">{v.motivo}</p>
              <p className="num mt-1 text-xs font-semibold text-ia-600">{dinero(v.impacto)} estimado · {v.confianza}% confianza</p>
            </div>
          ))}
          {cuenta.insights.map((ins) => (
            <div key={ins.id} className="rounded-lg border border-borde p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-texto"><Sparkles className="size-3.5 text-ia-500" /> {ins.titulo}</p>
              <p className="text-xs text-texto-secundario">{ins.explicacion}</p>
            </div>
          ))}
          {!analisis?.churn.riesgo && !analisis?.ventaCruzada.length && cuenta.insights.length === 0 && (
            <p className="text-sm text-texto-tenue">Sin hallazgos relevantes por ahora.</p>
          )}
        </CuerpoPanel>
      </Panel>

      <Panel>
        <Pestanas
          className="px-3"
          activa={pestana} onCambiar={setPestana}
          items={[
            { valor: 'oportunidades', etiqueta: 'Oportunidades', contador: cuenta.oportunidades.length },
            { valor: 'cotizaciones', etiqueta: 'Cotizaciones', contador: cuenta.cotizaciones.length },
            { valor: 'facturas', etiqueta: 'Facturación' },
            { valor: 'tickets', etiqueta: 'Tickets', contador: cuenta.tickets.length },
            { valor: 'archivos', etiqueta: 'Archivos', contador: cuenta.archivos.length },
          ]}
        />
        <CuerpoPanel className="pt-3">
          {pestana === 'oportunidades' && (
            cuenta.oportunidades.length === 0 ? <Vacio titulo="Sin oportunidades" /> : (
              <ul className="space-y-2">
                {cuenta.oportunidades.map((o) => (
                  <li key={o.id} onClick={() => navegar(`/oportunidades/${o.id}`)} className="fila-hover cursor-pointer rounded-lg border border-borde p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-texto">{o.nombre}</p>
                      <span className="num text-sm font-semibold text-texto">{dinero(o.monto)}</span>
                    </div>
                    <Insignia color={o.estado === 'ganada' ? 'exito' : o.estado === 'perdida' ? 'peligro' : 'marca'}>{ETAPAS_OPORTUNIDAD[o.etapa]}</Insignia>
                  </li>
                ))}
              </ul>
            )
          )}

          {pestana === 'cotizaciones' && (
            cuenta.cotizaciones.length === 0 ? <Vacio titulo="Sin cotizaciones" /> : (
              <ul className="space-y-2">
                {cuenta.cotizaciones.map((c) => (
                  <li key={c.id} onClick={() => navegar(`/cotizaciones/${c.id}`)} className="fila-hover cursor-pointer rounded-lg border border-borde p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-texto">{c.folio}</p>
                      <span className="num text-sm font-semibold text-texto">{dinero(c.total)}</span>
                    </div>
                    <span className="text-2xs font-semibold" style={{ color: ESTADO_COTIZACION_COLOR[c.estado] }}>{ESTADO_COTIZACION_TEXTO[c.estado]}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {pestana === 'facturas' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-superficie-2 p-2"><p className="num text-sm font-bold">{dinero(cuenta.facturacion.por_cobrar)}</p><p className="text-2xs text-texto-tenue">Por cobrar</p></div>
                <div className="rounded-lg bg-superficie-2 p-2"><p className="num text-sm font-bold text-peligro-500">{dinero(cuenta.facturacion.vencido)}</p><p className="text-2xs text-texto-tenue">Vencido</p></div>
              </div>
              {cuenta.facturas.length === 0 ? <Vacio titulo="Sin facturas" /> : (
                <ul className="space-y-1.5">
                  {cuenta.facturas.slice(0, 8).map((f) => (
                    <li key={f.id} className="flex items-center justify-between text-sm">
                      <span className="text-texto-secundario">{f.folio} · {fechaCorta(f.emitida_en)}</span>
                      <span className="num font-medium">{dinero(f.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {cuenta.contratos.length > 0 && (
                <div className="border-t border-borde pt-2">
                  <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">Contratos</p>
                  {cuenta.contratos.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span className="text-texto-secundario">{c.nombre}</span>
                      <span className="text-2xs text-texto-tenue">hasta {fechaCorta(c.termina_en)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {pestana === 'tickets' && (
            cuenta.tickets.length === 0 ? <Vacio titulo="Sin tickets" /> : (
              <ul className="space-y-2">
                {cuenta.tickets.map((t) => (
                  <li key={t.id} onClick={() => navegar(`/soporte/${t.id}`)} className="fila-hover cursor-pointer rounded-lg border border-borde p-2.5">
                    <p className="truncate text-sm font-medium text-texto">{t.asunto}</p>
                    <span className="text-2xs font-semibold" style={{ color: ESTADO_TICKET_COLOR[t.estado] }}>{ESTADO_TICKET_TEXTO[t.estado]}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {pestana === 'archivos' && (
            cuenta.archivos.length === 0 ? <Vacio titulo="Sin archivos" /> : (
              <ul className="space-y-1.5">
                {cuenta.archivos.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm text-texto-secundario">
                    <span className="truncate">{a.nombre}</span>
                    <span className="text-2xs text-texto-tenue">{Math.round(a.tamano_bytes / 1024)} kB</span>
                  </li>
                ))}
              </ul>
            )
          )}
        </CuerpoPanel>
      </Panel>

      {cuenta.productos.length > 0 && (
        <Panel>
          <EncabezadoPanel titulo="Servicios contratados" />
          <CuerpoPanel className="space-y-1.5">
            {cuenta.productos.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-texto-secundario">{p.nombre}</span>
                <span className="num text-texto-tenue">{p.cantidad_total} {p.unidad}</span>
              </div>
            ))}
          </CuerpoPanel>
        </Panel>
      )}
    </div>
  );
}
