import { useState } from 'react';
import { Modal } from '@/componentes/ui/Modal';
import { Boton } from '@/componentes/ui/Boton';
import { Campo, Selector } from '@/componentes/ui/Campo';
import { usarCrearOportunidad } from '@/lib/consultas/oportunidades';
import { usarCuentas } from '@/lib/consultas/cuentas';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { useDespacio } from '@/lib/hooks';

export function ModalNuevaOportunidad({
  abierto, onCerrar, onCreada, cuentaId,
}: { abierto: boolean; onCerrar: () => void; onCreada: (id: number) => void; cuentaId?: number }) {
  const [form, setForm] = useState({ nombre: '', cuenta_id: cuentaId ? String(cuentaId) : '', monto: '', cierre_estimado: '' });
  const [busquedaCuenta, setBusquedaCuenta] = useState('');
  const buscadoDespacio = useDespacio(busquedaCuenta);
  const { data: cuentas } = usarCuentas({ q: buscadoDespacio || undefined, limite: 20 });
  const crear = usarCrearOportunidad();
  const { avisar } = useAvisos();

  function confirmar() {
    if (!form.nombre.trim() || !form.cuenta_id) return;
    crear.mutate(
      { nombre: form.nombre, cuenta_id: Number(form.cuenta_id), monto: form.monto ? Math.round(Number(form.monto) * 100) : undefined, cierre_estimado: form.cierre_estimado || undefined },
      {
        onSuccess: (op) => { avisar({ tipo: 'exito', titulo: 'Oportunidad creada' }); setForm({ nombre: '', cuenta_id: '', monto: '', cierre_estimado: '' }); onCerrar(); onCreada(op.id); },
        onError: (e) => avisar({ tipo: 'error', titulo: 'No se pudo crear', cuerpo: e instanceof Error ? e.message : undefined }),
      },
    );
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nueva oportunidad"
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton variante="primario" cargando={crear.isPending} disabled={!form.nombre.trim() || !form.cuenta_id} onClick={confirmar}>Crear</Boton></>}>
      <div className="space-y-3">
        <Campo etiqueta="Nombre" requerido value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
        {!cuentaId && (
          <div>
            <Campo etiqueta="Buscar cuenta" placeholder="Escribe para buscar…" value={busquedaCuenta} onChange={(e) => setBusquedaCuenta(e.target.value)} />
            <Selector etiqueta="Cuenta" requerido value={form.cuenta_id} onChange={(e) => setForm((f) => ({ ...f, cuenta_id: e.target.value }))} className="mt-2">
              <option value="">Selecciona una cuenta</option>
              {(cuentas?.filas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre_comercial || c.nombre}</option>)}
            </Selector>
          </div>
        )}
        <Campo etiqueta="Monto estimado (MXN)" type="number" value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} />
        <Campo etiqueta="Cierre estimado" type="date" value={form.cierre_estimado} onChange={(e) => setForm((f) => ({ ...f, cierre_estimado: e.target.value }))} />
      </div>
    </Modal>
  );
}
