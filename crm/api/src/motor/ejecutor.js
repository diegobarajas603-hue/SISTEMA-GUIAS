/**
 * ============================================================================
 *  EJECUTOR DE AUTOMATIZACIONES
 * ============================================================================
 *
 *  Recorre el grafo que dibuja el editor visual (`nodos` + `aristas`) y ejecuta
 *  cada nodo de verdad contra la base de datos. No es una simulación: cuando el
 *  flujo dice «crear tarea», la tarea aparece en la agenda del ejecutivo.
 *
 *  Dos honestidades importantes:
 *
 *  1. Los nodos de canal externo (`enviar_correo`, `enviar_whatsapp`) **no**
 *     inventan un envío. Registran la intención con estado `simulado` y dejan
 *     constancia en la traza, porque las integraciones de correo y WhatsApp
 *     todavía no están conectadas. Un flujo que dijera «correo enviado» sin
 *     haberlo enviado sería peor que no tener la función.
 *  2. El nodo `esperar` se persiste en la base y lo reanuda el programador, así
 *     que una espera de 2 horas sobrevive a un reinicio del proceso.
 */

import { consultar, uno, pool } from '../db/pool.js';
import motor from '../ia/motor.js';
import { notificar, registrar } from '../servicios/bitacora.js';

const MAX_ENTIDADES_POR_CORRIDA = 25;
const MAX_PASOS = 60;

/** Punto de entrada: algo pasó en el CRM y puede haber flujos suscritos. */
export async function dispararEvento(evento, contexto = {}) {
  const flujos = await consultar(
    'SELECT * FROM automatizaciones WHERE activa AND evento = $1',
    [evento],
  );
  const resultados = [];
  for (const flujo of flujos) {
    resultados.push(await ejecutar(flujo, contexto));
  }
  return resultados;
}

/** Ejecuta un flujo completo. `contexto` lleva la entidad que originó el disparo. */
export async function ejecutar(flujo, contexto = {}, { desdeNodo = null, pasosPrevios = [] } = {}) {
  const t0 = Date.now();
  const nodos = new Map((flujo.nodos ?? []).map((n) => [n.id, n]));
  const aristas = flujo.aristas ?? [];
  const pasos = [...pasosPrevios];

  const salidas = (id, etiqueta = null) =>
    aristas
      .filter((a) => a.desde === id && (etiqueta === null || (a.etiqueta ?? null) === etiqueta))
      .map((a) => nodos.get(a.hasta))
      .filter(Boolean);

  const inicio = desdeNodo
    ? nodos.get(desdeNodo)
    : (flujo.nodos ?? []).find((n) => n.tipo === 'disparador') ?? (flujo.nodos ?? [])[0];

  if (!inicio) {
    return registrarEjecucion(flujo, 'omitida', pasos, Date.now() - t0, 'El flujo no tiene nodos.', contexto);
  }

  // Pila de trabajo: cada elemento es un nodo con su contexto (que puede haberse
  // especializado por el nodo `buscar`).
  const pila = [{ nodo: inicio, ctx: contexto }];
  let espera = null;

  try {
    while (pila.length && pasos.length < MAX_PASOS) {
      const { nodo, ctx } = pila.shift();
      const t = Date.now();
      const resultado = await ejecutarNodo(nodo, ctx, flujo);
      pasos.push({
        nodo: nodo.id, titulo: nodo.titulo, tipo: nodo.tipo,
        estado: resultado.estado, detalle: resultado.detalle ?? null, ms: Date.now() - t,
      });

      if (resultado.estado === 'detener') break;

      // --- Espera: se persiste y se corta esta rama ---
      if (resultado.espera) {
        const siguiente = salidas(nodo.id)[0];
        if (siguiente) {
          espera = { reanudar_en: resultado.espera, nodo_pendiente: siguiente.id, ctx };
        }
        continue;
      }

      // --- Fan-out: un `buscar` continúa el resto del grafo por cada entidad ---
      if (resultado.entidades) {
        const siguientes = salidas(nodo.id);
        for (const entidad of resultado.entidades.slice(0, MAX_ENTIDADES_POR_CORRIDA)) {
          for (const s of siguientes) {
            pila.push({ nodo: s, ctx: { ...ctx, ...entidad } });
          }
        }
        continue;
      }

      // --- Condición: sigue solo la rama correspondiente ---
      if (nodo.tipo === 'condicion') {
        const rama = resultado.valor ? 'sí' : 'no';
        const siguientes = salidas(nodo.id, rama);
        // Si no hay arista etiquetada, se toma la única salida disponible.
        for (const s of (siguientes.length ? siguientes : salidas(nodo.id))) {
          pila.push({ nodo: s, ctx: { ...ctx, ...(resultado.ctx ?? {}) } });
        }
        continue;
      }

      for (const s of salidas(nodo.id)) {
        pila.push({ nodo: s, ctx: { ...ctx, ...(resultado.ctx ?? {}) } });
      }
    }

    if (espera) {
      return registrarEjecucion(flujo, 'esperando', pasos, Date.now() - t0, null, espera.ctx, espera);
    }
    return registrarEjecucion(flujo, 'ok', pasos, Date.now() - t0, null, contexto);
  } catch (error) {
    return registrarEjecucion(flujo, 'error', pasos, Date.now() - t0, error.message, contexto);
  }
}

