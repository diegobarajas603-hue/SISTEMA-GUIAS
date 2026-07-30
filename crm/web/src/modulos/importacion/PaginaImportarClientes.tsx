import { useEffect, useMemo } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Upload, History } from 'lucide-react';
import { usarCatalogoImportacion, usarRefrescarTrasImportar } from '@/lib/consultas/importacion';
import { Boton, BotonIcono } from '@/componentes/ui/Boton';
import { Cargando } from '@/componentes/ui/Cargando';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { cx } from '@/lib/utilidades';
import { usarImportador, type Paso } from './usarImportador';
import { PasoArchivo } from './PasoArchivo';
import { PasoMapeo } from './PasoMapeo';
import { PasoRevision } from './PasoRevision';
import { PasoProgreso } from './PasoProgreso';
import { PasoResumen } from './PasoResumen';
import { descargarPlantilla, descargarReporteErrores } from './exportar';

const PASOS: Array<{ clave: Paso; titulo: string }> = [
  { clave: 'archivo', titulo: 'Archivo' },
  { clave: 'mapeo', titulo: 'Mapeo' },
  { clave: 'revision', titulo: 'Revisión' },
  { clave: 'importando', titulo: 'Importación' },
  { clave: 'resumen', titulo: 'Resumen' },
];

export default function PaginaImportarClientes() {
  const { data: catalogo, isLoading } = usarCatalogoImportacion();
  const refrescar = usarRefrescarTrasImportar();
  const { avisar } = useAvisos();
  const imp = usarImportador();

  // Salir a media importación perdería el avance restante: se avisa antes.
  const bloqueo = useBlocker(
    ({ currentLocation, nextLocation }) =>
      imp.paso === 'importando' && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (bloqueo.state !== 'blocked') return;
    const salir = window.confirm('La importación sigue en curso. ¿Salir de todos modos? Lo ya importado se conserva.');
    if (salir) { imp.cancelar(); bloqueo.proceed(); } else bloqueo.reset();
  }, [bloqueo, imp]);

  useEffect(() => {
    if (imp.paso === 'resumen') refrescar.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imp.paso]);

  useEffect(() => {
    if (imp.error) avisar({ tipo: 'error', titulo: 'Algo salió mal', cuerpo: imp.error });
  }, [imp.error, avisar]);

  const conteoFinal = useMemo(() => {
    const c = imp.progreso?.conteo;
    return c ?? { creados: 0, actualizados: 0, omitidos: 0, fallidos: 0, contactos: 0 };
  }, [imp.progreso]);

  const indicePaso = PASOS.findIndex((p) => p.clave === imp.paso);
  const puedeAvanzarMapeo = imp.hayNombre && imp.camposDuplicados.length === 0;

  if (isLoading || !catalogo) return <Cargando etiqueta="Preparando el importador…" className="py-24" />;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/clientes">
          <BotonIcono etiqueta="Volver a clientes"><ArrowLeft className="size-4" /></BotonIcono>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-texto">Importar clientes</h1>
          <p className="text-sm text-texto-tenue">
            Desde Excel o CSV, con vista previa y control de duplicados
          </p>
        </div>
        <Link to="/clientes/importaciones">
          <Boton variante="fantasma" tamano="sm" iconoIzq={<History className="size-3.5" />}>Historial</Boton>
        </Link>
      </div>

      <Pasos indice={indicePaso} />

      <AnimatePresence mode="wait">
        <motion.div
          key={imp.paso}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {imp.paso === 'archivo' && (
            <PasoArchivo
              onArchivo={imp.cargarArchivo} ocupado={imp.ocupado} fase={imp.fase}
              onPlantilla={() => descargarPlantilla(catalogo.campos)}
            />
          )}

          {imp.paso === 'mapeo' && imp.analisisArchivo && (
            <PasoMapeo
              analisis={imp.analisisArchivo} campos={catalogo.campos}
              mapeo={imp.mapeo} onMapeo={imp.setMapeo}
              camposDuplicados={imp.camposDuplicados} hayNombre={imp.hayNombre}
            />
          )}

          {imp.paso === 'revision' && imp.resumen && (
            <PasoRevision
              resumen={imp.resumen} previo={imp.previo}
              estrategia={imp.estrategia} onEstrategia={imp.setEstrategia}
              decisiones={imp.decisiones} onDecisiones={imp.setDecisiones}
            />
          )}

          {imp.paso === 'importando' && (
            <PasoProgreso progreso={imp.progreso} onCancelar={imp.cancelar} />
          )}

          {imp.paso === 'resumen' && (
            <PasoResumen
              conteo={conteoFinal} resultados={imp.resultados}
              duracionMs={imp.progreso ? Date.now() - imp.progreso.iniciadoEn : 0}
              archivo={imp.archivo?.name ?? 'archivo'} error={imp.error}
              onDescargarErrores={() => descargarReporteErrores(imp.resultados, imp.archivo?.name ?? 'clientes')}
              onReiniciar={imp.reiniciar}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {(imp.paso === 'mapeo' || imp.paso === 'revision') && (
        <div className="sticky bottom-0 -mx-6 border-t border-borde bg-superficie/85 px-6 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-3">
            <Boton
              variante="secundario"
              onClick={() => imp.setPaso(imp.paso === 'revision' ? 'mapeo' : 'archivo')}
              iconoIzq={<ArrowLeft className="size-4" />}
            >
              Atrás
            </Boton>

            <p className="hidden text-xs text-texto-tenue sm:block">
              {imp.paso === 'mapeo'
                ? `${imp.analisisArchivo?.totalFilas.toLocaleString('es-MX') ?? 0} filas · ${imp.archivo?.name}`
                : `${imp.resumen?.totalClientes.toLocaleString('es-MX') ?? 0} clientes listos para importar`}
            </p>

            {imp.paso === 'mapeo' ? (
              <Boton
                variante="primario" cargando={imp.ocupado} disabled={!puedeAvanzarMapeo}
                onClick={imp.confirmarMapeo} iconoDer={<ArrowRight className="size-4" />}
              >
                {imp.fase ? imp.fase.etiqueta : 'Validar datos'}
              </Boton>
            ) : (
              <Boton
                variante="primario" onClick={imp.importar}
                disabled={(imp.resumen?.totalClientes ?? 0) === 0}
                iconoIzq={<Upload className="size-4" />}
              >
                Importar {imp.resumen?.totalClientes.toLocaleString('es-MX')} clientes
              </Boton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Pasos({ indice }: { indice: number }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto" aria-label="Progreso de la importación">
      {PASOS.map((p, i) => {
        const hecho = i < indice;
        const activo = i === indice;
        return (
          <li key={p.clave} className="flex min-w-0 flex-1 items-center gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cx(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold transition-colors duration-200',
                hecho ? 'bg-exito-500 text-white'
                  : activo ? 'bg-marca-500 text-white'
                    : 'bg-superficie-2 text-texto-tenue',
              )}>
                {hecho ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cx('truncate text-xs font-medium',
                activo ? 'text-texto' : hecho ? 'text-texto-secundario' : 'text-texto-tenue')}>
                {p.titulo}
              </span>
            </div>
            {i < PASOS.length - 1 && (
              <span className="relative h-px min-w-4 flex-1 bg-borde">
                <motion.span
                  className="absolute inset-y-0 left-0 bg-exito-500"
                  initial={false}
                  animate={{ width: hecho ? '100%' : '0%' }}
                  transition={{ duration: 0.35 }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
