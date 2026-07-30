import { useState } from 'react';
import { Mail, Phone, Building2, MapPin, ArrowRightCircle, Plus, ExternalLink } from 'lucide-react';
import { PanelLateral } from '@/componentes/ui/PanelLateral';
import { Anillo } from '@/componentes/ui/Anillo';
import { Insignia } from '@/componentes/ui/Insignia';
import { Boton } from '@/componentes/ui/Boton';
import { Pestanas } from '@/componentes/ui/Pestanas';
import { Cargando } from '@/componentes/ui/Cargando';
import { AreaTexto } from '@/componentes/ui/Campo';
import { usarLead, usarMoverEtapaLead } from '@/lib/consultas/leads';
import { usarCrearNota } from '@/lib/consultas/cuentas';
import { usarCrearActividad } from '@/lib/consultas/actividades';
import { dinero, fechaHora, relativo } from '@/lib/formato';
import { ETAPAS_LEAD, TEMPERATURA_TEXTO, TIPO_ACTIVIDAD_TEXTO } from '@/lib/constantes';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { ModalConvertir } from './ModalConvertir';
import { cx } from '@/lib/utilidades';

export function PanelDetalleLead({ id, onCerrar }: { id: number | null; onCerrar: () => void }) {
  const { data: lead, isLoading } = usarLead(id);
  const [pestana, setPestana] = useState('resumen');
  const [nota, setNota] = useState('');
  const [convertirAbierto, setConvertirAbierto] = useState(false);
  const mover = usarMoverEtapaLead();
  const crearNota = usarCrearNota();
  const crearActividad = usarCrearActividad();
  const { avisar } = useAvisos();

  return (
    <PanelLateral abierto={id != null} onCerrar={onCerrar} ancho="lg" titulo={lead ? 'Prospecto' : ''}>
      {isLoading || !lead ? <Cargando /> : (
        <div className="space-y-5">
          <div className="flex items-start gap-4">
            <Anillo valor={lead.score} temperatura={lead.temperatura} tamano={56} grosor={5} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-texto">{lead.nombre}</h2>
              {lead.empresa && <p className="flex items-center gap-1 text-sm text-texto-secundario"><Building2 className="size-3.5" /> {lead.empresa}</p>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Insignia color={lead.temperatura === 'ardiente' || lead.temperatura === 'caliente' ? 'peligro' : lead.temperatura === 'tibio' ? 'alerta' : 'gris'}>
                  {TEMPERATURA_TEXTO[lead.temperatura]}
                </Insignia>
                <Insignia color="marca">{ETAPAS_LEAD[lead.etapa]}</Insignia>
                {lead.valor_estimado > 0 && <Insignia color="exito">{dinero(lead.valor_estimado)}</Insignia>}
              </div>
            </div>
          </div>

          {lead.cuenta_id && lead.oportunidad_id ? (
            <div className="rounded-lg border border-exito-200 bg-exito-50 px-3 py-2 text-xs text-exito-600">
              Convertido a cuenta y oportunidad. <a href={`/oportunidades/${lead.oportunidad_id}`} className="font-semibold underline">Ver oportunidad →</a>
            </div>
          ) : (
            <Boton variante="primario" className="w-full" iconoIzq={<ArrowRightCircle className="size-4" />} onClick={() => setConvertirAbierto(true)}>
              Convertir a cuenta y oportunidad
            </Boton>
          )}

          <div className="flex flex-wrap gap-1.5">
            {(['lead', 'contacto', 'calificado', 'perdido'] as const).filter((e) => e !== lead.etapa).map((e) => (
              <button key={e} onClick={() => {
                const motivo = e === 'perdido' ? window.prompt('Motivo de la pérdida (opcional)') ?? undefined : undefined;
                mover.mutate({ id: lead.id, etapa: e, motivo_perdida: motivo });
              }} className="rounded-lg border border-borde px-2.5 py-1 text-xs font-medium text-texto-secundario transition-colors hover:border-marca-200 hover:bg-marca-50 hover:text-marca-700">
                Mover a {ETAPAS_LEAD[e]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            {lead.email && <InfoLinea icono={<Mail className="size-3.5" />} texto={lead.email} href={`mailto:${lead.email}`} />}
            {lead.telefono && <InfoLinea icono={<Phone className="size-3.5" />} texto={lead.telefono} href={`tel:${lead.telefono}`} />}
            {(lead.ciudad || lead.estado) && <InfoLinea icono={<MapPin className="size-3.5" />} texto={[lead.ciudad, lead.estado].filter(Boolean).join(', ')} />}
            {lead.industria && <InfoLinea icono={<Building2 className="size-3.5" />} texto={lead.industria} />}
          </div>

          <Pestanas
            activa={pestana} onCambiar={setPestana}
            items={[
              { valor: 'resumen', etiqueta: 'Por qué este score' },
              { valor: 'actividad', etiqueta: 'Actividad', contador: lead.actividades?.length },
              { valor: 'notas', etiqueta: 'Notas', contador: lead.notas?.length },
            ]}
          />

          {pestana === 'resumen' && (
            <div className="space-y-2">
              {(lead.score_motivos ?? []).map((m, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-borde px-3 py-2 text-sm">
                  <span className="text-texto-secundario">{m.etiqueta}</span>
                  <span className={cx('num font-semibold', m.positivo ? 'text-exito-600' : 'text-peligro-500')}>{m.puntos > 0 ? '+' : ''}{m.puntos}</span>
                </div>
              ))}
              {lead.mensaje && (
                <div className="rounded-lg bg-superficie-2 p-3 text-sm text-texto-secundario">
                  <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">Mensaje original</p>
                  “{lead.mensaje}”
                </div>
              )}
            </div>
          )}

          {pestana === 'actividad' && (
            <div className="space-y-3">
              <Boton
                variante="secundario" tamano="sm" iconoIzq={<Plus className="size-3.5" />}
                onClick={() => crearActividad.mutate(
                  { tipo: 'llamada', asunto: `Llamada a ${lead.nombre}`, lead_id: lead.id, vence_en: new Date(Date.now() + 3600_000).toISOString() },
                  { onSuccess: () => avisar({ tipo: 'exito', titulo: 'Actividad creada' }) },
                )}
              >
                Agendar llamada
              </Boton>
              {(lead.actividades ?? []).map((a) => (
                <div key={a.id} className="rounded-lg border border-borde px-3 py-2 text-sm">
                  <p className="font-medium text-texto">{TIPO_ACTIVIDAD_TEXTO[a.tipo] ?? a.tipo}: {a.asunto}</p>
                  <p className="text-xs text-texto-tenue">{a.vence_en ? fechaHora(a.vence_en) : ''} · {a.estado}</p>
                </div>
              ))}
              <div className="border-t border-borde pt-3">
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-texto-tenue">Cronología</p>
                <ul className="space-y-2">
                  {(lead.cronologia ?? []).map((c) => (
                    <li key={c.id} className="text-xs">
                      <span className="text-texto-tenue">{relativo(c.creado_en)}</span> — <span className="text-texto">{c.titulo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {pestana === 'notas' && (
            <div className="space-y-3">
              <AreaTexto placeholder="Escribe una nota…" value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
              <Boton
                tamano="sm" variante="secundario" disabled={!nota.trim()}
                onClick={() => crearNota.mutate({ cuerpo: nota, lead_id: lead.id }, {
                  onSuccess: () => { setNota(''); avisar({ tipo: 'exito', titulo: 'Nota guardada' }); },
                })}
              >
                Guardar nota
              </Boton>
              {(lead.notas ?? []).map((n) => (
                <div key={n.id} className="rounded-lg bg-superficie-2 p-3 text-sm">
                  <p className="text-texto">{n.cuerpo}</p>
                  <p className="mt-1 text-2xs text-texto-tenue">{n.usuario_nombre} · {relativo(n.creado_en)}</p>
                </div>
              ))}
            </div>
          )}

          <ModalConvertir lead={lead} abierto={convertirAbierto} onCerrar={() => setConvertirAbierto(false)} />
        </div>
      )}
    </PanelLateral>
  );
}

function InfoLinea({ icono, texto, href }: { icono: React.ReactNode; texto: string; href?: string }) {
  const contenido = <span className="flex items-center gap-1.5 truncate text-texto-secundario">{icono}<span className="truncate">{texto}</span></span>;
  return href ? <a href={href} className="flex items-center gap-1 hover:text-marca-600">{contenido}<ExternalLink className="size-3 opacity-0 group-hover:opacity-100" /></a> : contenido;
}
