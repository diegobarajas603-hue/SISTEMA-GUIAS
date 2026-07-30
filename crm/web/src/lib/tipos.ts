/** Tipos del dominio, alineados con lo que la API realmente devuelve (snake_case). */

export type Rol = 'admin' | 'gerente' | 'ejecutivo' | 'marketing' | 'soporte';

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  puesto?: string | null;
  telefono?: string | null;
  zona?: string | null;
  equipo_id?: number | null;
  equipo_nombre?: string | null;
  avatar_tono: number;
  meta_mensual?: number;
  activo?: boolean;
  preferencias?: Record<string, unknown>;
  ultimo_acceso?: string | null;
  oportunidades_abiertas?: number;
}

export type EtapaLead = 'lead' | 'contacto' | 'calificado' | 'propuesta' | 'negociacion' | 'ganado' | 'perdido';
export type Temperatura = 'frio' | 'tibio' | 'caliente' | 'ardiente';

export interface MotivoScore {
  etiqueta: string;
  puntos: number;
  dimension: string;
  positivo: boolean;
}

export interface Lead {
  id: number;
  nombre: string;
  empresa?: string | null;
  puesto?: string | null;
  email?: string | null;
  telefono?: string | null;
  whatsapp?: string | null;
  origen?: string | null;
  industria?: string | null;
  tamano_empresa?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  etapa: EtapaLead;
  etapa_max: EtapaLead;
  score: number;
  score_motivos?: MotivoScore[];
  temperatura: Temperatura;
  intencion?: string | null;
  urgencia?: string | null;
  prioridad: number;
  valor_estimado: number;
  propietario_id?: number | null;
  propietario_nombre?: string | null;
  propietario_tono?: number | null;
  etiquetas: string[];
  necesidad?: string | null;
  mensaje?: string | null;
  cuenta_id?: number | null;
  oportunidad_id?: number | null;
  motivo_perdida?: string | null;
  ultimo_contacto_en?: string | null;
  convertido_en?: string | null;
  creado_en: string;
  total_senales?: number;
  pendientes?: number;
}

export type EtapaOportunidad = 'calificado' | 'propuesta' | 'negociacion' | 'ganado' | 'perdido';
export type EstadoOportunidad = 'abierta' | 'ganada' | 'perdida';

export interface Riesgo { titulo: string; severidad: 'baja' | 'media' | 'alta' | 'critica'; detalle: string; }
export interface AccionSugerida { titulo: string; detalle: string; tipo: string; impacto?: string; }
export interface Factor { etiqueta: string; delta: number; }

export interface Oportunidad {
  id: number;
  nombre: string;
  cuenta_id: number;
  cuenta_nombre?: string;
  cuenta_comercial?: string | null;
  contacto_id?: number | null;
  contacto_nombre?: string | null;
  propietario_id?: number | null;
  propietario_nombre?: string | null;
  propietario_tono?: number | null;
  etapa: EtapaOportunidad;
  etapa_max: EtapaOportunidad;
  estado: EstadoOportunidad;
  monto: number;
  monto_recurrente?: number;
  probabilidad: number;
  ia_probabilidad?: number | null;
  ia_riesgos?: Riesgo[];
  ia_acciones?: AccionSugerida[];
  ia_calculado_en?: string | null;
  cierre_estimado?: string | null;
  cerrado_en?: string | null;
  competidor?: string | null;
  origen?: string | null;
  tipo?: string;
  motivo_perdida?: string | null;
  siguiente_paso?: string | null;
  etiquetas: string[];
  ultima_actividad_en?: string | null;
  dias_inactiva?: number;
  creado_en: string;
  total_cotizaciones?: number;
  pendientes?: number;
}

export interface AnalisisIA {
  probabilidad: number;
  riesgos: Riesgo[];
  acciones: AccionSugerida[];
  factores: Factor[];
}

export type EstadoCuenta = 'prospecto' | 'cliente' | 'inactivo' | 'perdido';

