import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Sparkles, Plus } from 'lucide-react';
import * as Iconos from 'lucide-react';
import { useDespacio } from '@/lib/hooks';
import { usarBusquedaGlobal } from '@/lib/consultas/catalogo';
import { NAV_PRINCIPAL } from '@/lib/constantes';
import { cx } from '@/lib/utilidades';

interface Props { abierta: boolean; onCerrar: () => void; onAbrirCopiloto: (pregunta?: string) => void; }

const RUTAS_ENTIDAD: Record<string, string> = {
  cuenta: '/clientes', contacto: '/clientes', lead: '/prospectos', oportunidad: '/oportunidades',
  cotizacion: '/cotizaciones', ticket: '/soporte',
};

const ETIQUETA_TIPO: Record<string, string> = {
  cuenta: 'Clientes', contacto: 'Contactos', lead: 'Prospectos', oportunidad: 'Oportunidades',
  cotizacion: 'Cotizaciones', ticket: 'Tickets',
};

type NombreIcono = keyof typeof Iconos;
function IconoNav({ nombre }: { nombre: string }) {
  const Comp = Iconos[(nombre.replace(/(^\w|-\w)/g, (m) => m.replace('-', '').toUpperCase())) as NombreIcono] as Iconos.LucideIcon | undefined;
  return Comp ? <Comp className="size-4" /> : null;
}

export function PaletaComandos({ abierta, onCerrar, onAbrirCopiloto }: Props) {
  const [termino, setTermino] = useState('');
  const [indice, setIndice] = useState(0);
  const buscado = useDespacio(termino, 220);
  const navegar = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: resultados, isFetching } = usarBusquedaGlobal(buscado, abierta);

  useEffect(() => {
    if (abierta) { setTermino(''); setIndice(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [abierta]);
  useEffect(() => setIndice(0), [termino]);

  const navItems = useMemo(
    () => NAV_PRINCIPAL.flatMap((g) => g.items).filter((i) => !termino || i.etiqueta.toLowerCase().includes(termino.toLowerCase())),
    [termino],
  );

  const items = useMemo(() => {
    const lista: Array<{ tipo: 'accion' | 'nav' | 'resultado'; etiqueta: string; subtitulo?: string; icono: React.ReactNode; ejecutar: () => void }> = [];

    if (termino.trim()) {
      lista.push({
        tipo: 'accion', etiqueta: `Preguntarle al copiloto: "${termino}"`, icono: <Sparkles className="size-4 text-ia-500" />,
        ejecutar: () => onAbrirCopiloto(termino),
      });
    }
    for (const n of navItems) {
      lista.push({ tipo: 'nav', etiqueta: n.etiqueta, icono: <IconoNav nombre={n.icono} />, ejecutar: () => navegar(n.ruta) });
    }
    for (const r of resultados?.resultados ?? []) {
      lista.push({
        tipo: 'resultado', etiqueta: r.titulo, subtitulo: `${ETIQUETA_TIPO[r.tipo] ?? r.tipo}${r.subtitulo ? ` · ${r.subtitulo}` : ''}`,
        icono: <ArrowRight className="size-4" />,
        ejecutar: () => navegar(`${RUTAS_ENTIDAD[r.tipo] ?? '/'}/${r.id}`),
      });
    }
    return lista;
  }, [termino, navItems, resultados, navegar, onAbrirCopiloto]);

  useEffect(() => {
    if (!abierta) return;
    const onTecla = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => Math.min(i + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); items[indice]?.ejecutar(); onCerrar(); }
    };
    window.addEventListener('keydown', onTecla);
    return () => window.removeEventListener('keydown', onTecla);
  }, [abierta, items, indice, onCerrar]);

  return createPortal(
    <AnimatePresence>
      {abierta && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh]">
          <motion.div className="absolute inset-0 bg-[var(--overlay)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCerrar} />
          <motion.div
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-borde bg-superficie shadow-5"
            initial={{ opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-center gap-2.5 border-b border-borde px-4 py-3">
              <Search className="size-4 text-texto-tenue" />
              <input
                ref={inputRef}
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                placeholder="Buscar clientes, prospectos, oportunidades… o pregúntale a la IA"
                className="flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-texto-tenue"
              />
              {isFetching && <span className="text-2xs text-texto-tenue">buscando…</span>}
            </div>

            <div className="max-h-96 overflow-y-auto py-2">
              {items.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-texto-tenue">
                  <Plus className="mx-auto mb-2 size-5 opacity-50" />
                  Escribe para buscar o navegar
                </div>
              )}
              {items.map((item, i) => (
                <button
                  key={`${item.tipo}-${item.etiqueta}-${i}`}
                  onClick={() => { item.ejecutar(); onCerrar(); }}
                  onMouseEnter={() => setIndice(i)}
                  className={cx(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                    i === indice ? 'bg-superficie-2' : '',
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-superficie-2 text-texto-secundario">{item.icono}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-texto">{item.etiqueta}</span>
                    {item.subtitulo && <span className="block truncate text-xs text-texto-tenue">{item.subtitulo}</span>}
                  </span>
                  {i === indice && <kbd className="rounded border border-borde px-1.5 py-0.5 text-[10px] text-texto-tenue">↵</kbd>}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
