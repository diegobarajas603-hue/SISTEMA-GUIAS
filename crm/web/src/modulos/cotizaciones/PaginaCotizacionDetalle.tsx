import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { usarCotizacion, usarActualizarCotizacion, usarCambiarEstadoCotizacion } from '@/lib/consultas/cotizaciones';
import { usarProductosCatalogo } from '@/lib/consultas/oportunidades';
import { Cargando } from '@/componentes/ui/Cargando';
import { Vacio } from '@/componentes/ui/Vacio';
import { BotonIcono, Boton } from '@/componentes/ui/Boton';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Insignia } from '@/componentes/ui/Insignia';
import { AreaTexto } from '@/componentes/ui/Campo';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { fechaCorta, fechaHora } from '@/lib/formato';
import { ESTADO_COTIZACION_TEXTO } from '@/lib/constantes';
import { EditorItems } from './EditorItems';
import type { ItemCotizacion } from '@/lib/tipos';

const SIGUIENTES: Record<string, string[]> = {
  borrador: ['enviada'], enviada: ['vista', 'aceptada', 'rechazada'], vista: ['aceptada', 'rechazada'], vencida: ['enviada'],
};

export default function PaginaCotizacionDetalle() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { data: cot, isLoading } = usarCotizacion(id ? Number(id) : null);
  const { data: productos } = usarProductosCatalogo();
  const actualizar = usarActualizarCotizacion();
  const cambiarEstado = usarCambiarEstadoCotizacion();
  const { avisar } = useAvisos();

  const [items, setItems] = useState<ItemCotizacion[]>([]);
  const [condiciones, setCondiciones] = useState('');
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (cot) { setItems(cot.items ?? []); setCondiciones(cot.condiciones ?? ''); setNotas(cot.notas ?? ''); }
  }, [cot]);

  if (isLoading) return <Cargando etiqueta="Cargando cotización…" className="py-24" />;
  if (!cot) return <Vacio titulo="No se encontró la cotización" />;

  const editable = cot.estado === 'borrador';
  const siguientes = SIGUIENTES[cot.estado] ?? [];

  function guardar() {
    actualizar.mutate({ id: cot!.id, datos: { items, condiciones, notas } }, {
      onSuccess: () => avisar({ tipo: 'exito', titulo: 'Cotización guardada' }),
      onError: (e) => avisar({ tipo: 'error', titulo: 'No se pudo guardar', cuerpo: e instanceof Error ? e.message : undefined }),
    });
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <BotonIcono etiqueta="Volver" onClick={() => navegar('/cotizaciones')}><ArrowLeft className="size-4" /></BotonIcono>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-texto">{cot.folio}</h1>
          <p className="text-sm text-texto-tenue">{cot.cuenta_comercial || cot.cuenta_nombre}{cot.contacto_nombre ? ` · ${cot.contacto_nombre}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Insignia color={cot.estado === 'aceptada' ? 'exito' : cot.estado === 'rechazada' || cot.estado === 'vencida' ? 'peligro' : cot.estado === 'vista' ? 'ia' : 'gris'}>
            {ESTADO_COTIZACION_TEXTO[cot.estado]}
          </Insignia>
          {editable && <Boton variante="secundario" iconoIzq={<Save className="size-4" />} cargando={actualizar.isPending} onClick={guardar}>Guardar</Boton>}
          {siguientes.map((s) => (
            <Boton key={s} variante={s === 'aceptada' ? 'primario' : 'secundario'} iconoIzq={s === 'enviada' ? <Send className="size-4" /> : undefined}
              cargando={cambiarEstado.isPending}
              onClick={() => {
                if (editable && s === 'enviada') guardar();
                cambiarEstado.mutate({ id: cot.id, estado: s }, { onSuccess: () => avisar({ tipo: 'exito', titulo: `Marcada como ${ESTADO_COTIZACION_TEXTO[s].toLowerCase()}` }) });
              }}>
              {s === 'enviada' ? 'Enviar' : `Marcar ${ESTADO_COTIZACION_TEXTO[s].toLowerCase()}`}
            </Boton>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <Panel>
          <EncabezadoPanel titulo="Conceptos" subtitulo={!editable ? 'Esta cotización ya no se puede editar' : undefined} />
          <CuerpoPanel>
            <EditorItems items={items} onCambiar={setItems} productos={productos ?? []} soloLectura={!editable} />
          </CuerpoPanel>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <EncabezadoPanel titulo="Detalles" />
            <CuerpoPanel className="space-y-2.5 text-sm">
              <div className="flex justify-between"><span className="text-texto-tenue">Creada</span><span className="text-texto">{fechaCorta(cot.creado_en)}</span></div>
              <div className="flex justify-between"><span className="text-texto-tenue">Válida hasta</span><span className="text-texto">{fechaCorta(cot.valida_hasta)}</span></div>
              {cot.enviada_en && <div className="flex justify-between"><span className="text-texto-tenue">Enviada</span><span className="text-texto">{fechaHora(cot.enviada_en)}</span></div>}
              {cot.vista_en && <div className="flex justify-between"><span className="text-texto-tenue">Vista por el cliente</span><span className="text-ia-600">{fechaHora(cot.vista_en)}</span></div>}
            </CuerpoPanel>
          </Panel>

          <Panel>
            <EncabezadoPanel titulo="Condiciones" />
            <CuerpoPanel>
              {editable ? (
                <AreaTexto rows={6} value={condiciones} onChange={(e) => setCondiciones(e.target.value)} />
              ) : <p className="whitespace-pre-wrap text-sm text-texto-secundario">{cot.condiciones}</p>}
            </CuerpoPanel>
          </Panel>

          <Panel>
            <EncabezadoPanel titulo="Notas internas" />
            <CuerpoPanel>
              {editable ? (
                <AreaTexto rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Solo visibles internamente" />
              ) : <p className="text-sm text-texto-secundario">{cot.notas || 'Sin notas.'}</p>}
            </CuerpoPanel>
          </Panel>
        </div>
      </div>
    </div>
  );
}
