import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Send, Wrench, Plus, Mail, FileText, MessagesSquare, RefreshCw, Zap, Loader2 } from 'lucide-react';
import {
  usarPreguntar, usarSugerenciasCopiloto, usarEstadoIA, usarConversacionesIA,
  usarMensajesConversacion, usarAnalizarConversacion, usarRecalcularIA,
} from '@/lib/consultas/ia';
import { Boton } from '@/componentes/ui/Boton';
import { AreaTexto } from '@/componentes/ui/Campo';
import { Insignia, InsigniaIA } from '@/componentes/ui/Insignia';
import { Modal } from '@/componentes/ui/Modal';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { relativo } from '@/lib/formato';
import { cx } from '@/lib/utilidades';

interface Turno { rol: 'usuario' | 'asistente'; texto: string; herramientas?: Array<{ nombre: string }>; }

const ATAJOS = [
  { icono: Mail, titulo: 'Redactar un correo', pregunta: 'Genera un correo de seguimiento para mi prospecto más caliente.' },
  { icono: FileText, titulo: 'Armar una propuesta', pregunta: 'Genera una propuesta comercial para mi oportunidad más grande.' },
  { icono: MessagesSquare, titulo: 'Analizar una conversación', pregunta: null },
  { icono: Zap, titulo: 'Qué hago ahora', pregunta: '¿Qué debería hacer hoy? Dame mis siguientes mejores acciones.' },
];

