import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users, UserPlus, AlertTriangle, XCircle, Copy, SkipForward, RefreshCw,
  FilePlus2, SlidersHorizontal, Search, UserX,
} from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Insignia } from '@/componentes/ui/Insignia';
import { Campo } from '@/componentes/ui/Campo';
import { Segmentado } from '@/componentes/ui/Segmentado';
import { cx } from '@/lib/utilidades';
import { Aviso } from './PasoMapeo';
import type { AnalisisPrevio } from '@/lib/consultas/importacion';
import type { EstrategiaDuplicado, ResumenAgrupado } from './tipos';
import type { EstrategiaGlobal } from './usarImportador';

const ESTRATEGIAS: Array<{
  valor: EstrategiaGlobal; titulo: string; detalle: string; icono: typeof SkipForward;
}> = [
  { valor: 'omitir', titulo: 'Omitir', detalle: 'Deja intacto el cliente que ya existe y no importa esa fila.', icono: SkipForward },
  { valor: 'actualizar', titulo: 'Actualizar', detalle: 'Completa el registro existente con lo que traiga el archivo. Lo que no venga no se borra.', icono: RefreshCw },
  { valor: 'crear_nuevo', titulo: 'Crear como nuevo', detalle: 'Da de alta un registro aparte aunque comparta RFC o nombre.', icono: FilePlus2 },
  { valor: 'caso_por_caso', titulo: 'Caso por caso', detalle: 'Tú decides uno por uno en la lista de abajo.', icono: SlidersHorizontal },
];

interface Props {
  resumen: ResumenAgrupado;
  previo: AnalisisPrevio | null;
  estrategia: EstrategiaGlobal;
  onEstrategia: (e: EstrategiaGlobal) => void;
  decisiones: Record<string, EstrategiaDuplicado>;
  onDecisiones: (d: Record<string, EstrategiaDuplicado>) => void;
}

