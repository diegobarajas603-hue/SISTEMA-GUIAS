import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Send, Wrench } from 'lucide-react';
import { PanelLateral } from '@/componentes/ui/PanelLateral';
import { Boton } from '@/componentes/ui/Boton';
import { usarPreguntar, usarSugerenciasCopiloto, type ContextoCopiloto } from '@/lib/consultas/ia';
import { usarEstadoIA } from '@/lib/consultas/ia';
import { InsigniaIA } from '@/componentes/ui/Insignia';
import { cx } from '@/lib/utilidades';

interface Turno { rol: 'usuario' | 'asistente'; texto: string; herramientas?: Array<{ nombre: string }>; }

function detectarContexto(ruta: string, params: Record<string, string | undefined>): ContextoCopiloto {
  const id = params.id ? Number(params.id) : undefined;
  if (!id) return { ruta };
  if (ruta.startsWith('/clientes/')) return { ruta, entidad_tipo: 'cuenta', entidad_id: id };
  if (ruta.startsWith('/oportunidades/')) return { ruta, entidad_tipo: 'oportunidad', entidad_id: id };
  if (ruta.startsWith('/prospectos/')) return { ruta, entidad_tipo: 'lead', entidad_id: id };
  if (ruta.startsWith('/soporte/')) return { ruta, entidad_tipo: 'ticket', entidad_id: id };
  return { ruta };
}

export function Copiloto({ abierto, onCerrar, preguntaInicial }: { abierto: boolean; onCerrar: () => void; preguntaInicial?: string | null }) {
  const location = useLocation();
  const params = useParams();
  const contexto = detectarContexto(location.pathname, params);

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState('');
  const [conversacionId, setConversacionId] = useState<number | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  const preguntar = usarPreguntar();
  const { data: sugerencias } = usarSugerenciasCopiloto(contexto);
  const { data: estadoIA } = usarEstadoIA();

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turnos, preguntar.isPending]);

  useEffect(() => {
    if (abierto && preguntaInicial) enviar(preguntaInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, preguntaInicial]);

  function enviar(pregunta: string) {
    if (!pregunta.trim() || preguntar.isPending) return;
    setTurnos((t) => [...t, { rol: 'usuario', texto: pregunta }]);
    setTexto('');
    preguntar.mutate(
      { pregunta, conversacion_id: conversacionId, contexto },
      {
        onSuccess: (r) => {
          setConversacionId(r.conversacion_id);
          setTurnos((t) => [...t, { rol: 'asistente', texto: r.texto, herramientas: r.herramientas }]);
        },
        onError: () => {
          setTurnos((t) => [...t, { rol: 'asistente', texto: 'No pude procesar la pregunta. Intenta de nuevo en un momento.' }]);
        },
      },
    );
  }

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="md"
      titulo={
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg gradiente-ia text-white"><Sparkles className="size-4" /></span>
          <div>
            <div>Copiloto comercial</div>
            <div className="text-2xs font-normal text-texto-tenue">
              {estadoIA?.generativa ? estadoIA.modelo : 'Motor determinista · sin IA generativa'}
            </div>
          </div>
        </div>
      }
      pie={
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); enviar(texto); }}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Pregunta lo que quieras sobre tu operación…"
            className="h-10 flex-1 rounded-lg border border-borde bg-superficie px-3 text-sm outline-none focus:border-marca-500 focus:ring-4 focus:ring-marca-500/12"
          />
          <Boton type="submit" variante="ia" cargando={preguntar.isPending} iconoDer={<Send className="size-4" />}>
            Enviar
          </Boton>
        </form>
      }
    >
      <div className="flex flex-col gap-4">
        {turnos.length === 0 && (
          <div className="rounded-xl border border-dashed border-borde p-4">
            <p className="text-sm text-texto-secundario">
              Pregúntame sobre tu cartera, el pronóstico del mes, riesgos, o pídeme que redacte algo. Uso datos reales de tu CRM, no invento cifras.
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {(sugerencias ?? []).map((s) => (
                <button key={s} onClick={() => enviar(s)} className="rounded-lg border border-borde px-3 py-2 text-left text-xs text-texto-secundario transition-colors hover:border-marca-200 hover:bg-marca-50 hover:text-marca-700">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turnos.map((t, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
            className={cx('flex', t.rol === 'usuario' ? 'justify-end' : 'justify-start')}>
            <div className={cx(
              'max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
              t.rol === 'usuario' ? 'bg-marca-500 text-white' : 'border border-borde bg-superficie-2 text-texto',
            )}>
              {t.texto}
              {t.herramientas && t.herramientas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-borde/60 pt-2">
                  {t.herramientas.map((h, j) => (
                    <span key={j} className="inline-flex items-center gap-1 rounded-pildora bg-superficie px-2 py-0.5 text-2xs text-texto-tenue">
                      <Wrench className="size-2.5" /> {h.nombre.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {preguntar.isPending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl border border-borde bg-superficie-2 px-4 py-3">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="size-1.5 rounded-full bg-texto-tenue"
                  animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </div>
          </div>
        )}
        <div ref={finRef} />
      </div>
      {!estadoIA?.generativa && turnos.length === 0 && (
        <div className="mt-4">
          <InsigniaIA>Respuestas con motor determinista</InsigniaIA>
        </div>
      )}
    </PanelLateral>
  );
}
