import { useMemo, useState } from 'react';
import { Send, Filter } from 'lucide-react';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { AreaTexto } from '@/componentes/ui/Campo';
import { Boton } from '@/componentes/ui/Boton';
import { Selector } from '@/componentes/ui/Campo';
import { Vacio } from '@/componentes/ui/Vacio';
import { usarCrearNota } from '@/lib/consultas/cuentas';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { fechaHora, relativo } from '@/lib/formato';
import type { Ficha360 } from '@/lib/consultas/cuentas';
import { iconoPorNombre } from '@/lib/iconos';

const ICONO_TIPO: Record<string, string> = {
  creado: 'sparkles', etapa: 'git-branch', nota: 'sticky-note', llamada: 'phone', correo: 'mail',
  reunion: 'users', whatsapp: 'message-circle', ticket: 'life-buoy', cotizacion: 'file-text',
  cotizacion_vista: 'eye', ganada: 'trophy', perdida: 'x-circle', contacto: 'user-plus',
  asignacion: 'user-check', monto: 'circle-dollar-sign', ia: 'sparkles', automatizacion: 'workflow', estado: 'refresh-cw',
};

function Icono({ tipo }: { tipo: string }) {
  const nombre = ICONO_TIPO[tipo] ?? 'circle';
  const Comp = iconoPorNombre(nombre);
  return Comp ? <Comp className="size-3.5" /> : null;
}

export function Cronologia({ cuenta }: { cuenta: Ficha360 }) {
  const [filtro, setFiltro] = useState('');
  const [nota, setNota] = useState('');
  const crearNota = usarCrearNota();
  const { avisar } = useAvisos();

  const eventos = useMemo(
    () => (filtro ? cuenta.cronologia.filter((e) => e.tipo === filtro) : cuenta.cronologia),
    [cuenta.cronologia, filtro],
  );

  const tipos = useMemo(() => [...new Set(cuenta.cronologia.map((e) => e.tipo))], [cuenta.cronologia]);

  function enviarNota() {
    if (!nota.trim()) return;
    crearNota.mutate({ cuerpo: nota, cuenta_id: cuenta.id }, {
      onSuccess: () => { setNota(''); avisar({ tipo: 'exito', titulo: 'Nota agregada a la cronología' }); },
    });
  }

  return (
    <Panel className="flex h-full flex-col">
      <EncabezadoPanel
        titulo="Cronología"
        subtitulo="Todo lo que ha pasado con esta cuenta, en un solo lugar"
        acciones={
          <Selector value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-7 w-36 text-xs">
            <option value="">Todo</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </Selector>
        }
      />
      <CuerpoPanel className="flex flex-1 flex-col">
        <div className="mb-3 flex items-start gap-2">
          <AreaTexto placeholder="Escribe una nota rápida sobre esta cuenta…" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="flex-1" />
          <Boton variante="primario" tamano="sm" onClick={enviarNota} disabled={!nota.trim()} cargando={crearNota.isPending} iconoIzq={<Send className="size-3.5" />}>
            Agregar
          </Boton>
        </div>

        {eventos.length === 0 ? (
          <Vacio icono={<Filter className="size-5" />} titulo="Sin eventos" descripcion="Aún no hay actividad registrada con este filtro." />
        ) : (
          <div className="relative flex-1 space-y-0 overflow-y-auto border-l-2 border-borde pl-5" style={{ maxHeight: 640 }}>
            {eventos.map((e) => (
              <div key={e.id} className="relative pb-4">
                <span className="absolute -left-[27px] top-0.5 flex size-5 items-center justify-center rounded-full border-2 border-superficie bg-superficie-2 text-texto-secundario">
                  <Icono tipo={e.tipo} />
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-texto">{e.titulo}</p>
                  <span className="shrink-0 text-2xs text-texto-tenue" title={fechaHora(e.creado_en)}>{relativo(e.creado_en)}</span>
                </div>
                {e.detalle && <p className="mt-0.5 text-xs text-texto-secundario">{e.detalle}</p>}
                {e.usuario_nombre && <p className="mt-0.5 text-2xs text-texto-tenue">{e.usuario_nombre}</p>}
              </div>
            ))}
          </div>
        )}
      </CuerpoPanel>
    </Panel>
  );
}
