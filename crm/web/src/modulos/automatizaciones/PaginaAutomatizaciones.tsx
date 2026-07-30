import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Workflow, Play, Clock, AlertTriangle, CheckCircle2, Trash2, PenLine } from 'lucide-react';
import {
  usarAutomatizaciones, usarMetricasAutomatizaciones, usarEjecucionesRecientes,
  usarAlternarAutomatizacion, usarCrearAutomatizacion, usarEliminarAutomatizacion,
} from '@/lib/consultas/automatizaciones';
import { TarjetaKPI } from '@/componentes/ui/TarjetaKPI';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Boton, BotonIcono } from '@/componentes/ui/Boton';
import { Insignia, InsigniaIA } from '@/componentes/ui/Insignia';
import { Interruptor } from '@/componentes/ui/Interruptor';
import { Modal } from '@/componentes/ui/Modal';
import { Campo, AreaTexto, Selector } from '@/componentes/ui/Campo';
import { Vacio } from '@/componentes/ui/Vacio';
import { Cargando } from '@/componentes/ui/Cargando';
import { Tooltip } from '@/componentes/ui/Tooltip';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { numero, relativo } from '@/lib/formato';
import { cx } from '@/lib/utilidades';
import { EVENTOS_DISPARADOR, ESTADO_EJECUCION } from './constantes';
import type { Automatizacion, EjecucionFlujo } from '@/lib/tipos';

export default function PaginaAutomatizaciones() {
  const { data: flujos, isLoading } = usarAutomatizaciones();
  const { data: metricas } = usarMetricasAutomatizaciones();
  const { data: ejecuciones } = usarEjecucionesRecientes();
  const [nuevoAbierto, setNuevoAbierto] = useState(false);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-texto">Automatizaciones</h1>
          <p className="text-sm text-texto-tenue">Flujos visuales que trabajan cuando tú no estás</p>
        </div>
        <Boton variante="primario" iconoIzq={<Plus className="size-4" />} onClick={() => setNuevoAbierto(true)}>
          Nuevo flujo
        </Boton>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaKPI etiqueta="Flujos activos" valor={metricas?.activas ?? 0} formato={numero} acento="exito"
          extra={<span className="text-2xs text-texto-tenue">de {metricas?.totales ?? 0} creados</span>} />
        <TarjetaKPI etiqueta="Corridas esta semana" valor={metricas?.ejecuciones_semana ?? 0} formato={numero} acento="marca" />
        <TarjetaKPI etiqueta="Tareas generadas" valor={metricas?.tareas_generadas ?? 0} formato={numero} acento="ia"
          extra={<span className="text-2xs text-texto-tenue">{numero(metricas?.tareas_ia ?? 0)} por IA</span>} />
        <TarjetaKPI etiqueta="En espera" valor={metricas?.en_espera ?? 0} formato={numero} acento="alerta"
          extra={<span className="text-2xs text-texto-tenue">{numero(metricas?.fallos ?? 0)} con error</span>} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {isLoading ? (
            <Cargando etiqueta="Cargando flujos…" className="py-24" />
          ) : !flujos?.length ? (
            <Vacio icono={<Workflow className="size-5" />} titulo="Todavía no hay flujos"
              descripcion="Un flujo encadena disparador, condiciones e acciones. Empieza por uno sencillo."
              accion={<Boton variante="primario" onClick={() => setNuevoAbierto(true)}>Crear el primero</Boton>} />
          ) : (
            flujos.map((f, i) => <FilaFlujo key={f.id} flujo={f} indice={i} />)
          )}
        </div>

        <Panel className="h-fit">
          <EncabezadoPanel titulo="Actividad reciente" subtitulo="Últimas corridas" />
          <CuerpoPanel className="max-h-[560px] overflow-y-auto">
            {!ejecuciones?.length ? (
              <p className="py-6 text-center text-sm text-texto-tenue">Sin corridas registradas.</p>
            ) : (
              <ul className="space-y-1.5">
                {ejecuciones.map((e) => <FilaEjecucion key={e.id} ejecucion={e} />)}
              </ul>
            )}
          </CuerpoPanel>
        </Panel>
      </div>

      <ModalNuevoFlujo abierto={nuevoAbierto} onCerrar={() => setNuevoAbierto(false)} />
    </div>
  );
}

