import { useState } from 'react';
import { Modal } from '@/componentes/ui/Modal';
import { Boton } from '@/componentes/ui/Boton';
import { Campo, Selector } from '@/componentes/ui/Campo';
import { usarCrearCuenta } from '@/lib/consultas/cuentas';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { TAMANO_EMPRESA_TEXTO, TIPO_CUENTA_TEXTO } from '@/lib/constantes';

export function ModalNuevaCuenta({ abierto, onCerrar, onCreada }: { abierto: boolean; onCerrar: () => void; onCreada: (id: number) => void }) {
  const [form, setForm] = useState({ nombre: '', industria: '', tamano: '', tipo: 'prospecto', ciudad: '', estado: '', telefono: '', email: '' });
  const crear = usarCrearCuenta();
  const { avisar } = useAvisos();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function confirmar() {
    if (!form.nombre.trim()) return;
    crear.mutate(form, {
      onSuccess: (c) => { avisar({ tipo: 'exito', titulo: 'Cuenta creada' }); setForm({ nombre: '', industria: '', tamano: '', tipo: 'prospecto', ciudad: '', estado: '', telefono: '', email: '' }); onCerrar(); onCreada(c.id); },
      onError: (e) => avisar({ tipo: 'error', titulo: 'No se pudo crear', cuerpo: e instanceof Error ? e.message : undefined }),
    });
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nueva cuenta"
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton variante="primario" cargando={crear.isPending} disabled={!form.nombre.trim()} onClick={confirmar}>Crear cuenta</Boton></>}>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Nombre" requerido value={form.nombre} onChange={set('nombre')} className="col-span-2" />
        <Campo etiqueta="Industria" value={form.industria} onChange={set('industria')} />
        <Selector etiqueta="Tamaño" value={form.tamano} onChange={set('tamano')}>
          <option value="">Sin especificar</option>
          {Object.entries(TAMANO_EMPRESA_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <Selector etiqueta="Tipo" value={form.tipo} onChange={set('tipo')}>
          {Object.entries(TIPO_CUENTA_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <Campo etiqueta="Teléfono" value={form.telefono} onChange={set('telefono')} />
        <Campo etiqueta="Ciudad" value={form.ciudad} onChange={set('ciudad')} />
        <Campo etiqueta="Estado" value={form.estado} onChange={set('estado')} />
        <Campo etiqueta="Correo" type="email" value={form.email} onChange={set('email')} className="col-span-2" />
      </div>
    </Modal>
  );
}
