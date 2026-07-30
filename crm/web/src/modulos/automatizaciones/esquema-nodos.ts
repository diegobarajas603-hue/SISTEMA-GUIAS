/**
 * Espejo en el cliente de lo que `motor/ejecutor.js` sabe ejecutar. Cada campo que
 * el panel de configuración muestra corresponde a una `cfg.*` que el backend lee de
 * verdad: si aquí aparece un control que allá nadie consulta, el usuario configura
 * algo que no hace nada.
 */

export type Configuracion = Record<string, unknown>;

export interface OpcionConfig { valor: string; titulo: string; grupo?: string }

export interface CampoConfig {
  clave: string;
  etiqueta: string;
  tipo: 'texto' | 'numero' | 'seleccion' | 'area';
  ayuda?: string;
  placeholder?: string;
  predeterminado?: string | number;
  opciones?: OpcionConfig[] | ((cfg: Configuracion) => OpcionConfig[]);
  visible?: (cfg: Configuracion) => boolean;
}

export type Categoria = 'inicio' | 'datos' | 'logica' | 'ia' | 'accion' | 'canal';

export const CATEGORIAS: Record<Categoria, { titulo: string; acento: string; fondo: string; texto: string }> = {
  inicio: { titulo: 'Inicio', acento: 'var(--marca-500)', fondo: 'bg-marca-50', texto: 'text-marca-700' },
  datos: { titulo: 'Datos', acento: 'var(--serie-2)', fondo: 'bg-superficie-2', texto: 'text-texto-secundario' },
  logica: { titulo: 'Lógica', acento: 'var(--alerta-500)', fondo: 'bg-alerta-50', texto: 'text-alerta-600' },
  ia: { titulo: 'Inteligencia', acento: 'var(--ia-500)', fondo: 'bg-ia-50', texto: 'text-ia-600' },
  accion: { titulo: 'Acciones', acento: 'var(--exito-500)', fondo: 'bg-exito-50', texto: 'text-exito-600' },
  canal: { titulo: 'Canales', acento: 'var(--serie-5)', fondo: 'bg-superficie-2', texto: 'text-texto-secundario' },
};

export const ORDEN_CATEGORIAS: Categoria[] = ['inicio', 'datos', 'logica', 'ia', 'accion', 'canal'];

/** Columnas que `resolverCampo` acepta, agrupadas por la entidad que debe estar en contexto. */
const CAMPOS_CONDICION: OpcionConfig[] = [
  ...['score', 'etapa', 'prioridad', 'temperatura', 'valor_estimado', 'urgencia']
    .map((c) => ({ valor: c, titulo: c, grupo: 'Prospecto' })),
  ...['monto', 'etapa', 'probabilidad', 'ia_probabilidad', 'competidor']
    .map((c) => ({ valor: c, titulo: c, grupo: 'Oportunidad' })),
  ...['riesgo_churn', 'salud', 'tipo', 'ingresos_ano', 'tamano']
    .map((c) => ({ valor: c, titulo: c, grupo: 'Cuenta' })),
  ...['prioridad', 'estado', 'canal', 'categoria', 'sentimiento']
    .map((c) => ({ valor: c, titulo: c, grupo: 'Ticket' })),
  ...['estado', 'total', 'vista_en'].map((c) => ({ valor: c, titulo: c, grupo: 'Cotización' })),
];

/** Lista blanca de `actualizar`: el ejecutor rechaza cualquier otra combinación. */
const CAMPOS_ACTUALIZABLES: Record<string, OpcionConfig[]> = {
  cuenta: [
    { valor: 'tipo', titulo: 'Tipo de cuenta' },
    { valor: 'salud', titulo: 'Salud' },
    { valor: 'propietario_id', titulo: 'Propietario (id)' },
  ],
  oportunidad: [
    { valor: 'etapa', titulo: 'Etapa' },
    { valor: 'siguiente_paso', titulo: 'Siguiente paso' },
    { valor: 'probabilidad', titulo: 'Probabilidad' },
  ],
  lead: [
    { valor: 'etapa', titulo: 'Etapa' },
    { valor: 'prioridad', titulo: 'Prioridad' },
    { valor: 'propietario_id', titulo: 'Propietario (id)' },
  ],
  ticket: [
    { valor: 'estado', titulo: 'Estado' },
    { valor: 'prioridad', titulo: 'Prioridad' },
    { valor: 'asignado_id', titulo: 'Asignado (id)' },
  ],
};

