import { useNavigate } from 'react-router-dom';
import { UserPlus, UserMinus } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Vacio } from '@/componentes/ui/Vacio';
import { dinero, fechaCorta, relativo } from '@/lib/formato';
import type { DashboardResumen } from '@/lib/tipos';

export function WidgetClientesNuevos({ clientesNuevos }: Pick<DashboardResumen, 'clientesNuevos'>) {
  const navegar = useNavigate();
  return (
    <Panel className="col-span-full lg:col-span-1" interactivo>
      <EncabezadoPanel titulo="Clientes nuevos" subtitulo="Últimos 45 días" />
      <CuerpoPanel>
        {clientesNuevos.length === 0 ? (
          <Vacio icono={<UserPlus className="size-5" />} titulo="Sin clientes nuevos aún" />
        ) : (
          <ul className="divide-y divide-borde">
            {clientesNuevos.slice(0, 6).map((c) => (
              <li key={c.id} onClick={() => navegar(`/clientes/${c.id}`)} className="fila-hover -mx-1 cursor-pointer rounded-lg px-1 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-texto">{c.nombre_comercial || c.nombre}</p>
                  <span className="num shrink-0 text-xs font-semibold text-exito-600">{dinero(c.ingresos_ano)}</span>
                </div>
                <p className="text-xs text-texto-tenue">{c.industria ?? 'Sin industria'} · desde {fechaCorta(c.cliente_desde)}</p>
              </li>
            ))}
          </ul>
        )}
      </CuerpoPanel>
    </Panel>
  );
}

export function WidgetClientesInactivos({ clientesInactivos }: Pick<DashboardResumen, 'clientesInactivos'>) {
  const navegar = useNavigate();
  return (
    <Panel className="col-span-full lg:col-span-1" interactivo>
      <EncabezadoPanel titulo="Clientes inactivos" subtitulo="Sin actividad reciente" />
      <CuerpoPanel>
        {clientesInactivos.length === 0 ? (
          <Vacio icono={<UserMinus className="size-5" />} titulo="Ningún cliente inactivo" descripcion="Buena señal: la cartera se mantiene activa." />
        ) : (
          <ul className="divide-y divide-borde">
            {clientesInactivos.slice(0, 6).map((c) => (
              <li key={c.id} onClick={() => navegar(`/clientes/${c.id}`)} className="fila-hover -mx-1 cursor-pointer rounded-lg px-1 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-texto">{c.nombre_comercial || c.nombre}</p>
                  <span className="text-2xs font-medium text-peligro-500">{relativo(c.ultima_actividad_en)}</span>
                </div>
                <p className="text-xs text-texto-tenue">{dinero(c.ingresos_ano)} facturados en el año</p>
              </li>
            ))}
          </ul>
        )}
      </CuerpoPanel>
    </Panel>
  );
}
