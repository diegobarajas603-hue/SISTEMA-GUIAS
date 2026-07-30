import { useState } from 'react';
import { Modal } from '@/componentes/ui/Modal';
import { Boton } from '@/componentes/ui/Boton';
import { Campo, Selector, AreaTexto } from '@/componentes/ui/Campo';
import { usarCrearTicket } from '@/lib/consultas/tickets';
import { usarCuentas } from '@/lib/consultas/cuentas';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { useDespacio } from '@/lib/hooks';
import { PRIORIDAD_TICKET_TEXTO } from '@/lib/constantes';

export function ModalNuevoTicket({ abierto, onCerrar, onCreado }: { abierto: boolean; onCerrar: () => void; onCreado: (id: number) => void }) {
  const [form, setForm] = useState({ asunto: '', descripcion: '', cuenta_id: '', canal: 'correo', categoria: '', prioridad: 'media', guia_relacionada: '' });
  const [busqueda, setBusqueda] = useState('');
  const buscadoDespacio = useDespacio(busqueda);
  const { data: cuentas } = usarCuentas({ q: buscadoDespacio || undefined, limite: 20 });
  const crear = usarCrearTicket();
  const { avisar } = useAvisos();

  function confirmar() {
    if (!form.asunto.trim()) return;
    crear.mutate({ ...form, cuenta_id: form.cuenta_id ? Number(form.cuenta_id) : undefined }, {
      onSuccess: (t) => { avisar({ tipo: 'exito', titulo: `Ticket ${t.folio} creado`, cuerpo: `SLA de ${t.sla_horas} horas` }); onCerrar(); onCreado(t.id); },
      onError: (e) => avisar({ tipo: 'error', titulo: 'No se pudo crear', cuerpo: e instanceof Error ? e.message : undefined }),
    });
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nuevo ticket"
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton variante="primario" cargando={crear.isPending} disabled={!form.asunto.trim()} onClick={confirmar}>Crear ticket</Boton></>}>
      <div className="space-y-3">
        <Campo etiqueta="Asunto" requerido value={form.asunto} onChange={(e) => setForm((f) => ({ ...f, asunto: e.target.value }))} />
        <AreaTexto etiqueta="Descripción" rows={3} value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
        <Campo etiqueta="Buscar cuenta" placeholder="Escribe para buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <Selector etiqueta="Cuenta" value={form.cuenta_id} onChange={(e) => setForm((f) => ({ ...f, cuenta_id: e.target.value }))}>
          <option value="">Sin cuenta asociada</option>
          {(cuentas?.filas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre_comercial || c.nombre}</option>)}
        </Selector>
        <div className="grid grid-cols-2 gap-3">
          <Selector etiqueta="Prioridad" value={form.prioridad} onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value }))}>
            {Object.entries(PRIORIDAD_TICKET_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </Selector>
          <Selector etiqueta="Canal" value={form.canal} onChange={(e) => setForm((f) => ({ ...f, canal: e.target.value }))}>
            {['correo', 'whatsapp', 'chat', 'telefono', 'portal', 'presencial'].map((c) => <option key={c} value={c}>{c}</option>)}
          </Selector>
        </div>
        <Campo etiqueta="Categoría" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} />
        <Campo etiqueta="Guía relacionada" placeholder="Ej. AN123456" value={form.guia_relacionada} onChange={(e) => setForm((f) => ({ ...f, guia_relacionada: e.target.value }))} />
      </div>
    </Modal>
  );
}