const ENTIDADES_ACTUALIZABLES: OpcionConfig[] = [
  { valor: 'lead', titulo: 'Prospecto' },
  { valor: 'oportunidad', titulo: 'Oportunidad' },
  { valor: 'cuenta', titulo: 'Cuenta' },
  { valor: 'ticket', titulo: 'Ticket' },
];

export const ESQUEMA_CONFIG: Record<string, CampoConfig[]> = {
  disparador: [],

  buscar: [
    {
      clave: 'entidad', etiqueta: '¿Qué buscar?', tipo: 'seleccion', predeterminado: 'oportunidad',
      ayuda: 'El resto del flujo se ejecuta una vez por cada registro encontrado.',
      opciones: [
        { valor: 'oportunidad', titulo: 'Oportunidades abiertas y estancadas' },
        { valor: 'cotizacion', titulo: 'Cotizaciones enviadas sin respuesta' },
        { valor: 'cuenta', titulo: 'Clientes con riesgo de fuga' },
        { valor: 'lead', titulo: 'Prospectos sin trabajar' },
      ],
    },
    {
      clave: 'dias_inactiva', etiqueta: 'Días sin actividad', tipo: 'numero', predeterminado: 14,
      visible: (c) => c.entidad === 'oportunidad',
    },
    {
      clave: 'dias', etiqueta: 'Días desde el envío', tipo: 'numero', predeterminado: 3,
      visible: (c) => c.entidad === 'cotizacion',
    },
    {
      clave: 'riesgo_min', etiqueta: 'Riesgo de fuga mínimo', tipo: 'numero', predeterminado: 60,
      ayuda: 'De 0 a 100.', visible: (c) => c.entidad === 'cuenta',
    },
  ],

  condicion: [
    {
      clave: 'campo', etiqueta: 'Campo a evaluar', tipo: 'seleccion', opciones: CAMPOS_CONDICION,
      ayuda: 'Se lee de la entidad que traiga el flujo en ese momento.',
    },
    {
      clave: 'op', etiqueta: 'Comparación', tipo: 'seleccion', predeterminado: '>=',
      opciones: [
        { valor: '>=', titulo: 'mayor o igual que' },
        { valor: '>', titulo: 'mayor que' },
        { valor: '<=', titulo: 'menor o igual que' },
        { valor: '<', titulo: 'menor que' },
        { valor: '=', titulo: 'igual a' },
        { valor: '<>', titulo: 'distinto de' },
        { valor: 'existe', titulo: 'tiene valor' },
        { valor: 'vacio', titulo: 'está vacío' },
      ],
    },
    {
      clave: 'valor', etiqueta: 'Valor', tipo: 'texto', placeholder: '70',
      visible: (c) => c.op !== 'existe' && c.op !== 'vacio',
    },
  ],

  ia_calificar: [],
  ia_analizar: [],
  ia_responder: [],
  asignar: [],

  crear_actividad: [
    {
      clave: 'tipo', etiqueta: 'Tipo de actividad', tipo: 'seleccion', predeterminado: 'tarea',
      opciones: [
        { valor: 'tarea', titulo: 'Tarea' },
        { valor: 'llamada', titulo: 'Llamada' },
        { valor: 'correo', titulo: 'Correo' },
        { valor: 'reunion', titulo: 'Reunión' },
        { valor: 'seguimiento', titulo: 'Seguimiento' },
        { valor: 'visita', titulo: 'Visita' },
      ],
    },
    {
      clave: 'vence_horas', etiqueta: 'Vence en (horas)', tipo: 'numero', predeterminado: 24,
      ayuda: 'Se cuenta desde que corre el flujo.',
    },
    {
      clave: 'prioridad', etiqueta: 'Prioridad', tipo: 'seleccion', predeterminado: '3',
      opciones: [
        { valor: '1', titulo: '1 · Crítica' },
        { valor: '2', titulo: '2 · Alta' },
        { valor: '3', titulo: '3 · Media' },
        { valor: '4', titulo: '4 · Baja' },
      ],
    },
  ],

  actualizar: [
    { clave: 'entidad', etiqueta: 'Entidad', tipo: 'seleccion', predeterminado: 'lead', opciones: ENTIDADES_ACTUALIZABLES },
    {
      clave: 'campo', etiqueta: 'Campo', tipo: 'seleccion',
      opciones: (cfg) => CAMPOS_ACTUALIZABLES[String(cfg.entidad ?? 'lead')] ?? [],
    },
    { clave: 'valor', etiqueta: 'Nuevo valor', tipo: 'texto', placeholder: 'calificado' },
  ],

  notificar: [
    {
      clave: 'destino', etiqueta: 'Destinatario', tipo: 'seleccion', predeterminado: 'propietario',
      opciones: [
        { valor: 'propietario', titulo: 'Ejecutivo responsable' },
        { valor: 'gerente', titulo: 'Gerente del equipo' },
      ],
    },
  ],

  enviar_correo: [
    { clave: 'plantilla', etiqueta: 'Plantilla', tipo: 'texto', placeholder: 'seguimiento-cotizacion' },
  ],
  enviar_whatsapp: [
    { clave: 'plantilla', etiqueta: 'Plantilla', tipo: 'texto', placeholder: 'recordatorio-visita' },
  ],

  esperar: [
    { clave: 'horas', etiqueta: 'Esperar (horas)', tipo: 'numero', predeterminado: 24,
      ayuda: 'La espera se guarda en base de datos y sobrevive a un reinicio del servidor.' },
  ],
};

