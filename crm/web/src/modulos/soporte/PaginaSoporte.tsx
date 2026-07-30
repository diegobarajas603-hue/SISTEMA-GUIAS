import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, Search, BookOpen, Plus } from 'lucide-react';
import { usarTickets, usarMetricasTickets, type FiltrosTicket } from '@/lib/consultas/tickets';
import { TarjetaKPI } from '@/componentes/ui/TarjetaKPI';
import { Campo, Selector } from '@/componentes/ui/Campo';
import { Boton } from '@/componentes/ui/Boton';
import { Insignia } from '@/componentes/ui/Insignia';
import { EsqueletoTabla } from '@/componentes/ui/Esqueleto';
import { Vacio } from '@/componentes/ui/Vacio';
import { Avatar } from '@/componentes/ui/Avatar';
import { useDespacio } from '@/lib/hooks';
import { relativo } from '@/lib/formato';
import { ESTADO_TICKET_COLOR, ESTADO_TICKET_TEXTO, PRIORIDAD_TICKET_COLOR, PRIORIDAD_TICKET_TEXTO } from '@/lib/constantes';
import { ModalNuevoTicket } from './ModalNuevoTicket';

export default function PaginaSoporte() {
  const navegar = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [prioridad, setPrioridad] = useState('');
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const buscadoDespacio = useDespacio(busqueda);

  const filtros: FiltrosTicket = { q: buscadoDespacio || undefined, estado: estado || undefined, prioridad: prioridad || undefined, limite: 60 };
  const { data, isLoading } = usarTickets(filtros);
  const { data: metricas } = usarMetricasTickets();
  const tickets = data?.filas ?? [];

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-texto">Atención al cliente</h1>
          <p className="text-sm text-texto-tenue">{data?.total ?? 0} tickets</p>
        </div>
        <div className="flex gap-2">
          <Boton variante="secundario" iconoIzq={<BookOpen className="size-4" />} onClick={() => navegar('/soporte/conocimiento')}>Base de conocimiento</Boton>
          <Boton variante="primario" iconoIzq={<Plus className="size-4" />} onClick={() => setNuevoAbierto(true)}>Nuevo ticket</Boton>
        </div>
      </div>

      {metricas && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <TarjetaKPI etiqueta="Abiertos" valor={metricas.abiertos} formato={(n) => String(n)} acento="marca" />
          <TarjetaKPI etiqueta="SLA incumplido" valor={metricas.sla_incumplido} formato={(n) => String(n)} acento="peligro" />
          <TarjetaKPI etiqueta="Urgentes" valor={metricas.urgentes} formato={(n) => String(n)} acento="alerta" />
          <TarjetaKPI etiqueta="Cumplimiento SLA" valor={metricas.cumplimiento_sla ?? 0} formato={(n) => `${n}%`} acento="exito" />
          <TarjetaKPI etiqueta="CSAT" valor={metricas.csat ?? 0} formato={(n) => `${n.toFixed(1)}/5`} acento="ia" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <Campo iconoIzq={<Search className="size-3.5" />} placeholder="Buscar por asunto, folio, guía…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-64" />
        <Selector value={estado} onChange={(e) => setEstado(e.target.value)} className="w-36">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_TICKET_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <Selector value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="w-32">
          <option value="">Prioridad</option>
          {Object.entries(PRIORIDAD_TICKET_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
      </div>

      {isLoading ? (
        <EsqueletoTabla filas={8} columnas={6} />
      ) : tickets.length === 0 ? (
        <Vacio icono={<LifeBuoy className="size-5" />} titulo="Sin tickets" accion={<Boton variante="primario" onClick={() => setNuevoAbierto(true)}>Nuevo ticket</Boton>} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-borde bg-superficie">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde bg-superficie-2 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">
                <th className="px-4 py-2.5 text-left">Folio</th><th className="px-4 py-2.5 text-left">Asunto</th>
                <th className="px-4 py-2.5 text-left">Cuenta</th><th className="px-4 py-2.5 text-left">Prioridad</th>
                <th className="px-4 py-2.5 text-left">Estado</th><th className="px-4 py-2.5 text-left">SLA</th>
                <th className="px-4 py-2.5 text-left">Asignado</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} onClick={() => navegar(`/soporte/${t.id}`)} className="fila-hover cursor-pointer border-b border-borde last:border-0">
                  <td className="px-4 py-2.5 font-medium text-texto">{t.folio}</td>
                  <td className="max-w-64 truncate px-4 py-2.5 text-texto-secundario">{t.asunto}</td>
                  <td className="px-4 py-2.5 text-texto-secundario">{t.cuenta_comercial || t.cuenta_nombre || '—'}</td>
                  <td className="px-4 py-2.5"><span className="text-xs font-semibold" style={{ color: PRIORIDAD_TICKET_COLOR[t.prioridad] }}>{PRIORIDAD_TICKET_TEXTO[t.prioridad]}</span></td>
                  <td className="px-4 py-2.5"><Insignia color={t.estado === 'resuelto' || t.estado === 'cerrado' ? 'exito' : t.sla_incumplido ? 'peligro' : 'marca'}>{ESTADO_TICKET_TEXTO[t.estado]}</Insignia></td>
                  <td className="px-4 py-2.5">
                    {t.sla_incumplido ? <span className="text-2xs font-semibold text-peligro-500">Vencido</span>
                      : <span className="text-2xs text-texto-tenue" style={{ color: ESTADO_TICKET_COLOR[t.estado] }}>{relativo(t.sla_vence_en)}</span>}
                  </td>
                  <td className="px-4 py-2.5">{t.asignado_nombre ? <Avatar nombre={t.asignado_nombre} tono={t.asignado_tono} tamano="xs" /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalNuevoTicket abierto={nuevoAbierto} onCerrar={() => setNuevoAbierto(false)} onCreado={(id) => navegar(`/soporte/${id}`)} />
    </div>
  );
}
