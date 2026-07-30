import { consultar, uno } from '../db/pool.js';
import { noEncontrado, peticionInvalida } from '../lib/errores.js';
import { ejecutar } from '../motor/ejecutor.js';

/**
 * Catálogo de nodos que entiende el ejecutor. La interfaz del editor visual se
 * construye a partir de esto, así que **no puede haber un nodo dibujable que el
 * backend no sepa ejecutar**: una sola fuente de verdad evita flujos que se ven
 * bien y no hacen nada.
 */
export const CATALOGO_NODOS = [
  {
    tipo: 'disparador', titulo: 'Disparador', categoria: 'inicio', icono: 'zap',
    descripcion: 'Punto de entrada del flujo.',
    eventos: [
      { valor: 'lead.creado', titulo: 'Cuando entra un prospecto' },
      { valor: 'oportunidad.etapa', titulo: 'Cuando cambia de etapa una oportunidad' },
      { valor: 'oportunidad.ganada', titulo: 'Cuando se gana una oportunidad' },
      { valor: 'ticket.creado', titulo: 'Cuando entra un ticket' },
      { valor: 'cron.diario', titulo: 'Cada día a una hora' },
      { valor: 'cron.semanal', titulo: 'Cada semana' },
    ],
  },
  { tipo: 'buscar', titulo: 'Buscar registros', categoria: 'datos', icono: 'search',
    descripcion: 'Selecciona registros que cumplen una condición. El resto del flujo corre por cada uno.' },
  { tipo: 'condicion', titulo: 'Condición', categoria: 'logica', icono: 'git-branch',
    descripcion: 'Bifurca el flujo en dos ramas: sí y no.' },
  { tipo: 'ia_calificar', titulo: 'Calificar con IA', categoria: 'ia', icono: 'sparkles',
    descripcion: 'Calcula el lead score con su explicación y actualiza la temperatura.' },
  { tipo: 'ia_analizar', titulo: 'Analizar con IA', categoria: 'ia', icono: 'brain',
    descripcion: 'Calcula probabilidad de cierre, riesgos y acciones recomendadas.' },
  { tipo: 'ia_responder', titulo: 'Respuesta sugerida IA', categoria: 'ia', icono: 'message-square',
    descripcion: 'Redacta un borrador con la base de conocimiento. No envía nada solo.' },
  { tipo: 'asignar', titulo: 'Asignar ejecutivo', categoria: 'accion', icono: 'user-plus',
    descripcion: 'Reparte por carga de trabajo y zona.' },
  { tipo: 'crear_actividad', titulo: 'Crear actividad', categoria: 'accion', icono: 'check-square',
    descripcion: 'Genera una tarea, llamada o reunión con vencimiento.' },
  { tipo: 'actualizar', titulo: 'Actualizar campo', categoria: 'accion', icono: 'edit',
    descripcion: 'Cambia un campo permitido de la entidad en contexto.' },
  { tipo: 'notificar', titulo: 'Notificar', categoria: 'accion', icono: 'bell',
    descripcion: 'Avisa dentro de Aura al responsable o a su gerente.' },
  { tipo: 'enviar_correo', titulo: 'Enviar correo', categoria: 'canal', icono: 'mail',
    descripcion: 'Registra el envío. La integración de correo aún no está conectada.',
    simulado: true },
  { tipo: 'enviar_whatsapp', titulo: 'Enviar WhatsApp', categoria: 'canal', icono: 'phone',
    descripcion: 'Registra el envío. La integración de WhatsApp aún no está conectada.',
    simulado: true },
  { tipo: 'esperar', titulo: 'Esperar', categoria: 'logica', icono: 'clock',
    descripcion: 'Pausa el flujo. La espera se guarda y sobrevive a un reinicio.' },
];

const TIPOS_VALIDOS = new Set(CATALOGO_NODOS.map((n) => n.tipo));

const SELECT_AUT = `
  SELECT a.*, u.nombre AS creado_por_nombre,
         (SELECT count(*)::int FROM automatizacion_ejecuciones e
           WHERE e.automatizacion_id = a.id AND e.creado_en > now() - interval '30 days') AS ejecuciones_mes,
         (SELECT count(*)::int FROM automatizacion_ejecuciones e
           WHERE e.automatizacion_id = a.id AND e.estado = 'esperando') AS en_espera
    FROM automatizaciones a
    LEFT JOIN usuarios u ON u.id = a.creado_por`;

export const listar = () => consultar(`${SELECT_AUT} ORDER BY a.activa DESC, a.nombre`);

export async function porId(id) {
  const flujo = await uno(`${SELECT_AUT} WHERE a.id = $1`, [id]);
  if (!flujo) throw noEncontrado('automatización');
  const ejecuciones = await consultar(
    `SELECT * FROM automatizacion_ejecuciones
      WHERE automatizacion_id = $1 ORDER BY creado_en DESC LIMIT 30`, [id]);
  return { ...flujo, ejecuciones };
}

/**
 * Valida el grafo antes de guardarlo. Un flujo mal formado que se guarda «porque ya
 * lo dibujé» acaba fallando en producción a las 3 de la mañana.
 */
