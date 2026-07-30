import { useState } from 'react';
import { Download, TrendingUp, TrendingDown } from 'lucide-react';
import { usarReportes, urlExportar } from '@/lib/consultas/reportes';
import { TarjetaKPI } from '@/componentes/ui/TarjetaKPI';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { GraficaArea } from '@/componentes/graficas/GraficaArea';
import { GraficaBarras } from '@/componentes/graficas/GraficaBarras';
import { Embudo } from '@/componentes/graficas/Embudo';
import { MapaCalor } from '@/componentes/graficas/MapaCalor';
import { Avatar } from '@/componentes/ui/Avatar';
import { Progreso } from '@/componentes/ui/Progreso';
import { Cargando } from '@/componentes/ui/Cargando';
import { BotonIcono } from '@/componentes/ui/Boton';
import { Tooltip } from '@/componentes/ui/Tooltip';
import { dinero, dineroCompacto, numero, porcentaje } from '@/lib/formato';
import { ETAPAS_LEAD } from '@/lib/constantes';

export default function PaginaReportes() {
  const [meses, setMeses] = useState(12);
  const { data, isLoading } = usarReportes('auto', meses);

  if (isLoading || !data) return <Cargando etiqueta="Cargando reportes…" className="py-24" />;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-texto">Reportes</h1>
          <p className="text-sm text-texto-tenue">Analítica comercial interactiva</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} className="h-9 rounded-lg border border-borde bg-superficie px-3 text-sm">
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
            <option value={24}>Últimos 24 meses</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <TarjetaKPI etiqueta="Ingresos del mes" valor={data.kpis.ingresos_mes} formato={dinero} acento="marca" />
        <TarjetaKPI etiqueta="Pipeline abierto" valor={data.kpis.pipeline} formato={dinero} acento="ia" />
        <TarjetaKPI etiqueta="Conversión (12m)" valor={data.kpis.conversion ?? 0} formato={porcentaje} acento="exito" />
        <TarjetaKPI etiqueta="Ciclo de venta" valor={data.kpis.dias_ciclo ?? 0} formato={(n) => `${Math.round(n)} d`} acento="alerta" />
        <TarjetaKPI etiqueta="Ticket promedio" valor={data.kpis.ticket_promedio ?? 0} formato={dinero} acento="marca" />
      </div>

      <Panel>
        <EncabezadoPanel titulo="Ingresos vs. meta" subtitulo={`Últimos ${meses} meses`}
          acciones={<ExportarBoton reporte="ingresos" meses={meses} />} />
        <CuerpoPanel>
          <GraficaArea datos={data.ingresos.map((i) => ({ etiqueta: i.mes.slice(5), valor: i.ganado, secundario: i.meta }))} formatoY={dineroCompacto} etiquetaSecundaria="meta" />
        </CuerpoPanel>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <EncabezadoPanel titulo="Embudo con conversión real" />
          <CuerpoPanel><Embudo etapas={data.embudo} /></CuerpoPanel>
        </Panel>

        <Panel>
          <EncabezadoPanel titulo="Velocidad por etapa" subtitulo="Días promedio antes de avanzar" />
          <CuerpoPanel>
            <GraficaBarras horizontal formato={(n) => `${Math.round(n)} d`} datos={data.velocidad.map((v) => ({ etiqueta: ETAPAS_LEAD[v.etapa] ?? v.etapa, valor: v.dias_promedio }))} colorBase="var(--serie-2)" />
          </CuerpoPanel>
        </Panel>
      </div>

      <Panel>
        <EncabezadoPanel titulo="Vendedores" subtitulo="Últimos 3 meses" acciones={<ExportarBoton reporte="vendedores" meses={meses} />} />
        <CuerpoPanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-2xs uppercase text-texto-tenue">
                  <th className="py-2 text-left">Vendedor</th><th className="py-2 text-right">Ingresos</th>
                  <th className="py-2 text-right">Pipeline</th><th className="py-2 text-right">Conversión</th>
                  <th className="py-2 text-right">Ciclo</th><th className="py-2 text-left">Meta</th>
                </tr>
              </thead>
              <tbody>
                {data.vendedores.map((v) => (
                  <tr key={v.id} className="border-b border-borde last:border-0">
                    <td className="flex items-center gap-2 py-2.5"><Avatar nombre={v.nombre} tono={v.avatar_tono} tamano="xs" /> <span className="text-texto">{v.nombre}</span></td>
                    <td className="num py-2.5 text-right font-medium">{dinero(v.ingresos)}</td>
                    <td className="num py-2.5 text-right text-texto-secundario">{dinero(v.pipeline)}</td>
                    <td className="num py-2.5 text-right">{v.conversion !== null ? porcentaje(v.conversion) : '—'}</td>
                    <td className="num py-2.5 text-right text-texto-secundario">{v.dias_ciclo !== null ? `${Math.round(v.dias_ciclo)} d` : '—'}</td>
                    <td className="w-32 py-2.5"><Progreso valor={v.ingresos} max={v.meta_mensual || 1} alto={5} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CuerpoPanel>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <EncabezadoPanel titulo="Por industria" acciones={<ExportarBoton reporte="industrias" meses={meses} />} />
          <CuerpoPanel><GraficaBarras horizontal formato={dineroCompacto} datos={data.industrias.slice(0, 8).map((i) => ({ etiqueta: i.industria, valor: i.ingresos }))} /></CuerpoPanel>
        </Panel>
        <Panel>
          <EncabezadoPanel titulo="Por servicio" acciones={<ExportarBoton reporte="productos" meses={meses} />} />
          <CuerpoPanel><GraficaBarras horizontal formato={dineroCompacto} datos={data.productos.slice(0, 8).map((p) => ({ etiqueta: p.nombre, valor: p.ingresos }))} colorBase="var(--serie-3)" /></CuerpoPanel>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <EncabezadoPanel titulo="Motivos de pérdida" acciones={<ExportarBoton reporte="perdidas" meses={meses} />} />
          <CuerpoPanel>
            {data.perdidas.length === 0 ? <p className="text-sm text-texto-tenue">Sin operaciones perdidas registradas.</p> : (
              <ul className="space-y-2">
                {data.perdidas.map((p) => (
                  <li key={p.motivo} className="flex items-center justify-between text-sm">
                    <span className="text-texto-secundario">{p.motivo}</span>
                    <span className="flex items-center gap-2"><span className="num text-texto-tenue">{numero(p.total)}</span><span className="num font-medium text-texto">{dinero(p.monto)}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </CuerpoPanel>
        </Panel>

        <Panel>
          <EncabezadoPanel titulo="Competencia" acciones={<ExportarBoton reporte="competencia" meses={meses} />} />
          <CuerpoPanel>
            {data.competencia.length === 0 ? <p className="text-sm text-texto-tenue">Sin competidores registrados.</p> : (
              <ul className="space-y-2">
                {data.competencia.map((c) => (
                  <li key={c.competidor} className="flex items-center justify-between text-sm">
                    <span className="text-texto-secundario">{c.competidor}</span>
                    <span className="flex items-center gap-1.5">
                      {c.tasa_victoria !== null && (c.tasa_victoria >= 50 ? <TrendingUp className="size-3.5 text-exito-500" /> : <TrendingDown className="size-3.5 text-peligro-500" />)}
                      <span className="num font-medium text-texto">{c.tasa_victoria !== null ? porcentaje(c.tasa_victoria) : '—'}</span>
                      <span className="text-2xs text-texto-tenue">({c.ganados}/{c.enfrentamientos})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CuerpoPanel>
        </Panel>
      </div>

      <Panel>
        <EncabezadoPanel titulo="Mapa de calor de actividad" subtitulo="Cuándo se completan más actividades" />
        <CuerpoPanel><MapaCalor datos={data.mapaCalor} /></CuerpoPanel>
      </Panel>
    </div>
  );
}

function ExportarBoton({ reporte, meses }: { reporte: string; meses: number }) {
  return (
    <Tooltip contenido="Exportar CSV">
      <a href={urlExportar(reporte, meses)} download>
        <BotonIcono etiqueta="Exportar CSV" tamano="sm"><Download className="size-3.5" /></BotonIcono>
      </a>
    </Tooltip>
  );
}
