import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, X, Target } from 'lucide-react';
import { usarOportunidades, type FiltrosOportunidad } from '@/lib/consultas/oportunidades';
import { Segmentado } from '@/componentes/ui/Segmentado';
import { Campo } from '@/componentes/ui/Campo';
import { Boton } from '@/componentes/ui/Boton';
import { Chip } from '@/componentes/ui/Chip';
import { Interruptor } from '@/componentes/ui/Interruptor';
import { EsqueletoTarjetas } from '@/componentes/ui/Esqueleto';
import { Vacio } from '@/componentes/ui/Vacio';
import { useDespacio } from '@/lib/hooks';
import { dinero } from '@/lib/formato';
import { VistaTablero } from './VistaTablero';
import { VistaTablaOportunidades } from './VistaTablaOportunidades';
import { PanelPronostico } from './PanelPronostico';
import { ModalNuevaOportunidad } from './ModalNuevaOportunidad';

const VISTAS = [{ valor: 'tablero', etiqueta: 'Tablero' }, { valor: 'tabla', etiqueta: 'Tabla' }];

export default function PaginaOportunidades() {
  const navegar = useNavigate();
  const [vista, setVista] = useState('tablero');
  const [busqueda, setBusqueda] = useState('');
  const [soloEstancadas, setSoloEstancadas] = useState(false);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const buscadoDespacio = useDespacio(busqueda);

  const filtros: FiltrosOportunidad = { q: buscadoDespacio || undefined, estancadas: soloEstancadas || undefined, estado: 'abierta', limite: 300 };
  const { data, isLoading } = usarOportunidades(filtros);
  const oportunidades = data?.filas ?? [];
  const montoTotal = oportunidades.reduce((s, o) => s + o.monto, 0);

  const hayFiltros = !!(busqueda || soloEstancadas);

  return (
    <div className="grid grid-cols-1 gap-4 pb-8 xl:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-texto">Oportunidades</h1>
            <p className="text-sm text-texto-tenue">{oportunidades.length} abiertas · {dinero(montoTotal)} en pipeline</p>
          </div>
          <Boton variante="primario" iconoIzq={<Plus className="size-4" />} onClick={() => setNuevoAbierto(true)}>Nueva oportunidad</Boton>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Segmentado opciones={VISTAS} valor={vista} onCambiar={setVista} />
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Campo iconoIzq={<Search className="size-3.5" />} placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-48" />
            <label className="flex items-center gap-2 text-xs text-texto-secundario">
              <Interruptor activo={soloEstancadas} onCambiar={setSoloEstancadas} etiqueta="Solo estancadas" /> Estancadas
            </label>
            {hayFiltros && <Chip onClick={() => { setBusqueda(''); setSoloEstancadas(false); }}><span className="flex items-center gap-1"><X className="size-3" /> Limpiar</span></Chip>}
          </div>
        </div>

        {isLoading ? (
          <EsqueletoTarjetas n={5} />
        ) : oportunidades.length === 0 ? (
          <Vacio icono={<Target className="size-5" />} titulo="Sin oportunidades abiertas" accion={<Boton variante="primario" onClick={() => setNuevoAbierto(true)}>Nueva oportunidad</Boton>} />
        ) : vista === 'tablero' ? (
          <VistaTablero oportunidades={oportunidades} onAbrir={(id) => navegar(`/oportunidades/${id}`)} />
        ) : (
          <VistaTablaOportunidades oportunidades={oportunidades} onAbrir={(id) => navegar(`/oportunidades/${id}`)} />
        )}
      </div>

      <div className="space-y-4">
        <PanelPronostico />
      </div>

      <ModalNuevaOportunidad abierto={nuevoAbierto} onCerrar={() => setNuevoAbierto(false)} onCreada={(id) => navegar(`/oportunidades/${id}`)} />
    </div>
  );
}
