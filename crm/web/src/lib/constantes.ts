import type { Severidad } from './tipos';

/** Copy y color por estado, centralizados para que ningún componente invente los suyos. */

export const ETAPAS_LEAD: Record<string, string> = {
  lead: 'Lead', contacto: 'Contacto', calificado: 'Calificado',
  propuesta: 'Propuesta', negociacion: 'Negociación', ganado: 'Ganado', perdido: 'Perdido',
};

export const ETAPAS_OPORTUNIDAD: Record<string, string> = {
  calificado: 'Calificado', propuesta: 'Propuesta', negociacion: 'Negociación',
  ganado: 'Ganado', perdido: 'Perdido',
};

export const COLUMNAS_KANBAN_LEAD = ['lead', 'contacto', 'calificado', 'perdido'] as const;
export const COLUMNAS_KANBAN_OP = ['calificado', 'propuesta', 'negociacion', 'ganado', 'perdido'] as const;

export const TEMPERATURA_COLOR: Record<string, string> = {
  frio: 'var(--marca-500)', tibio: 'var(--alerta-500)', caliente: 'var(--peligro-500)', ardiente: 'var(--peligro-600)',
};
export const TEMPERATURA_TEXTO: Record<string, string> = {
  frio: 'Frío', tibio: 'Tibio', caliente: 'Caliente', ardiente: 'Ardiente',
};

export const SEVERIDAD_COLOR: Record<Severidad, string> = {
  baja: 'var(--texto-tenue)', media: 'var(--alerta-500)', alta: 'var(--peligro-500)', critica: 'var(--peligro-600)',
};
export const SEVERIDAD_TEXTO: Record<Severidad, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

export const ESTADO_COTIZACION_TEXTO: Record<string, string> = {
  borrador: 'Borrador', enviada: 'Enviada', vista: 'Vista', aceptada: 'Aceptada', rechazada: 'Rechazada', vencida: 'Vencida',
};
export const ESTADO_COTIZACION_COLOR: Record<string, string> = {
  borrador: 'var(--texto-tenue)', enviada: 'var(--marca-500)', vista: 'var(--ia-500)',
  aceptada: 'var(--exito-500)', rechazada: 'var(--peligro-500)', vencida: 'var(--alerta-500)',
};

export const ESTADO_TICKET_TEXTO: Record<string, string> = {
  nuevo: 'Nuevo', abierto: 'Abierto', pendiente: 'Pendiente', resuelto: 'Resuelto', cerrado: 'Cerrado',
};
export const ESTADO_TICKET_COLOR: Record<string, string> = {
  nuevo: 'var(--marca-500)', abierto: 'var(--ia-500)', pendiente: 'var(--alerta-500)',
  resuelto: 'var(--exito-500)', cerrado: 'var(--texto-tenue)',
};
export const PRIORIDAD_TICKET_COLOR: Record<string, string> = {
  baja: 'var(--texto-tenue)', media: 'var(--marca-500)', alta: 'var(--alerta-500)', urgente: 'var(--peligro-500)',
};
export const PRIORIDAD_TICKET_TEXTO: Record<string, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente',
};

export const TIPO_ACTIVIDAD_TEXTO: Record<string, string> = {
  llamada: 'Llamada', correo: 'Correo', reunion: 'Reunión', whatsapp: 'WhatsApp',
  tarea: 'Tarea', visita: 'Visita', seguimiento: 'Seguimiento', demo: 'Demostración',
};
export const TIPO_ACTIVIDAD_ICONO: Record<string, string> = {
  llamada: 'phone', correo: 'mail', reunion: 'users', whatsapp: 'message-circle',
  tarea: 'check-square', visita: 'map-pin', seguimiento: 'repeat', demo: 'monitor-play',
};

export const ROL_TEXTO: Record<string, string> = {
  admin: 'Administrador', gerente: 'Gerente', ejecutivo: 'Ejecutivo',
  marketing: 'Marketing', soporte: 'Soporte',
};

export const ROL_COMPRA_TEXTO: Record<string, string> = {
  decisor: 'Decisor', influenciador: 'Influenciador', usuario: 'Usuario', bloqueador: 'Bloqueador', campeon: 'Campeón',
};
export const ROL_COMPRA_COLOR: Record<string, string> = {
  decisor: 'var(--exito-500)', influenciador: 'var(--marca-500)', usuario: 'var(--texto-tenue)',
  bloqueador: 'var(--peligro-500)', campeon: 'var(--ia-500)',
};

export const TIPO_CUENTA_TEXTO: Record<string, string> = {
  prospecto: 'Prospecto', cliente: 'Cliente', inactivo: 'Inactivo', perdido: 'Perdido',
};

export const TAMANO_EMPRESA_TEXTO: Record<string, string> = {
  micro: 'Micro', pequena: 'Pequeña', mediana: 'Mediana', grande: 'Grande', corporativo: 'Corporativo',
};

export const TIPO_INSIGHT_TEXTO: Record<string, string> = {
  riesgo: 'Riesgo', oportunidad: 'Oportunidad', venta_cruzada: 'Venta cruzada', churn: 'Riesgo de fuga',
  nba: 'Siguiente acción', pronostico: 'Pronóstico', estancada: 'Estancada', reactivacion: 'Reactivación',
};

export const ZONAS = ['MTY', 'CDMX', 'AMBAS'] as const;

export interface ItemNav { ruta: string; etiqueta: string; icono: string; }
export interface GrupoNav { grupo: string; items: ItemNav[]; }

export const NAV_PRINCIPAL: GrupoNav[] = [
  {
    grupo: 'Ventas', items: [
      { ruta: '/', etiqueta: 'Dashboard', icono: 'layout-dashboard' },
      { ruta: '/prospectos', etiqueta: 'Prospectos', icono: 'radar' },
      { ruta: '/clientes', etiqueta: 'Clientes', icono: 'building-2' },
      { ruta: '/oportunidades', etiqueta: 'Oportunidades', icono: 'target' },
      { ruta: '/cotizaciones', etiqueta: 'Cotizaciones', icono: 'file-text' },
    ],
  },
  {
    grupo: 'Relación', items: [
      { ruta: '/marketing', etiqueta: 'Marketing', icono: 'megaphone' },
      { ruta: '/soporte', etiqueta: 'Soporte', icono: 'life-buoy' },
      { ruta: '/agenda', etiqueta: 'Agenda', icono: 'calendar' },
    ],
  },
  {
    grupo: 'Inteligencia', items: [
      { ruta: '/reportes', etiqueta: 'Reportes', icono: 'bar-chart-3' },
      { ruta: '/automatizaciones', etiqueta: 'Automatizaciones', icono: 'workflow' },
      { ruta: '/ia', etiqueta: 'Copiloto', icono: 'sparkles' },
    ],
  },
];