// ---------------------------------------------------------------------------
//  Un handler por tipo de nodo
// ---------------------------------------------------------------------------

async function ejecutarNodo(nodo, ctx, flujo) {
  const cfg = nodo.config ?? {};

  switch (nodo.tipo) {
    case 'disparador':
      return { estado: 'ok', detalle: `Evento ${flujo.evento}` };

    // --- Búsquedas que alimentan los flujos programados ---
    case 'buscar': {
      const entidades = await buscarEntidades(cfg);
      return {
        estado: 'ok',
        detalle: `${entidades.length} coincidencia(s)`,
        entidades,
      };
    }

    // --- IA: calificación y análisis con el motor determinista ---
    case 'ia_calificar': {
      if (!ctx.entidad_id) return { estado: 'omitido', detalle: 'Sin prospecto en contexto' };
      const lead = await uno('SELECT * FROM leads WHERE id = $1', [ctx.entidad_id]);
      if (!lead) return { estado: 'omitido', detalle: 'El prospecto ya no existe' };
      const senales = await consultar('SELECT * FROM senales WHERE lead_id = $1', [lead.id]);
      const { score, motivos, temperatura } = motor.calcularLeadScore(lead, senales);
      await pool.query(
        `UPDATE leads SET score = $2, score_motivos = $3::jsonb, temperatura = $4 WHERE id = $1`,
        [lead.id, score, JSON.stringify(motivos), temperatura],
      );
      return { estado: 'ok', detalle: `Score ${score}/100 (${temperatura})`, ctx: { score, temperatura, lead } };
    }

    case 'ia_analizar': {
      if (ctx.entidad_tipo === 'oportunidad' && ctx.entidad_id) {
        const op = await uno(
          `SELECT o.*, c.nombre AS cuenta_nombre FROM oportunidades o
             JOIN cuentas c ON c.id = o.cuenta_id WHERE o.id = $1`, [ctx.entidad_id]);
        if (!op) return { estado: 'omitido', detalle: 'La oportunidad ya no existe' };
        const contactos = await consultar('SELECT rol_compra FROM contactos WHERE cuenta_id = $1', [op.cuenta_id]);
        const cotizaciones = await consultar('SELECT estado FROM cotizaciones WHERE oportunidad_id = $1', [op.id]);
        const analisis = motor.analizarOportunidad(op, { contactos, cotizaciones });
        await pool.query(
          `UPDATE oportunidades SET ia_probabilidad = $2, ia_riesgos = $3::jsonb,
                  ia_acciones = $4::jsonb, ia_calculado_en = now() WHERE id = $1`,
          [op.id, analisis.probabilidad, JSON.stringify(analisis.riesgos), JSON.stringify(analisis.acciones)],
        );
        return {
          estado: 'ok',
          detalle: `Probabilidad ${analisis.probabilidad}% · ${analisis.riesgos.length} riesgo(s)`,
          ctx: { analisis, oportunidad: op },
        };
      }
      if (ctx.entidad_tipo === 'cuenta' && ctx.entidad_id) {
        const cuenta = await uno('SELECT * FROM cuentas WHERE id = $1', [ctx.entidad_id]);
        if (!cuenta) return { estado: 'omitido', detalle: 'La cuenta ya no existe' };
        return { estado: 'ok', detalle: `Riesgo de fuga ${cuenta.riesgo_churn}/100`, ctx: { cuenta } };
      }
      return { estado: 'omitido', detalle: 'Sin entidad analizable en contexto' };
    }

    case 'ia_responder': {
      if (!ctx.entidad_id || ctx.entidad_tipo !== 'ticket') {
        return { estado: 'omitido', detalle: 'Sin ticket en contexto' };
      }
      const ticket = await uno('SELECT * FROM tickets WHERE id = $1', [ctx.entidad_id]);
      if (!ticket) return { estado: 'omitido', detalle: 'El ticket ya no existe' };
      // Busca en la base de conocimiento por categoría y palabras del asunto.
      const articulo = await uno(
        `SELECT titulo, cuerpo FROM articulos_kb
          WHERE publicado AND (categoria = $1 OR to_tsvector('simple', titulo || ' ' || cuerpo)
                @@ plainto_tsquery('simple', $2))
          ORDER BY utiles DESC LIMIT 1`,
        [ticket.categoria, ticket.asunto],
      );
      if (!articulo) return { estado: 'omitido', detalle: 'Sin artículo aplicable en la base de conocimiento' };
      const sugerencia = `${articulo.cuerpo}\n\n(Referencia: «${articulo.titulo}»)`;
      await pool.query('UPDATE tickets SET ia_sugerencia = $2 WHERE id = $1', [ticket.id, sugerencia]);
      return { estado: 'ok', detalle: `Sugerencia basada en «${articulo.titulo}»` };
    }

    // --- Condiciones ---
    case 'condicion': {
      const valorActual = await resolverCampo(cfg.campo, ctx);
      const valor = evaluar(valorActual, cfg.op, cfg.valor);
      return { estado: 'ok', detalle: `${cfg.campo} ${cfg.op ?? ''} ${cfg.valor ?? ''} → ${valor ? 'sí' : 'no'}`, valor };
    }

    // --- Asignación ---
    case 'asignar': {
      if (ctx.entidad_tipo !== 'lead' || !ctx.entidad_id) {
        return { estado: 'omitido', detalle: 'Solo aplica a prospectos' };
      }
      const lead = ctx.lead ?? await uno('SELECT * FROM leads WHERE id = $1', [ctx.entidad_id]);
      const candidatos = await consultar(
        `SELECT u.id, u.nombre, u.rol, u.zona,
                (SELECT count(*)::int FROM leads l
                  WHERE l.propietario_id = u.id AND l.etapa IN ('lead','contacto')) AS carga
           FROM usuarios u WHERE u.activo AND u.rol IN ('ejecutivo','gerente')`,
      );
      const elegido = motor.asignarEjecutivo(lead, candidatos);
      if (!elegido) return { estado: 'error', detalle: 'No hay ejecutivo disponible' };
      await pool.query('UPDATE leads SET propietario_id = $2 WHERE id = $1', [lead.id, elegido.id]);
      return { estado: 'ok', detalle: `Asignado a ${elegido.nombre}`, ctx: { propietario_id: elegido.id } };
    }

    case 'actualizar': {
      const permitidas = {
        cuenta: { tabla: 'cuentas', campos: ['tipo', 'salud', 'propietario_id'] },
        oportunidad: { tabla: 'oportunidades', campos: ['etapa', 'siguiente_paso', 'probabilidad'] },
        lead: { tabla: 'leads', campos: ['etapa', 'prioridad', 'propietario_id'] },
        ticket: { tabla: 'tickets', campos: ['estado', 'prioridad', 'asignado_id'] },
      }[cfg.entidad];
      if (!permitidas || !permitidas.campos.includes(cfg.campo)) {
        return { estado: 'error', detalle: `Campo no permitido: ${cfg.entidad}.${cfg.campo}` };
      }
      const objetivoId = cfg.entidad === ctx.entidad_tipo ? ctx.entidad_id : ctx.cuenta_id;
      if (!objetivoId) return { estado: 'omitido', detalle: 'Sin entidad objetivo en contexto' };
      // El nombre de tabla y columna vienen de la lista blanca de arriba, nunca del
      // cliente: la interpolación aquí es segura y el valor va parametrizado.
      await pool.query(
        `UPDATE ${permitidas.tabla} SET ${cfg.campo} = $2 WHERE id = $1`,
        [objetivoId, cfg.valor],
      );
      return { estado: 'ok', detalle: `${cfg.entidad}.${cfg.campo} = ${cfg.valor}` };
    }

    // --- Actividades ---
    case 'crear_actividad': {
      const usuarioId = ctx.propietario_id
        ?? ctx.oportunidad?.propietario_id ?? ctx.cuenta?.propietario_id ?? ctx.usuario_id ?? null;
      if (!usuarioId) return { estado: 'omitido', detalle: 'Sin responsable a quien asignar la tarea' };

      const vinculo = {
        lead_id: ctx.entidad_tipo === 'lead' ? ctx.entidad_id : null,
        oportunidad_id: ctx.entidad_tipo === 'oportunidad' ? ctx.entidad_id : null,
        cuenta_id: ctx.entidad_tipo === 'cuenta' ? ctx.entidad_id : (ctx.cuenta_id ?? null),
        ticket_id: ctx.entidad_tipo === 'ticket' ? ctx.entidad_id : null,
      };

      // Evita duplicar la misma tarea automática si el flujo se ejecuta a diario.
      const yaExiste = await uno(
        `SELECT id FROM actividades
          WHERE origen = 'automatizacion' AND asunto = $1 AND estado = 'pendiente'
            AND COALESCE(lead_id,0) = COALESCE($2,0)
            AND COALESCE(oportunidad_id,0) = COALESCE($3,0)
            AND COALESCE(cuenta_id,0) = COALESCE($4,0)
            AND COALESCE(ticket_id,0) = COALESCE($5,0)
          LIMIT 1`,
        [nodo.titulo, vinculo.lead_id, vinculo.oportunidad_id, vinculo.cuenta_id, vinculo.ticket_id],
      );
      if (yaExiste) return { estado: 'omitido', detalle: 'La tarea ya estaba pendiente' };

      await pool.query(
        `INSERT INTO actividades (tipo, asunto, descripcion, estado, prioridad, usuario_id,
                                  lead_id, oportunidad_id, cuenta_id, ticket_id, vence_en, origen)
         VALUES ($1,$2,$3,'pendiente',$4,$5,$6,$7,$8,$9, now() + ($10 || ' hours')::interval, 'automatizacion')`,
        [
          cfg.tipo ?? 'tarea', nodo.titulo,
          `Generada por la automatización «${flujo.nombre}».`,
          cfg.prioridad ?? 3, usuarioId,
          vinculo.lead_id, vinculo.oportunidad_id, vinculo.cuenta_id, vinculo.ticket_id,
          String(cfg.vence_horas ?? 24),
        ],
      );
      return { estado: 'ok', detalle: `Tarea «${nodo.titulo}» para dentro de ${cfg.vence_horas ?? 24} h` };
    }

    // --- Notificación interna ---
    case 'notificar': {
      let destinoId = ctx.propietario_id
        ?? ctx.oportunidad?.propietario_id ?? ctx.cuenta?.propietario_id ?? null;
      if (cfg.destino === 'gerente') {
        const gerente = await uno(
          `SELECT g.id FROM usuarios g
            WHERE g.rol = 'gerente' AND g.activo
              AND (g.equipo_id = (SELECT equipo_id FROM usuarios WHERE id = $1) OR $1 IS NULL)
            ORDER BY g.id LIMIT 1`,
          [destinoId],
        );
        destinoId = gerente?.id ?? destinoId;
      }
      if (!destinoId) return { estado: 'omitido', detalle: 'Sin destinatario' };
      await notificar({
        usuario_id: destinoId, tipo: 'ia', titulo: nodo.titulo,
        cuerpo: `Automatización «${flujo.nombre}»${ctx.oportunidad?.nombre ? ` · ${ctx.oportunidad.nombre}` : ''}`,
        enlace: enlaceDe(ctx),
      });
      return { estado: 'ok', detalle: 'Notificación entregada' };
    }

    // --- Canales externos: aún no integrados, y se dice ---
    case 'enviar_correo':
    case 'enviar_whatsapp': {
      const canal = nodo.tipo === 'enviar_correo' ? 'correo' : 'WhatsApp';
      if (ctx.entidad_tipo && ctx.entidad_id) {
        await registrar({
          entidad_tipo: ctx.entidad_tipo, entidad_id: ctx.entidad_id,
          cuenta_id: ctx.cuenta_id ?? null, tipo: 'automatizacion',
          titulo: `${canal} programado por «${flujo.nombre}»`,
          detalle: `Plantilla «${cfg.plantilla ?? 'sin plantilla'}». Pendiente de envío: la integración de ${canal} no está conectada todavía.`,
          metadata: { simulado: true, plantilla: cfg.plantilla ?? null, canal },
        });
      }
      return { estado: 'simulado', detalle: `${canal} registrado, sin integración de envío` };
    }

    // --- Espera durable ---
    case 'esperar': {
      const horas = Number(cfg.horas ?? 1);
      return {
        estado: 'esperando',
        detalle: `Reanudar en ${horas} h`,
        espera: new Date(Date.now() + horas * 3_600_000),
      };
    }

    default:
      return { estado: 'omitido', detalle: `Tipo de nodo desconocido: ${nodo.tipo}` };
  }
}

