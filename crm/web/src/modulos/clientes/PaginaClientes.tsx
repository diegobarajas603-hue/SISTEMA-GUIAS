import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, X, Building2 } from 'lucide-react';
import { usarCuentas, usarFacetasCuentas, type FiltrosCuenta } from '@/lib/consultas/cuentas';
import { Segmentado } from '@/componentes/ui/Segmentado';
import { Campo, Selector } from '@/componentes/ui/Campo';
import { Boton } from '@/componentes/ui/Boton';
import { Chip } from '@/componentes/ui/Chip';
import { EsqueletoTarjetas } from '@/componentes/ui/Esqueleto';
import { Vacio } from '@/componentes/ui/Vacio';
import { useDespacio } from '@/lib/hooks';
import { TIPO_CUENTA_TEXTO } from '@/lib/constantes';
import { TarjetaCuenta } from './TarjetaCuenta';
import { ModalNuevaCuenta } from './ModalNuevaCuenta';

const VISTAS = [{ valor: 'tarjetas', etiqueta: 'Tarjetas' }, { valor: 'tabla', etiqueta: 'Tabla' }];

export default function PaginaClientes() {
  const navegar = useNavigate();
  const [vista, setVista] = useState('tarjetas');
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [industria, setIndustria] = useState('');
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const buscadoDespacio = useDespacio(busqueda);

  const filtros: FiltrosCuenta = { q: buscadoDespacio || undefined, tipo: tipo || undefined, industria: industria || undefined, orden: 'ingresos_ano', dir: 'desc', limite: 60 };
  const { data, isLoading } = usarCuentas(filtros);
  const { data: facetas } = usarFacetasCuentas();
  const cuentas = data?.filas ?? [];

  const hayFiltros = !!(busqueda || tipo || industria);
  const limpiar = () => { setBusqueda(''); setTipo(''); setIndustria(''); };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-texto">Clientes</h1>
          <p className="text-sm text-texto-tenue">{data?.total ?? 0} cuentas en la cartera</p>
        </div>
        <Boton variante="primario" iconoIzq={<Plus className="size-4" />} onClick={() => setNuevoAbierto(true)}>Nueva cuenta</Boton>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Segmentado opciones={VISTAS} valor={vista} onCambiar={setVista} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Campo iconoIzq={<Search className="size-3.5" />} placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-48" />
          <Selector value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-32">
            <option value="">Tipo</option>
            {Object.entries(TIPO_CUENTA_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
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
      ) : cuentas.length === 0 ? (
        <Vacio icono={<Building2 className="size-5" />} titulo={hayFiltros ? 'Sin resultados' : 'Aún no hay cuentas'}
          accion={hayFiltros ? <Boton variante="secundario" onClick={limpiar}>Limpiar filtros</Boton> : <Boton variante="primario" onClick={() => setNuevoAbierto(true)}>Nueva cuenta</Boton>} />
      ) : vista === 'tarjetas' ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cuentas.map((c) => <TarjetaCuenta key={c.id} cuenta={c} onClick={() => navegar(`/clientes/${c.id}`)} />)}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-borde bg-superficie">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde bg-superficie-2 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">
                <th className="px-4 py-2.5 text-left">Cuenta</th><th className="px-4 py-2.5 text-left">Industria</th>
                <th className="px-4 py-2.5 text-left">Tipo</th><th className="px-4 py-2.5 text-left">Salud</th>
                <th className="px-4 py-2.5 text-left">Riesgo</th><th className="px-4 py-2.5 text-left">Facturado</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <tr key={c.id} onClick={() => navegar(`/clientes/${c.id}`)} className="fila-hover cursor-pointer border-b border-borde last:border-0">
                  <td className="px-4 py-2.5 font-medium text-texto">{c.nombre_comercial || c.nombre}</td>
                  <td className="px-4 py-2.5 text-texto-secundario">{c.industria ?? '—'}</td>
                  <td className="px-4 py-2.5 text-texto-secundario">{TIPO_CUENTA_TEXTO[c.tipo]}</td>
                  <td className="num px-4 py-2.5">{c.salud}</td>
                  <td className="num px-4 py-2.5">{c.riesgo_churn}</td>
                  <td className="num px-4 py-2.5 font-medium">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(c.ingresos_ano / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalNuevaCuenta abierto={nuevoAbierto} onCerrar={() => setNuevoAbierto(false)} onCreada={(id) => navegar(`/clientes/${id}`)} />
    </div>
  );
}
