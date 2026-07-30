import { useState } from 'react';
import { Modal } from '@/componentes/ui/Modal';
import { Boton } from '@/componentes/ui/Boton';
import { Campo, Selector, AreaTexto } from '@/componentes/ui/Campo';
import { usarCrearActividad } from '@/lib/consultas/actividades';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { TIPO_ACTIVIDAD_TEXTO } from '@/lib/constantes';

const fechaHoraLocal = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ModalNuevaActividad({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const dentroUnaHora = new Date(Date.now() + 3_600_000);
  const [form, setForm] = useState({ tipo: 'llamada', asunto: '', descripcion: '', vence_en: fechaHoraLocal(dentroUnaHora) });
  const crear = usarCrearActividad();
  const { avisar } = useAvisos();

  function confirmar() {
    if (!form.asunto.trim()) return;
    crear.mutate({ ...form, vence_en: new Date(form.vence_en).toISOString() }, {
      onSuccess: () => { avisar({ tipo: 'exito', titulo: 'Actividad agendada' }); setForm({ tipo: 'llamada', asunto: '', descripcion: '', vence_en: fechaHoraLocal(dentroUnaHora) }); onCerrar(); },
    });
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nueva actividad"
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton variante="primario" cargando={crear.isPending} disabled={!form.asunto.trim()} onClick={confirmar}>Agendar</Boton></>}>
      <div className="space-y-3">
        <Selector etiqueta="Tipo" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
          {Object.entries(TIPO_ACTIVIDAD_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <Campo etiqueta="Asunto" requerido value={form.asunto} onChange={(e) => setForm((f) => ({ ...f, asunto: e.target.value }))} />
        <Campo etiqueta="Fecha y hora" type="datetime-local" value={form.vence_en} onChange={(e) => setForm((f) => ({ ...f, vence_en: e.target.value }))} />
        <AreaTexto etiqueta="Descripción" rows={3} value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
      </div>
    </Modal>
  );
}