// ---------------------------------------------------------------------------
//  Auxiliares
// ---------------------------------------------------------------------------

/** Búsquedas soportadas por el nodo `buscar`, todas con lista blanca. */
async function buscarEntidades(cfg) {
  if (cfg.entidad === 'oportunidad') {
    const dias = Number(cfg.dias_inactiva ?? 14);
    const filas = await consultar(
      `SELECT o.id, o.cuenta_id, o.propietario_id, o.monto, o.nombre
         FROM oportunidades o
        WHERE o.estado = 'abierta'
          AND COALESCE(o.ultima_actividad_en, o.creado_en) < now() - ($1 || ' days')::interval
        ORDER BY o.monto DESC LIMIT $2`,
      [String(dias), MAX_ENTIDADES_POR_CORRIDA],
    );
    return filas.map((f) => ({
      entidad_tipo: 'oportunidad', entidad_id: f.id, cuenta_id: f.cuenta_id,
      propietario_id: f.propietario_id, monto: f.monto,
    }));
  }

  if (cfg.entidad === 'cotizacion') {
    const dias = Number(cfg.dias ?? 3);
    const filas = await consultar(
      `SELECT c.id, c.cuenta_id, c.propietario_id, c.oportunidad_id, c.vista_en, c.total
         FROM cotizaciones c
        WHERE c.estado IN ('enviada','vista')
          AND c.enviada_en < now() - ($1 || ' days')::interval
        ORDER BY c.total DESC LIMIT $2`,
      [String(dias), MAX_ENTIDADES_POR_CORRIDA],
    );
    return filas.map((f) => ({
      entidad_tipo: 'cotizacion', entidad_id: f.id, cuenta_id: f.cuenta_id,
      propietario_id: f.propietario_id, vista_en: f.vista_en, total: f.total,
    }));
  }

  if (cfg.entidad === 'cuenta') {
    const minimo = Number(cfg.riesgo_min ?? 60);
    const filas = await consultar(
      `SELECT c.id, c.propietario_id, c.riesgo_churn, c.ingresos_ano
         FROM cuentas c
        WHERE c.tipo = 'cliente' AND c.riesgo_churn >= $1
        ORDER BY c.ingresos_ano DESC LIMIT $2`,
      [minimo, MAX_ENTIDADES_POR_CORRIDA],
    );
    return filas.map((f) => ({
      entidad_tipo: 'cuenta', entidad_id: f.id, cuenta_id: f.id,
      propietario_id: f.propietario_id, riesgo_churn: f.riesgo_churn,
    }));
  }

  if (cfg.entidad === 'lead') {
    const filas = await consultar(
      `SELECT l.id, l.propietario_id, l.score FROM leads l
        WHERE l.etapa = 'lead' AND l.creado_en < now() - interval '2 days'
        ORDER BY l.score DESC LIMIT $1`,
      [MAX_ENTIDADES_POR_CORRIDA],
    );
    return filas.map((f) => ({
      entidad_tipo: 'lead', entidad_id: f.id, propietario_id: f.propietario_id, score: f.score,
    }));
  }

  return [];
}

