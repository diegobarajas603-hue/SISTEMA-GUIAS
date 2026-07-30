import { useNavigate } from 'react-router-dom';
import { Megaphone, TrendingUp } from 'lucide-react';
import { usarPanoramaMarketing, usarCampanas } from '@/lib/consultas/marketing';
import { TarjetaKPI } from '@/componentes/ui/TarjetaKPI';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { GraficaArea } from '@/componentes/graficas/GraficaArea';
import { GraficaBarras } from '@/componentes/graficas/GraficaBarras';
import { Insignia } from '@/componentes/ui/Insignia';
import { Vacio } from '@/componentes/ui/Vacio';
import { Cargando } from '@/componentes/ui/Cargando';
import { dinero, numero, porcentaje } from '@/lib/formato';

export default function PaginaMarketing() {
  const navegar = useNavigate();
  const { data: panorama, isLoading } = usarPanoramaMarketing();
  const { data: campanas } = usarCampanas();

  if (isLoading || !panorama) return <Cargando etiqueta="Cargando marketing…" className="py-24" />;

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-texto">Marketing</h1>
        <p className="text-sm text-texto-tenue">Campañas, atribución y generación de demanda</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TarjetaKPI etiqueta="Campañas activas" valor={panorama.resumen.activas} formato={numero} acento="marca" />
        <TarjetaKPI etiqueta="Inversión (12 m)" valor={panorama.resumen.inversion_ano} formato={dinero} acento="alerta" />
        <TarjetaKPI etiqueta="Leads este mes" valor={panorama.resumen.leads_mes} formato={numero} acento="ia" />
        <TarjetaKPI etiqueta="Ingresos atribuidos" valor={panorama.resumen.ingresos_atribuidos} formato={dinero} acento="exito" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <EncabezadoPanel titulo="Generación de leads" subtitulo="Últimos 12 meses · de campaña vs. orgánico" />
          <CuerpoPanel>
            <GraficaArea
              datos={panorama.serieLeads.map((s) => ({ etiqueta: s.mes.slice(5), valor: s.leads, secundario: s.de_campana }))}
              formatoY={numero} etiquetaSecundaria="de campaña"
            />
          </CuerpoPanel>
        </Panel>

        <Panel>
          <EncabezadoPanel titulo="Por origen" />
          <CuerpoPanel>
            <GraficaBarras horizontal formato={numero} datos={panorama.porOrigen.slice(0, 6).map((o) => ({ etiqueta: o.valor, valor: o.leads }))} />
          </CuerpoPanel>
        </Panel>
      </div>

      <Panel>
        <EncabezadoPanel titulo="Campañas" subtitulo="ROI calculado en vivo, no almacenado" />
        <CuerpoPanel>
          {!campanas?.length ? <Vacio icono={<Megaphone className="size-5" />} titulo="Sin campañas" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borde text-2xs uppercase text-texto-tenue">
                    <th className="py-2 text-left">Campaña</th><th className="py-2 text-left">Estado</th>
                    <th className="py-2 text-right">Costo</th><th className="py-2 text-right">Leads</th>
                    <th className="py-2 text-right">Ganadas</th><th className="py-2 text-right">Ingresos</th><th className="py-2 text-right">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {campanas.map((c) => (
                    <tr key={c.id} onClick={() => navegar(`/marketing/campanas/${c.id}`)} className="fila-hover cursor-pointer border-b border-borde last:border-0">
                      <td className="py-2 font-medium text-texto">{c.nombre}</td>
                      <td className="py-2"><Insignia color={c.estado === 'activa' ? 'exito' : 'gris'}>{c.estado}</Insignia></td>
                      <td className="num py-2 text-right text-texto-secundario">{dinero(c.costo)}</td>
                      <td className="num py-2 text-right">{c.leads}</td>
                      <td className="num py-2 text-right">{c.ganadas}</td>
                      <td className="num py-2 text-right font-medium">{dinero(c.ingresos)}</td>
                      <td className="num py-2 text-right font-semibold">
                        {c.roi !== null ? (
                          <span className={c.roi >= 0 ? 'text-exito-600' : 'text-peligro-500'}>
                            {c.roi >= 0 && <TrendingUp className="mr-0.5 inline size-3" />}{porcentaje(c.roi)}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CuerpoPanel>
      </Panel>
    </div>
  );
}