export interface Cuenta {
  id: number;
  nombre: string;
  nombre_comercial?: string | null;
  rfc?: string | null;
  industria?: string | null;
  tamano?: string | null;
  sitio_web?: string | null;
  telefono?: string | null;
  email?: string | null;
  calle?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  pais?: string;
  codigo_postal?: string | null;
  tipo: EstadoCuenta;
  propietario_id?: number | null;
  propietario_nombre?: string | null;
  propietario_tono?: number | null;
  salud: number;
  riesgo_churn: number;
  ingresos_ano: number;
  valor_vida: number;
  dias_credito?: number;
  origen?: string | null;
  etiquetas: string[];
  notasLibres?: string | null;
  cliente_desde?: string | null;
  ultima_actividad_en?: string | null;
  total_contactos?: number;
  oportunidades_abiertas?: number;
  pipeline?: number;
  tickets_abiertos?: number;
  creado_en: string;
}

export type RolCompra = 'decisor' | 'influenciador' | 'usuario' | 'bloqueador' | 'campeon';

export interface Contacto {
  id: number;
  cuenta_id: number;
  nombre: string;
  puesto?: string | null;
  email?: string | null;
  telefono?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
  es_principal: boolean;
  rol_compra?: RolCompra | null;
  notas?: string | null;
  creado_en: string;
}

export interface MapaPoder {
  decisor: Contacto[]; campeon: Contacto[]; influenciador: Contacto[]; usuario: Contacto[]; bloqueador: Contacto[];
  completo: boolean;
  advertencia: string | null;
}

export interface EventoBitacora {
  id: number;
  entidad_tipo: string;
  entidad_id: number;
  cuenta_id?: number | null;
  tipo: string;
  titulo: string;
  detalle?: string | null;
  usuario_id?: number | null;
  usuario_nombre?: string | null;
  usuario_tono?: number | null;
  metadata?: Record<string, unknown>;
  creado_en: string;
}

export interface Nota {
  id: number;
  cuerpo: string;
  usuario_id?: number | null;
  usuario_nombre?: string | null;
  usuario_tono?: number | null;
  fijada: boolean;
  creado_en: string;
}

export interface Archivo {
  id: number; nombre: string; tipo_mime?: string | null; tamano_bytes: number;
  url?: string | null; categoria?: string | null; creado_en: string;
}

export type EstadoCotizacion = 'borrador' | 'enviada' | 'vista' | 'aceptada' | 'rechazada' | 'vencida';

export interface ItemCotizacion {
  id?: number;
  producto_id?: number | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  importe?: number;
  orden?: number;
  sku?: string;
  unidad?: string;
}

export interface Cotizacion {
  id: number;
  folio: string;
  oportunidad_id?: number | null;
  oportunidad_nombre?: string | null;
  cuenta_id: number;
  cuenta_nombre?: string;
  cuenta_comercial?: string | null;
  contacto_id?: number | null;
  contacto_nombre?: string | null;
  propietario_id?: number | null;
  propietario_nombre?: string | null;
  propietario_tono?: number | null;
  estado: EstadoCotizacion;
  subtotal: number;
  descuento: number;
  impuestos: number;
  total: number;
  condiciones?: string | null;
  notas?: string | null;
  valida_hasta?: string | null;
  enviada_en?: string | null;
  vista_en?: string | null;
  resuelta_en?: string | null;
  caducada?: boolean;
  creado_en: string;
  items?: ItemCotizacion[];
}

export type TipoActividad = 'llamada' | 'correo' | 'reunion' | 'whatsapp' | 'tarea' | 'visita' | 'seguimiento' | 'demo';

export interface Actividad {
  id: number;
  tipo: TipoActividad;
  asunto: string;
  descripcion?: string | null;
  estado: 'pendiente' | 'completada' | 'cancelada';
  prioridad: number;
  usuario_id?: number | null;
  usuario_nombre?: string | null;
  usuario_tono?: number | null;
  cuenta_id?: number | null;
  cuenta_nombre?: string | null;
  contacto_id?: number | null;
  contacto_nombre?: string | null;
  lead_id?: number | null;
  lead_nombre?: string | null;
  oportunidad_id?: number | null;
  oportunidad_nombre?: string | null;
  ticket_id?: number | null;
  ticket_folio?: string | null;
  inicia_en?: string | null;
  vence_en?: string | null;
  duracion_min?: number | null;
  completada_en?: string | null;
  resultado?: string | null;
  ubicacion?: string | null;
  origen: string;
  creado_en: string;
}