export default function PaginaCopilotoCompleto() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState('');
  const [conversacionId, setConversacionId] = useState<number | null>(null);
  const [analisisAbierto, setAnalisisAbierto] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  const preguntar = usarPreguntar();
  const { data: sugerencias } = usarSugerenciasCopiloto({ ruta: '/copiloto' });
  const { data: estadoIA } = usarEstadoIA();
  const { data: conversaciones } = usarConversacionesIA();
  const { data: mensajes } = usarMensajesConversacion(conversacionId);
  const recalcular = usarRecalcularIA();
  const { avisar } = useAvisos();

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turnos, preguntar.isPending]);

  // Al abrir una conversación guardada se reconstruye el hilo desde el servidor.
  useEffect(() => {
    if (!mensajes) return;
    setTurnos(mensajes
      .filter((m) => m.rol !== 'sistema')
      .map((m) => ({ rol: m.rol === 'usuario' ? 'usuario' : 'asistente', texto: m.cuerpo })));
  }, [mensajes]);

  function enviar(pregunta: string) {
    if (!pregunta.trim() || preguntar.isPending) return;
    setTurnos((t) => [...t, { rol: 'usuario', texto: pregunta }]);
    setTexto('');
    preguntar.mutate({ pregunta, conversacion_id: conversacionId, contexto: { ruta: '/copiloto' } }, {
      onSuccess: (r) => {
        setConversacionId(r.conversacion_id);
        setTurnos((t) => [...t, { rol: 'asistente', texto: r.texto, herramientas: r.herramientas }]);
      },
      onError: () => setTurnos((t) => [...t, { rol: 'asistente', texto: 'No pude procesar la pregunta. Intenta de nuevo en un momento.' }]),
    });
  }

  function nuevaConversacion() {
    setConversacionId(null);
    setTurnos([]);
    setTexto('');
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[560px] gap-4">
      <aside className="hidden w-60 shrink-0 flex-col rounded-xl border border-borde bg-superficie lg:flex">
        <div className="border-b border-borde p-3">
          <Boton variante="secundario" tamano="sm" className="w-full" iconoIzq={<Plus className="size-3.5" />} onClick={nuevaConversacion}>
            Nueva conversación
          </Boton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <p className="px-2 pb-1.5 pt-1 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">Historial</p>
          {!conversaciones?.length ? (
            <p className="px-2 text-2xs text-texto-tenue">Todavía no hay conversaciones.</p>
          ) : conversaciones.map((c) => (
            <button key={c.id} onClick={() => setConversacionId(c.id)}
              className={cx('flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                conversacionId === c.id ? 'bg-marca-50 text-marca-700' : 'text-texto-secundario hover:bg-superficie-2')}>
              <span className="truncate text-xs font-medium">{c.titulo}</span>
              <span className="text-2xs text-texto-tenue">{c.mensajes} mensajes · {relativo(c.actualizado_en)}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-borde p-3">
          <Boton variante="fantasma" tamano="sm" className="w-full" cargando={recalcular.isPending}
            iconoIzq={<RefreshCw className="size-3.5" />}
            onClick={() => recalcular.mutate(undefined, {
              onSuccess: (r) => avisar({
                tipo: 'exito', titulo: 'Inteligencia recalculada',
                cuerpo: `${r.oportunidades} oportunidades y ${r.cuentas} cuentas en ${r.ms} ms.`,
              }),
            })}>
            Recalcular inteligencia
          </Boton>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-borde bg-superficie">
        <div className="flex items-center gap-2 border-b border-borde px-4 py-3">
          <span className="gradiente-ia flex size-8 items-center justify-center rounded-lg text-white">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-texto">Copiloto comercial</p>
            <p className="truncate text-2xs text-texto-tenue">
              {estadoIA?.generativa ? `Redacción con ${estadoIA.modelo} · cálculos del motor determinista` : 'Motor determinista · redacción con plantillas'}
            </p>
          </div>
          {estadoIA && (
            <Insignia color={estadoIA.generativa ? 'ia' : 'gris'} punto>
              {estadoIA.generativa ? 'Generativa activa' : 'Solo determinista'}
            </Insignia>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {turnos.length === 0 && (
            <div className="mx-auto max-w-xl py-8 text-center">
              <span className="gradiente-ia mx-auto mb-3 flex size-11 items-center justify-center rounded-xl text-white">
                <Sparkles className="size-5" />
              </span>
              <h2 className="text-lg font-bold text-texto">¿Qué necesitas saber?</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-texto-tenue">
                Pregunta sobre tu pipeline, tus clientes o tu equipo. Los números salen de la base de datos,
                nunca del modelo.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2">
                {ATAJOS.map((a) => (
                  <button key={a.titulo}
                    onClick={() => (a.pregunta ? enviar(a.pregunta) : setAnalisisAbierto(true))}
                    className="flex items-center gap-2.5 rounded-lg border border-borde bg-superficie px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-borde-fuerte hover:shadow-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ia-50 text-ia-600">
                      <a.icono className="size-4" />
                    </span>
                    <span className="text-xs font-medium text-texto">{a.titulo}</span>
                  </button>
                ))}
              </div>

              {!!sugerencias?.length && (
                <div className="mt-5 space-y-1.5 text-left">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-texto-tenue">Prueba con</p>
                  {sugerencias.map((s) => (
                    <button key={s} onClick={() => enviar(s)}
                      className="block w-full rounded-lg border border-borde px-3 py-2 text-left text-xs text-texto-secundario transition-colors hover:border-marca-500 hover:text-texto">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {turnos.map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
              className={cx('flex', t.rol === 'usuario' ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
                t.rol === 'usuario' ? 'bg-marca-500 text-white' : 'border border-borde bg-superficie-2 text-texto')}>
                {t.rol === 'asistente' && !!t.herramientas?.length && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {t.herramientas.map((h, k) => (
                      <span key={k} className="inline-flex items-center gap-1 rounded-pildora border border-borde bg-superficie px-1.5 py-0.5 text-[10px] text-texto-tenue">
                        <Wrench className="size-2.5" />{h.nombre}
                      </span>
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{t.texto}</p>
              </div>
            </motion.div>
          ))}

          {preguntar.isPending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-xl border border-borde bg-superficie-2 px-3.5 py-2.5">
                <Loader2 className="size-3.5 animate-spin text-ia-500" />
                <span className="text-xs text-texto-tenue">Consultando tus datos…</span>
              </div>
            </div>
          )}
          <div ref={finRef} />
        </div>

        <div className="border-t border-borde p-3">
          <div className="flex items-end gap-2">
            <textarea
              rows={1} value={texto} onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); } }}
              placeholder="Pregunta lo que necesites sobre tu operación comercial…"
              className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-texto placeholder:text-texto-tenue focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-500/12"
            />
            <Boton variante="ia" disabled={!texto.trim() || preguntar.isPending} onClick={() => enviar(texto)}>
              <Send className="size-4" />
            </Boton>
          </div>
          <p className="mt-1.5 text-2xs text-texto-tenue">
            Enter envía · Shift+Enter salta de línea. Las cifras las calcula el motor, el modelo solo las redacta.
          </p>
        </div>
      </div>

      <ModalAnalizarConversacion abierto={analisisAbierto} onCerrar={() => setAnalisisAbierto(false)} />
    </div>
  );
}

function ModalAnalizarConversacion({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [texto, setTexto] = useState('');
  const analizar = usarAnalizarConversacion();
  const r = analizar.data;

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Analizar una conversación" ancho="lg"
      pie={<>
        <Boton variante="secundario" onClick={onCerrar}>Cerrar</Boton>
        <Boton variante="ia" cargando={analizar.isPending} disabled={texto.trim().length < 30} onClick={() => analizar.mutate(texto)}>
          Analizar
        </Boton>
      </>}>
      <div className="space-y-3">
        <AreaTexto etiqueta="Pega aquí la conversación" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Transcripción de la llamada, hilo de correo o chat de WhatsApp…"
          ayuda="Mínimo 30 caracteres. No se guarda: se analiza y se descarta." />

        {r && (
          <div className="space-y-3 rounded-lg border border-borde bg-superficie-2 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <InsigniaIA>{r.generado_por}</InsigniaIA>
              <Insignia color={r.sentimiento === 'positivo' ? 'exito' : r.sentimiento === 'negativo' ? 'peligro' : 'gris'}>
                {r.sentimiento}
              </Insignia>
              <Insignia color="marca">Intención: {r.intencion_de_compra}</Insignia>
            </div>
            <p className="text-sm leading-relaxed text-texto">{r.resumen}</p>

            {r.objeciones.length > 0 && (
              <Bloque titulo="Objeciones" items={r.objeciones} color="text-alerta-600" />
            )}
            {r['señales_de_riesgo'].length > 0 && (
              <Bloque titulo="Señales de riesgo" items={r['señales_de_riesgo']} color="text-peligro-500" />
            )}
            {r.compromisos.length > 0 && (
              <div>
                <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">Compromisos</p>
                <ul className="space-y-1">
                  {r.compromisos.map((c, i) => (
                    <li key={i} className="text-xs text-texto-secundario">
                      <strong className="text-texto">{c.quien}</strong>: {c.que}{c.cuando ? ` · ${c.cuando}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-lg border border-marca-200 bg-marca-50 p-2.5">
              <p className="text-2xs font-semibold uppercase tracking-wide text-marca-700">Siguiente acción</p>
              <p className="mt-0.5 text-xs text-texto">{r.siguiente_accion}</p>
            </div>
            {r.limitacion && <p className="text-2xs text-texto-tenue">{r.limitacion}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Bloque({ titulo, items, color }: { titulo: string; items: string[]; color: string }) {
  return (
    <div>
      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">{titulo}</p>
      <ul className="space-y-0.5">
        {items.map((t, i) => <li key={i} className={cx('text-xs', color)}>· {t}</li>)}
      </ul>
    </div>
  );
}
