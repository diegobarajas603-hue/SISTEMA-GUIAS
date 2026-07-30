import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { usarAgenda } from '@/lib/consultas/actividades';
import { Segmentado } from '@/componentes/ui/Segmentado';
import { Boton, BotonIcono } from '@/componentes/ui/Boton';
import { Cargando } from '@/componentes/ui/Cargando';
import { mesAno } from '@/lib/formato';
import { VistaMes } from './VistaMes';
import { VistaLista } from './VistaLista';
import { PanelDetalleActividad } from './PanelDetalleActividad';
import { ModalNuevaActividad } from './ModalNuevaActividad';
import type { Actividad } from '@/lib/tipos';

const VISTAS = [{ valor: 'mes', etiqueta: 'Mes' }, { valor: 'lista', etiqueta: 'Agenda' }];

export default function PaginaAgenda() {
  const [vista, setVista] = useState('mes');
  const [fecha, setFecha] = useState(() => new Date());
  const [actividadAbierta, setActividadAbierta] = useState<Actividad | null>(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);

  const { desde, hasta } = useMemo(() => {
    const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
    const fin = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1);
    return { desde: inicio.toISOString(), hasta: fin.toISOString() };
  }, [fecha]);

  const { data, isLoading } = usarAgenda(desde, hasta);
  const eventos = data?.eventos ?? [];

  function cambiarMes(delta: number) {
    setFecha((f) => new Date(f.getFullYear(), f.getMonth() + delta, 1));
  }

  function abrirActividad(id: number) {
    const act = eventos.find((e) => e.id === id) ?? null;
    setActividadAbierta(act);
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-texto">Agenda</h1>
          <p className="text-sm text-texto-tenue">{eventos.length} actividades este mes</p>
        </div>
        <Boton variante="primario" iconoIzq={<Plus className="size-4" />} onClick={() => setNuevoAbierto(true)}>Nueva actividad</Boton>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BotonIcono etiqueta="Mes anterior" onClick={() => cambiarMes(-1)}><ChevronLeft className="size-4" /></BotonIcono>
          <span className="w-40 text-center text-sm font-semibold capitalize text-texto">{mesAno(fecha)}</span>
          <BotonIcono etiqueta="Mes siguiente" onClick={() => cambiarMes(1)}><ChevronRight className="size-4" /></BotonIcono>
          <Boton tamano="sm" variante="fantasma" onClick={() => setFecha(new Date())}>Hoy</Boton>
        </div>
        <Segmentado opciones={VISTAS} valor={vista} onCambiar={setVista} />
      </div>

      {isLoading ? (
        <Cargando etiqueta="Cargando agenda…" className="py-24" />
      ) : eventos.length === 0 && vista === 'lista' ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-texto-tenue">
          <CalendarDays className="size-6" />
          <p className="text-sm">Sin actividades este mes.</p>
        </div>
      ) : vista === 'mes' ? (
        <VistaMes fechaBase={fecha} eventos={eventos} onAbrir={abrirActividad} />
      ) : (
        <VistaLista eventos={eventos} onAbrir={abrirActividad} />
      )}

      <PanelDetalleActividad actividad={actividadAbierta} onCerrar={() => setActividadAbierta(null)} />
      <ModalNuevaActividad abierto={nuevoAbierto} onCerrar={() => setNuevoAbierto(false)} />
    </div>
  );
}