/** Resuelve el valor de un campo del contexto, con acceso a la base si hace falta. */
async function resolverCampo(campo, ctx) {
  if (!campo) return null;
  if (campo in ctx) return ctx[campo];
  if (ctx.entidad_tipo && ctx.entidad_id) {
    const tabla = {
      lead: 'leads', oportunidad: 'oportunidades', cuenta: 'cuentas',
      ticket: 'tickets', cotizacion: 'cotizaciones',
    }[ctx.entidad_tipo];
    // Solo se consultan columnas conocidas: nada del cliente entra al SQL.
    const columnas = {
      leads: ['score', 'etapa', 'prioridad', 'temperatura', 'valor_estimado', 'urgencia'],
      oportunidades: ['monto', 'etapa', 'probabilidad', 'ia_probabilidad', 'competidor'],
      cuentas: ['riesgo_churn', 'salud', 'tipo', 'ingresos_ano', 'tamano'],
      tickets: ['prioridad', 'estado', 'canal', 'categoria', 'sentimiento'],
      cotizaciones: ['estado', 'total', 'vista_en'],
    }[tabla];
    if (tabla && columnas?.includes(campo)) {
      const fila = await uno(`SELECT ${campo} AS v FROM ${tabla} WHERE id = $1`, [ctx.entidad_id]);
      return fila?.v ?? null;
    }
  }
  return null;
}

