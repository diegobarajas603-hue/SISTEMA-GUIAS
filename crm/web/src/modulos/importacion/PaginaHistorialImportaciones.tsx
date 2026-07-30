import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, FileSpreadsheet, Upload, CheckCircle2, XCircle, Loader2, Ban, ChevronRight,
} from 'lucide-react';
import { usarHistorialImportaciones, usarImportacion } from '@/lib/consultas/importacion';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Boton, BotonIcono } from '@/componentes/ui/Boton';
import { Insignia } from '@/componentes/ui/Insignia';
import { Avatar } from '@/componentes/ui/Avatar';
import { PanelLateral } from '@/componentes/ui/PanelLateral';
import { Vacio } from '@/componentes/ui/Vacio';
import { Cargando } from '@/componentes/ui/Cargando';
import { fechaHora, relativo, numero } from '@/lib/formato';
import { cx } from '@/lib/utilidades';
import type { Importacion } from './tipos';

const ESTADO: Record<string, { titulo: string; color: 'exito' | 'peligro' | 'marca' | 'gris'; icono: typeof CheckCircle2 }> = {
  completada: { titulo: 'Completada', color: 'exito', icono: CheckCircle2 },
  fallida: { titulo: 'Fallida', color: 'peligro', icono: XCircle },
  en_proceso: { titulo: 'En proceso', color: 'marca', icono: Loader2 },
  cancelada: { titulo: 'Cancelada', color: 'gris', icono: Ban },
};

