import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, AlertTriangle, Table2, Wand2, CircleSlash } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Insignia } from '@/componentes/ui/Insignia';
import { Segmentado } from '@/componentes/ui/Segmentado';
import { cx } from '@/lib/utilidades';
import type { ArchivoAnalizado } from './tipos';
import type { CampoImportacion } from '@aura/compartido';

interface Props {
  analisis: ArchivoAnalizado;
  campos: CampoImportacion[];
  mapeo: Record<number, string | null>;
  onMapeo: (m: Record<number, string | null>) => void;
  camposDuplicados: string[];
  hayNombre: boolean;
}

export function PasoMapeo({ analisis, campos, mapeo, onMapeo, camposDuplicados, hayNombre }: Props) {
  const [vista, setVista] = useState('columnas');

  const porGrupo = useMemo(() => {
    const g = new Map<string, CampoImportacion[]>();
    for (const c of campos) {
      if (!g.has(c.grupo)) g.set(c.grupo, []);
      g.get(c.grupo)!.push(c);
    }
    return [...g.entries()];
  }, [campos]);

  const porClave = useMemo(() => Object.fromEntries(campos.map((c) => [c.clave, c])), [campos]);

  const asignadas = Object.values(mapeo).filter(Boolean).length;
  const detectadas = analisis.columnas.filter((c) => c.confianza).length;
  const sinMapear = campos.filter((c) => c.requerido && !Object.values(mapeo).includes(c.clave));

  const cambiar = (indice: number, campo: string) =>
    onMapeo({ ...mapeo, [indice]: campo || null });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Insignia color="ia" icono={<Sparkles className="size-3" />}>
            {detectadas} de {analisis.columnas.length} columnas detectadas
          </Insignia>
          <Insignia color={asignadas > 0 ? 'exito' : 'gris'}>{asignadas} campos mapeados</Insignia>
          <span className="text-xs text-texto-tenue">{analisis.totalFilas.toLocaleString('es-MX')} filas</span>
        </div>
        <Segmentado
          opciones={[{ valor: 'columnas', etiqueta: 'Columnas' }, { valor: 'filas', etiqueta: 'Vista previa' }]}
          valor={vista} onCambiar={setVista}
        />
      </div>

      {!hayNombre && (
        <Aviso tono="peligro" icono={<AlertTriangle className="size-4" />}>
          Falta asignar el <strong>nombre del cliente</strong>. Es el único campo obligatorio:
          sin él no se puede crear ningún registro.
        </Aviso>
      )}
      {camposDuplicados.length > 0 && (
        <Aviso tono="alerta" icono={<AlertTriangle className="size-4" />}>
          Hay dos columnas apuntando al mismo campo
          ({camposDuplicados.map((c) => porClave[c]?.etiqueta ?? c).join(', ')}). Deja solo una.
        </Aviso>
      )}
      {sinMapear.length === 0 && hayNombre && camposDuplicados.length === 0 && (
        <Aviso tono="exito" icono={<Wand2 className="size-4" />}>
          El mapeo está completo. Revisa que las columnas detectadas automáticamente sean correctas
          antes de continuar.
        </Aviso>
      )}

      {vista === 'columnas' ? (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {analisis.columnas.map((col, i) => {
            const elegido = mapeo[col.indice];
            const duplicado = elegido ? camposDuplicados.includes(elegido) : false;
            return (
              <motion.div
                key={col.indice}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.3), duration: 0.2 }}
              >
                <div className={cx(
                  'rounded-xl border bg-superficie p-3 transition-colors',
                  duplicado ? 'border-alerta-500' : elegido ? 'border-borde' : 'border-dashed border-borde',
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-texto">{col.encabezado}</span>
                        {col.confianza === 'alta' && (
                          <span title="Detectada automáticamente con alta confianza">
                            <Sparkles className="size-3 shrink-0 text-ia-500" />
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-2xs text-texto-tenue">
                        {col.muestra.length ? col.muestra.join(' · ') : 'columna vacía'}
                      </p>
                    </div>
                    {!elegido && (
                      <span className="shrink-0 text-texto-tenue" title="Esta columna no se importará">
                        <CircleSlash className="size-3.5" />
                      </span>
                    )}
                  </div>

                  <select
                    value={elegido ?? ''}
                    onChange={(e) => cambiar(col.indice, e.target.value)}
                    aria-label={`Campo del CRM para la columna ${col.encabezado}`}
                    className={cx(
                      'mt-2.5 h-8 w-full rounded-lg border bg-superficie px-2 text-xs text-texto',
                      'focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-500/12',
                      duplicado ? 'border-alerta-500' : 'border-borde',
                    )}
                  >
                    <option value="">— No importar esta columna —</option>
                    {porGrupo.map(([grupo, items]) => (
                      <optgroup key={grupo} label={grupo}>
                        {items.map((c) => (
                          <option key={c.clave} value={c.clave}>
                            {c.etiqueta}{c.requerido ? ' *' : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  {elegido && porClave[elegido]?.ayuda && (
                    <p className="mt-1.5 text-2xs leading-relaxed text-texto-tenue">{porClave[elegido].ayuda}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <Panel>
          <EncabezadoPanel
            titulo="Primeras 20 filas"
            subtitulo={`Hoja «${analisis.hoja}» · así se leyó tu archivo`}
            acciones={<Table2 className="size-4 text-texto-tenue" />}
          />
          <CuerpoPanel className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-y border-borde bg-superficie-2">
                    <th className="sticky left-0 z-10 bg-superficie-2 px-3 py-2 text-left font-medium text-texto-tenue">#</th>
                    {analisis.encabezados.map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-3 py-2 text-left">
                        <span className="block font-semibold text-texto">{h}</span>
                        <span className={cx('block text-2xs font-normal',
                          mapeo[i] ? 'text-marca-600' : 'text-texto-tenue')}>
                          {mapeo[i] ? (porClave[mapeo[i]!]?.etiqueta ?? mapeo[i]) : 'no se importa'}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analisis.muestra.map((fila, f) => (
                    <tr key={f} className="border-b border-borde last:border-0 hover:bg-superficie-2">
                      <td className="sticky left-0 z-10 bg-superficie px-3 py-1.5 text-texto-tenue">{f + 2}</td>
                      {analisis.encabezados.map((_, c) => (
                        <td key={c} className={cx('max-w-[220px] truncate px-3 py-1.5',
                          mapeo[c] ? 'text-texto' : 'text-texto-tenue')}>
                          {fila[c] === null || fila[c] === undefined ? '' : String(fila[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CuerpoPanel>
        </Panel>
      )}
    </div>
  );
}

function Aviso({ tono, icono, children }: {
  tono: 'exito' | 'alerta' | 'peligro'; icono: React.ReactNode; children: React.ReactNode;
}) {
  const clases = {
    exito: 'border-exito-200 bg-exito-50 text-exito-600',
    alerta: 'border-alerta-200 bg-alerta-50 text-alerta-600',
    peligro: 'border-peligro-200 bg-peligro-50 text-peligro-500',
  }[tono];
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className={cx('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm leading-relaxed', clases)}>
      <span className="mt-px shrink-0">{icono}</span>
      <span>{children}</span>
    </motion.div>
  );
}

export { Aviso };
