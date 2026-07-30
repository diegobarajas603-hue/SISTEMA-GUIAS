import { useEffect, useState } from 'react';
import { Modal } from '@/componentes/ui/Modal';
import { Boton } from '@/componentes/ui/Boton';
import { Campo, Selector } from '@/componentes/ui/Campo';
import { Interruptor } from '@/componentes/ui/Interruptor';
import { usarCrearContacto, usarActualizarContacto, usarEliminarContacto } from '@/lib/consultas/cuentas';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { ROL_COMPRA_TEXTO } from '@/lib/constantes';
import type { Contacto } from '@/lib/tipos';

const VACIO = { nombre: '', puesto: '', email: '', telefono: '', whatsapp: '', linkedin: '', rol_compra: '', es_principal: false };

export function ModalContacto({
  cuentaId, contacto, abierto, onCerrar,
}: { cuentaId: number; contacto?: Contacto; abierto: boolean; onCerrar: () => void }) {
  const [form, setForm] = useState(VACIO);
  const crear = usarCrearContacto();
  const actualizar = usarActualizarContacto();
  const eliminar = usarEliminarContacto();
  const { avisar } = useAvisos();

  useEffect(() => {
    if (abierto) {
      setForm(contacto
        ? { nombre: contacto.nombre, puesto: contacto.puesto ?? '', email: contacto.email ?? '', telefono: contacto.telefono ?? '', whatsapp: contacto.whatsapp ?? '', linkedin: contacto.linkedin ?? '', rol_compra: contacto.rol_compra ?? '', es_principal: contacto.es_principal }
        : VACIO);
    }
  }, [abierto, contacto]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function confirmar() {
    if (!form.nombre.trim()) return;
    const datos = { ...form, rol_compra: form.rol_compra || undefined };
    if (contacto) {
      actualizar.mutate({ id: contacto.id, cuentaId, datos }, { onSuccess: () => { avisar({ tipo: 'exito', titulo: 'Contacto actualizado' }); onCerrar(); } });
    } else {
      crear.mutate({ cuentaId, datos }, { onSuccess: () => { avisar({ tipo: 'exito', titulo: 'Contacto agregado' }); onCerrar(); } });
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={contacto ? 'Editar contacto' : 'Nuevo contacto'}
      pie={
        <div className="flex w-full items-center justify-between">
          {contacto ? (
            <Boton variante="peligro" tamano="sm" onClick={() => eliminar.mutate({ id: contacto.id, cuentaId }, { onSuccess: onCerrar })}>Eliminar</Boton>
          ) : <span />}
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
            <Boton variante="primario" cargando={crear.isPending || actualizar.isPending} disabled={!form.nombre.trim()} onClick={confirmar}>Guardar</Boton>
          </div>
        </div>
      }>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Nombre" requerido value={form.nombre} onChange={set('nombre')} className="col-span-2" />
        <Campo etiqueta="Puesto" value={form.puesto} onChange={set('puesto')} className="col-span-2" />
        <Campo etiqueta="Correo" type="email" value={form.email} onChange={set('email')} />
        <Campo etiqueta="Teléfono" value={form.telefono} onChange={set('telefono')} />
        <Campo etiqueta="WhatsApp" value={form.whatsapp} onChange={set('whatsapp')} />
        <Campo etiqueta="LinkedIn" value={form.linkedin} onChange={set('linkedin')} />
        <Selector etiqueta="Rol de compra" value={form.rol_compra} onChange={set('rol_compra')} className="col-span-2">
          <option value="">Sin especificar</option>
          {Object.entries(ROL_COMPRA_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <div className="col-span-2 flex items-center gap-2">
          <Interruptor activo={form.es_principal} onCambiar={(v) => setForm((f) => ({ ...f, es_principal: v }))} etiqueta="Contacto principal" />
          <span className="text-sm text-texto-secundario">Contacto principal de la cuenta</span>
        </div>
      </div>
    </Modal>
  );
}