export function validarGrafo(nodos = [], aristas = []) {
  const errores = [];
  const ids = new Set();

  for (const n of nodos) {
    if (!n.id) errores.push('Hay un nodo sin identificador.');
    if (ids.has(n.id)) errores.push(`Identificador de nodo repetido: ${n.id}.`);
    ids.add(n.id);
    if (!TIPOS_VALIDOS.has(n.tipo)) errores.push(`Tipo de nodo desconocido: «${n.tipo}».`);
    if (n.tipo === 'condicion' && !n.config?.campo) {
      errores.push(`La condición «${n.titulo ?? n.id}» no tiene campo a evaluar.`);
    }
  }

  const disparadores = nodos.filter((n) => n.tipo === 'disparador');
  if (disparadores.length === 0) errores.push('El flujo necesita un nodo disparador.');
  if (disparadores.length > 1) errores.push('Solo puede haber un disparador por flujo.');

  for (const a of aristas) {
    if (!ids.has(a.desde)) errores.push(`Conexión con origen inexistente: ${a.desde}.`);
    if (!ids.has(a.hasta)) errores.push(`Conexión con destino inexistente: ${a.hasta}.`);
  }

  // Nodos huérfanos: no se alcanzan nunca, así que el usuario cree que hacen algo.
  const alcanzables = new Set(disparadores.map((d) => d.id));
  let creció = true;
  while (creció) {
    creció = false;
    for (const a of aristas) {
      if (alcanzables.has(a.desde) && !alcanzables.has(a.hasta)) {
        alcanzables.add(a.hasta);
        creció = true;
      }
    }
  }
  const huerfanos = nodos.filter((n) => !alcanzables.has(n.id));
  const advertencias = huerfanos.map(
    (n) => `El nodo «${n.titulo ?? n.id}» no está conectado al disparador: nunca se ejecutará.`,
  );

  return { valido: errores.length === 0, errores, advertencias };
}

export async function crear(datos, usuario) {
  const nodos = datos.nodos ?? [];
  const aristas = datos.aristas ?? [];
  const validacion = validarGrafo(nodos, aristas);
  if (!validacion.valido) {
    throw peticionInvalida('El flujo tiene errores que hay que corregir.', validacion.errores);
  }
  const disparador = nodos.find((n) => n.tipo === 'disparador');

  const flujo = await uno(
    `INSERT INTO automatizaciones (nombre, descripcion, activa, evento, condiciones, nodos, aristas, creado_por)
     VALUES ($1,$2,COALESCE($3,false),$4,'[]'::jsonb,$5::jsonb,$6::jsonb,$7) RETURNING *`,
    [
      datos.nombre, datos.descripcion ?? null, datos.activa ?? null,
      datos.evento ?? disparador?.config?.evento ?? 'lead.creado',
      JSON.stringify(nodos), JSON.stringify(aristas), usuario.id,
    ],
  );
  return { ...flujo, advertencias: validacion.advertencias };
}

export async function actualizar(id, datos) {
  const previo = await uno('SELECT * FROM automatizaciones WHERE id = $1', [id]);
  if (!previo) throw noEncontrado('automatización');

  const nodos = datos.nodos ?? previo.nodos;
  const aristas = datos.aristas ?? previo.aristas;
  const validacion = validarGrafo(nodos, aristas);
  if (!validacion.valido) {
    throw peticionInvalida('El flujo tiene errores que hay que corregir.', validacion.errores);
  }
  const disparador = nodos.find((n) => n.tipo === 'disparador');

  const flujo = await uno(
    `UPDATE automatizaciones
        SET nombre = COALESCE($2, nombre), descripcion = COALESCE($3, descripcion),
            activa = COALESCE($4, activa), evento = COALESCE($5, evento),
            nodos = $6::jsonb, aristas = $7::jsonb, actualizado_en = now()
      WHERE id = $1 RETURNING *`,
    [
      id, datos.nombre ?? null, datos.descripcion ?? null,
      datos.activa ?? null, datos.evento ?? disparador?.config?.evento ?? null,
      JSON.stringify(nodos), JSON.stringify(aristas),
    ],
  );
  return { ...flujo, advertencias: validacion.advertencias };
}

export async function alternar(id, activa) {
  const flujo = await uno(
    'UPDATE automatizaciones SET activa = $2, actualizado_en = now() WHERE id = $1 RETURNING *',
    [id, activa],
  );
  if (!flujo) throw noEncontrado('automatización');
  return flujo;
}

export async function eliminar(id) {
  const borrado = await uno('DELETE FROM automatizaciones WHERE id = $1 RETURNING id', [id]);
  if (!borrado) throw noEncontrado('automatización');
}

/**
 * Ejecución manual para probar un flujo. Con `simulacion: true` recorre el grafo y
 * reporta qué haría **sin escribir nada**: es lo que uno quiere antes de activar un
 * flujo que va a tocar 200 registros.
 */