function FilaFlujo({ flujo, indice }: { flujo: Automatizacion; indice: number }) {
  const alternar = usarAlternarAutomatizacion();
  const eliminar = usarEliminarAutomatizacion();
  const { avisar } = useAvisos();
  const [confirmar, setConfirmar] = useState(false);

  const evento = EVENTOS_DISPARADOR.find((e) => e.valor === flujo.evento);
  const corridas = flujo.ejecuciones ?? 0;
  const tasaExito = corridas > 0 ? Math.round((flujo.exitos / corridas) * 100) : null;
  const nodosIA = flujo.nodos?.filter((n) => n.tipo.startsWith('ia_')).length ?? 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: indice * 0.04, duration: 0.25 }}>
      <Panel interactivo className={cx('p-4', !flujo.activa && 'opacity-70')}>
        <div className="flex items-start gap-3">
          <span className={cx(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            flujo.activa ? 'bg-exito-50 text-exito-600' : 'bg-superficie-2 text-texto-tenue',
          )}>
            <Workflow className="size-4" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/automatizaciones/${flujo.id}`} className="truncate text-sm font-semibold text-texto hover:text-marca-600">
                {flujo.nombre}
              </Link>
              {nodosIA > 0 && <InsigniaIA>{nodosIA} paso{nodosIA > 1 ? 's' : ''} IA</InsigniaIA>}
              {(flujo.en_espera ?? 0) > 0 && (
                <Insignia color="alerta" icono={<Clock className="size-3" />}>{flujo.en_espera} en espera</Insignia>
              )}
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs text-texto-tenue">
              {evento?.titulo ?? flujo.evento} · {flujo.nodos?.length ?? 0} pasos
              {flujo.descripcion ? ` · ${flujo.descripcion}` : ''}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-texto-tenue">
              <span className="num">{numero(corridas)} corridas</span>
              {tasaExito !== null && (
                <span className={cx('num inline-flex items-center gap-1', tasaExito >= 90 ? 'text-exito-600' : tasaExito >= 70 ? 'text-alerta-600' : 'text-peligro-500')}>
                  <CheckCircle2 className="size-3" />{tasaExito}% éxito
                </span>
              )}
              {flujo.fallos > 0 && (
                <span className="num inline-flex items-center gap-1 text-peligro-500">
                  <AlertTriangle className="size-3" />{flujo.fallos} fallo{flujo.fallos > 1 ? 's' : ''}
                </span>
              )}
              {flujo.ultimo_run_en && <span>Última: {relativo(flujo.ultimo_run_en)}</span>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Tooltip contenido={flujo.activa ? 'Desactivar flujo' : 'Activar flujo'}>
              <span>
                <Interruptor activo={flujo.activa} etiqueta={`Activar ${flujo.nombre}`}
                  deshabilitado={alternar.isPending}
                  onCambiar={(v) => alternar.mutate({ id: flujo.id, activa: v }, {
                    onSuccess: () => avisar({ tipo: 'exito', titulo: v ? 'Flujo activado' : 'Flujo pausado' }),
                  })} />
              </span>
            </Tooltip>
            <Link to={`/automatizaciones/${flujo.id}`}>
              <BotonIcono etiqueta="Editar flujo" tamano="sm"><PenLine className="size-3.5" /></BotonIcono>
            </Link>
            <BotonIcono etiqueta="Eliminar flujo" tamano="sm" onClick={() => setConfirmar(true)}>
              <Trash2 className="size-3.5" />
            </BotonIcono>
          </div>
        </div>
      </Panel>

      <Modal abierto={confirmar} onCerrar={() => setConfirmar(false)} titulo="Eliminar flujo" ancho="sm"
        pie={<>
          <Boton variante="secundario" onClick={() => setConfirmar(false)}>Cancelar</Boton>
          <Boton variante="peligro" cargando={eliminar.isPending}
            onClick={() => eliminar.mutate(flujo.id, {
              onSuccess: () => { avisar({ tipo: 'exito', titulo: 'Flujo eliminado' }); setConfirmar(false); },
            })}>Eliminar</Boton>
        </>}>
        <p className="text-sm text-texto-secundario">
          Se eliminará «{flujo.nombre}» y su historial de {numero(corridas)} corridas. No se puede deshacer.
        </p>
      </Modal>
    </motion.div>
  );
}

function FilaEjecucion({ ejecucion }: { ejecucion: EjecucionFlujo }) {
  const est = ESTADO_EJECUCION[ejecucion.estado] ?? ESTADO_EJECUCION.ok;
  return (
    <li className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-superficie-2">
      <span className={cx('mt-1 size-1.5 shrink-0 rounded-full', est.punto)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-texto">{ejecucion.automatizacion ?? `Flujo #${ejecucion.automatizacion_id}`}</p>
        <p className="truncate text-2xs text-texto-tenue">
          {est.titulo} · {ejecucion.pasos?.length ?? 0} pasos · {ejecucion.duracion_ms} ms
        </p>
        {ejecucion.error && <p className="mt-0.5 line-clamp-2 text-2xs text-peligro-500">{ejecucion.error}</p>}
      </div>
      <span className="shrink-0 text-2xs text-texto-tenue">{relativo(ejecucion.creado_en)}</span>
    </li>
  );
}

function ModalNuevoFlujo({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [form, setForm] = useState({ nombre: '', descripcion: '', evento: 'lead.creado' });
  const crear = usarCrearAutomatizacion();
  const navegar = useNavigate();
  const { avisar } = useAvisos();

  function confirmar() {
    if (!form.nombre.trim()) return;
    // Un flujo nuevo nace con su disparador ya colocado: el lienzo vacío obliga a
    // adivinar por dónde se empieza y el backend rechaza guardar sin disparador.
    crear.mutate({
      ...form,
      activa: false,
      nodos: [{ id: 'disparador', tipo: 'disparador', titulo: 'Disparador', x: 80, y: 160, config: { evento: form.evento } }],
      aristas: [],
    }, {
      onSuccess: (flujo) => {
        avisar({ tipo: 'exito', titulo: 'Flujo creado', cuerpo: 'Arma el resto en el editor visual.' });
        onCerrar();
        setForm({ nombre: '', descripcion: '', evento: 'lead.creado' });
        navegar(`/automatizaciones/${flujo.id}`);
      },
    });
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nuevo flujo"
      pie={<>
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" cargando={crear.isPending} disabled={!form.nombre.trim()} iconoIzq={<Play className="size-4" />} onClick={confirmar}>
          Crear y abrir editor
        </Boton>
      </>}>
      <div className="space-y-3">
        <Campo etiqueta="Nombre" requerido placeholder="Reactivar oportunidades estancadas"
          value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
        <Selector etiqueta="¿Cuándo debe correr?" value={form.evento}
          onChange={(e) => setForm((f) => ({ ...f, evento: e.target.value }))}>
          {EVENTOS_DISPARADOR.map((ev) => <option key={ev.valor} value={ev.valor}>{ev.titulo}</option>)}
        </Selector>
        <AreaTexto etiqueta="Descripción" rows={2} placeholder="Qué resuelve este flujo y para quién."
          value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
      </div>
    </Modal>
  );
}
