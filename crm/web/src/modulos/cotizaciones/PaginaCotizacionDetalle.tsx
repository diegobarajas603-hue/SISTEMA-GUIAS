import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Send, FileDown } from 'lucide-react';
import { usarCotizacion, usarActualizarCotizacion, usarCambiarEstadoCotizacion, urlPdfCotizacion } from '@/lib/consultas/cotizaciones';
import { Cargando } from '@/componentes/ui/Cargando';
import { Vacio } from '@/componentes/ui/Vacio';
import { BotonIcono, Boton } from '@/componentes/ui/Boton';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Insignia } from '@/componentes/ui/Insignia';
import { AreaTexto } from '@/componentes/ui/Campo';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { fechaCorta, fechaHora } from '@/lib/formato';
import { ESTADO_COTIZACION_TEXTO } from '@/lib/constantes';
import { EditorMercancia } from './EditorMercancia';
import { ResumenFlete } from './ResumenFlete';
import type { ItemCotizacion } from '@/lib/tipos';

const SIGUIENTES: Record<string, string[]> = {
  borrador: ['enviada'], enviada: ['vista', 'aceptada', 'rechazada'], vista: ['aceptada', 'rechazada'], vencida: ['enviada'],
};

export default function PaginaCotizacionDetalle() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { data: cot, isLoading } = usarCotizacion(id ? Number(id) : null);
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
          <a href={urlPdfCotizacion(cot.id)} target="_blank" rel="noreferrer">
            <Boton variante="secundario" iconoIzq={<FileDown className="size-4" />}>PDF</Boton>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Panel>
            <EncabezadoPanel
              titulo="Mercancía"
              subtitulo={editable ? 'Se cobra el mayor entre el peso real y el volumétrico'
                : 'Esta cotización ya no se puede editar'}
            />
            <CuerpoPanel>
              {editable ? (
                <EditorMercancia
                  renglones={items as unknown as Parameters<typeof EditorMercancia>[0]['renglones']}
                  onCambiar={(r) => setItems(r as unknown as ItemCotizacion[])}
                />
              ) : (
                <TablaMercancia items={items} />
              )}
            </CuerpoPanel>
          </Panel>

          <ResumenFlete cotizacion={cot} items={items} />
        </div>

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

/** Detalle del cubicaje cuando la cotización ya no se puede editar. */
function TablaMercancia({ items }: { items: ItemCotizacion[] }) {
  const kg = (n: unknown) =>
    `${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
  const m = (n: unknown) => `${Number(n ?? 0).toFixed(2)} m`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-borde text-2xs uppercase text-texto-tenue">
            <th className="py-2 text-left">Cant.</th>
            <th className="py-2 text-left">Descripción</th>
            <th className="py-2 text-right">Medidas</th>
            <th className="py-2 text-right">P. real</th>
            <th className="py-2 text-right">P. volum.</th>
            <th className="py-2 text-right">Cobrable</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id ?? i} className="border-b border-borde last:border-0">
              <td className="num py-2.5">{it.cantidad}</td>
              <td className="py-2.5 text-texto-secundario">
                {it.descripcion || (it.estibable ? 'Tarima estibable' : 'Tarima no estibable')}
                {!it.estibable && <span className="ml-1.5 text-2xs text-texto-tenue">se cubica a 1.80 m</span>}
              </td>
              <td className="num py-2.5 text-right text-texto-tenue">
                {m(it.largo)} × {m(it.ancho)} × {m(it.alto)}
              </td>
              <td className="num py-2.5 text-right text-texto-secundario">{kg(it.peso_real)}</td>
              <td className="num py-2.5 text-right text-texto-secundario">{kg(it.peso_volumetrico)}</td>
              <td className="num py-2.5 text-right font-semibold text-texto">{kg(it.peso_cobrable)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