export type EstadoTicket = 'nuevo' | 'abierto' | 'pendiente' | 'resuelto' | 'cerrado';
export type PrioridadTicket = 'baja' | 'media' | 'alta' | 'urgente';

export interface Ticket {
  id: number;
  folio: string;
  asunto: string;
  descripcion?: string | null;
  cuenta_id?: number | null;
  cuenta_nombre?: string | null;
  cuenta_comercial?: string | null;
  cuenta_riesgo?: number | null;
  contacto_id?: number | null;
  contacto_nombre?: string | null;
  canal: string;
  categoria?: string | null;
  prioridad: PrioridadTicket;
  estado: EstadoTicket;
  asignado_id?: number | null;
  asignado_nombre?: string | null;
  asignado_tono?: number | null;
  sla_horas: number;
  sla_vence_en?: string | null;
  sla_incumplido?: boolean;
  horas_para_sla?: number;
  primera_respuesta_en?: string | null;
  resuelto_en?: string | null;
  cerrado_en?: string | null;
  sentimiento?: string | null;
  csat?: number | null;
  ia_sugerencia?: string | null;
  ia_resuelto?: boolean;
  guia_relacionada?: string | null;
  etiquetas: string[];
  mensajes?: number;
  creado_en: string;
}

export interface MensajeTicket {
  id: number;
  ticket_id: number;
  autor_tipo: 'cliente' | 'agente' | 'ia' | 'sistema';
  usuario_id?: number | null;
  usuario_nombre?: string | null;
  cuerpo: string;
  interno: boolean;
  creado_en: string;
}

export interface ArticuloKB {
  id: number; titulo: string; slug: string; categoria?: string | null; cuerpo: string;
  etiquetas: string[]; vistas: number; utiles: number; actualizado_en?: string;
}

export interface Campana {
  id: number;
  nombre: string;
  tipo: string;
  estado: string;
  canal?: string | null;
  presupuesto: number;
  costo: number;
  meta_leads: number;
  inicia_en?: string | null;
  termina_en?: string | null;
  responsable_nombre?: string | null;
  leads: number;
  leads_calificados: number;
  oportunidades: number;
  ganadas: number;
  ingresos: number;
  pipeline: number;
  enviados: number;
  abiertos: number;
  clics: number;
  roi: number | null;
  costoPorLead: number | null;
  tasaConversion: number | null;
  tasaApertura: number | null;
  avanceMeta: number | null;
}

export interface Producto {
  id: number; sku: string; nombre: string; descripcion?: string | null; categoria?: string | null;
  unidad: string; precio_base: number; costo_base: number; margen_meta: number;
  volumen_mensual: number; recurrente: boolean; activo?: boolean; operaciones?: number;
}

export type TipoInsight = 'riesgo' | 'oportunidad' | 'venta_cruzada' | 'churn' | 'nba' | 'pronostico' | 'estancada' | 'reactivacion';
export type Severidad = 'baja' | 'media' | 'alta' | 'critica';

export interface Insight {
  id: number;
  tipo: TipoInsight;
  entidad_tipo: string;
  entidad_id: number;
  entidad_nombre?: string | null;
  titulo: string;
  explicacion: string;
  confianza: number;
  impacto: number;
  severidad: Severidad;
  acciones: AccionSugerida[];
  estado: 'nuevo' | 'visto' | 'aplicado' | 'descartado';
  creado_en: string;
}

export interface NodoFlujo {
  id: string;
  tipo: string;
  titulo: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
}
export interface AristaFlujo { desde: string; hasta: string; etiqueta?: string; }

export interface Automatizacion {
  id: number;
  nombre: string;
  descripcion?: string | null;
  activa: boolean;
  evento: string;
  nodos: NodoFlujo[];
  aristas: AristaFlujo[];
  ejecuciones: number;
  exitos: number;
  fallos: number;
  ejecuciones_mes?: number;
  en_espera?: number;
  ultimo_run_en?: string | null;
  creado_por_nombre?: string | null;
  creado_en: string;
}