export function PasoRevision({ resumen, previo, estrategia, onEstrategia, decisiones, onDecisiones }: Props) {
  const [pestana, setPestana] = useState('duplicados');
  const [busqueda, setBusqueda] = useState('');

  const duplicados = previo?.duplicados ?? [];
  const nuevos = resumen.totalClientes - duplicados.length;

  const problemasFiltrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return resumen.problemas;
    return resumen.problemas.filter(
      (p) => p.mensaje.toLowerCase().includes(t) || (p.nombre ?? '').toLowerCase().includes(t),
    );
  }, [resumen.problemas, busqueda]);

  const duplicadosFiltrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return duplicados;
    return duplicados.filter(
      (d) => d.nombre.toLowerCase().includes(t) || d.cuenta_nombre.toLowerCase().includes(t),
    );
  }, [duplicados, busqueda]);

  const decidir = (llave: string, v: EstrategiaDuplicado) => onDecisiones({ ...decisiones, [llave]: v });
  const decidirTodos = (v: EstrategiaDuplicado) =>
    onDecisiones(Object.fromEntries(duplicados.map((d) => [d.llave, v])));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tarjeta etiqueta="Clientes a importar" valor={resumen.totalClientes} icono={Users} acento="marca" />
        <Tarjeta etiqueta="Nuevos" valor={nuevos} icono={UserPlus} acento="exito" />
        <Tarjeta etiqueta="Ya existen" valor={duplicados.length} icono={Copy} acento="alerta" />
        <Tarjeta etiqueta="Contactos" valor={resumen.totalContactos} icono={Users} acento="ia" />
        <Tarjeta etiqueta="Filas rechazadas" valor={resumen.conError} icono={XCircle} acento="peligro" />
      </div>

      {resumen.filasFusionadas > 0 && (
        <Aviso tono="exito" icono={<Users className="size-4" />}>
          {resumen.filasFusionadas.toLocaleString('es-MX')} filas comparten cliente con otra.
          Se agruparon en <strong>{resumen.totalClientes.toLocaleString('es-MX')} clientes</strong> con
          varios contactos cada uno, en lugar de crear registros repetidos.
        </Aviso>
      )}
      {(previo?.ejecutivosDesconocidos.length ?? 0) > 0 && (
        <Aviso tono="alerta" icono={<UserX className="size-4" />}>
          <strong>{previo!.ejecutivosDesconocidos.length} ejecutivos</strong> del archivo no existen
          en el CRM. Esos clientes se importarán sin asignar y podrás repartirlos después.
          <span className="mt-1 block text-2xs opacity-90">
            {previo!.ejecutivosDesconocidos.slice(0, 3).map((t) => t.replace(/^El ejecutivo /, '').split('»')[0] + '»').join(' · ')}
            {previo!.ejecutivosDesconocidos.length > 3 && ` y ${previo!.ejecutivosDesconocidos.length - 3} más`}
          </span>
        </Aviso>
      )}
      {resumen.conError > 0 && (
        <Aviso tono="peligro" icono={<AlertTriangle className="size-4" />}>
          {resumen.conError.toLocaleString('es-MX')} filas no se pueden importar porque les falta el
          nombre del cliente. El resto sí se importa: la carga no se detiene por ellas.
        </Aviso>
      )}

      {duplicados.length > 0 && (
        <Panel>
          <EncabezadoPanel
            titulo="Clientes que ya existen"
            subtitulo={`¿Qué hacemos con los ${duplicados.length} que ya están en el CRM?`}
          />
          <CuerpoPanel>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ESTRATEGIAS.map((e) => {
                const activa = estrategia === e.valor;
                return (
                  <button
                    key={e.valor} onClick={() => onEstrategia(e.valor)}
                    aria-pressed={activa}
                    className={cx(
                      'flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all duration-150',
                      activa
                        ? 'border-marca-500 bg-marca-50 shadow-2'
                        : 'border-borde bg-superficie hover:border-borde-fuerte hover:shadow-2',
                    )}
                  >
                    <span className={cx('flex size-7 items-center justify-center rounded-lg',
                      activa ? 'bg-marca-500 text-white' : 'bg-superficie-2 text-texto-secundario')}>
                      <e.icono className="size-3.5" />
                    </span>
                    <span className={cx('text-sm font-semibold', activa ? 'text-marca-700' : 'text-texto')}>
                      {e.titulo}
                    </span>
                    <span className="text-2xs leading-relaxed text-texto-tenue">{e.detalle}</span>
                  </button>
                );
              })}
            </div>
          </CuerpoPanel>
        </Panel>
      )}

      <Panel>
        <EncabezadoPanel
          titulo="Detalle"
          acciones={
            <div className="flex items-center gap-2">
              <Campo
                iconoIzq={<Search className="size-3.5" />} placeholder="Buscar…"
                value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-40"
              />
              <Segmentado
                opciones={[
                  { valor: 'duplicados', etiqueta: `Duplicados (${duplicados.length})` },
                  { valor: 'avisos', etiqueta: `Avisos (${resumen.conAviso})` },
                ]}
                valor={pestana} onCambiar={setPestana}
              />
            </div>
          }
        />
        <CuerpoPanel className="px-0 pb-0">
          {pestana === 'duplicados' ? (
            duplicados.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-texto-tenue">
                Ningún cliente del archivo existe todavía en el CRM.
              </p>
            ) : (
              <>
                {estrategia === 'caso_por_caso' && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-borde px-5 pb-3">
                    <span className="text-2xs font-medium uppercase tracking-wide text-texto-tenue">Aplicar a todos:</span>
                    {(['omitir', 'actualizar', 'crear_nuevo'] as EstrategiaDuplicado[]).map((v) => (
                      <button key={v} onClick={() => decidirTodos(v)}
                        className="rounded-pildora border border-borde px-2 py-0.5 text-2xs text-texto-secundario hover:border-marca-500 hover:text-marca-600">
                        {ESTRATEGIAS.find((e) => e.valor === v)?.titulo}
                      </button>
                    ))}
                  </div>
                )}
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-superficie">
                      <tr className="border-b border-borde text-2xs uppercase text-texto-tenue">
                        <th className="px-5 py-2 text-left">En tu archivo</th>
                        <th className="px-3 py-2 text-left">Ya en el CRM</th>
                        <th className="px-3 py-2 text-left">Coincide por</th>
                        {estrategia === 'caso_por_caso' && <th className="px-5 py-2 text-right">Decisión</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {duplicadosFiltrados.map((d) => (
                        <tr key={d.llave} className="border-b border-borde last:border-0 hover:bg-superficie-2">
                          <td className="max-w-[240px] truncate px-5 py-2 text-texto">{d.nombre}</td>
                          <td className="max-w-[240px] truncate px-3 py-2 text-texto-secundario">{d.cuenta_nombre}</td>
                          <td className="px-3 py-2">
                            <Insignia color={d.motivo === 'rfc' ? 'marca' : 'gris'}>
                              {d.motivo === 'rfc' ? `RFC ${d.cuenta_rfc ?? ''}` : 'Nombre'}
                            </Insignia>
                          </td>
                          {estrategia === 'caso_por_caso' && (
                            <td className="px-5 py-2 text-right">
                              <select
                                value={decisiones[d.llave] ?? 'omitir'}
                                onChange={(e) => decidir(d.llave, e.target.value as EstrategiaDuplicado)}
                                aria-label={`Decisión para ${d.nombre}`}
                                className="h-7 rounded-lg border border-borde bg-superficie px-2 text-xs text-texto focus:border-marca-500 focus:outline-none"
                              >
                                <option value="omitir">Omitir</option>
                                <option value="actualizar">Actualizar</option>
                                <option value="crear_nuevo">Crear nuevo</option>
                              </select>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          ) : (
            resumen.problemas.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-texto-tenue">
                Ninguna celda necesitó corrección. El archivo viene impecable.
              </p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-superficie">
                    <tr className="border-b border-borde text-2xs uppercase text-texto-tenue">
                      <th className="px-5 py-2 text-left">Fila</th>
                      <th className="px-3 py-2 text-left">Cliente</th>
                      <th className="px-3 py-2 text-left">Qué pasó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problemasFiltrados.map((p, i) => (
                      <tr key={`${p.llave}-${i}`} className="border-b border-borde last:border-0 hover:bg-superficie-2">
                        <td className="px-5 py-2 text-texto-tenue">{p.fila}</td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-texto">{p.nombre ?? '—'}</td>
                        <td className="px-3 py-2">
                          <span className={cx('inline-flex items-start gap-1.5',
                            p.nivel === 'error' ? 'text-peligro-500' : 'text-alerta-600')}>
                            {p.nivel === 'error'
                              ? <XCircle className="mt-px size-3.5 shrink-0" />
                              : <AlertTriangle className="mt-px size-3.5 shrink-0" />}
                            {p.mensaje}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {resumen.conAviso + resumen.conError > resumen.problemas.length && (
                  <p className="border-t border-borde px-5 py-2.5 text-2xs text-texto-tenue">
                    Se muestran los primeros {resumen.problemas.length}. Al terminar podrás descargar
                    el detalle completo en Excel.
                  </p>
                )}
              </div>
            )
          )}
        </CuerpoPanel>
      </Panel>
    </div>
  );
}

function Tarjeta({ etiqueta, valor, icono: Icono, acento }: {
  etiqueta: string; valor: number; icono: typeof Users;
  acento: 'marca' | 'exito' | 'alerta' | 'peligro' | 'ia';
}) {
  const tono = {
    marca: 'bg-marca-50 text-marca-600', exito: 'bg-exito-50 text-exito-600',
    alerta: 'bg-alerta-50 text-alerta-600', peligro: 'bg-peligro-50 text-peligro-500',
    ia: 'bg-ia-50 text-ia-600',
  }[acento];
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-borde bg-superficie p-3.5">
      <span className={cx('flex size-7 items-center justify-center rounded-lg', tono)}>
        <Icono className="size-3.5" />
      </span>
      <p className="num mt-2 text-xl font-bold tracking-tight text-texto">{valor.toLocaleString('es-MX')}</p>
      <p className="text-2xs text-texto-tenue">{etiqueta}</p>
    </motion.div>
  );
}
