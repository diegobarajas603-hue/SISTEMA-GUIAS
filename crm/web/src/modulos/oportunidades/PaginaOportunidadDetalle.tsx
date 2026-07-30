import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Sparkles, Plus, Send, ShieldCheck, TrendingUp, TrendingDown, FileText } from 'lucide-react';
import { usarOportunidad, usarMoverEtapaOportunidad } from '@/lib/consultas/oportunidades';
import { usarCrearNota } from '@/lib/consultas/cuentas';
import { usarCrearActividad } from '@/lib/consultas/actividades';
import { Cargando } from '@/componentes/ui/Cargando';
import { Vacio } from '@/componentes/ui/Vacio';
import { BotonIcono, Boton } from '@/componentes/ui/Boton';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Insignia, InsigniaIA } from '@/componentes/ui/Insignia';
import { Avatar } from '@/componentes/ui/Avatar';
import { AreaTexto } from '@/componentes/ui/Campo';
import { Medidor } from '@/componentes/graficas/Medidor';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { dinero, fechaCorta, fechaHora, relativo } from '@/lib/formato';
import { ETAPAS_OPORTUNIDAD, ROL_COMPRA_TEXTO, SEVERIDAD_COLOR, SEVERIDAD_TEXTO } from '@/lib/constantes';
import { cx } from '@/lib/utilidades';

const ETAPAS = ['calificado', 'propuesta', 'negociacion', 'ganado', 'perdido'] as const;

