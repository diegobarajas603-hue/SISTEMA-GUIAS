import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { IconoNodo } from './IconoNodo';
import { CATEGORIAS, resumenNodo, type Categoria } from './esquema-nodos';
import { ESTADO_PASO } from './constantes';
import { cx } from '@/lib/utilidades';
import type { AristaFlujo, NodoCatalogo, NodoFlujo } from '@/lib/tipos';

export const ANCHO_NODO = 216;
export const ALTO_NODO = 68;
export const LIENZO_ANCHO = 2600;
export const LIENZO_ALTO = 1600;

interface Props {
  nodos: NodoFlujo[];
  aristas: AristaFlujo[];
  catalogo: NodoCatalogo[];
  seleccionado: string | null;
  estadosPaso?: Record<string, string>;
  escala: number;
  /** Cambiar este número vuelve a encuadrar la vista sobre los nodos. */
  encuadre: number;
  onEscala: (v: number) => void;
  onSeleccionar: (id: string | null) => void;
  onMover: (id: string, x: number, y: number) => void;
  onConectar: (desde: string, hasta: string, etiqueta?: string) => void;
  onQuitarArista: (indice: number) => void;
  onSoltarTipo: (tipo: string, x: number, y: number) => void;
}

interface Punto { x: number; y: number }

/** Puerto de salida: el de una condición se abre en dos, sí arriba y no abajo. */
function puertoSalida(nodo: NodoFlujo, etiqueta?: string): Punto {
  const x = nodo.x + ANCHO_NODO;
  if (nodo.tipo !== 'condicion') return { x, y: nodo.y + ALTO_NODO / 2 };
  return { x, y: nodo.y + (etiqueta === 'no' ? ALTO_NODO - 18 : 18) };
}

const puertoEntrada = (nodo: NodoFlujo): Punto => ({ x: nodo.x, y: nodo.y + ALTO_NODO / 2 });