/** Config inicial de un nodo recién soltado en el lienzo. */
export function configPredeterminada(tipo: string, evento?: string): Configuracion {
  const cfg: Configuracion = {};
  for (const campo of ESQUEMA_CONFIG[tipo] ?? []) {
    if (campo.predeterminado !== undefined) cfg[campo.clave] = campo.predeterminado;
  }
  if (tipo === 'disparador') cfg.evento = evento ?? 'lead.creado';
  return cfg;
}

/** Resumen de una línea que se dibuja bajo el título del nodo en el lienzo. */
export function resumenNodo(tipo: string, cfg: Configuracion): string | null {
  switch (tipo) {
    case 'condicion': {
      if (!cfg.campo) return 'Sin campo configurado';
      if (cfg.op === 'existe') return `${cfg.campo} tiene valor`;
      if (cfg.op === 'vacio') return `${cfg.campo} está vacío`;
      return `${cfg.campo} ${cfg.op ?? '?'} ${cfg.valor ?? '?'}`;
    }
    case 'esperar': return `${cfg.horas ?? 24} h`;
    case 'crear_actividad': return `${cfg.tipo ?? 'tarea'} · vence en ${cfg.vence_horas ?? 24} h`;
    case 'actualizar': return cfg.campo ? `${cfg.entidad}.${cfg.campo} = ${cfg.valor ?? '—'}` : 'Sin campo';
    case 'notificar': return cfg.destino === 'gerente' ? 'Al gerente' : 'Al responsable';
    case 'buscar': return String(cfg.entidad ?? 'oportunidad');
    case 'enviar_correo':
    case 'enviar_whatsapp': return cfg.plantilla ? `Plantilla «${cfg.plantilla}»` : 'Sin plantilla';
    default: return null;
  }
}
