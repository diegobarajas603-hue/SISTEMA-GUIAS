import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, FileSpreadsheet, Loader2, Download, ShieldCheck } from 'lucide-react';
import { Boton } from '@/componentes/ui/Boton';
import { cx } from '@/lib/utilidades';

const EXTENSIONES = ['.xlsx', '.xls', '.csv'];
const MAX_BYTES = 60 * 1024 * 1024;

const pesoLegible = (b: number) =>
  b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

interface Props {
  onArchivo: (f: File) => void;
  ocupado: boolean;
  fase: { etiqueta: string; porcentaje: number } | null;
  onPlantilla: () => void;
}

export function PasoArchivo({ onArchivo, ocupado, fase, onPlantilla }: Props) {
  const [encima, setEncima] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const entradaRef = useRef<HTMLInputElement>(null);

  function validarYCargar(f: File | undefined) {
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!EXTENSIONES.includes(ext)) {
      setAviso(`«${ext || 'sin extensión'}» no es un formato admitido. Usa ${EXTENSIONES.join(', ')}.`);
      return;
    }
    if (f.size > MAX_BYTES) {
      setAviso(`El archivo pesa ${pesoLegible(f.size)}. El máximo son ${pesoLegible(MAX_BYTES)}.`);
      return;
    }
    setAviso(null);
    onArchivo(f);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); validarYCargar(e.dataTransfer.files?.[0]); }}
        onClick={() => !ocupado && entradaRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Arrastra o selecciona el archivo de clientes"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entradaRef.current?.click(); } }}
        className={cx(
          'relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-16 text-center',
          'transition-[border-color,background-color,transform] duration-200 ease-[var(--ease-casa)]',
          encima ? 'scale-[1.01] border-marca-500 bg-marca-50' : 'border-borde-fuerte bg-superficie hover:border-marca-500 hover:bg-superficie-2',
          ocupado && 'pointer-events-none opacity-80',
        )}
      >
        <input
          ref={entradaRef} type="file" className="sr-only" accept={EXTENSIONES.join(',')}
          onChange={(e) => { validarYCargar(e.target.files?.[0]); e.target.value = ''; }}
        />

        {ocupado ? (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl bg-marca-50 text-marca-600">
              <Loader2 className="size-7 animate-spin" />
            </span>
            <div className="w-full max-w-xs">
              <p className="text-sm font-medium text-texto">{fase?.etiqueta ?? 'Procesando'}…</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-pildora bg-superficie-2">
                <motion.div
                  className="h-full rounded-pildora bg-marca-500"
                  animate={{ width: `${fase?.porcentaje ?? 15}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <motion.span
              animate={encima ? { y: -4, scale: 1.06 } : { y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className={cx(
                'flex size-14 items-center justify-center rounded-2xl',
                encima ? 'bg-marca-500 text-white' : 'bg-superficie-2 text-texto-secundario',
              )}
            >
              <UploadCloud className="size-7" />
            </motion.span>
            <div>
              <p className="text-base font-semibold text-texto">
                {encima ? 'Suelta el archivo aquí' : 'Arrastra tu archivo de clientes'}
              </p>
              <p className="mt-1 text-sm text-texto-tenue">
                o <span className="font-medium text-marca-600">búscalo en tu equipo</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {EXTENSIONES.map((e) => (
                <span key={e} className="rounded-pildora border border-borde bg-superficie px-2 py-0.5 text-2xs font-medium text-texto-secundario">
                  {e}
                </span>
              ))}
              <span className="text-2xs text-texto-tenue">· hasta {pesoLegible(MAX_BYTES)}</span>
            </div>
          </>
        )}
      </div>

      {aviso && (
        <motion.p
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="mt-3 rounded-lg border border-peligro-200 bg-peligro-50 px-3 py-2 text-sm text-peligro-500"
        >
          {aviso}
        </motion.p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-borde bg-superficie p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-texto">
            <FileSpreadsheet className="size-4 text-texto-tenue" /> ¿No sabes cómo estructurarlo?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-texto-tenue">
            Descarga la plantilla con todas las columnas que Aura reconoce y un ejemplo lleno.
          </p>
          <Boton tamano="sm" variante="secundario" className="mt-3" iconoIzq={<Download className="size-3.5" />} onClick={onPlantilla}>
            Descargar plantilla
          </Boton>
        </div>
        <div className="rounded-xl border border-borde bg-superficie p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-texto">
            <ShieldCheck className="size-4 text-texto-tenue" /> Nada se guarda todavía
          </p>
          <p className="mt-1 text-xs leading-relaxed text-texto-tenue">
            El archivo se lee en tu navegador. Verás una vista previa, revisarás los duplicados
            y solo entonces decides qué se escribe en el CRM.
          </p>
        </div>
      </div>
    </div>
  );
}
