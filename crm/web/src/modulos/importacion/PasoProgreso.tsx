import { motion } from 'framer-motion';
import { Loader2, UserPlus, RefreshCw, SkipForward, AlertTriangle, Users } from 'lucide-react';
import { Boton } from '@/componentes/ui/Boton';
import { cx } from '@/lib/utilidades';
import type { EstadoProgreso } from './usarImportador';

/** Tiempo restante en palabras: «menos de un minuto» es más útil que «00:47». */
function restante(ms: number | null): string {
  if (ms === null) return 'calculando…';
  if (ms < 5_000) return 'unos segundos';
  if (ms < 60_000) return `${Math.ceil(ms / 1000)} segundos`;
  const min = Math.ceil(ms / 60_000);
  return min === 1 ? 'cerca de un minuto' : `cerca de ${min} minutos`;
}

export function PasoProgreso({ progreso, onCancelar }: { progreso: EstadoProgreso | null; onCancelar: () => void }) {
  const total = progreso?.total ?? 0;
  const hechos = progreso?.procesados ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((hechos / total) * 100)) : 0;
  const c = progreso?.conteo;
  const transcurrido = progreso ? Math.round((Date.now() - progreso.iniciadoEn) / 1000) : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-borde bg-superficie p-8 text-center shadow-2">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-marca-50 text-marca-600">
          <Loader2 className="size-7 animate-spin" />
        </span>

        <h2 className="mt-4 text-lg font-bold text-texto">Importando tus clientes</h2>
        <p className="mt-1 text-sm text-texto-tenue">
          No cierres esta pestaña. Puedes cancelar y lo ya importado se conserva.
        </p>

        <div className="mt-6">
          <div className="flex items-end justify-between">
            <span className="num text-3xl font-bold tracking-tight text-texto">{pct}%</span>
            <span className="num text-sm text-texto-secundario">
              {hechos.toLocaleString('es-MX')} de {total.toLocaleString('es-MX')}
            </span>
          </div>
          <div
            className="mt-2 h-2.5 overflow-hidden rounded-pildora bg-superficie-2"
            role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
            aria-label="Avance de la importación"
          >
            <motion.div
              className="h-full rounded-pildora bg-marca-500"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-2xs text-texto-tenue">
            <span>{transcurrido}s transcurridos</span>
            <span>Faltan {restante(progreso?.msRestantes ?? null)}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Contador etiqueta="Nuevos" valor={c?.creados ?? 0} icono={UserPlus} tono="text-exito-600" />
          <Contador etiqueta="Actualizados" valor={c?.actualizados ?? 0} icono={RefreshCw} tono="text-marca-600" />
          <Contador etiqueta="Omitidos" valor={c?.omitidos ?? 0} icono={SkipForward} tono="text-texto-tenue" />
          <Contador etiqueta="Contactos" valor={c?.contactos ?? 0} icono={Users} tono="text-ia-600" />
          <Contador etiqueta="Errores" valor={c?.fallidos ?? 0} icono={AlertTriangle} tono="text-peligro-500" />
        </div>

        <Boton variante="secundario" tamano="sm" className="mt-6" onClick={onCancelar}>
          Cancelar importación
        </Boton>
      </div>
    </div>
  );
}

function Contador({ etiqueta, valor, icono: Icono, tono }: {
  etiqueta: string; valor: number; icono: typeof UserPlus; tono: string;
}) {
  return (
    <div className="rounded-lg border border-borde bg-superficie-2 px-2 py-2">
      <Icono className={cx('mx-auto size-3.5', tono)} />
      <p className="num mt-1 text-base font-bold text-texto">{valor.toLocaleString('es-MX')}</p>
      <p className="text-[10px] text-texto-tenue">{etiqueta}</p>
    </div>
  );
}
