import { Trash2, Info } from 'lucide-react';
import { Campo, Selector } from '@/componentes/ui/Campo';
import { Boton } from '@/componentes/ui/Boton';
import { IconoNodo } from './IconoNodo';
import { EVENTOS_DISPARADOR } from './constantes';
import { CATEGORIAS, ESQUEMA_CONFIG, type Categoria, type Configuracion, type OpcionConfig } from './esquema-nodos';
import { cx } from '@/lib/utilidades';
import type { NodoCatalogo, NodoFlujo } from '@/lib/tipos';

interface Props {
  nodo: NodoFlujo;
  catalogo: NodoCatalogo[];
  onCambiar: (parche: Partial<NodoFlujo>) => void;
  onEliminar: () => void;
}

export function PanelConfigNodo({ nodo, catalogo, onCambiar, onEliminar }: Props) {
  const meta = catalogo.find((c) => c.tipo === nodo.tipo);
  const cat = CATEGORIAS[(meta?.categoria ?? 'accion') as Categoria] ?? CATEGORIAS.accion;
  const cfg: Configuracion = nodo.config ?? {};
  const campos = (ESQUEMA_CONFIG[nodo.tipo] ?? []).filter((c) => !c.visible || c.visible(cfg));

  const ponerCfg = (clave: string, valor: unknown) => onCambiar({ config: { ...cfg, [clave]: valor } });

  return (
    <div className="flex h-full flex-col overflow-y-auto rounded-xl border border-borde bg-superficie">
      <div className="flex items-start gap-2.5 border-b border-borde px-4 py-3">
        <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg', cat.fondo, cat.texto)}>
          <IconoNodo nombre={meta?.icono ?? 'box'} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-texto">{meta?.titulo ?? nodo.tipo}</p>
          <p className="text-2xs text-texto-tenue">{cat.titulo}</p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {meta?.descripcion && (
          <p className="flex gap-2 rounded-lg bg-superficie-2 p-2.5 text-2xs leading-relaxed text-texto-secundario">
            <Info className="mt-px size-3.5 shrink-0 text-texto-tenue" />
            {meta.descripcion}
          </p>
        )}

        <Campo etiqueta="Título del paso" value={nodo.titulo}
          onChange={(e) => onCambiar({ titulo: e.target.value })}
          ayuda={nodo.tipo === 'crear_actividad' ? 'Es el asunto que verá el ejecutivo en su agenda.' : undefined} />

        {nodo.tipo === 'disparador' && (
          <Selector etiqueta="Evento" value={String(cfg.evento ?? 'lead.creado')}
            onChange={(e) => ponerCfg('evento', e.target.value)}
            ayuda="Define también el evento del flujo completo.">
            {EVENTOS_DISPARADOR.map((ev) => <option key={ev.valor} value={ev.valor}>{ev.titulo}</option>)}
          </Selector>
        )}

        {campos.map((campo) => {
          const valor = cfg[campo.clave];
          if (campo.tipo === 'seleccion') {
            const opciones = typeof campo.opciones === 'function' ? campo.opciones(cfg) : (campo.opciones ?? []);
            return (
              <Selector key={campo.clave} etiqueta={campo.etiqueta} ayuda={campo.ayuda}
                value={valor === undefined || valor === null ? '' : String(valor)}
                onChange={(e) => ponerCfg(campo.clave, e.target.value)}>
                <option value="">Selecciona…</option>
                {agrupar(opciones).map(([grupo, items]) =>
                  grupo ? (
                    <optgroup key={grupo} label={grupo}>
                      {items.map((o) => <option key={`${grupo}-${o.valor}`} value={o.valor}>{o.titulo}</option>)}
                    </optgroup>
                  ) : (
                    items.map((o) => <option key={o.valor} value={o.valor}>{o.titulo}</option>)
                  ))}
              </Selector>
            );
          }
          return (
            <Campo key={campo.clave} etiqueta={campo.etiqueta} ayuda={campo.ayuda} placeholder={campo.placeholder}
              type={campo.tipo === 'numero' ? 'number' : 'text'}
              value={valor === undefined || valor === null ? '' : String(valor)}
              onChange={(e) => ponerCfg(campo.clave, campo.tipo === 'numero' ? Number(e.target.value) : e.target.value)} />
          );
        })}

        {campos.length === 0 && nodo.tipo !== 'disparador' && (
          <p className="text-2xs text-texto-tenue">Este paso no necesita configuración: usa la entidad que traiga el flujo.</p>
        )}

        {nodo.tipo === 'condicion' && (
          <p className="rounded-lg border border-alerta-200 bg-alerta-50 p-2.5 text-2xs leading-relaxed text-alerta-600">
            Conecta las dos salidas: <strong>sí</strong> arriba y <strong>no</strong> abajo. Si solo conectas una,
            el flujo toma esa rama en ambos casos.
          </p>
        )}
      </div>

      {nodo.tipo !== 'disparador' && (
        <div className="mt-auto border-t border-borde p-3">
          <Boton variante="peligro" tamano="sm" className="w-full" iconoIzq={<Trash2 className="size-3.5" />} onClick={onEliminar}>
            Eliminar paso
          </Boton>
        </div>
      )}
    </div>
  );
}

/** Agrupa manteniendo el orden de aparición; sin grupo se devuelve bajo la clave vacía. */
function agrupar(opciones: OpcionConfig[]): Array<[string, OpcionConfig[]]> {
  const mapa = new Map<string, OpcionConfig[]>();
  for (const o of opciones) {
    const clave = o.grupo ?? '';
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave)!.push(o);
  }
  return [...mapa.entries()];
}
