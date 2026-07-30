import { useMemo, useState } from 'react';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Mapa de calor día × hora, para «cuándo contesta el teléfono» un equipo comercial. */
export function MapaCalor({ datos }: { datos: Array<{ dia: number; hora: number; total: number }> }) {
  const [activo, setActivo] = useState<{ dia: number; hora: number; total: number } | null>(null);
  const max = Math.max(...datos.map((d) => d.total), 1);
  const horas = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00–20:00, el horario comercial real

  const mapa = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of datos) m.set(`${d.dia}-${d.hora}`, d.total);
    return m;
  }, [datos]);

  return (
    <div className="w-full overflow-x-auto">
      <div className="inline-grid gap-1" style={{ gridTemplateColumns: `36px repeat(${horas.length}, minmax(20px, 1fr))` }}>
        <div />
        {horas.map((h) => (
          <div key={h} className="text-center text-2xs text-texto-tenue">{h}</div>
        ))}
        {DIAS.map((etiqueta, dia) => (
          <div key={dia} className="contents">
            <div className="flex items-center text-2xs text-texto-tenue">{etiqueta}</div>
            {horas.map((h) => {
              const total = mapa.get(`${dia}-${h}`) ?? 0;
              const intensidad = total / max;
              return (
                <div
                  key={h}
                  onMouseEnter={() => setActivo({ dia, hora: h, total })}
                  onMouseLeave={() => setActivo(null)}
                  className="aspect-square rounded-sm transition-transform duration-100 hover:scale-110"
                  style={{ background: intensidad === 0 ? 'var(--superficie-2)' : `color-mix(in oklch, var(--marca-500) ${Math.round(20 + intensidad * 80)}%, var(--superficie-2))` }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 h-5 text-xs text-texto-secundario">
        {activo && activo.total > 0 && `${DIAS[activo.dia]} ${activo.hora}:00 · ${activo.total} actividad${activo.total === 1 ? '' : 'es'}`}
      </div>
    </div>
  );
}
