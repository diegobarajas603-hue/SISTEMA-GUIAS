import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, FileText } from 'lucide-react';
import { usarCotizaciones, type FiltrosCotizacion } from '@/lib/consultas/cotizaciones';
import { Campo, Selector } from '@/componentes/ui/Campo';
import { Boton } from '@/componentes/ui/Boton';
import { Insignia } from '@/componentes/ui/Insignia';
import { EsqueletoTabla } from '@/componentes/ui/Esqueleto';
import { Vacio } from '@/componentes/ui/Vacio';
import { TarjetaKPI } from '@/componentes/ui/TarjetaKPI';
import { useDespacio } from '@/lib/hooks';
import { dinero, fechaCorta } from '@/lib/formato';
import { ESTADO_COTIZACION_COLOR, ESTADO_COTIZACION_TEXTO } from '@/lib/constantes';
import { ModalNuevaCotizacion } from './ModalNuevaCotizacion';

export default function PaginaCotizaciones() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const buscadoDespacio = useDespacio(busqueda);

  const filtros: FiltrosCotizacion = { q: buscadoDespacio || undefined, estado: estado || undefined, limite: 60 };
  const { data, isLoading } = usarCotizaciones(filtros);
  const cotizaciones = data?.filas ?? [];
  const resumen = data?.resumen ?? [];

  const totalPor = (e: string) => resumen.find((r) => r.estado === e)?.monto ?? 0;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-texto">Cotizaciones</h1>
          <p className="text-sm text-texto-tenue">{data?.total ?? 0} en total</p>
        </div>
        <Boton variante="primario" iconoIzq={<Plus className="size-4" />} onClick={() => setNuevoAbierto(true)}>Nueva cotización</Boton>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TarjetaKPI etiqueta="Enviadas" valor={totalPor('enviada') + totalPor('vista')} formato={dinero} acento="marca" />
        <TarjetaKPI etiqueta="Vistas" valor={totalPor('vista')} formato={dinero} acento="ia" />
        <TarjetaKPI etiqueta="Aceptadas" valor={totalPor('aceptada')} formato={dinero} acento="exito" />
        <TarjetaKPI etiqueta="Rechazadas" valor={totalPor('rechazada')} formato={dinero} acento="peligro" />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Campo iconoIzq={<Search className="size-3.5" />} placeholder="Buscar por folio o cuenta…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-64" />
        <Selector value={estado} onChange={(e) => setEstado(e.target.value)} className="w-40">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_COTIZACION_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
      </div>

      {isLoading ? (
        <EsqueletoTabla filas={8} columnas={6} />
      ) : cotizaciones.length === 0 ? (
        <Vacio icono={<FileText className="size-5" />} titulo="Sin cotizaciones" accion={<Boton variante="primario" onClick={() => setNuevoAbierto(true)}>Nueva cotización</Boton>} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-borde bg-superficie">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde bg-superficie-2 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">
                <th className="px-4 py-2.5 text-left">Folio</th><th className="px-4 py-2.5 text-left">Cuenta</th>
                <th className="px-4 py-2.5 text-left">Estado</th><th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-left">Válida hasta</th><th className="px-4 py-2.5 text-left">Creada</th>
              </tr>
            </thead>
            <tbody>
              {cotizaciones.map((c) => (
                <tr key={c.id} onClick={() => navegar(`/cotizaciones/${c.id}`)} className="fila-hover cursor-pointer border-b border-borde last:border-0">
                  <td className="px-4 py-2.5 font-medium text-texto">{c.folio}</td>
                  <td className="px-4 py-2.5 text-texto-secundario">{c.cuenta_comercial || c.cuenta_nombre}</td>
                  <td className="px-4 py-2.5"><Insignia color={c.estado === 'aceptada' ? 'exito' : c.estado === 'rechazada' || c.estado === 'vencida' ? 'peligro' : c.estado === 'vista' ? 'ia' : 'gris'}>{ESTADO_COTIZACION_TEXTO[c.estado]}</Insignia></td>
                  <td className="num px-4 py-2.5 text-right font-semibold" style={{ color: ESTADO_COTIZACION_COLOR[c.estado] }}>{dinero(c.total)}</td>
                  <td className="px-4 py-2.5 text-texto-tenue">{fechaCorta(c.valida_hasta)}</td>
                  <td className="px-4 py-2.5 text-texto-tenue">{fechaCorta(c.creado_en)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalNuevaCotizacion
        abierto={nuevoAbierto} onCerrar={() => setNuevoAbierto(false)}
        oportunidadId={params.get('oportunidad') ? Number(params.get('oportunidad')) : undefined}
        onCreada={(id) => navegar(`/cotizaciones/${id}`)}
      />
    </div>
  );
}
