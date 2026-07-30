import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Sparkles, Lock } from 'lucide-react';
import { usarTicket, usarResponderTicket, usarCambiarEstadoTicket, usarSugerirRespuesta } from '@/lib/consultas/tickets';
import { Cargando } from '@/componentes/ui/Cargando';
import { Vacio } from '@/componentes/ui/Vacio';
import { BotonIcono, Boton } from '@/componentes/ui/Boton';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Insignia, InsigniaIA } from '@/componentes/ui/Insignia';
import { AreaTexto, Selector } from '@/componentes/ui/Campo';
import { Interruptor } from '@/componentes/ui/Interruptor';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { fechaHora, relativo } from '@/lib/formato';
import { ESTADO_TICKET_TEXTO, PRIORIDAD_TICKET_COLOR, PRIORIDAD_TICKET_TEXTO } from '@/lib/constantes';
import { cx } from '@/lib/utilidades';

export default function PaginaTicketDetalle() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { data: t, isLoading } = usarTicket(id ? Number(id) : null);
  const responder = usarResponderTicket();
  const cambiarEstado = usarCambiarEstadoTicket();
  const sugerir = usarSugerirRespuesta();
  const { avisar } = useAvisos();

  const [mensaje, setMensaje] = useState('');
  const [interno, setInterno] = useState(false);

  if (isLoading) return <Cargando etiqueta="Cargando ticket…" className="py-24" />;
  if (!t) return <Vacio titulo="No se encontró el ticket" />;

  function enviar() {
    if (!mensaje.trim()) return;
    responder.mutate({ id: t!.id, cuerpo: mensaje, autor_tipo: 'agente', interno }, {
      onSuccess: () => { setMensaje(''); avisar({ tipo: 'exito', titulo: interno ? 'Nota interna agregada' : 'Respuesta enviada' }); },
    });
  }

  function pedirSugerencia() {
    sugerir.mutate(t!.id, {
      onSuccess: (r) => { if (r.disponible && r.borrador) setMensaje(r.borrador); else avisar({ tipo: 'info', titulo: 'Sin sugerencia disponible', cuerpo: r.motivo }); },
    });
  }

  return (
    <div className="space-y-4 pb-8">
      <BotonIcono etiqueta="Volver" onClick={() => navegar('/soporte')}><ArrowLeft className="size-4" /></BotonIcono>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-texto">{t.folio} · {t.asunto}</h1>
          <p className="text-sm text-texto-tenue">{t.cuenta_comercial || t.cuenta_nombre || 'Sin cuenta'} {t.contacto_nombre ? `· ${t.contacto_nombre}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: PRIORIDAD_TICKET_COLOR[t.prioridad] }}>{PRIORIDAD_TICKET_TEXTO[t.prioridad]}</span>
          <Selector value={t.estado} onChange={(e) => cambiarEstado.mutate({ id: t.id, estado: e.target.value })} className="h-8 w-36 text-xs">
            {Object.entries(ESTADO_TICKET_TEXTO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Selector>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <Panel className="flex flex-col">
          <CuerpoPanel className="flex-1 space-y-3">
            {(t.mensajes ?? []).map((m) => (
              <div key={m.id} className={cx('rounded-xl border p-3', m.interno ? 'border-alerta-200 bg-alerta-50' : m.autor_tipo === 'cliente' ? 'border-borde bg-superficie-2' : 'border-marca-200 bg-marca-50')}>
                <div className="mb-1 flex items-center justify-between text-2xs">
                  <span className="flex items-center gap-1 font-semibold text-texto-secundario">
                    {m.interno && <Lock className="size-3" />}
                    {m.autor_tipo === 'ia' && <Sparkles className="size-3 text-ia-500" />}
                    {m.autor_tipo === 'cliente' ? 'Cliente' : m.autor_tipo === 'ia' ? 'IA' : m.usuario_nombre ?? 'Agente'}
                  </span>
                  <span className="text-texto-tenue">{fechaHora(m.creado_en)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-texto">{m.cuerpo}</p>
              </div>
            ))}
          </CuerpoPanel>
          <div className="border-t border-borde p-4">
            <AreaTexto placeholder="Escribe una respuesta…" rows={3} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Boton tamano="sm" variante="secundario" iconoIzq={<Sparkles className="size-3.5 text-ia-500" />} cargando={sugerir.isPending} onClick={pedirSugerencia}>
                  Sugerir con IA
                </Boton>
                <label className="flex items-center gap-1.5 text-xs text-texto-secundario">
                  <Interruptor activo={interno} onCambiar={setInterno} etiqueta="Nota interna" /> Nota interna
                </label>
              </div>
              <Boton variante="primario" iconoIzq={<Send className="size-4" />} disabled={!mensaje.trim()} cargando={responder.isPending} onClick={enviar}>
                {interno ? 'Agregar nota' : 'Responder'}
              </Boton>
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <EncabezadoPanel titulo="SLA" acciones={t.sla_incumplido ? <Insignia color="peligro">Incumplido</Insignia> : <Insignia color="exito">En tiempo</Insignia>} />
            <CuerpoPanel className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-texto-tenue">Vence</span><span className="text-texto">{relativo(t.sla_vence_en)}</span></div>
              <div className="flex justify-between"><span className="text-texto-tenue">Primera respuesta</span><span className="text-texto">{t.primera_respuesta_en ? fechaHora(t.primera_respuesta_en) : 'Pendiente'}</span></div>
              {t.csat && <div className="flex justify-between"><span className="text-texto-tenue">CSAT</span><span className="text-texto">{t.csat}/5</span></div>}
            </CuerpoPanel>
          </Panel>

          {t.ia_sugerencia && (
            <Panel>
              <EncabezadoPanel titulo="Sugerencia de IA" acciones={<InsigniaIA>IA</InsigniaIA>} />
              <CuerpoPanel><p className="whitespace-pre-wrap text-xs text-texto-secundario">{t.ia_sugerencia}</p></CuerpoPanel>
            </Panel>
          )}

          {(t.sugerencias ?? []).length > 0 && (
            <Panel>
              <EncabezadoPanel titulo="Base de conocimiento relevante" />
              <CuerpoPanel className="space-y-1.5">
                {t.sugerencias.map((a) => <p key={a.id} className="text-sm text-marca-600">{a.titulo}</p>)}
              </CuerpoPanel>
            </Panel>
          )}

          {(t.otrosDeLaCuenta ?? []).length > 0 && (
            <Panel>
              <EncabezadoPanel titulo="Otros tickets de la cuenta" />
              <CuerpoPanel className="space-y-1.5">
                {t.otrosDeLaCuenta.map((o) => (
                  <button key={o.id} onClick={() => navegar(`/soporte/${o.id}`)} className="block w-full truncate text-left text-sm text-marca-600 hover:underline">{o.folio} · {o.asunto}</button>
                ))}
              </CuerpoPanel>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
