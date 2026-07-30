import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Search, X, Radar } from 'lucide-react';
import { usarLeads, usarFacetasLeads, type FiltrosLead } from '@/lib/consultas/leads';
import { Segmentado } from '@/componentes/ui/Segmentado';
import { Campo, Selector } from '@/componentes/ui/Campo';
import { Boton } from '@/componentes/ui/Boton';
import { Chip } from '@/componentes/ui/Chip';
import { EsqueletoTarjetas } from '@/componentes/ui/Esqueleto';
import { Vacio } from '@/componentes/ui/Vacio';
import { useDespacio } from '@/lib/hooks';
import { TEMPERATURA_TEXTO } from '@/lib/constantes';
import { VistaKanban } from './VistaKanban';
import { VistaTabla } from './VistaTabla';
import { VistaTarjetas } from './VistaTarjetas';
import { VistaCronologia } from './VistaCronologia';
import { PanelDetalleLead } from './PanelDetalleLead';
import { ModalNuevoLead } from './ModalNuevoLead';

const VISTAS = [
  { valor: 'kanban', etiqueta: 'Kanban' }, { valor: 'tabla', etiqueta: 'Tabla' },
  { valor: 'tarjetas', etiqueta: 'Tarjetas' }, { valor: 'cronologia', etiqueta: 'Cronología' },
];

export default function PaginaProspectos() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [vista, setVista] = useState('kanban');
  const [busqueda, setBusqueda] = useState('');
  const [temperatura, setTemperatura] = useState('');
  const [industria, setIndustria] = useState('');
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [orden, setOrden] = useState<{ columna: string; direccion: 'asc' | 'desc' }>({ columna: 'score', direccion: 'desc' });
  const buscadoDespacio = useDespacio(busqueda);

  const filtros: FiltrosLead = {
    q: buscadoDespacio || undefined,
    temperatura: temperatura || undefined,
    industria: industria || undefined,
    orden: orden.columna, dir: orden.direccion,
    limite: vista === 'kanban' ? 300 : 200,
  };

  const { data, isLoading } = usarLeads(filtros);
  const { data: facetas } = usarFacetasLeads();
  const leads = useMemo(() => data?.filas ?? [], [data]);

  const hayFiltros = !!(busqueda || temperatura || industria);
  const limpiar = () => { setBusqueda(''); setTemperatura(''); setIndustria(''); };

  function ordenar(columna: string) {
    setOrden((o) => (o.columna === columna ? { columna, direccion: o.direccion === 'asc' ? 'desc' : 'asc' } : { columna, direccion: 'desc' }));
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-texto">Prospectos</h1>
          <p className="text-sm text-texto-tenue">{data?.total ?? 0} en total · calificados automáticamente por IA</p>
        </div>
        <Boton variante="primario" iconoIzq={<Plus className="size-4" />} onClick={() => setNuevoAbierto(true)}>Nuevo prospecto</Boton>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Segmentado opciones={VISTAS} valor={vista} onCambiar={setVista} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Campo iconoIzq={<Search className="size-3.5" />} placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-48" />
          <Selector value={temperatura} onChange={(e) => setTemperatura(e.target.value)} className="w-32">
            <option value="">Temperatura</option>
            {Object.entries(TEMPERATURA_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </Selector>
          <Selector value={industria} onChange={(e) => setIndustria(e.target.value)} className="w-40">
            <option value="">Industria</option>
            {(facetas?.industrias ?? []).map((i) => <option key={i.valor} value={i.valor}>{i.valor} ({i.total})</option>)}
          </Selector>
          {hayFiltros && <Chip onClick={limpiar}><span className="flex items-center gap-1"><X className="size-3" /> Limpiar</span></Chip>}
        </div>
      </div>

      {isLoading ? (
        <EsqueletoTarjetas n={8} />
      ) : leads.length === 0 ? (
        <Vacio
          icono={<Radar className="size-5" />}
          titulo={hayFiltros ? 'Sin resultados para estos filtros' : 'Aún no hay prospectos'}
          descripcion={hayFiltros ? 'Prueba a limpiar los filtros.' : 'Crea el primero o espera a que lleguen por los canales conectados.'}
          accion={hayFiltros ? <Boton variante="secundario" onClick={limpiar}>Limpiar filtros</Boton> : <Boton variante="primario" onClick={() => setNuevoAbierto(true)}>Nuevo prospecto</Boton>}
        />
      ) : vista === 'kanban' ? (
        <VistaKanban leads={leads} onAbrir={(i) => navegar(`/prospectos/${i}`)} />
      ) : vista === 'tabla' ? (
        <VistaTabla leads={leads} onAbrir={(i) => navegar(`/prospectos/${i}`)} orden={orden} onOrdenar={ordenar} />
      ) : vista === 'tarjetas' ? (
        <VistaTarjetas leads={leads} onAbrir={(i) => navegar(`/prospectos/${i}`)} />
      ) : (
        <VistaCronologia leads={leads} onAbrir={(i) => navegar(`/prospectos/${i}`)} />
      )}

      <PanelDetalleLead id={id ? Number(id) : null} onCerrar={() => navegar('/prospectos')} />
      <ModalNuevoLead abierto={nuevoAbierto} onCerrar={() => setNuevoAbierto(false)} onCreado={(i) => navegar(`/prospectos/${i}`)} />
    </div>
  );
}
