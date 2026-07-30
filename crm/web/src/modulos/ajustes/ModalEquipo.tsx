import { useState } from 'react';
import { Modal } from '@/componentes/ui/Modal';
import { Boton } from '@/componentes/ui/Boton';
import { Campo, Selector } from '@/componentes/ui/Campo';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { ErrorAPI } from '@/lib/api';
import { usarCrearEquipo } from '@/lib/consultas/auth';

export function ModalEquipo({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [form, setForm] = useState({ nombre: '', zona: '' });
  const crear = usarCrearEquipo();
  const { avisar } = useAvisos();

  function guardar() {
    if (!form.nombre.trim()) return;
    crear.mutate({ nombre: form.nombre.trim(), zona: form.zona || undefined }, {
      onSuccess: (e) => {
        avisar({ tipo: 'exito', titulo: `Equipo «${e.nombre}» creado` });
        setForm({ nombre: '', zona: '' });
        onCerrar();
      },
      onError: (e) => avisar({
        tipo: 'error', titulo: 'No se pudo crear',
        cuerpo: e instanceof ErrorAPI ? e.message : undefined,
      }),
    });
  }

  return (
    <Modal
      abierto={abierto} onCerrar={onCerrar} titulo="Nuevo equipo" ancho="sm"
      pie={<>
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={!form.nombre.trim()} cargando={crear.isPending} onClick={guardar}>
          Crear
        </Boton>
      </>}
    >
      <div className="space-y-3">
        <Campo
          etiqueta="Nombre" requerido placeholder="Equipo Monterrey"
          value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
        />
        <Selector
          etiqueta="Zona" value={form.zona}
          onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))}
          ayuda="Se usa para repartir prospectos por cercanía."
        >
          <option value="">Sin zona</option>
          <option value="MTY">MTY</option>
          <option value="CDMX">CDMX</option>
          <option value="NACIONAL">NACIONAL</option>
        </Selector>
      </div>
    </Modal>
  );
}
