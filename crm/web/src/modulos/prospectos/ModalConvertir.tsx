import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/componentes/ui/Modal';
import { Boton } from '@/componentes/ui/Boton';
import { Campo } from '@/componentes/ui/Campo';
import { usarConvertirLead } from '@/lib/consultas/leads';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import type { Lead } from '@/lib/tipos';

export function ModalConvertir({ lead, abierto, onCerrar }: { lead: Lead; abierto: boolean; onCerrar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState(lead.valor_estimado ? String(Math.round(lead.valor_estimado / 100)) : '');
  const [siguientePaso, setSiguientePaso] = useState('Agendar reunión de descubrimiento');
  const convertir = usarConvertirLead();
  const { avisar } = useAvisos();
  const navegar = useNavigate();

  function confirmar() {
    convertir.mutate(
      { id: lead.id, opciones: { nombre: nombre || undefined, monto: monto ? Math.round(Number(monto) * 100) : undefined, siguiente_paso: siguientePaso } },
      {
        onSuccess: (r) => {
          avisar({ tipo: 'exito', titulo: 'Prospecto convertido', cuerpo: `Se creó la oportunidad en ${lead.empresa ?? lead.nombre}.` });
          onCerrar();
          navegar(`/oportunidades/${r.oportunidad.id}`);
        },
        onError: (e) => avisar({ tipo: 'error', titulo: 'No se pudo convertir', cuerpo: e instanceof Error ? e.message : undefined }),
      },
    );
  }

  return (
    <Modal
      abierto={abierto} onCerrar={onCerrar} titulo="Convertir prospecto"
      pie={<>
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" cargando={convertir.isPending} onClick={confirmar}>Crear cuenta y oportunidad</Boton>
      </>}
    >
      <p className="mb-4 text-sm text-texto-secundario">
        Esto crea la cuenta (o reutiliza una existente con el mismo nombre), el contacto principal y una oportunidad calificada, arrastrando toda la cronología del prospecto.
      </p>
      <div className="space-y-3">
        <Campo etiqueta="Nombre de la oportunidad" placeholder={`Servicio logístico · ${lead.empresa ?? lead.nombre}`} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Campo etiqueta="Monto estimado (MXN)" type="number" value={monto} onChange={(e) => setMonto(e.target.value)} />
        <Campo etiqueta="Siguiente paso" value={siguientePaso} onChange={(e) => setSiguientePaso(e.target.value)} />
      </div>
    </Modal>
  );
}
