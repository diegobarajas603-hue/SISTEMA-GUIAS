import { useMemo } from 'react';
import { TIPO_ACTIVIDAD_ICONO } from '@/lib/constantes';
import { hora } from '@/lib/formato';
import type { Actividad } from '@/lib/tipos';
import { cx } from '@/lib/utilidades';
import { iconoPorNombre } from '@/lib/iconos';

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function IconoTipo({ tipo }: { tipo: string }) {
  const nombre = TIPO_ACTIVIDAD_ICONO[tipo] ?? 'circle';
  const Comp = iconoPorNombre(nombre);
  return Comp ? <Comp className="size-2.5" /> : null;
}

export function VistaMes({
  fechaBase, eventos, onAbrir,
}: { fechaBase: Date; eventos: Actividad[]; onAbrir: (id: number) => void }) {
  const celdas = useMemo(() => {
    const inicioMes = new Date(fechaBase.getFullYear(), fechaBase.getMonth(), 1);
    const inicioMalla = new Date(inicioMes);
    inicioMalla.setDate(inicioMalla.getDate() - inicioMes.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicioMalla);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [fechaBase]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, Actividad[]>();
    for (const e of eventos) {
      if (!e.vence_en) continue;
      const clave = new Date(e.vence_en).toDateString();
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(e);
    }
    return mapa;
  }, [eventos]);

  const hoy = new Date().toDateString();

  return (
    <div className="overflow-hidden rounded-xl border border-borde bg-superficie">
      <div className="grid grid-cols-7 border-b border-borde bg-superficie-2">
        {DIAS_SEMANA.map((d) => <div key={d} className="px-2 py-2 text-center text-2xs font-semibold uppercase text-texto-tenue">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {celdas.map((dia, i) => {
          const esMesActual = dia.getMonth() === fechaBase.getMonth();
          const items = porDia.get(dia.toDateString()) ?? [];
          return (
            <div key={i} className={cx('min-h-24 border-b border-r border-borde p-1.5 last:border-r-0', !esMesActual && 'bg-superficie-2/40')}>
              <span className={cx(
                'inline-flex size-5 items-center justify-center rounded-full text-2xs font-medium',
                dia.toDateString() === hoy ? 'bg-marca-500 text-white' : esMesActual ? 'text-texto-secundario' : 'text-texto-tenue',
              )}>
                {dia.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((e) => (
                  <button key={e.id} onClick={() => onAbrir(e.id)}
                    className={cx('flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-2xs',
                      e.estado === 'completada' ? 'bg-superficie-2 text-texto-tenue line-through' : 'bg-marca-50 text-marca-700 hover:bg-marca-100')}>
                    <IconoTipo tipo={e.tipo} /> {hora(e.vence_en)} {e.asunto}
                  </button>
                ))}
                {items.length > 3 && <p className="px-1 text-2xs text-texto-tenue">+{items.length - 3} más</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