export default function PaginaOportunidadDetalle() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { data: op, isLoading } = usarOportunidad(id ? Number(id) : null);
  const mover = usarMoverEtapaOportunidad();
  const crearNota = usarCrearNota();
  const crearActividad = usarCrearActividad();
  const { avisar } = useAvisos();
  const [nota, setNota] = useState('');

  if (isLoading) return <Cargando etiqueta="Cargando oportunidad…" className="py-24" />;
  if (!op) return <Vacio titulo="No se encontró la oportunidad" />;

  const probIA = op.analisis.probabilidad;
  const discrepancia = Math.abs(probIA - op.probabilidad) >= 20;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <BotonIcono etiqueta="Volver" onClick={() => navegar('/oportunidades')}><ArrowLeft className="size-4" /></BotonIcono>
        <span className="text-sm text-texto-tenue">{op.cuenta_nombre}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-texto">{op.nombre}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Insignia color={op.estado === 'ganada' ? 'exito' : op.estado === 'perdida' ? 'peligro' : 'marca'}>{ETAPAS_OPORTUNIDAD[op.etapa]}</Insignia>
            <span className="num text-lg font-bold text-texto">{dinero(op.monto)}</span>
            {op.competidor && <Insignia color="alerta">vs {op.competidor}</Insignia>}
          </div>
        </div>
        {op.estado === 'abierta' && (
          <div className="flex flex-wrap gap-1.5">
            {ETAPAS.filter((e) => e !== op.etapa).map((e) => (
              <button key={e} onClick={() => {
                const motivo = e === 'perdido' ? window.prompt('Motivo de la pérdida') : undefined;
                if (e === 'perdido' && !motivo) return;
                mover.mutate({ id: op.id, etapa: e, motivo_perdida: motivo ?? undefined }, {
                  onSuccess: () => avisar({ tipo: e === 'ganado' ? 'exito' : 'info', titulo: e === 'ganado' ? '🎉 Oportunidad ganada' : `Etapa actualizada` }),
                });
              }} className={cx(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                e === 'ganado' ? 'border-exito-200 bg-exito-50 text-exito-600 hover:bg-exito-100' :
                e === 'perdido' ? 'border-peligro-200 bg-peligro-50 text-peligro-500 hover:bg-peligro-100' :
                'border-borde text-texto-secundario hover:border-marca-200 hover:bg-marca-50 hover:text-marca-700',
              )}>
                {e === 'ganado' ? '✓ Marcar como ganada' : e === 'perdido' ? 'Marcar como perdida' : `Mover a ${ETAPAS_OPORTUNIDAD[e]}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Panel>
            <EncabezadoPanel titulo="Análisis de IA" acciones={<InsigniaIA>{op.ia_calculado_en ? `Actualizado ${relativo(op.ia_calculado_en)}` : 'IA'}</InsigniaIA>} />
            <CuerpoPanel>
              <div className="flex flex-wrap items-center gap-6">
                <div className="text-center">
                  <Medidor valor={probIA} etiqueta="prob. IA" tamano={120} />
                </div>
                <div className="flex-1 space-y-1 text-sm">
                  <p className="text-texto-secundario">El vendedor estima <span className="num font-semibold text-texto">{op.probabilidad}%</span> de probabilidad.</p>
                  {discrepancia && (
                    <p className="flex items-center gap-1.5 rounded-lg bg-ia-50 px-2.5 py-1.5 text-xs text-ia-600">
                      <Sparkles className="size-3.5 shrink-0" /> La diferencia es de {Math.abs(Math.round(probIA - op.probabilidad))} puntos — vale la pena revisar los supuestos.
                    </p>
                  )}
                  {op.analisis.factores.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {op.analisis.factores.slice(0, 5).map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-texto-tenue">{f.etiqueta}</span>
                          <span className={cx('num font-semibold', f.delta >= 0 ? 'text-exito-600' : 'text-peligro-500')}>
                            {f.delta >= 0 ? <TrendingUp className="inline size-3" /> : <TrendingDown className="inline size-3" />} {f.delta > 0 ? '+' : ''}{Math.round(f.delta)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {op.analisis.riesgos.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-borde pt-3">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-texto-tenue">Riesgos detectados</p>
                  {op.analisis.riesgos.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-borde p-2.5">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" style={{ color: SEVERIDAD_COLOR[r.severidad] }} />
                      <div>
                        <p className="text-xs font-semibold" style={{ color: SEVERIDAD_COLOR[r.severidad] }}>{r.titulo} · {SEVERIDAD_TEXTO[r.severidad]}</p>
                        <p className="text-xs text-texto-secundario">{r.detalle}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {op.analisis.acciones.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-borde pt-3">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-texto-tenue">Qué hacer ahora</p>
                  {op.analisis.acciones.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg bg-marca-50 p-2.5">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-marca-600" />
                      <div>
                        <p className="text-xs font-semibold text-marca-700">{a.titulo}</p>
                        <p className="text-xs text-marca-700/80">{a.detalle}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CuerpoPanel>
          </Panel>

          {op.productos.length > 0 && (
            <Panel>
              <EncabezadoPanel titulo="Servicios cotizados" />
              <CuerpoPanel>
                <table className="w-full text-sm">
                  <thead><tr className="text-2xs uppercase text-texto-tenue"><th className="pb-2 text-left">Servicio</th><th className="pb-2 text-right">Cant.</th><th className="pb-2 text-right">Importe</th></tr></thead>
                  <tbody>
                    {op.productos.map((p) => (
                      <tr key={p.id} className="border-t border-borde">
                        <td className="py-2 text-texto">{p.nombre}</td>
                        <td className="num py-2 text-right text-texto-secundario">{p.cantidad} {p.unidad}</td>
                        <td className="num py-2 text-right font-medium text-texto">{dinero(p.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CuerpoPanel>
            </Panel>
          )}

          <Panel>
            <EncabezadoPanel titulo="Cotizaciones" acciones={<Boton tamano="sm" variante="fantasma" iconoIzq={<FileText className="size-3.5" />} onClick={() => navegar(`/cotizaciones?oportunidad=${op.id}`)}>Nueva</Boton>} />
            <CuerpoPanel>
              {op.cotizaciones.length === 0 ? <p className="text-sm text-texto-tenue">Sin cotizaciones aún.</p> : (
                <ul className="space-y-2">
                  {op.cotizaciones.map((c) => (
                    <li key={c.id} onClick={() => navegar(`/cotizaciones/${c.id}`)} className="fila-hover flex cursor-pointer items-center justify-between rounded-lg border border-borde p-2.5">
                      <span className="text-sm font-medium text-texto">{c.folio}</span>
                      <span className="num text-sm text-texto-secundario">{dinero(c.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CuerpoPanel>
          </Panel>

          <Panel>
            <EncabezadoPanel titulo="Cronología" />
            <CuerpoPanel>
              <div className="mb-3 flex items-start gap-2">
                <AreaTexto placeholder="Nota rápida…" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="flex-1" />
                <Boton tamano="sm" variante="primario" iconoIzq={<Send className="size-3.5" />} disabled={!nota.trim()} cargando={crearNota.isPending}
                  onClick={() => crearNota.mutate({ cuerpo: nota, oportunidad_id: op.id, cuenta_id: op.cuenta_id }, { onSuccess: () => { setNota(''); avisar({ tipo: 'exito', titulo: 'Nota agregada' }); } })}>
                  Agregar
                </Boton>
              </div>
              <Boton tamano="sm" variante="secundario" iconoIzq={<Plus className="size-3.5" />} className="mb-3"
                onClick={() => crearActividad.mutate({ tipo: 'llamada', asunto: `Llamada · ${op.nombre}`, oportunidad_id: op.id, cuenta_id: op.cuenta_id, vence_en: new Date(Date.now() + 3600_000).toISOString() },
                  { onSuccess: () => avisar({ tipo: 'exito', titulo: 'Actividad agendada' }) })}>
                Agendar seguimiento
              </Boton>
              <ul className="space-y-2 border-t border-borde pt-3">
                {op.cronologia.map((c) => (
                  <li key={c.id} className="text-xs"><span className="text-texto-tenue">{relativo(c.creado_en)}</span> — <span className="text-texto">{c.titulo}</span></li>
                ))}
              </ul>
            </CuerpoPanel>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <EncabezadoPanel titulo="Detalles" />
            <CuerpoPanel className="space-y-2.5 text-sm">
              {op.propietario_nombre && <FilaDetalle etiqueta="Propietario"><Avatar nombre={op.propietario_nombre} tono={op.propietario_tono} tamano="xs" /><span>{op.propietario_nombre}</span></FilaDetalle>}
              <FilaDetalle etiqueta="Cierre estimado">{fechaCorta(op.cierre_estimado)}</FilaDetalle>
              <FilaDetalle etiqueta="Última actividad">{op.ultima_actividad_en ? fechaHora(op.ultima_actividad_en) : '—'}</FilaDetalle>
              <FilaDetalle etiqueta="Origen">{op.origen ?? '—'}</FilaDetalle>
              {op.siguiente_paso && <FilaDetalle etiqueta="Siguiente paso">{op.siguiente_paso}</FilaDetalle>}
            </CuerpoPanel>
          </Panel>

          <Panel>
            <EncabezadoPanel titulo="Mapa de poder" />
            <CuerpoPanel className="space-y-2">
              {[op.mapaPoder.decisor, op.mapaPoder.campeon, op.mapaPoder.bloqueador].every((c) => !c) && <p className="text-sm text-texto-tenue">Sin contactos con rol asignado.</p>}
              {op.mapaPoder.decisor && <ContactoPoder contacto={op.mapaPoder.decisor} rol="decisor" />}
              {op.mapaPoder.campeon && <ContactoPoder contacto={op.mapaPoder.campeon} rol="campeon" />}
              {op.mapaPoder.bloqueador && <ContactoPoder contacto={op.mapaPoder.bloqueador} rol="bloqueador" />}
            </CuerpoPanel>
          </Panel>

          {op.historial.length > 0 && (
            <Panel>
              <EncabezadoPanel titulo="Velocidad de pipeline" />
              <CuerpoPanel className="space-y-1.5">
                {op.historial.map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-texto-secundario">{ETAPAS_OPORTUNIDAD[h.etapa_nueva as keyof typeof ETAPAS_OPORTUNIDAD] ?? h.etapa_nueva}</span>
                    <span className="num text-texto-tenue">{h.dias_en_anterior != null ? `${Math.round(h.dias_en_anterior)} d` : fechaCorta(h.creado_en)}</span>
                  </div>
                ))}
              </CuerpoPanel>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function FilaDetalle({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-texto-tenue">{etiqueta}</span><span className="flex items-center gap-1.5 font-medium text-texto">{children}</span></div>;
}

function ContactoPoder({ contacto, rol }: { contacto: { nombre: string; puesto?: string | null }; rol: keyof typeof ROL_COMPRA_TEXTO }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-borde p-2">
      <Avatar nombre={contacto.nombre} tamano="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-texto">{contacto.nombre}</p>
        <p className="truncate text-2xs text-texto-tenue">{contacto.puesto}</p>
      </div>
      <Insignia color={rol === 'decisor' ? 'exito' : rol === 'campeon' ? 'ia' : 'peligro'}>{ROL_COMPRA_TEXTO[rol]}</Insignia>
    </div>
  );
}