const peso = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const duracion = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min`);

export default function PaginaHistorialImportaciones() {
  const { data, isLoading } = usarHistorialImportaciones();
  const [abierta, setAbierta] = useState<number | null>(null);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/clientes">
          <BotonIcono etiqueta="Volver a clientes"><ArrowLeft className="size-4" /></BotonIcono>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-texto">Historial de importaciones</h1>
          <p className="text-sm text-texto-tenue">Quién importó qué, cuándo y con qué resultado</p>
        </div>
        <Link to="/clientes/importar">
          <Boton variante="primario" iconoIzq={<Upload className="size-4" />}>Nueva importación</Boton>
        </Link>
      </div>

      {isLoading ? (
        <Cargando etiqueta="Cargando historial…" className="py-24" />
      ) : !data?.length ? (
        <Vacio
          icono={<FileSpreadsheet className="size-5" />}
          titulo="Todavía no se ha importado nada"
          descripcion="Cuando subas tu primera base de clientes, el registro aparecerá aquí para auditoría."
          accion={<Link to="/clientes/importar"><Boton variante="primario">Importar clientes</Boton></Link>}
        />
      ) : (
        <div className="space-y-2">
          {data.map((imp, i) => {
            const est = ESTADO[imp.estado] ?? ESTADO.completada;
            return (
              <motion.button
                key={imp.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                onClick={() => setAbierta(imp.id)}
                className="fila-hover flex w-full items-center gap-3 rounded-xl border border-borde bg-superficie p-4 text-left"
              >
                <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-lg',
                  imp.estado === 'completada' ? 'bg-exito-50 text-exito-600'
                    : imp.estado === 'fallida' ? 'bg-peligro-50 text-peligro-500'
                      : 'bg-superficie-2 text-texto-tenue')}>
                  <FileSpreadsheet className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-texto">{imp.archivo}</span>
                    <Insignia color={est.color}>{est.titulo}</Insignia>
                  </div>
                  <p className="mt-0.5 text-2xs text-texto-tenue">
                    {imp.usuario_nombre ?? 'Usuario eliminado'} · {relativo(imp.creado_en)} · {peso(imp.tamano_bytes)}
                    {imp.duracion_ms > 0 && ` · ${duracion(imp.duracion_ms)}`}
                  </p>
                </div>

                <div className="hidden shrink-0 items-center gap-4 text-right sm:flex">
                  <Cifra valor={imp.creados} etiqueta="nuevos" tono="text-exito-600" />
                  <Cifra valor={imp.actualizados} etiqueta="actualizados" tono="text-marca-600" />
                  <Cifra valor={imp.omitidos} etiqueta="omitidos" tono="text-texto-tenue" />
                  <Cifra valor={imp.fallidos} etiqueta="errores" tono={imp.fallidos ? 'text-peligro-500' : 'text-texto-tenue'} />
                </div>

                <ChevronRight className="size-4 shrink-0 text-texto-tenue" />
              </motion.button>
            );
          })}
        </div>
      )}

      <DetalleImportacion id={abierta} onCerrar={() => setAbierta(null)} />
    </div>
  );
}

function Cifra({ valor, etiqueta, tono }: { valor: number; etiqueta: string; tono: string }) {
  return (
    <div>
      <p className={cx('num text-sm font-semibold', tono)}>{numero(valor)}</p>
      <p className="text-[10px] text-texto-tenue">{etiqueta}</p>
    </div>
  );
}

function DetalleImportacion({ id, onCerrar }: { id: number | null; onCerrar: () => void }) {
  const { data } = usarImportacion(id);

  return (
    <PanelLateral abierto={id !== null} onCerrar={onCerrar} ancho="lg" titulo="Detalle de la importación">
      {!data ? <Cargando etiqueta="Cargando…" className="py-16" /> : (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-texto">{data.archivo}</h2>
            <p className="mt-0.5 text-sm text-texto-tenue">
              {fechaHora(data.creado_en)}
              {data.terminado_en && ` → ${fechaHora(data.terminado_en)}`}
            </p>
          </div>

          {data.usuario_nombre && (
            <div className="flex items-center gap-2">
              <Avatar nombre={data.usuario_nombre} tono={data.usuario_tono ?? 0} tamano="xs" />
              <span className="text-sm text-texto-secundario">{data.usuario_nombre}</span>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-superficie-2 p-3 text-sm">
            <Dato t="Filas del archivo" v={numero(data.total_filas)} />
            <Dato t="Clientes detectados" v={numero(data.total_clientes)} />
            <Dato t="Creados" v={numero(data.creados)} />
            <Dato t="Actualizados" v={numero(data.actualizados)} />
            <Dato t="Omitidos" v={numero(data.omitidos)} />
            <Dato t="Con error" v={numero(data.fallidos)} />
            <Dato t="Contactos creados" v={numero(data.contactos)} />
            <Dato t="Duración" v={duracion(data.duracion_ms)} />
            <Dato t="Estrategia" v={data.estrategia.replace('_', ' ')} />
            <Dato t="Peso" v={peso(data.tamano_bytes)} />
          </dl>

          {data.mapeo && Object.keys(data.mapeo).length > 0 && (
            <Panel>
              <EncabezadoPanel titulo="Mapeo usado" subtitulo="Columna del archivo → campo del CRM" />
              <CuerpoPanel className="pt-0">
                <ul className="space-y-1 text-xs">
                  {Object.entries(data.mapeo).map(([col, campo]) => (
                    <li key={col} className="flex items-center gap-2">
                      <span className="truncate text-texto-secundario">{col}</span>
                      <span className="text-texto-tenue">→</span>
                      <span className="truncate font-medium text-texto">{campo}</span>
                    </li>
                  ))}
                </ul>
              </CuerpoPanel>
            </Panel>
          )}

          {!!data.errores?.length && (
            <Panel>
              <EncabezadoPanel
                titulo={`${data.errores.length} filas rechazadas`}
                subtitulo="Guardadas para auditoría"
              />
              <CuerpoPanel className="px-0 pt-0">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-superficie">
                      <tr className="border-b border-borde text-2xs uppercase text-texto-tenue">
                        <th className="px-5 py-1.5 text-left">Fila</th>
                        <th className="px-3 py-1.5 text-left">Cliente</th>
                        <th className="px-3 py-1.5 text-left">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.errores.map((e, i) => (
                        <tr key={i} className="border-b border-borde last:border-0">
                          <td className="px-5 py-1.5 text-texto-tenue">{e.fila ?? '—'}</td>
                          <td className="max-w-[160px] truncate px-3 py-1.5 text-texto">{e.nombre ?? '—'}</td>
                          <td className="px-3 py-1.5 text-peligro-500">{e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CuerpoPanel>
            </Panel>
          )}
        </div>
      )}
    </PanelLateral>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-texto-tenue">{t}</dt>
      <dd className="num font-medium text-texto">{v}</dd>
    </div>
  );
}

export type { Importacion };
