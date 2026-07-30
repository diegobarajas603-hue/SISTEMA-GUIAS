import { useState } from 'react';
import { Modal } from '@/componentes/ui/Modal';
import { Boton } from '@/componentes/ui/Boton';
import { Campo, Selector } from '@/componentes/ui/Campo';
import { usarCrearCotizacion } from '@/lib/consultas/cotizaciones';
import { usarCuentas } from '@/lib/consultas/cuentas';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { useDespacio } from '@/lib/hooks';

export function ModalNuevaCotizacion({
  abierto, onCerrar, onCreada, oportunidadId,
}: { abierto: boolean; onCerrar: () => void; onCreada: (id: number) => void; oportunidadId?: number }) {
  const [cuentaId, setCuentaId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const buscadoDespacio = useDespacio(busqueda);
  const { data: cuentas } = usarCuentas({ q: buscadoDespacio || undefined, limite: 20 });
  const crear = usarCrearCotizacion();
  const { avisar } = useAvisos();

  function confirmar() {
    if (!cuentaId) return;
    crear.mutate(
      { cuenta_id: Number(cuentaId), oportunidad_id: oportunidadId, items: [{ descripcion: 'Servicio de transporte', cantidad: 1, precio_unitario: 0 }] },
      {
        onSuccess: (c) => { avisar({ tipo: 'exito', titulo: 'Cotización creada' }); onCerrar(); onCreada(c.id); },
        onError: (e) => avisar({ tipo: 'error', titulo: 'No se pudo crear', cuerpo: e instanceof Error ? e.message : undefined }),
      },
    );
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nueva cotización"
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton variante="primario" cargando={crear.isPending} disabled={!cuentaId} onClick={confirmar}>Crear borrador</Boton></>}>
      <p className="mb-3 text-sm text-texto-secundario">Elige la cuenta; los conceptos y montos se editan en el siguiente paso.</p>
      <Campo etiqueta="Buscar cuenta" placeholder="Escribe para buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      <Selector etiqueta="Cuenta" requerido value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="mt-2">
        <option value="">Selecciona una cuenta</option>
        {(cuentas?.filas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre_comercial || c.nombre}</option>)}
      </Selector>
    </Modal>
  );
}