export interface EjecucionFlujo {
  id: number;
  automatizacion_id: number;
  automatizacion?: string;
  estado: 'ok' | 'error' | 'parcial' | 'omitida' | 'esperando';
  entidad_tipo?: string | null;
  entidad_id?: number | null;
  pasos: Array<{ nodo: string; titulo: string; estado: string; detalle?: string | null; ms: number }>;
  duracion_ms: number;
  error?: string | null;
  creado_en: string;
}

export interface NodoCatalogo {
  tipo: string; titulo: string; categoria: string; icono: string; descripcion: string;
  simulado?: boolean;
  eventos?: Array<{ valor: string; titulo: string }>;
}

export interface EtapaEmbudo {
  clave: string; titulo: string; enEtapa: number; alcanzaron: number;
  porcentajeTotal: number; porcentajePaso: number; caida: number; monto?: number;
}

export interface Pronostico {
  cerrado: number; proyeccion: number;
  rango: { bajo: number; alto: number };
  desviacion: number; meta: number; probabilidadMeta: number | null; faltante: number;
  tramos: { comprometido: number; probable: number; optimista: number };
  oportunidadesEnPeriodo: number;
  ritmo: { diasTranscurridos: number; diasRestantes: number; requeridoDiario: number; logradoDiario: number };
}

export interface DashboardResumen {
  alcance: string;
  ventasMes: { total: number; operaciones: number; ticketPromedio: number; mesAnterior: number; variacion: number | null; anoAnterior: number };
  serie: Array<{ mes: string; etiqueta: string; ingresos: number; operaciones: number; nuevos: number; recurrentes: number }>;
  embudo: EtapaEmbudo[];
  actividadesHoy: { llamadas: number; correos: number; reuniones: number; whatsapp: number; seguimientos: number; visitas: number; total: number; completadas: number; cotizaciones: number; vencidas: number };
  objetivos: { metaIngresos: number; items: Array<{ clave: string; titulo: string; actual: number; meta: number; porcentaje: number | null; formato: string }> };
  ranking: Array<{ id: number; nombre: string; avatar_tono: number; puesto?: string; zona?: string; equipo?: string; ingresos: number; ganadas: number; cerradas_trim: number; ganadas_trim: number; meta_mensual: number; pipeline: number }>;
  clientesNuevos: Array<Cuenta & { propietario?: string }>;
  clientesInactivos: Array<Cuenta & { propietario?: string; dias_sin_actividad?: number }>;
  oportunidadesRiesgo: Array<Oportunidad & { cuenta_comercial?: string; propietario?: string; dias_inactiva?: number }>;
  proximasActividades: Array<Actividad & { cuenta?: string; lead?: string; oportunidad?: string; contacto?: string; usuario?: string }>;
  pipeline: Array<{ etapa: string; operaciones: number; monto: number; probabilidad_media: number; ponderado: number }>;
  pronostico: Pronostico;
  insights: Insight[];
  feed: EventoBitacora[];
  contadores: { actividadesHoy: number; actividadesVencidas: number; ticketsAbiertos: number; ticketsSlaVencido: number; oportunidadesAbiertas: number; prospectosNuevos: number };
}

export interface RespuestaLista<T> { filas: T[]; total: number; limite: number; desplazamiento: number; pagina: number; }

export interface RespuestaCopiloto {
  texto: string;
  herramientas: Array<{ nombre: string; argumentos?: Record<string, unknown> }>;
  datos: { herramienta: string; resultado: unknown } | null;
  modelo?: string;
  conversacion_id: number;
}

export interface MensajeIA {
  id: number;
  conversacion_id: number;
  rol: 'usuario' | 'asistente' | 'sistema';
  cuerpo: string;
  datos?: Record<string, unknown>;
  modelo?: string;
  creado_en: string;
}

export interface ResultadoBusqueda {
  tipo: string; id: number; titulo: string; subtitulo?: string; etiqueta?: string;
}
export interface RespuestaBusqueda {
  termino: string; resultados: ResultadoBusqueda[]; porTipo: Record<string, ResultadoBusqueda[]>; total: number;
}