function curva(a: Punto, b: Punto): string {
  const dx = Math.max(50, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

/** Punto medio de la cúbica (t = 0.5), donde se ancla el botón de borrar. */
function medioCurva(a: Punto, b: Punto): Punto {
  const dx = Math.max(50, Math.abs(b.x - a.x) * 0.5);
  return {
    x: (a.x + 3 * (a.x + dx) + 3 * (b.x - dx) + b.x) / 8,
    y: (a.y + 3 * a.y + 3 * b.y + b.y) / 8,
  };
}

export function Lienzo({
  nodos, aristas, catalogo, seleccionado, estadosPaso, escala, encuadre,
  onEscala, onSeleccionar, onMover, onConectar, onQuitarArista, onSoltarTipo,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [conectando, setConectando] = useState<{ desde: string; etiqueta?: string } | null>(null);
  const [cursor, setCursor] = useState<Punto | null>(null);
  const [aristaSobre, setAristaSobre] = useState<number | null>(null);

  const porId = new Map(nodos.map((n) => [n.id, n]));
  const metaDe = (tipo: string) => catalogo.find((c) => c.tipo === tipo);

  const local = useCallback((clientX: number, clientY: number): Punto => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left) / escala, y: (clientY - rect.top) / escala };
  }, [escala]);

  useEffect(() => {
    if (!conectando) return;
    const onTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setConectando(null); };
    document.addEventListener('keydown', onTecla);
    return () => document.removeEventListener('keydown', onTecla);
  }, [conectando]);

  /**
   * Encuadra la vista sobre los nodos: un flujo de seis pasos se sale del viewport
   * y abrir el editor sobre un lienzo medio vacío hace creer que faltan pasos.
   */
  useEffect(() => {
    const caja = marco.current;
    if (!caja || nodos.length === 0) return;

    const minX = Math.min(...nodos.map((n) => n.x));
    const minY = Math.min(...nodos.map((n) => n.y));
    const maxX = Math.max(...nodos.map((n) => n.x + ANCHO_NODO));
    const maxY = Math.max(...nodos.map((n) => n.y + ALTO_NODO));

    const margen = 48;
    const anchoNecesario = maxX - minX + margen * 2;
    const altoNecesario = maxY - minY + margen * 2;
    const nueva = Math.min(1, +Math.min(caja.clientWidth / anchoNecesario, caja.clientHeight / altoNecesario).toFixed(2));
    const usada = Math.max(0.5, nueva);
    onEscala(usada);

    // El scroll se aplica tras el repintado con la nueva escala, si no se calcula
    // contra las dimensiones anteriores y queda desplazado.
    requestAnimationFrame(() => {
      if (!marco.current) return;
      const centroX = ((minX + maxX) / 2) * usada;
      const centroY = ((minY + maxY) / 2) * usada;
      marco.current.scrollLeft = Math.max(0, centroX - marco.current.clientWidth / 2);
      marco.current.scrollTop = Math.max(0, centroY - marco.current.clientHeight / 2);
    });
    // Solo al montar y cuando se pide encuadrar: seguir a `nodos` movería la vista
    // en cada arrastre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encuadre]);

  function alMoverPuntero(e: React.PointerEvent) {
    const p = local(e.clientX, e.clientY);
    if (conectando) setCursor(p);
    const a = arrastre.current;
    if (!a) return;
    onMover(a.id, Math.max(0, Math.round(p.x - a.dx)), Math.max(0, Math.round(p.y - a.dy)));
  }

  function iniciarArrastre(e: React.PointerEvent, nodo: NodoFlujo) {
    if ((e.target as HTMLElement).closest('[data-puerto]')) return;
    const p = local(e.clientX, e.clientY);
    arrastre.current = { id: nodo.id, dx: p.x - nodo.x, dy: p.y - nodo.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSeleccionar(nodo.id);
  }

  function alClicNodo(nodo: NodoFlujo) {
    if (conectando && conectando.desde !== nodo.id) {
      onConectar(conectando.desde, nodo.id, conectando.etiqueta);
      setConectando(null);
    }
  }

  return (
    <div
      ref={marco}
      className="relative h-full w-full overflow-auto rounded-xl border border-borde bg-superficie-2"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={(e) => {
        e.preventDefault();
        const tipo = e.dataTransfer.getData('text/aura-nodo');
        if (!tipo) return;
        const p = local(e.clientX, e.clientY);
        onSoltarTipo(tipo, Math.max(0, Math.round(p.x - ANCHO_NODO / 2)), Math.max(0, Math.round(p.y - ALTO_NODO / 2)));
      }}
    >
      <div
        ref={ref}
        className="relative origin-top-left"
        style={{
          width: LIENZO_ANCHO, height: LIENZO_ALTO, transform: `scale(${escala})`,
          backgroundImage: 'radial-gradient(circle, var(--borde) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          cursor: conectando ? 'crosshair' : 'default',
        }}
        onPointerMove={alMoverPuntero}
        onPointerUp={(e) => {
          arrastre.current = null;
          (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) { onSeleccionar(null); setConectando(null); }
        }}
      >
        <svg className="pointer-events-none absolute inset-0" width={LIENZO_ANCHO} height={LIENZO_ALTO}>
          <defs>
            <marker id="punta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--borde-fuerte)" />
            </marker>
            <marker id="punta-activa" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--marca-500)" />
            </marker>
          </defs>

          {aristas.map((a, i) => {
            const desde = porId.get(a.desde);
            const hasta = porId.get(a.hasta);
            if (!desde || !hasta) return null;
            const p0 = puertoSalida(desde, a.etiqueta);
            const p1 = puertoEntrada(hasta);
            const activa = seleccionado === a.desde || seleccionado === a.hasta || aristaSobre === i;
            const medio = medioCurva(p0, p1);
            return (
              <g key={`${a.desde}-${a.hasta}-${a.etiqueta ?? ''}-${i}`} className="pointer-events-auto">
                <path d={curva(p0, p1)} fill="none" stroke="transparent" strokeWidth={16}
                  onPointerEnter={() => setAristaSobre(i)} onPointerLeave={() => setAristaSobre(null)} />
                <motion.path
                  d={curva(p0, p1)} fill="none"
                  stroke={activa ? 'var(--marca-500)' : 'var(--borde-fuerte)'}
                  strokeWidth={activa ? 2.25 : 1.75}
                  markerEnd={activa ? 'url(#punta-activa)' : 'url(#punta)'}
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }}
                  className="pointer-events-none"
                />
                {a.etiqueta && (
                  <g className="pointer-events-none">
                    <rect x={medio.x - 13} y={medio.y - 9} width={26} height={16} rx={8}
                      fill="var(--superficie)" stroke={activa ? 'var(--marca-500)' : 'var(--borde)'} />
                    <text x={medio.x} y={medio.y + 2} textAnchor="middle" fontSize={9.5} fontWeight={600}
                      fill={a.etiqueta === 'no' ? 'var(--peligro-500)' : 'var(--exito-600)'}>{a.etiqueta}</text>
                  </g>
                )}
                {aristaSobre === i && (
                  <g className="pointer-events-auto cursor-pointer" onClick={() => { onQuitarArista(i); setAristaSobre(null); }}
                    onPointerEnter={() => setAristaSobre(i)}>
                    <circle cx={medio.x} cy={a.etiqueta ? medio.y - 18 : medio.y} r={9}
                      fill="var(--peligro-500)" stroke="var(--superficie)" strokeWidth={2} />
                    <path d={`M ${medio.x - 3.5} ${(a.etiqueta ? medio.y - 18 : medio.y) - 3.5} l 7 7 M ${medio.x + 3.5} ${(a.etiqueta ? medio.y - 18 : medio.y) - 3.5} l -7 7`}
                      stroke="white" strokeWidth={1.75} strokeLinecap="round" />
                  </g>
                )}
              </g>
            );
          })}

          {conectando && cursor && porId.get(conectando.desde) && (
            <path d={curva(puertoSalida(porId.get(conectando.desde)!, conectando.etiqueta), cursor)}
              fill="none" stroke="var(--marca-500)" strokeWidth={2} strokeDasharray="5 4" />
          )}
        </svg>

        <AnimatePresence>
          {nodos.map((nodo) => {
            const meta = metaDe(nodo.tipo);
            const cat = CATEGORIAS[(meta?.categoria ?? 'accion') as Categoria] ?? CATEGORIAS.accion;
            const resumen = resumenNodo(nodo.tipo, nodo.config ?? {});
            const estado = estadosPaso?.[nodo.id];
            const activo = seleccionado === nodo.id;
            const esDestino = !!conectando && conectando.desde !== nodo.id;

            return (
              <motion.div
                key={nodo.id}
                initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.18 }}
                className={cx(
                  'absolute touch-none select-none rounded-xl border bg-superficie shadow-2 transition-shadow',
                  activo ? 'border-marca-500 shadow-3 ring-2 ring-marca-500/20' : 'border-borde hover:shadow-3',
                  esDestino && 'cursor-crosshair ring-2 ring-marca-500/30',
                )}
                style={{ left: nodo.x, top: nodo.y, width: ANCHO_NODO, height: ALTO_NODO }}
                onPointerDown={(e) => iniciarArrastre(e, nodo)}
                onClick={() => alClicNodo(nodo)}
              >
                <span className="absolute inset-y-0 left-0 w-1 rounded-l-xl" style={{ background: cat.acento }} />

                <div className="flex h-full items-center gap-2.5 pl-3.5 pr-2.5">
                  <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg', cat.fondo, cat.texto)}>
                    <IconoNodo nombre={meta?.icono ?? 'box'} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-texto">{nodo.titulo}</p>
                    <p className="truncate text-2xs text-texto-tenue">{resumen ?? meta?.titulo ?? nodo.tipo}</p>
                  </div>
                  {meta?.simulado && (
                    <span className="shrink-0 rounded-pildora bg-superficie-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-texto-tenue">
                      sim
                    </span>
                  )}
                  {estado && <span className={cx('size-2 shrink-0 rounded-full', ESTADO_PASO[estado]?.punto ?? 'bg-borde-fuerte')} />}
                </div>

                {nodo.tipo !== 'disparador' && (
                  <span data-puerto className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-superficie bg-borde-fuerte" />
                )}

                {nodo.tipo === 'condicion' ? (
                  <>
                    <PuertoSalida etiqueta="sí" arriba onIniciar={() => setConectando({ desde: nodo.id, etiqueta: 'sí' })}
                      activo={conectando?.desde === nodo.id && conectando.etiqueta === 'sí'} />
                    <PuertoSalida etiqueta="no" onIniciar={() => setConectando({ desde: nodo.id, etiqueta: 'no' })}
                      activo={conectando?.desde === nodo.id && conectando.etiqueta === 'no'} />
                  </>
                ) : (
                  <PuertoSalida onIniciar={() => setConectando({ desde: nodo.id })} activo={conectando?.desde === nodo.id} />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {conectando && (
        <div className="pointer-events-none sticky bottom-3 left-1/2 z-10 mx-auto w-fit -translate-x-1/2 rounded-pildora bg-texto px-3 py-1.5 text-xs text-superficie shadow-3">
          Elige el nodo destino · <kbd className="font-semibold">Esc</kbd> para cancelar
        </div>
      )}
    </div>
  );
}

function PuertoSalida({ etiqueta, arriba, activo, onIniciar }: {
  etiqueta?: string; arriba?: boolean; activo?: boolean; onIniciar: () => void;
}) {
  const posicion = etiqueta ? (arriba ? 'top-[18px]' : 'top-[50px]') : 'top-1/2';
  return (
    <button
      data-puerto
      aria-label={etiqueta ? `Conectar rama ${etiqueta}` : 'Conectar salida'}
      onClick={(e) => { e.stopPropagation(); onIniciar(); }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cx(
        'absolute -right-1.5 size-3 -translate-y-1/2 rounded-full border-2 border-superficie transition-colors',
        posicion,
        activo ? 'scale-125 bg-marca-500' : 'bg-borde-fuerte hover:bg-marca-500',
      )}
    >
      {etiqueta && (
        <span className={cx('pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-semibold',
          etiqueta === 'no' ? 'text-peligro-500' : 'text-exito-600')}>
          {etiqueta}
        </span>
      )}
    </button>
  );
}

export function BotonCerrarFlotante({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Cerrar" className="rounded-md p-1 text-texto-tenue hover:bg-superficie-2 hover:text-texto">
      <X className="size-4" />
    </button>
  );
}
