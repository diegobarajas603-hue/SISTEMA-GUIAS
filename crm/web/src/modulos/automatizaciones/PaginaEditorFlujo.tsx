import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Save, ShieldCheck, Play, FlaskConical, ZoomIn, ZoomOut, Maximize2,
  AlertTriangle, CheckCircle2, Clock, ChevronUp, ChevronDown, History,
} from 'lucide-react';
import {
  usarAutomatizacion, usarCatalogoNodos, usarActualizarAutomatizacion,
  usarValidarFlujo, usarEjecutarAutomatizacion,
} from '@/lib/consultas/automatizaciones';
import { Boton, BotonIcono } from '@/componentes/ui/Boton';
import { Insignia } from '@/componentes/ui/Insignia';
import { Interruptor } from '@/componentes/ui/Interruptor';
import { Campo, AreaTexto, Selector } from '@/componentes/ui/Campo';
import { Cargando } from '@/componentes/ui/Cargando';
import { Tooltip } from '@/componentes/ui/Tooltip';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { ErrorAPI } from '@/lib/api';
import { relativo } from '@/lib/formato';
import { cx } from '@/lib/utilidades';
import { Lienzo } from './Lienzo';
import { PaletaNodos } from './PaletaNodos';
import { PanelConfigNodo } from './PanelConfigNodo';
import { configPredeterminada } from './esquema-nodos';
import { EVENTOS_DISPARADOR, ESTADO_EJECUCION, ESTADO_PASO } from './constantes';
import type { AristaFlujo, EjecucionFlujo, NodoFlujo } from '@/lib/tipos';

type PasoSimulado = { nodo: string; titulo: string; tipo: string; efecto: string; ramifica: boolean };

/** El backend manda la lista de errores de validación en `detalles`; se muestra el primero. */
function primerDetalle(e: unknown): string {
  if (!(e instanceof ErrorAPI)) return 'Revisa el flujo e inténtalo de nuevo.';
  const detalles = e.detalles;
  if (Array.isArray(detalles) && typeof detalles[0] === 'string') return detalles[0];
  return e.message;
}

