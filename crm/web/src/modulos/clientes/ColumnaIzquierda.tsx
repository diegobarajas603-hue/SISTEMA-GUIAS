import { useState } from 'react';
import { Mail, Phone, Globe, MapPin, CreditCard, Plus, Star } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Avatar } from '@/componentes/ui/Avatar';
import { Insignia } from '@/componentes/ui/Insignia';
import { Boton } from '@/componentes/ui/Boton';
import { Medidor } from '@/componentes/graficas/Medidor';
import { ROL_COMPRA_COLOR, ROL_COMPRA_TEXTO, TIPO_CUENTA_TEXTO } from '@/lib/constantes';
import { dinero, fechaCorta } from '@/lib/formato';
import type { Ficha360 } from '@/lib/consultas/cuentas';
import { ModalContacto } from './ModalContacto';
import { cx } from '@/lib/utilidades';

export function ColumnaIzquierda({ cuenta }: { cuenta: Ficha360 }) {
  const [modalContacto, setModalContacto] = useState<{ abierto: boolean; contacto?: Ficha360['contactos'][number] }>({ abierto: false });

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <div className="mb-1 flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold leading-tight text-texto">{cuenta.nombre_comercial || cuenta.nombre}</h1>
            <p className="text-xs text-texto-tenue">{cuenta.nombre}</p>
          </div>
          <Insignia color={cuenta.tipo === 'cliente' ? 'exito' : cuenta.tipo === 'prospecto' ? 'marca' : 'gris'}>{TIPO_CUENTA_TEXTO[cuenta.tipo]}</Insignia>
        </div>

        <div className="mt-3 flex items-center justify-around border-y border-borde py-3">
          <Medidor valor={cuenta.salud} etiqueta="salud" tamano={110} />
          <Medidor valor={cuenta.riesgo_churn} etiqueta="riesgo de fuga" tamano={110} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-superficie-2 p-2">
            <p className="num text-sm font-bold text-texto">{dinero(cuenta.ingresos_ano)}</p>
            <p className="text-2xs text-texto-tenue">Facturado (año)</p>
          </div>
          <div className="rounded-lg bg-superficie-2 p-2">
            <p className="num text-sm font-bold text-texto">{dinero(cuenta.valor_vida)}</p>
            <p className="text-2xs text-texto-tenue">Valor de vida</p>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          {cuenta.propietario_nombre && (
            <div className="flex items-center gap-2"><Avatar nombre={cuenta.propietario_nombre} tono={cuenta.propietario_tono} tamano="xs" /> <span className="text-texto-secundario">{cuenta.propietario_nombre}</span></div>
          )}
          {cuenta.telefono && <InfoLinea icono={<Phone className="size-3.5" />} texto={cuenta.telefono} />}
          {cuenta.email && <InfoLinea icono={<Mail className="size-3.5" />} texto={cuenta.email} />}
          {cuenta.sitio_web && <InfoLinea icono={<Globe className="size-3.5" />} texto={cuenta.sitio_web} />}
          {(cuenta.ciudad || cuenta.estado) && <InfoLinea icono={<MapPin className="size-3.5" />} texto={[cuenta.ciudad, cuenta.estado].filter(Boolean).join(', ')} />}
          {cuenta.dias_credito !== undefined && cuenta.dias_credito > 0 && <InfoLinea icono={<CreditCard className="size-3.5" />} texto={`Crédito a ${cuenta.dias_credito} días`} />}
          {cuenta.cliente_desde && <InfoLinea icono={<Star className="size-3.5" />} texto={`Cliente desde ${fechaCorta(cuenta.cliente_desde)}`} />}
        </div>

        {cuenta.etiquetas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {cuenta.etiquetas.map((e) => <span key={e} className="rounded-pildora bg-superficie-2 px-2 py-0.5 text-2xs text-texto-tenue">{e}</span>)}
          </div>
        )}
      </Panel>

      <Panel>
        <EncabezadoPanel titulo="Contactos" acciones={<Boton tamano="sm" variante="fantasma" iconoIzq={<Plus className="size-3.5" />} onClick={() => setModalContacto({ abierto: true })}>Añadir</Boton>} />
        <CuerpoPanel className="space-y-2">
          {cuenta.mapaPoder.advertencia && (
            <p className="rounded-lg bg-alerta-50 px-2.5 py-2 text-2xs text-alerta-600">{cuenta.mapaPoder.advertencia}</p>
          )}
          {cuenta.contactos.length === 0 && <p className="text-sm text-texto-tenue">Sin contactos registrados.</p>}
          {cuenta.contactos.map((c) => (
            <button key={c.id} onClick={() => setModalContacto({ abierto: true, contacto: c })}
              className="flex w-full items-center gap-2.5 rounded-lg border border-borde p-2.5 text-left transition-colors hover:border-borde-fuerte hover:bg-superficie-2">
              <Avatar nombre={c.nombre} tamano="sm" />
              <div className="min-w-0 flex-1">
                <p className={cx('truncate text-sm font-medium text-texto', c.es_principal && 'flex items-center gap-1')}>
                  {c.nombre} {c.es_principal && <Star className="size-3 fill-alerta-500 text-alerta-500" />}
                </p>
                <p className="truncate text-xs text-texto-tenue">{c.puesto ?? 'Sin puesto'}</p>
              </div>
              {c.rol_compra && (
                <span className="shrink-0 rounded-pildora px-1.5 py-0.5 text-2xs font-semibold" style={{ color: ROL_COMPRA_COLOR[c.rol_compra], background: 'var(--superficie-2)' }}>
                  {ROL_COMPRA_TEXTO[c.rol_compra]}
                </span>
              )}
            </button>
          ))}
        </CuerpoPanel>
      </Panel>

      <ModalContacto cuentaId={cuenta.id} contacto={modalContacto.contacto} abierto={modalContacto.abierto} onCerrar={() => setModalContacto({ abierto: false })} />
    </div>
  );
}

function InfoLinea({ icono, texto }: { icono: React.ReactNode; texto: string }) {
  return <div className="flex items-center gap-1.5 text-texto-secundario"><span className="text-texto-tenue">{icono}</span><span className="truncate">{texto}</span></div>;
}
