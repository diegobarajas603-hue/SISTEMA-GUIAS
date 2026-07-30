import { ArrowDown, ArrowUp } from 'lucide-react';
import { Anillo } from '@/componentes/ui/Anillo';
import { Avatar } from '@/componentes/ui/Avatar';
import { Insignia } from '@/componentes/ui/Insignia';
import { dinero, relativo } from '@/lib/formato';
import { ETAPAS_LEAD, TEMPERATURA_TEXTO } from '@/lib/constantes';
import type { Lead } from '@/lib/tipos';
import { cx } from '@/lib/utilidades';

interface Props {
  leads: Lead[]; onAbrir: (id: number) => void;
  orden: { columna: string; direccion: 'asc' | 'desc' }; onOrdenar: (columna: string) => void;
}

const COLUMNAS = [
  { clave: 'nombre', etiqueta: 'Prospecto' },
  { clave: 'empresa', etiqueta: 'Empresa' },
  { clave: 'score', etiqueta: 'Score' },
  { clave: 'prioridad', etiqueta: 'Etapa' },
  { clave: 'valor_estimado', etiqueta: 'Valor' },
  { clave: 'ultimo_contacto_en', etiqueta: 'Último contacto' },
  { clave: 'propietario', etiqueta: 'Propietario' },
];

export function VistaTabla({ leads, onAbrir, orden, onOrdenar }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-borde bg-superficie">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2">
              {COLUMNAS.map((c) => (
                <th key={c.clave} className="whitespace-nowrap px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wide text-texto-tenue">
                  <button onClick={() => onOrdenar(c.clave)} className="flex items-center gap-1 hover:text-texto-secundario">
                    {c.etiqueta}
                    {orden.columna === c.clave && (orden.direccion === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} onClick={() => onAbrir(l.id)} className="fila-hover cursor-pointer border-b border-borde last:border-0">
                <td className="px-4 py-2.5 font-medium text-texto">{l.nombre}</td>
                <td className="px-4 py-2.5 text-texto-secundario">{l.empresa ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Anillo valor={l.score} temperatura={l.temperatura} tamano={28} grosor={3} />
                    <Insignia color={l.temperatura === 'ardiente' || l.temperatura === 'caliente' ? 'peligro' : l.temperatura === 'tibio' ? 'alerta' : 'gris'}>
                      {TEMPERATURA_TEXTO[l.temperatura]}
                    </Insignia>
                  </div>
                </td>
                <td className="px-4 py-2.5"><span className={cx('text-xs font-medium', l.etapa === 'perdido' && 'text-peligro-500')}>{ETAPAS_LEAD[l.etapa]}</span></td>
                <td className="num px-4 py-2.5 font-medium text-texto">{dinero(l.valor_estimado)}</td>
                <td className="px-4 py-2.5 text-texto-tenue">{relativo(l.ultimo_contacto_en ?? l.creado_en)}</td>
                <td className="px-4 py-2.5">{l.propietario_nombre ? <Avatar nombre={l.propietario_nombre} tono={l.propietario_tono} tamano="xs" /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
