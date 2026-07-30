export const EVENTOS_DISPARADOR = [
  { valor: 'lead.creado', titulo: 'Cuando entra un prospecto' },
  { valor: 'oportunidad.etapa', titulo: 'Cuando cambia de etapa una oportunidad' },
  { valor: 'oportunidad.ganada', titulo: 'Cuando se gana una oportunidad' },
  { valor: 'ticket.creado', titulo: 'Cuando entra un ticket' },
  { valor: 'cron.diario', titulo: 'Cada día a una hora' },
  { valor: 'cron.semanal', titulo: 'Cada semana' },
];

export const ESTADO_EJECUCION: Record<string, { titulo: string; punto: string; color: 'exito' | 'peligro' | 'alerta' | 'gris' | 'marca' }> = {
  ok: { titulo: 'Completada', punto: 'bg-exito-500', color: 'exito' },
  error: { titulo: 'Con error', punto: 'bg-peligro-500', color: 'peligro' },
  parcial: { titulo: 'Parcial', punto: 'bg-alerta-500', color: 'alerta' },
  omitida: { titulo: 'Omitida', punto: 'bg-borde-fuerte', color: 'gris' },
  esperando: { titulo: 'En espera', punto: 'bg-marca-500', color: 'marca' },
};

export const ESTADO_PASO: Record<string, { punto: string; color: 'exito' | 'peligro' | 'alerta' | 'gris' | 'ia' }> = {
  ok: { punto: 'bg-exito-500', color: 'exito' },
  error: { punto: 'bg-peligro-500', color: 'peligro' },
  omitido: { punto: 'bg-borde-fuerte', color: 'gris' },
  simulado: { punto: 'bg-ia-500', color: 'ia' },
  esperando: { punto: 'bg-alerta-500', color: 'alerta' },
};