export default function PaginaEditorFlujo() {
  const { id } = useParams();
  const flujoId = Number(id);
  const { data: flujo, isLoading } = usarAutomatizacion(Number.isFinite(flujoId) ? flujoId : null);
  const { data: catalogo } = usarCatalogoNodos();
  const guardar = usarActualizarAutomatizacion();
  const validar = usarValidarFlujo();
  const ejecutar = usarEjecutarAutomatizacion();
  const { avisar } = useAvisos();

  const [nodos, setNodos] = useState<NodoFlujo[]>([]);
  const [aristas, setAristas] = useState<AristaFlujo[]>([]);
  const [meta, setMeta] = useState({ nombre: '', descripcion: '', evento: 'lead.creado', activa: false });
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [escala, setEscala] = useState(1);
  const [sucio, setSucio] = useState(false);
  const [bandeja, setBandeja] = useState<'cerrada' | 'validacion' | 'simulacion' | 'historial'>('cerrada');
  const [simulacion, setSimulacion] = useState<PasoSimulado[] | null>(null);
  const [encuadre, setEncuadre] = useState(0);
  const cargadoId = useRef<number | null>(null);

  // El servidor es la fuente de verdad una sola vez: después manda el lienzo, o cada
  // refetch de React Query pisaría los cambios sin guardar del usuario.
  useEffect(() => {
    if (!flujo || cargadoId.current === flujo.id) return;
    cargadoId.current = flujo.id;
    setNodos(flujo.nodos ?? []);
    setAristas(flujo.aristas ?? []);
    setMeta({
      nombre: flujo.nombre, descripcion: flujo.descripcion ?? '',
      evento: flujo.evento, activa: flujo.activa,
    });
    setSucio(false);
    setEncuadre((v) => v + 1);
  }, [flujo]);

  useEffect(() => {
    if (!sucio) return;
    const alSalir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [sucio]);

  const nodoActual = nodos.find((n) => n.id === seleccionado) ?? null;
  const estadosPaso = useMemo(() => {
    if (!simulacion) return undefined;
    return Object.fromEntries(simulacion.map((p) => [p.nodo, 'ok']));
  }, [simulacion]);

  function marcar<T>(fn: () => T): T { setSucio(true); return fn(); }

  function agregarNodo(tipo: string, x?: number, y?: number) {
    const cat = catalogo?.find((c) => c.tipo === tipo);
    const base = `${tipo}_${Date.now().toString(36).slice(-4)}`;
    const nuevo: NodoFlujo = {
      id: base,
      tipo,
      titulo: cat?.titulo ?? tipo,
      x: x ?? 420 + (nodos.length % 4) * 40,
      y: y ?? 120 + (nodos.length % 6) * 40,
      config: configPredeterminada(tipo, meta.evento),
    };
    marcar(() => setNodos((ns) => [...ns, nuevo]));
    setSeleccionado(nuevo.id);
  }

  function conectar(desde: string, hasta: string, etiqueta?: string) {
    setSucio(true);
    setAristas((as) => {
      const repetida = as.some((a) => a.desde === desde && a.hasta === hasta && a.etiqueta === etiqueta);
      if (repetida) return as;
      return [...as, etiqueta ? { desde, hasta, etiqueta } : { desde, hasta }];
    });
  }

  function eliminarNodo(nodoId: string) {
    setSucio(true);
    setNodos((ns) => ns.filter((n) => n.id !== nodoId));
    setAristas((as) => as.filter((a) => a.desde !== nodoId && a.hasta !== nodoId));
    setSeleccionado(null);
  }

  function guardarFlujo() {
    guardar.mutate(
      { id: flujoId, datos: { ...meta, nodos, aristas } },
      {
        onSuccess: (res) => {
          setSucio(false);
          const avisos = (res as { advertencias?: string[] }).advertencias ?? [];
          avisar({
            tipo: avisos.length ? 'alerta' : 'exito',
            titulo: 'Flujo guardado',
            cuerpo: avisos.length ? avisos[0] : undefined,
          });
        },
        onError: (e) => avisar({ tipo: 'error', titulo: 'No se pudo guardar', cuerpo: primerDetalle(e) }),
      },
    );
  }

  function validarFlujo() {
    validar.mutate({ nodos, aristas }, {
      onSuccess: (r) => {
        setBandeja('validacion');
        if (r.valido && !r.advertencias.length) avisar({ tipo: 'exito', titulo: 'El flujo está bien formado' });
      },
    });
  }

  function simular() {
    ejecutar.mutate({ id: flujoId, simulacion: true }, {
      onSuccess: (r) => {
        if ('simulacion' in r) { setSimulacion(r.pasos); setBandeja('simulacion'); }
      },
    });
  }

  function correrDeVerdad() {
    ejecutar.mutate({ id: flujoId }, {
      onSuccess: (r) => {
        setBandeja('historial');
        if ('estado' in r) {
          avisar({
            tipo: r.estado === 'error' ? 'error' : 'exito',
            titulo: `Corrida ${ESTADO_EJECUCION[r.estado]?.titulo.toLowerCase() ?? r.estado}`,
            cuerpo: r.error ?? `${r.pasos?.length ?? 0} pasos en ${r.duracion_ms} ms`,
          });
        }
      },
    });
  }

  if (isLoading || !flujo || !catalogo) return <Cargando etiqueta="Cargando editor…" className="py-24" />;

  const validacion = validar.data;

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[600px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/automatizaciones">
          <BotonIcono etiqueta="Volver a automatizaciones"><ArrowLeft className="size-4" /></BotonIcono>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-bold tracking-tight text-texto">{meta.nombre || 'Flujo sin nombre'}</h1>
            {sucio && <Insignia color="alerta">Sin guardar</Insignia>}
            <Insignia color={meta.activa ? 'exito' : 'gris'} punto>{meta.activa ? 'Activo' : 'Pausado'}</Insignia>
          </div>
          <p className="truncate text-xs text-texto-tenue">
            {EVENTOS_DISPARADOR.find((e) => e.valor === meta.evento)?.titulo ?? meta.evento} · {nodos.length} pasos · {aristas.length} conexiones
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Interruptor activo={meta.activa} etiqueta="Activar flujo"
            onCambiar={(v) => { setSucio(true); setMeta((m) => ({ ...m, activa: v })); }} />
          <Boton tamano="sm" variante="fantasma" iconoIzq={<ShieldCheck className="size-3.5" />} cargando={validar.isPending} onClick={validarFlujo}>
            Validar
          </Boton>
          <Boton tamano="sm" variante="secundario" iconoIzq={<FlaskConical className="size-3.5" />} cargando={ejecutar.isPending} onClick={simular}>
            Simular
          </Boton>
          <Boton tamano="sm" variante="secundario" iconoIzq={<Play className="size-3.5" />} onClick={correrDeVerdad}>
            Ejecutar
          </Boton>
          <Boton tamano="sm" variante="primario" iconoIzq={<Save className="size-3.5" />} cargando={guardar.isPending} disabled={!sucio} onClick={guardarFlujo}>
            Guardar
          </Boton>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[232px_minmax(0,1fr)_300px] grid-rows-[minmax(0,1fr)] gap-3">
        <PaletaNodos catalogo={catalogo} onAgregar={(t) => agregarNodo(t)} />

        <div className="relative min-w-0">
          <Lienzo
            nodos={nodos} aristas={aristas} catalogo={catalogo} seleccionado={seleccionado}
            estadosPaso={estadosPaso} escala={escala} encuadre={encuadre} onEscala={setEscala}
            onSeleccionar={setSeleccionado}
            onMover={(nodoId, x, y) => { setSucio(true); setNodos((ns) => ns.map((n) => (n.id === nodoId ? { ...n, x, y } : n))); }}
            onConectar={conectar}
            onQuitarArista={(i) => { setSucio(true); setAristas((as) => as.filter((_, k) => k !== i)); }}
            onSoltarTipo={(tipo, x, y) => agregarNodo(tipo, x, y)}
          />

          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border border-borde bg-superficie p-1 shadow-2">
            <BotonIcono etiqueta="Alejar" tamano="sm" onClick={() => setEscala((s) => Math.max(0.5, +(s - 0.1).toFixed(2)))}>
              <ZoomOut className="size-3.5" />
            </BotonIcono>
            <span className="num w-10 text-center text-2xs text-texto-tenue">{Math.round(escala * 100)}%</span>
            <BotonIcono etiqueta="Acercar" tamano="sm" onClick={() => setEscala((s) => Math.min(1.4, +(s + 0.1).toFixed(2)))}>
              <ZoomIn className="size-3.5" />
            </BotonIcono>
            <BotonIcono etiqueta="Encuadrar el flujo" tamano="sm" onClick={() => setEncuadre((v) => v + 1)}>
              <Maximize2 className="size-3.5" />
            </BotonIcono>
          </div>

          {nodos.length <= 1 && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 mx-auto w-fit rounded-xl border border-dashed border-borde-fuerte bg-superficie/80 px-5 py-3 text-center backdrop-blur">
              <p className="text-sm font-medium text-texto">Arrastra un paso desde la izquierda</p>
              <p className="mt-0.5 text-xs text-texto-tenue">Conéctalo al disparador usando el punto de su borde derecho.</p>
            </div>
          )}
        </div>

        <div className="min-h-0">
          <AnimatePresence mode="wait">
            {nodoActual ? (
              <motion.div key={nodoActual.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.15 }} className="h-full">
                <PanelConfigNodo
                  nodo={nodoActual} catalogo={catalogo}
                  onCambiar={(parche) => {
                    setSucio(true);
                    setNodos((ns) => ns.map((n) => (n.id === nodoActual.id ? { ...n, ...parche } : n)));
                    if (parche.config && nodoActual.tipo === 'disparador') {
                      const ev = (parche.config as Record<string, unknown>).evento;
                      if (typeof ev === 'string') setMeta((m) => ({ ...m, evento: ev }));
                    }
                  }}
                  onEliminar={() => eliminarNodo(nodoActual.id)}
                />
              </motion.div>
            ) : (
              <motion.div key="flujo" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.15 }}
                className="h-full space-y-3 overflow-y-auto rounded-xl border border-borde bg-superficie p-4">
                <p className="text-2xs font-semibold uppercase tracking-wide text-texto-tenue">Propiedades del flujo</p>
                <Campo etiqueta="Nombre" value={meta.nombre}
                  onChange={(e) => { setSucio(true); setMeta((m) => ({ ...m, nombre: e.target.value })); }} />
                <Selector etiqueta="Evento disparador" value={meta.evento}
                  ayuda="Se sincroniza con el nodo disparador del lienzo."
                  onChange={(e) => {
                    const ev = e.target.value;
                    setSucio(true);
                    setMeta((m) => ({ ...m, evento: ev }));
                    setNodos((ns) => ns.map((n) => (n.tipo === 'disparador' ? { ...n, config: { ...n.config, evento: ev } } : n)));
                  }}>
                  {EVENTOS_DISPARADOR.map((ev) => <option key={ev.valor} value={ev.valor}>{ev.titulo}</option>)}
                </Selector>
                <AreaTexto etiqueta="Descripción" rows={3} value={meta.descripcion}
                  onChange={(e) => { setSucio(true); setMeta((m) => ({ ...m, descripcion: e.target.value })); }} />
                <div className="rounded-lg bg-superficie-2 p-3 text-2xs leading-relaxed text-texto-secundario">
                  Selecciona un paso del lienzo para configurarlo. Arrastra los nodos para reacomodarlos y
                  usa el punto derecho de cada uno para trazar la conexión al siguiente.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Bandeja
        abierta={bandeja} onCambiar={setBandeja}
        validacion={validacion} simulacion={simulacion} ejecuciones={flujo.ejecuciones ?? []}
        onIrANodo={(nodoId) => setSeleccionado(nodoId)}
      />
    </div>
  );
}

