import { useState } from 'react';
import { Modal } from '@/componentes/ui/Modal';
import { Boton } from '@/componentes/ui/Boton';
import { Campo, AreaTexto, Selector } from '@/componentes/ui/Campo';
import { usarCrearLead } from '@/lib/consultas/leads';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { TAMANO_EMPRESA_TEXTO } from '@/lib/constantes';

export function ModalNuevoLead({ abierto, onCerrar, onCreado }: { abierto: boolean; onCerrar: () => void; onCreado: (id: number) => void }) {
  const [form, setForm] = useState({
    nombre: '', empresa: '', email: '', telefono: '', industria: '', tamano_empresa: '',
    ciudad: '', estado: '', necesidad: '', mensaje: '',
  });
  const crear = usarCrearLead();
  const { avisar } = useAvisos();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function confirmar() {
    if (!form.nombre.trim()) return;
    crear.mutate(
      { ...form, valor_estimado: undefined },
      {
        onSuccess: (lead) => {
          avisar({ tipo: 'exito', titulo: 'Prospecto creado', cuerpo: `Score ${lead.score}/100 · clasificado automáticamente por IA.` });
          setForm({ nombre: '', empresa: '', email: '', telefono: '', industria: '', tamano_empresa: '', ciudad: '', estado: '', necesidad: '', mensaje: '' });
          onCerrar();
          onCreado(lead.id);
        },
        onError: (e) => avisar({ tipo: 'error', titulo: 'No se pudo crear', cuerpo: e instanceof Error ? e.message : undefined }),
      },
    );
  }

  return (
    <Modal
      abierto={abierto} onCerrar={onCerrar} titulo="Nuevo prospecto" ancho="lg"
      pie={<>
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" cargando={crear.isPending} disabled={!form.nombre.trim()} onClick={confirmar}>Crear prospecto</Boton>
      </>}
    >
      <p className="mb-4 text-xs text-texto-tenue">Al guardar, la IA calcula el score, clasifica intención y urgencia, asigna un ejecutivo y agenda el primer contacto — automáticamente.</p>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Nombre" requerido value={form.nombre} onChange={set('nombre')} className="col-span-2" />
        <Campo etiqueta="Empresa" value={form.empresa} onChange={set('empresa')} />
        <Campo etiqueta="Correo" type="email" value={form.email} onChange={set('email')} />
        <Campo etiqueta="Teléfono" value={form.telefono} onChange={set('telefono')} />
        <Campo etiqueta="Industria" value={form.industria} onChange={set('industria')} />
        <Selector etiqueta="Tamaño de empresa" value={form.tamano_empresa} onChange={set('tamano_empresa')}>
          <option value="">Sin especificar</option>
          {Object.entries(TAMANO_EMPRESA_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </Selector>
        <Campo etiqueta="Ciudad" value={form.ciudad} onChange={set('ciudad')} />
        <Campo etiqueta="Estado" value={form.estado} onChange={set('estado')} />
        <Campo etiqueta="Necesidad" placeholder="Ej. Consolidado MTY–CDMX" value={form.necesidad} onChange={set('necesidad')} className="col-span-2" />
        <AreaTexto etiqueta="Mensaje del prospecto" className="col-span-2" rows={3} value={form.mensaje} onChange={set('mensaje')}
          ayuda="La IA lee este texto para deducir intención y urgencia." />
      </div>
    </Modal>
  );
}
