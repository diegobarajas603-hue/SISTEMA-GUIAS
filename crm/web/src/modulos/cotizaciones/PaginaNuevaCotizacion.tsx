import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Truck, Package, Calculator, Send } from 'lucide-react';
import { calcularCotizacion, TIPOS_MERCANCIA, renglonVacio } from '@aura/compartido';
import { usarCrearCotizacion } from '@/lib/consultas/cotizaciones';
import { usarCuenta } from '@/lib/consultas/cuentas';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Boton, BotonIcono } from '@/componentes/ui/Boton';
import { Campo, AreaTexto } from '@/componentes/ui/Campo';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { ErrorAPI } from '@/lib/api';
import { dinero } from '@/lib/formato';
import { cx } from '@/lib/utilidades';
import { SelectorCliente } from './SelectorCliente';
import { EditorMercancia, type Renglon } from './EditorMercancia';
import type { Cuenta } from '@/lib/tipos';

const kg = (n: number) =>
  `${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

export default function PaginaNuevaCotizacion() {
  const navegar = useNavigate();
  const crear = usarCrearCotizacion();
  const { avisar } = useAvisos();

  // Al llegar desde la ficha de un cliente («?cuenta=123») se preselecciona,
  // que es el camino más frecuente: se cotiza para alguien concreto.
  const [params] = useSearchParams();
  const cuentaPrevia = params.get('cuenta');
  const { data: fichaPrevia } = usarCuenta(cuentaPrevia ? Number(cuentaPrevia) : null);

  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const elegida = cuenta ?? (fichaPrevia as Cuenta | undefined) ?? null;
  const [envio, setEnvio] = useState({
    origen: '', destino: '', descripcion_envio: '', observaciones: '', tipo_mercancia: 'general',
  });
  const [renglones, setRenglones] = useState<Renglon[]>([renglonVacio() as Renglon]);

  // El mismo módulo que usa el servidor: la cifra de la vista previa es la que
  // se va a guardar, no una aproximación.
  const totales = useMemo(
    () => calcularCotizacion(renglones as Record<string, unknown>[], envio.tipo_mercancia),
    [renglones, envio.tipo_mercancia],
  );

    const conMedidas = totales.renglones.filter((r) => r.largo > 0 && r.ancho > 0).length;
  const listo = !!elegida && conMedidas > 0 && totales.peso_cobrable_total > 0;

  function guardar() {
    if (!listo || !elegida) return;
    crear.mutate({
      cuenta_id: elegida.id,
      ...envio,
      items: renglones.map((r, i) => ({ ...r, orden: i })),
    }, {
      onSuccess: (c) => {
        avisar({ tipo: 'exito', titulo: `Cotización ${c.folio} creada` });
        navegar(`/cotizaciones/${c.id}`);
      },
      onError: (e) => avisar({
        tipo: 'error', titulo: 'No se pudo crear',
        cuerpo: e instanceof ErrorAPI ? e.message : 'Revisa los datos.',
      }),
    });
  }

  return (
    <div className="pb-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/cotizaciones">
          <BotonIcono etiqueta="Volver a cotizaciones"><ArrowLeft className="size-4" /></BotonIcono>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-texto">Nueva cotización de flete</h1>
          <p className="text-sm text-texto-tenue">Se cobra el mayor entre el peso real y el volumétrico</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel>
            <EncabezadoPanel
              titulo="1 · Cliente"
              subtitulo={elegida ? 'Sus datos se toman de la ficha' : 'Búscalo en tu cartera'}
              acciones={<Truck className="size-4 text-texto-tenue" />}
            />
            <CuerpoPanel>
              <SelectorCliente cuenta={elegida} onElegir={setCuenta} />
            </CuerpoPanel>
          </Panel>

          <Panel className={cx(!elegida && 'pointer-events-none opacity-50')}>
            <EncabezadoPanel titulo="2 · El envío" acciones={<FileText className="size-4 text-texto-tenue" />} />
            <CuerpoPanel>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo
                  etiqueta="Origen" placeholder="Monterrey, N.L."
                  value={envio.origen} onChange={(e) => setEnvio((s) => ({ ...s, origen: e.target.value }))}
                />
                <Campo
                  etiqueta="Destino" placeholder="Ciudad de México, CDMX"
                  value={envio.destino} onChange={(e) => setEnvio((s) => ({ ...s, destino: e.target.value }))}
                />
              </div>

              <AreaTexto
                etiqueta="Descripción del envío" rows={2} className="mt-3"
                placeholder="Qué se transporta, en qué se embala, si requiere algo especial."
                value={envio.descripcion_envio}
                onChange={(e) => setEnvio((s) => ({ ...s, descripcion_envio: e.target.value }))}
              />

              <div className="mt-3">
                <span className="mb-1.5 block text-xs font-medium text-texto-secundario">Tipo de mercancía</span>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS_MERCANCIA.map((t) => {
                    const activo = envio.tipo_mercancia === t.clave;
                    return (
                      <button
                        key={t.clave}
                        aria-pressed={activo}
                        onClick={() => setEnvio((s) => ({ ...s, tipo_mercancia: t.clave }))}
                        className={cx(
                          'rounded-lg border px-3 py-2.5 text-left transition-all duration-150',
                          activo ? 'border-marca-500 bg-marca-50 shadow-2' : 'border-borde hover:border-borde-fuerte',
                        )}
                      >
                        <span className={cx('block text-sm font-semibold', activo ? 'text-marca-700' : 'text-texto')}>
                          {t.titulo}
                        </span>
                        <span className="num block text-2xs text-texto-tenue">
                          ${(t.centavosPorKg / 100).toFixed(2)} por kg cobrable
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CuerpoPanel>
          </Panel>

          <Panel className={cx(!elegida && 'pointer-events-none opacity-50')}>
            <EncabezadoPanel
              titulo="3 · Mercancía"
              subtitulo="Una línea por tarima, pieza o bulto"
              acciones={<Package className="size-4 text-texto-tenue" />}
            />
            <CuerpoPanel>
              <EditorMercancia renglones={renglones} onCambiar={setRenglones} />
            </CuerpoPanel>
          </Panel>

          <Panel className={cx(!elegida && 'pointer-events-none opacity-50')}>
            <EncabezadoPanel titulo="4 · Observaciones" subtitulo="Opcional, sale en el PDF" />
            <CuerpoPanel>
              <AreaTexto
                rows={2} placeholder="Horarios de entrega, contacto en destino, requisitos de acceso…"
                value={envio.observaciones}
                onChange={(e) => setEnvio((s) => ({ ...s, observaciones: e.target.value }))}
              />
            </CuerpoPanel>
          </Panel>
        </div>

        {/* Vista previa: se queda visible mientras se captura. */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <Panel elevado>
            <EncabezadoPanel titulo="Vista previa" acciones={<Calculator className="size-4 text-texto-tenue" />} />
            <CuerpoPanel>
              <dl className="space-y-2 text-sm">
                <Fila termino="Cliente" valor={elegida?.nombre ?? '—'} truncar />
                <Fila termino="Origen" valor={envio.origen || '—'} truncar />
                <Fila termino="Destino" valor={envio.destino || '—'} truncar />
                <Fila termino="Tipo" valor={totales.tarifa_titulo} />
                <Fila termino="Renglones" valor={`${conMedidas} · ${totales.piezas} piezas`} />
              </dl>

              <div className="my-3 border-t border-borde" />

              <dl className="space-y-2 text-sm">
                <Fila termino="Peso real" valor={kg(totales.peso_real_total)} />
                <Fila termino="Peso volumétrico" valor={kg(totales.peso_volumetrico_total)} />
                <div className="flex items-center justify-between gap-2 pt-1">
                  <dt className="font-medium text-texto">Peso cobrable</dt>
                  <dd className="num font-semibold text-marca-600">{kg(totales.peso_cobrable_total)}</dd>
                </div>
                <Fila termino="Tarifa" valor={`$${(totales.tarifa_centavos_kg / 100).toFixed(2)} / kg`} />
              </dl>

              <div className="mt-4 rounded-xl bg-texto p-4">
                <p className="text-2xs font-semibold uppercase tracking-wide text-superficie/70">
                  Importe del flete
                </p>
                <p className="num mt-1 text-2xl font-bold tracking-tight text-superficie">
                  {dinero(totales.importe)}
                </p>
                <p className="num mt-1 text-2xs text-superficie/70">
                  + IVA {dinero(Math.round(totales.importe * 0.16))} · total{' '}
                  {dinero(totales.importe + Math.round(totales.importe * 0.16))}
                </p>
              </div>

              <Boton
                variante="primario" className="mt-4 w-full" iconoIzq={<Send className="size-4" />}
                disabled={!listo} cargando={crear.isPending} onClick={guardar}
              >
                Crear cotización
              </Boton>

              {!listo && (
                <p className="mt-2 text-center text-2xs text-texto-tenue">
                  {!elegida ? 'Elige un cliente para continuar.' : 'Captura al menos el largo y el ancho de una tarima.'}
                </p>
              )}
            </CuerpoPanel>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Fila({ termino, valor, truncar }: { termino: string; valor: string; truncar?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-texto-tenue">{termino}</dt>
      <dd className={cx('text-right text-texto', truncar && 'truncate')}>{valor}</dd>
    </div>
  );
}