export async function ejecutarAhora(id, { entidad_tipo, entidad_id, simulacion = false } = {}) {
  const flujo = await uno('SELECT * FROM automatizaciones WHERE id = $1', [id]);
  if (!flujo) throw noEncontrado('automatización');

  if (simulacion) return simular(flujo, { entidad_tipo, entidad_id });

  const contexto = {};
  if (entidad_tipo && entidad_id) {
    contexto.entidad_tipo = entidad_tipo;
    contexto.entidad_id = Number(entidad_id);
    if (entidad_tipo === 'oportunidad') {
      const op = await uno('SELECT cuenta_id, propietario_id FROM oportunidades WHERE id = $1', [entidad_id]);
      Object.assign(contexto, op ?? {});
    } else if (entidad_tipo === 'lead') {
      const l = await uno('SELECT propietario_id FROM leads WHERE id = $1', [entidad_id]);
      Object.assign(contexto, l ?? {});
    }
  }
  return ejecutar(flujo, contexto);
}

/** Recorre el grafo sin ejecutar acciones: devuelve la ruta y lo que haría cada nodo. */
function simular(flujo, contexto) {
  const nodos = new Map((flujo.nodos ?? []).map((n) => [n.id, n]));
  const aristas = flujo.aristas ?? [];
  const inicio = (flujo.nodos ?? []).find((n) => n.tipo === 'disparador');
  if (!inicio) return { simulacion: true, pasos: [], aviso: 'El flujo no tiene disparador.' };

  const pasos = [];
  const visitados = new Set();
  const pila = [inicio];

  while (pila.length && pasos.length < 40) {
    const nodo = pila.shift();
    if (visitados.has(nodo.id)) continue;
    visitados.add(nodo.id);

    pasos.push({
      nodo: nodo.id, titulo: nodo.titulo, tipo: nodo.tipo,
      efecto: describirEfecto(nodo),
      // En una condición no se sabe qué rama tomaría sin datos reales, y se dice.
      ramifica: nodo.tipo === 'condicion',
    });

    for (const a of aristas.filter((x) => x.desde === nodo.id)) {
      const siguiente = nodos.get(a.hasta);
      if (siguiente) pila.push(siguiente);
    }
  }

  return {
    simulacion: true,
    contexto,
    pasos,
    aviso: 'Simulación: no se escribió nada en la base de datos. Las condiciones se muestran '
      + 'como bifurcación porque su resultado depende de los datos de cada registro.',
  };
}

function describirEfecto(nodo) {
  const cfg = nodo.config ?? {};
  switch (nodo.tipo) {
    case 'disparador': return `Se activa con: ${cfg.evento ?? 'evento configurado'}`;
    case 'buscar': return `Busca ${cfg.entidad ?? 'registros'} que cumplan la condición`;
    case 'condicion': return `Evalúa ${cfg.campo} ${cfg.op ?? ''} ${cfg.valor ?? ''}`;
    case 'ia_calificar': return 'Calcula el lead score y lo guarda';
    case 'ia_analizar': return 'Calcula probabilidad, riesgos y acciones';
    case 'ia_responder': return 'Redacta un borrador con la base de conocimiento';
    case 'asignar': return 'Asigna al ejecutivo con menos carga en la zona';
    case 'crear_actividad': return `Crea una ${cfg.tipo ?? 'tarea'} con vencimiento en ${cfg.vence_horas ?? 24} h`;
    case 'actualizar': return `Cambia ${cfg.entidad ?? ''}.${cfg.campo ?? ''} a «${cfg.valor ?? ''}»`;
    case 'notificar': return `Notifica ${cfg.destino === 'gerente' ? 'al gerente' : 'al responsable'}`;
    case 'enviar_correo': return 'Registra el correo (sin envío real todavía)';
    case 'enviar_whatsapp': return 'Registra el WhatsApp (sin envío real todavía)';
    case 'esperar': return `Pausa ${cfg.horas ?? 1} h y continúa`;
    default: return 'Sin efecto conocido';
  }
}

/** Métricas del módulo: cuánto trabajo están ahorrando de verdad. */
export const metricas = () =>
  uno(
    `SELECT
       count(*) FILTER (WHERE activa)::int AS activas,
       count(*)::int AS totales,
       COALESCE(sum(ejecuciones), 0)::int AS ejecuciones,
       COALESCE(sum(fallos), 0)::int AS fallos,
       (SELECT count(*)::int FROM automatizacion_ejecuciones
         WHERE creado_en > now() - interval '7 days') AS ejecuciones_semana,
       (SELECT count(*)::int FROM automatizacion_ejecuciones WHERE estado = 'esperando') AS en_espera,
       (SELECT count(*)::int FROM actividades
         WHERE origen = 'automatizacion' AND creado_en > now() - interval '30 days') AS tareas_generadas,
       (SELECT count(*)::int FROM actividades
         WHERE origen = 'ia' AND creado_en > now() - interval '30 days') AS tareas_ia
     FROM automatizaciones`,
  );

export const ejecucionesRecientes = (limite = 40) =>
  consultar(
    `SELECT e.*, a.nombre AS automatizacion
       FROM automatizacion_ejecuciones e
       JOIN automatizaciones a ON a.id = e.automatizacion_id
      ORDER BY e.creado_en DESC LIMIT $1`,
    [limite],
  );
