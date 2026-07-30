import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CheckCircle2, Download, UserPlus, RefreshCw, SkipForward, AlertTriangle,
  Users, ArrowRight, RotateCcw,
} from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Boton } from '@/componentes/ui/Boton';
import { cx } from '@/lib/utilidades';
import type { ConteoImportacion, ResultadoFila } from './tipos';

interface Props {
  conteo: ConteoImportacion;
  resultados: ResultadoFila[];
  duracionMs: number;
  archivo: string;
  error: string | null;
  onDescargarErrores: () => void;
  onReiniciar: () => void;
}

const duracion = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return s === 1 ? 'un segundo' : `${s} segundos`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
};

export function PasoResumen({
  conteo, resultados, duracionMs, archivo, error, onDescargarErrores, onReiniciar,
}: Props) {
  const conError = useMemo(() => resultados.filter((r) => r.resultado === 'error'), [resultados]);
  const conAviso = useMemo(() => resultados.filter((r) => (r.avisos?.length ?? 0) > 0), [resultados]);
  const totalOk = conteo.creados + conteo.actualizados;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-borde bg-superficie p-8 text-center shadow-2"
      >
        <motion.span
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 18 }}
          className={cx('mx-auto flex size-14 items-center justify-center rounded-2xl',
            error ? 'bg-alerta-50 text-alerta-600' : 'bg-exito-50 text-exito-600')}
        >
          {error ? <AlertTriangle className="size-7" /> : <CheckCircle2 className="size-7" />}
        </motion.span>

        <h2 className="mt-4 text-xl font-bold tracking-tight text-texto">
          {error ? 'La importación se interrumpió' : 'Importación terminada'}
        </h2>
        <p className="mt-1 text-sm text-texto-tenue">
          {error
            ? error
            : `${totalOk.toLocaleString('es-MX')} clientes procesados desde «${archivo}» en ${duracion(duracionMs)}.`}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Ficha etiqueta="Importados" valor={conteo.creados} icono={UserPlus} tono="exito" />
          <Ficha etiqueta="Actualizados" valor={conteo.actualizados} icono={RefreshCw} tono="marca" />
          <Ficha etiqueta="Omitidos" valor={conteo.omitidos} icono={SkipForward} tono="gris" />
          <Ficha etiqueta="Contactos" valor={conteo.contactos} icono={Users} tono="ia" />
          <Ficha etiqueta="Errores" valor={conteo.fallidos} icono={AlertTriangle} tono="peligro" />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link to="/clientes">
            <Boton variante="primario" iconoDer={<ArrowRight className="size-4" />}>Ver mis clientes</Boton>
          </Link>
          {(conError.length > 0 || conAviso.length > 0) && (
            <Boton variante="secundario" iconoIzq={<Download className="size-4" />} onClick={onDescargarErrores}>
              Descargar reporte en Excel
            </Boton>
          )}
          <Boton variante="fantasma" iconoIzq={<RotateCcw className="size-4" />} onClick={onReiniciar}>
            Importar otro archivo
          </Boton>
        </div>
      </motion.div>

      {conError.length > 0 && (
        <Panel>
          <EncabezadoPanel
            titulo={`${conError.length} filas no se importaron`}
            subtitulo="Corrige estas filas en tu Excel y vuelve a subirlo: las demás ya están dentro."
          />
          <CuerpoPanel className="px-0 pb-0">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-superficie">
                  <tr className="border-b border-borde text-2xs uppercase text-texto-tenue">
                    <th className="px-5 py-2 text-left">Fila</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {conError.slice(0, 200).map((r, i) => (
                    <tr key={`${r.llave}-${i}`} className="border-b border-borde last:border-0">
                      <td className="px-5 py-2 text-texto-tenue">{r.fila ?? '—'}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-texto">{r.nombre ?? '—'}</td>
                      <td className="px-3 py-2 text-peligro-500">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CuerpoPanel>
        </Panel>
      )}

      {conAviso.length > 0 && (
        <Panel>
          <EncabezadoPanel
            titulo={`${conAviso.length} clientes con datos corregidos`}
            subtitulo="Se importaron, pero conviene revisarlos."
          />
          <CuerpoPanel className="px-0 pb-0">
            <div className="max-h-64 overflow-y-auto">
              <ul className="divide-y divide-borde">
                {conAviso.slice(0, 100).map((r, i) => (
                  <li key={`${r.llave}-${i}`} className="px-5 py-2">
                    <p className="text-sm font-medium text-texto">
                      {r.nombre} <span className="text-2xs font-normal text-texto-tenue">· fila {r.fila}</span>
                    </p>
                    <ul className="mt-0.5 space-y-0.5">
                      {r.avisos!.map((a, k) => (
                        <li key={k} className="text-2xs text-alerta-600">· {a}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </CuerpoPanel>
        </Panel>
      )}
    </div>
  );
}

function Ficha({ etiqueta, valor, icono: Icono, tono }: {
  etiqueta: string; valor: number; icono: typeof UserPlus;
  tono: 'exito' | 'marca' | 'gris' | 'peligro' | 'ia';
}) {
  const color = {
    exito: 'text-exito-600', marca: 'text-marca-600', gris: 'text-texto-tenue',
    peligro: 'text-peligro-500', ia: 'text-ia-600',
  }[tono];
  return (
    <div className="rounded-lg border border-borde bg-superficie-2 px-2 py-2.5">
      <Icono className={cx('mx-auto size-4', color)} />
      <p className="num mt-1 text-lg font-bold text-texto">{valor.toLocaleString('es-MX')}</p>
      <p className="text-[10px] text-texto-tenue">{etiqueta}</p>
    </div>
  );
}