function evaluar(actual, op, esperado) {
  switch (op) {
    case '>=': return Number(actual) >= Number(esperado);
    case '>': return Number(actual) > Number(esperado);
    case '<=': return Number(actual) <= Number(esperado);
    case '<': return Number(actual) < Number(esperado);
    case '=': return String(actual) === String(esperado);
    case '<>': return String(actual) !== String(esperado);
    case 'en': return Array.isArray(esperado) && esperado.map(String).includes(String(actual));
    case 'existe': return actual !== null && actual !== undefined && actual !== '';
    case 'vacio': return actual === null || actual === undefined || actual === '';
    default: return Boolean(actual);
  }
}

const enlaceDe = (ctx) => ({
  lead: `/prospectos/${ctx.entidad_id}`,
  oportunidad: `/oportunidades/${ctx.entidad_id}`,
  cuenta: `/clientes/${ctx.entidad_id}`,
  ticket: `/soporte/${ctx.entidad_id}`,
  cotizacion: `/cotizaciones/${ctx.entidad_id}`,
}[ctx.entidad_tipo] ?? null);

async function registrarEjecucion(flujo, estado, pasos, ms, error, contexto, espera = null) {
  const fila = await uno(
    `INSERT INTO automatizacion_ejecuciones
       (automatizacion_id, estado, entidad_tipo, entidad_id, pasos, duracion_ms, error,
        reanudar_en, nodo_pendiente, contexto)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
    [
      flujo.id, estado, contexto?.entidad_tipo ?? null, contexto?.entidad_id ?? null,
      JSON.stringify(pasos), ms, error,
      espera?.reanudar_en ?? null, espera?.nodo_pendiente ?? null,
      JSON.stringify(espera ? contextoSerializable(espera.ctx) : {}),
    ],
  );

  const exito = estado === 'ok' || estado === 'esperando';
  await pool.query(
    `UPDATE automatizaciones
        SET ejecuciones = ejecuciones + 1,
            exitos = exitos + CASE WHEN $2 THEN 1 ELSE 0 END,
            fallos = fallos + CASE WHEN $3 THEN 1 ELSE 0 END,
            ultimo_run_en = now()
      WHERE id = $1`,
    [flujo.id, exito, estado === 'error'],
  );
  return fila;
}

/** El contexto persistido debe ser JSON plano: se quedan solo los identificadores. */
const contextoSerializable = (ctx = {}) => ({
  entidad_tipo: ctx.entidad_tipo ?? null,
  entidad_id: ctx.entidad_id ?? null,
  cuenta_id: ctx.cuenta_id ?? null,
  propietario_id: ctx.propietario_id ?? null,
});

/** Reanuda las esperas vencidas. Lo llama el programador. */
export async function reanudarEsperas() {
  const pendientes = await consultar(
    `SELECT e.*, a.nombre, a.nodos, a.aristas, a.evento, a.activa
       FROM automatizacion_ejecuciones e
       JOIN automatizaciones a ON a.id = e.automatizacion_id
      WHERE e.estado = 'esperando' AND e.reanudar_en <= now() AND a.activa
      ORDER BY e.reanudar_en LIMIT 20`,
  );

  for (const p of pendientes) {
    // Se marca antes de continuar para que dos ticks no reanuden lo mismo.
    await pool.query(
      `UPDATE automatizacion_ejecuciones SET estado = 'parcial', reanudar_en = NULL WHERE id = $1`,
      [p.id],
    );
    await ejecutar(
      { id: p.automatizacion_id, nombre: p.nombre, nodos: p.nodos, aristas: p.aristas, evento: p.evento },
      p.contexto ?? {},
      { desdeNodo: p.nodo_pendiente, pasosPrevios: p.pasos ?? [] },
    ).catch((e) => console.error('[automatizaciones] al reanudar:', e.message));
  }
  return pendientes.length;
}

export default { dispararEvento, ejecutar, reanudarEsperas };
