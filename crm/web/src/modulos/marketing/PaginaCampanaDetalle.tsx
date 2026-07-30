import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usarCampana } from '@/lib/consultas/marketing';
import { Cargando } from '@/componentes/ui/Cargando';
import { Vacio } from '@/componentes/ui/Vacio';
import { BotonIcono } from '@/componentes/ui/Boton';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { TarjetaKPI } from '@/componentes/ui/TarjetaKPI';
import { Embudo } from '@/componentes/graficas/Embudo';
import { Anillo } from '@/componentes/ui/Anillo';
import { dinero, numero, porcentaje } from '@/lib/formato';

export default function PaginaCampanaDetalle() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { data: c, isLoading } = usarCampana(id ? Number(id) : null);

  if (isLoading) return <Cargando etiqueta="Cargando campaña…" className="py-24" />;
  if (!c) return <Vacio titulo="No se encontró la campaña" />;

  const total = c.embudo[0]?.total ?? 1;
  const embudoNormalizado = c.embudo.map((e, i, arr) => ({
    clave: e.etapa, titulo: e.etapa, enEtapa: e.total ?? 0, alcanzaron: e.total ?? 0,
    porcentajeTotal: Math.round(((e.total ?? 0) / (total || 1)) * 100),
    porcentajePaso: i === 0 ? 100 : Math.round(((e.total ?? 0) / (arr[i - 1].total || 1)) * 100),
    caida: i === 0 ? 0 : (arr[i - 1].total ?? 0) - (e.total ?? 0),
  }));

  return (
    <div className="space-y-4 pb-8">
      <BotonIcono etiqueta="Volver" onClick={() => navegar('/marketing')}><ArrowLeft className="size-4" /></BotonIcono>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-texto">{c.nombre}</h1>
        <p className="text-sm text-texto-tenue">{c.tipo} · {c.canal ?? 'sin canal'} · {c.estado}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TarjetaKPI etiqueta="Costo" valor={c.costo} formato={dinero} acento="alerta" />
        <TarjetaKPI etiqueta="Leads" valor={c.leads} formato={numero} acento="marca" />
        <TarjetaKPI etiqueta="Ingresos" valor={c.ingresos} formato={dinero} acento="exito" />
        <TarjetaKPI etiqueta="ROI" valor={c.roi ?? 0} formato={porcentaje} acento={c.roi && c.roi >= 0 ? 'exito' : 'peligro'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <EncabezadoPanel titulo="Embudo de la campaña" />
          <CuerpoPanel><Embudo etapas={embudoNormalizado} /></CuerpoPanel>
        </Panel>

        <Panel>
          <EncabezadoPanel titulo="Tasas" />
          <CuerpoPanel className="flex flex-wrap items-center justify-around gap-4">
            {c.tasaApertura !== null && <ConAnillo valor={c.tasaApertura} etiqueta="Apertura" />}
            {c.tasaConversion !== null && <ConAnillo valor={c.tasaConversion} etiqueta="Conversión" />}
            {c.avanceMeta !== null && <ConAnillo valor={Math.min(c.avanceMeta, 100)} etiqueta="Meta de leads" />}
          </CuerpoPanel>
        </Panel>
      </div>

      {c.listaLeads.length > 0 && (
        <Panel>
          <EncabezadoPanel titulo="Leads generados" />
          <CuerpoPanel>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-borde text-2xs uppercase text-texto-tenue"><th className="py-2 text-left">Nombre</th><th className="py-2 text-left">Empresa</th><th className="py-2 text-right">Score</th><th className="py-2 text-left">Etapa</th></tr></thead>
              <tbody>
                {c.listaLeads.slice(0, 15).map((l) => (
                  <tr key={l.id} onClick={() => navegar(`/prospectos/${l.id}`)} className="fila-hover cursor-pointer border-b border-borde last:border-0">
                    <td className="py-2 text-texto">{l.nombre}</td>
                    <td className="py-2 text-texto-secundario">{l.empresa ?? '—'}</td>
                    <td className="num py-2 text-right">{l.score}</td>
                    <td className="py-2 text-texto-secundario">{l.etapa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CuerpoPanel>
        </Panel>
      )}
    </div>
  );
}

function ConAnillo({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Anillo valor={Math.round(valor)} temperatura={valor >= 60 ? 'ardiente' : valor >= 30 ? 'tibio' : 'frio'} tamano={64} grosor={6} />
      <span className="text-2xs text-texto-tenue">{etiqueta}</span>
    </div>
  );
}
