import { useState } from 'react';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { PanelLateral } from '@/componentes/ui/PanelLateral';
import { Boton } from '@/componentes/ui/Boton';
import { AreaTexto } from '@/componentes/ui/Campo';
import { Insignia } from '@/componentes/ui/Insignia';
import { usarCompletarActividad, usarEliminarActividad } from '@/lib/consultas/actividades';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { fechaHora } from '@/lib/formato';
import { TIPO_ACTIVIDAD_TEXTO } from '@/lib/constantes';
import type { Actividad } from '@/lib/tipos';

export function PanelDetalleActividad({ actividad, onCerrar }: { actividad: Actividad | null; onCerrar: () => void }) {
  const [resultado, setResultado] = useState('');
  const completar = usarCompletarActividad();
  const eliminar = usarEliminarActividad();
  const { avisar } = useAvisos();

  return (
    <PanelLateral abierto={!!actividad} onCerrar={onCerrar} ancho="sm" titulo={actividad ? TIPO_ACTIVIDAD_TEXTO[actividad.tipo] : ''}>
      {actividad && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-texto">{actividad.asunto}</h2>
            <p className="mt-1 text-sm text-texto-tenue">{fechaHora(actividad.vence_en)}</p>
          </div>
          <Insignia color={actividad.estado === 'completada' ? 'exito' : 'marca'}>{actividad.estado}</Insignia>

          {actividad.descripcion && <p className="text-sm text-texto-secundario">{actividad.descripcion}</p>}

          <div className="space-y-1 text-sm">
            {actividad.cuenta_nombre && <p><span className="text-texto-tenue">Cuenta: </span>{actividad.cuenta_nombre}</p>}
            {actividad.lead_nombre && <p><span className="text-texto-tenue">Prospecto: </span>{actividad.lead_nombre}</p>}
            {actividad.oportunidad_nombre && <p><span className="text-texto-tenue">Oportunidad: </span>{actividad.oportunidad_nombre}</p>}
            {actividad.contacto_nombre && <p><span className="text-texto-tenue">Contacto: </span>{actividad.contacto_nombre}</p>}
            {actividad.ubicacion && <p><span className="text-texto-tenue">Ubicación: </span>{actividad.ubicacion}</p>}
          </div>

          {actividad.estado === 'pendiente' ? (
            <div className="space-y-2 border-t border-borde pt-4">
              <AreaTexto etiqueta="Resultado" placeholder="¿Cómo salió?" rows={2} value={resultado} onChange={(e) => setResultado(e.target.value)} />
              <Boton variante="primario" className="w-full" iconoIzq={<CheckCircle2 className="size-4" />} cargando={completar.isPending}
                onClick={() => completar.mutate({ id: actividad.id, resultado }, { onSuccess: () => { avisar({ tipo: 'exito', titulo: 'Actividad completada' }); onCerrar(); } })}>
                Marcar como completada
              </Boton>
            </div>
          ) : (
            <div className="space-y-2 border-t border-borde pt-4">
              {actividad.resultado && <p className="rounded-lg bg-superficie-2 p-2.5 text-sm text-texto-secundario">{actividad.resultado}</p>}
            </div>
          )}

          <Boton variante="peligro" tamano="sm" iconoIzq={<Trash2 className="size-3.5" />}
            onClick={() => eliminar.mutate(actividad.id, { onSuccess: onCerrar })}>
            Eliminar
          </Boton>
        </div>
      )}
    </PanelLateral>
  );
}