interface PropsBandeja {
  abierta: 'cerrada' | 'validacion' | 'simulacion' | 'historial';
  onCambiar: (v: 'cerrada' | 'validacion' | 'simulacion' | 'historial') => void;
  validacion?: { valido: boolean; errores: string[]; advertencias: string[] };
  simulacion: PasoSimulado[] | null;
  ejecuciones: EjecucionFlujo[];
  onIrANodo: (id: string) => void;
}

function Bandeja({ abierta, onCambiar, validacion, simulacion, ejecuciones, onIrANodo }: PropsBandeja) {
  const pestanas = [
    { clave: 'validacion' as const, titulo: 'Validación', icono: ShieldCheck, badge: validacion ? validacion.errores.length + validacion.advertencias.length : 0 },
    { clave: 'simulacion' as const, titulo: 'Simulación', icono: FlaskConical, badge: simulacion?.length ?? 0 },
    { clave: 'historial' as const, titulo: 'Corridas', icono: History, badge: ejecuciones.length },
  ];

  return (
    <div className="shrink-0 rounded-xl border border-borde bg-superficie">
      <div className="flex items-center gap-1 px-2 py-1.5">
        {pestanas.map((p) => (
          <button key={p.clave}
            onClick={() => onCambiar(abierta === p.clave ? 'cerrada' : p.clave)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              abierta === p.clave ? 'bg-superficie-2 text-texto' : 'text-texto-tenue hover:text-texto',
            )}>
            <p.icono className="size-3.5" />
            {p.titulo}
            {p.badge > 0 && <span className="num rounded-pildora bg-borde px-1.5 text-[10px] text-texto-secundario">{p.badge}</span>}
          </button>
        ))}
        <span className="ml-auto pr-1 text-texto-tenue">
          {abierta === 'cerrada' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {abierta !== 'cerrada' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden border-t border-borde">
            <div className="max-h-52 overflow-y-auto p-3">
              {abierta === 'validacion' && (
                !validacion ? <p className="text-xs text-texto-tenue">Pulsa «Validar» para revisar el grafo antes de guardarlo.</p>
                  : (
                    <div className="space-y-1.5">
                      {validacion.valido && !validacion.advertencias.length && (
                        <p className="flex items-center gap-2 text-xs text-exito-600">
                          <CheckCircle2 className="size-3.5" /> El flujo está bien formado y todos los pasos son alcanzables.
                        </p>
                      )}
                      {validacion.errores.map((e, i) => (
                        <p key={`e${i}`} className="flex items-start gap-2 text-xs text-peligro-500">
                          <AlertTriangle className="mt-px size-3.5 shrink-0" />{e}
                        </p>
                      ))}
                      {validacion.advertencias.map((a, i) => (
                        <p key={`a${i}`} className="flex items-start gap-2 text-xs text-alerta-600">
                          <AlertTriangle className="mt-px size-3.5 shrink-0" />{a}
                        </p>
                      ))}
                    </div>
                  )
              )}

              {abierta === 'simulacion' && (
                !simulacion ? <p className="text-xs text-texto-tenue">Pulsa «Simular» para ver qué haría el flujo sin escribir nada.</p>
                  : simulacion.length === 0 ? <p className="text-xs text-texto-tenue">El flujo no recorrió ningún paso.</p>
                    : (
                      <ol className="space-y-1.5">
                        {simulacion.map((p, i) => (
                          <li key={`${p.nodo}-${i}`}>
                            <button onClick={() => onIrANodo(p.nodo)} className="flex w-full items-start gap-2.5 rounded-md px-1.5 py-1 text-left hover:bg-superficie-2">
                              <span className="num mt-px w-4 shrink-0 text-2xs text-texto-tenue">{i + 1}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-medium text-texto">{p.titulo}</span>
                                <span className="block text-2xs text-texto-tenue">{p.efecto}</span>
                              </span>
                              {p.ramifica && <Insignia color="alerta">bifurca</Insignia>}
                            </button>
                          </li>
                        ))}
                      </ol>
                    )
              )}

              {abierta === 'historial' && (
                ejecuciones.length === 0 ? <p className="text-xs text-texto-tenue">Este flujo todavía no ha corrido.</p>
                  : (
                    <ul className="space-y-2">
                      {ejecuciones.map((e) => (
                        <li key={e.id} className="rounded-lg border border-borde px-2.5 py-2">
                          <div className="flex items-center gap-2">
                            <span className={cx('size-1.5 rounded-full', ESTADO_EJECUCION[e.estado]?.punto ?? 'bg-borde-fuerte')} />
                            <span className="text-xs font-medium text-texto">{ESTADO_EJECUCION[e.estado]?.titulo ?? e.estado}</span>
                            {e.entidad_tipo && <span className="text-2xs text-texto-tenue">{e.entidad_tipo} #{e.entidad_id}</span>}
                            <span className="num ml-auto text-2xs text-texto-tenue">{e.duracion_ms} ms · {relativo(e.creado_en)}</span>
                          </div>
                          {e.error && <p className="mt-1 text-2xs text-peligro-500">{e.error}</p>}
                          {e.pasos?.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {e.pasos.map((p, i) => (
                                <Tooltip key={`${p.nodo}-${i}`} contenido={`${p.titulo}: ${p.detalle ?? p.estado}`}>
                                  <span className={cx(
                                    'inline-flex items-center gap-1 rounded-pildora border border-borde px-1.5 py-0.5 text-[10px] text-texto-secundario',
                                  )}>
                                    <span className={cx('size-1.5 rounded-full', ESTADO_PASO[p.estado]?.punto ?? 'bg-borde-fuerte')} />
                                    {p.titulo}
                                  </span>
                                </Tooltip>
                              ))}
                            </div>
                          )}
                          {e.estado === 'esperando' && (
                            <p className="mt-1 flex items-center gap-1 text-2xs text-marca-600">
                              <Clock className="size-3" /> Reanudará automáticamente cuando venza la espera.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
