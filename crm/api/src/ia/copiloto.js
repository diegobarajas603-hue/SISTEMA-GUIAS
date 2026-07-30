/**
 * ============================================================================
 *  COPILOTO COMERCIAL
 * ============================================================================
 *
 *  Dos caminos, misma calidad de datos:
 *
 *  A) Con `ANTHROPIC_API_KEY`: ciclo de herramientas. El modelo elige qué consultar,
 *     se le entregan datos reales del CRM y redacta la respuesta.
 *
 *  B) Sin llave: un clasificador de intenciones enruta la pregunta a **la misma
 *     herramienta** y la respuesta se arma con plantillas.
 *
 *  Las diez preguntas del pliego funcionan en ambos modos. La diferencia está en la
 *  redacción, nunca en las cifras.
 */

import { consultar, uno, pool } from '../db/pool.js';
import proveedor from './proveedor.js';
import { DEFINICIONES, ejecutarHerramienta } from './herramientas.js';
import { formatearMXN, formatearFechaCorta } from '../lib/formato.js';

const MAX_VUELTAS = 4;

const SISTEMA = `Eres el copiloto comercial de Aura CRM, la plataforma de Fletes Tauro,
una empresa mexicana de transporte de carga que opera principalmente la ruta
Monterrey ↔ Ciudad de México, además de última milla, almacenaje, cross-docking,
carga refrigerada y servicio dedicado.

CÓMO TRABAJAS
- Consulta el CRM con las herramientas disponibles antes de afirmar cualquier cosa.
- NUNCA inventes cifras, nombres de clientes, fechas ni montos. Si una herramienta no
  devuelve el dato, dilo con claridad: «no tengo ese dato en el CRM».
- Los montos llegan en centavos de peso mexicano. Al escribirlos, conviértelos a pesos
  y usa formato mexicano (por ejemplo 1 250 000 centavos → $12,500.00 MXN).
- Cuando cites un grupo de registros, menciona cuántos son y su monto total.
- Si el usuario se refiere a «este cliente» o «esta oportunidad», usa el contexto de la
  pantalla que se te da; si no hay contexto, busca por nombre con buscar_entidad.

CÓMO ESCRIBES
- Español de México, tono profesional y directo, como un buen analista comercial.
- Respuestas breves: 2 a 5 frases, o una lista corta. Nada de rodeos ni de repetir la
  pregunta.
- Empieza por la conclusión, después el detalle.
- Cuando detectes un riesgo, di qué hacer al respecto en una frase concreta.
- Sin emojis salvo que el usuario los use. Sin markdown de encabezados; listas simples
  con guiones sí.`;

// ---------------------------------------------------------------------------
//  Conversaciones
// ---------------------------------------------------------------------------

export async function crearConversacion(usuarioId, titulo = 'Nueva conversación') {
  return uno(
    'INSERT INTO ia_conversaciones (usuario_id, titulo) VALUES ($1, $2) RETURNING *',
    [usuarioId, titulo],
  );
}

export const listarConversaciones = (usuarioId) =>
  consultar(
    `SELECT c.*, (SELECT count(*)::int FROM ia_mensajes m WHERE m.conversacion_id = c.id) AS mensajes
       FROM ia_conversaciones c WHERE c.usuario_id = $1
      ORDER BY c.actualizado_en DESC LIMIT 30`,
    [usuarioId],
  );

export const mensajes = (conversacionId, usuarioId) =>
  consultar(
    `SELECT m.* FROM ia_mensajes m
       JOIN ia_conversaciones c ON c.id = m.conversacion_id
      WHERE m.conversacion_id = $1 AND c.usuario_id = $2
      ORDER BY m.creado_en`,
    [conversacionId, usuarioId],
  );

export async function borrarConversacion(id, usuarioId) {
  await pool.query('DELETE FROM ia_conversaciones WHERE id = $1 AND usuario_id = $2', [id, usuarioId]);
}

// ---------------------------------------------------------------------------
//  Preguntar
// ---------------------------------------------------------------------------

/**
 * @param {string} pregunta
 * @param {object} usuario   usuario de la sesión (la IA hereda sus permisos)
 * @param {object} opciones  { conversacionId, contexto: { ruta, entidad_tipo, entidad_id } }
 */
export async function preguntar(pregunta, usuario, opciones = {}) {
  const { conversacionId = null, contexto = {} } = opciones;

  let conversacion = null;
  if (conversacionId) {
    conversacion = await uno(
      'SELECT * FROM ia_conversaciones WHERE id = $1 AND usuario_id = $2',
      [conversacionId, usuario.id],
    );
  }
  if (!conversacion) {
    conversacion = await crearConversacion(usuario.id, pregunta.slice(0, 60));
  }

  await pool.query(
    'INSERT INTO ia_mensajes (conversacion_id, rol, cuerpo) VALUES ($1, $2, $3)',
    [conversacion.id, 'usuario', pregunta],
  );

  const respuesta = proveedor.disponible()
    ? await conModelo(pregunta, usuario, conversacion, contexto)
    : await conMotor(pregunta, usuario, contexto);

  await pool.query(
    `INSERT INTO ia_mensajes (conversacion_id, rol, cuerpo, datos, modelo)
     VALUES ($1, 'asistente', $2, $3::jsonb, $4)`,
    [
      conversacion.id, respuesta.texto,
      JSON.stringify({ herramientas: respuesta.herramientas ?? [], datos: respuesta.datos ?? null }),
      respuesta.modelo ?? 'motor-determinista',
    ],
  );
  await pool.query('UPDATE ia_conversaciones SET actualizado_en = now() WHERE id = $1', [conversacion.id]);

  return { ...respuesta, conversacion_id: conversacion.id };
}

/** Camino A: ciclo de herramientas con el modelo. */
async function conModelo(pregunta, usuario, conversacion, contexto) {
  const historial = await consultar(
    `SELECT rol, cuerpo FROM ia_mensajes WHERE conversacion_id = $1
      ORDER BY creado_en DESC LIMIT 8`,
    [conversacion.id],
  );

  const mensajesModelo = historial
    .reverse()
    .filter((m) => m.cuerpo?.trim())
    .map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.cuerpo }));

  // El último mensaje ya es la pregunta (se insertó antes de llamar aquí).
  if (mensajesModelo.at(-1)?.role !== 'user') {
    mensajesModelo.push({ role: 'user', content: pregunta });
  }

  const sistema = `${SISTEMA}

CONTEXTO ACTUAL
- Usuario: ${usuario.nombre} (${usuario.rol}${usuario.zona ? `, zona ${usuario.zona}` : ''}).
- Fecha de hoy: ${new Date().toISOString().slice(0, 10)}.
${contexto.ruta ? `- Pantalla abierta: ${contexto.ruta}.` : ''}
${contexto.entidad_tipo && contexto.entidad_id
    ? `- Registro abierto: ${contexto.entidad_tipo} #${contexto.entidad_id}. Si el usuario dice «este/esta», se refiere a este registro.`
    : ''}`;

  const usadas = [];
  let datosFinales = null;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
    const r = await proveedor.intentar({
      sistema, mensajes: mensajesModelo, herramientas: DEFINICIONES,
    });
    // El proveedor falló: se cae al camino determinista sin molestar al usuario.
    if (!r) return conMotor(pregunta, usuario, contexto);

    if (r.motivoFin !== 'tool_use' || !r.usoHerramientas.length) {
      return {
        texto: r.texto || 'No encontré información suficiente para responder eso.',
        herramientas: usadas, datos: datosFinales, modelo: r.modelo,
      };
    }

    mensajesModelo.push({ role: 'assistant', content: r.contenido });

    const resultados = [];
    for (const uso of r.usoHerramientas) {
      let salida;
      try {
        salida = await ejecutarHerramienta(uso.name, uso.input, usuario);
        usadas.push({ nombre: uso.name, argumentos: uso.input });
        datosFinales = { herramienta: uso.name, resultado: salida };
      } catch (error) {
        salida = { error: error.message };
      }
      resultados.push({
        type: 'tool_result',
        tool_use_id: uso.id,
        content: JSON.stringify(salida).slice(0, 24_000),
      });
    }
    mensajesModelo.push({ role: 'user', content: resultados });
  }

  return {
    texto: 'Consulté varias veces el CRM y no logré cerrar una respuesta clara. Intenta con una pregunta más específica.',
    herramientas: usadas, datos: datosFinales, modelo: proveedor.modelo(),
  };
}

// ---------------------------------------------------------------------------
//  Camino B: clasificador de intenciones + plantillas
// ---------------------------------------------------------------------------

/**
 * Reglas léxicas ordenadas por especificidad. Cada una apunta a la MISMA herramienta
 * que usaría el modelo, así que las cifras son idénticas; solo cambia quién escribe
 * la prosa.
 */
const INTENCIONES = [
  {
    clave: 'cerca_de_cerrar',
    patrones: [/cerca(nas)? (de|a) cerrar/i, /por cerrar/i, /voy a cerrar/i, /cierro este mes/i, /m[aá]s probables/i],
    herramienta: 'oportunidades_por_cerrar',
  },
  {
    clave: 'sin_seguimiento',
    patrones: [/sin seguimiento/i, /sin contacto/i, /d[ií]as sin/i, /abandonad[oa]s?/i, /no he contactado/i],
    herramienta: 'cuentas_sin_seguimiento',
    argumentos: (p) => {
      const m = p.match(/(\d+)\s*d[ií]as/i);
      return m ? { dias: Number(m[1]) } : {};
    },
  },
  {
    clave: 'conversion_vendedor',
    patrones: [/mejor conversi[oó]n/i, /qu[eé] vendedor/i, /ranking/i, /desempe[nñ]o del equipo/i, /mejor vendedor/i],
    herramienta: 'conversion_por_vendedor',
  },
  {
    clave: 'resumen_hoy',
    patrones: [/resum(e|en) (la actividad )?de hoy/i, /qu[eé] tengo hoy/i, /mi d[ií]a/i, /actividad de hoy/i],
    herramienta: 'resumen_de_hoy',
  },
  {
    clave: 'pronostico',
    patrones: [/pron[oó]stico/i, /forecast/i, /voy a llegar/i, /alcanzar? (mi|la) meta/i, /objetivo del mes/i],
    herramienta: 'pronostico',
  },
  {
    clave: 'riesgos',
    patrones: [/riesgo/i, /estancad[oa]s?/i, /atorad[oa]s?/i, /en peligro/i, /se me est[aá]n? cayendo/i],
    herramienta: 'riesgos_detectados',
  },
  {
    clave: 'nba',
    patrones: [/qu[eé] (debo|hago|deber[ií]a) (hacer|priorizar)/i, /por d[oó]nde empiezo/i, /prioridad/i, /siguiente (mejor )?acci[oó]n/i],
    herramienta: 'siguiente_mejor_accion',
  },
  {
    clave: 'prospectos',
    patrones: [/mejores prospectos/i, /a qui[eé]n llamo/i, /leads? (calientes|m[aá]s)/i, /prospectos? con m[aá]s/i],
    herramienta: 'mejores_prospectos',
  },
  {
    clave: 'venta_cruzada',
    patrones: [/venta cruzada/i, /cross.?sell/i, /venta adicional/i, /up.?sell/i,
      /qu[eé] m[aá]s (le )?puedo vender/i, /servicio adicional/i, /a qui[eé]n.*(puedo )?vender/i],
    herramienta: 'venta_cruzada',
  },
  {
    clave: 'embudo',
    patrones: [/embudo/i, /funnel/i, /cuello de botella/i, /d[oó]nde (se )?pierdo/i, /conversi[oó]n por etapa/i],
    herramienta: 'embudo',
  },
  {
    clave: 'soporte',
    patrones: [/tickets?/i, /soporte/i, /sla/i, /csat/i, /atenci[oó]n a clientes/i],
    herramienta: 'estado_soporte',
  },
];

async function conMotor(pregunta, usuario, contexto) {
  // «¿Qué hago con este cliente?» con un registro abierto en pantalla: se responde
  // sobre ese registro, que es lo que el usuario espera.
  if (/este cliente|esta cuenta|este prospecto|esta oportunidad/i.test(pregunta)
      && contexto.entidad_tipo && contexto.entidad_id) {
    if (contexto.entidad_tipo === 'cuenta') {
      const datos = await ejecutarHerramienta('contexto_cuenta', { cuenta_id: contexto.entidad_id }, usuario);
      return { texto: redactarCuenta(datos), herramientas: [{ nombre: 'contexto_cuenta' }], datos: { herramienta: 'contexto_cuenta', resultado: datos } };
    }
    if (contexto.entidad_tipo === 'oportunidad') {
      const datos = await ejecutarHerramienta('contexto_oportunidad', { oportunidad_id: contexto.entidad_id }, usuario);
      return { texto: redactarOportunidad(datos), herramientas: [{ nombre: 'contexto_oportunidad' }], datos: { herramienta: 'contexto_oportunidad', resultado: datos } };
    }
  }

  const intencion = INTENCIONES.find((i) => i.patrones.some((p) => p.test(pregunta)));

  if (!intencion) {
    // Último recurso: buscar por nombre lo que el usuario mencionó.
    const posible = pregunta.replace(/[¿?¡!.,]/g, '').split(/\s+/).filter((w) => w.length > 3).slice(-3).join(' ');
    if (posible) {
      const r = await ejecutarHerramienta('buscar_entidad', { termino: posible }, usuario);
      if (r.resultados?.length) {
        return {
          texto: `Encontré ${r.resultados.length} registro(s) relacionado(s) con «${posible}»:\n`
            + r.resultados.slice(0, 5).map((x) => `- ${x.tipo}: ${x.titulo}${x.subtitulo ? ` · ${x.subtitulo}` : ''}`).join('\n')
            + '\n\nAbre el que te interese o pregúntame algo concreto sobre él.',
          herramientas: [{ nombre: 'buscar_entidad' }], datos: { herramienta: 'buscar_entidad', resultado: r },
        };
      }
    }
    return { texto: sugerenciaDeAyuda(), herramientas: [], datos: null };
  }

  const argumentos = intencion.argumentos ? intencion.argumentos(pregunta) : {};
  const datos = await ejecutarHerramienta(intencion.herramienta, argumentos, usuario);

  return {
    texto: REDACTORES[intencion.herramienta](datos, usuario),
    herramientas: [{ nombre: intencion.herramienta, argumentos }],
    datos: { herramienta: intencion.herramienta, resultado: datos },
  };
}

const sugerenciaDeAyuda = () =>
  `No identifiqué qué necesitas. Puedo ayudarte con esto:

- ¿Cuáles son mis oportunidades más cercanas a cerrar?
- ¿Qué clientes llevan más de 20 días sin seguimiento?
- ¿Qué vendedor tiene mejor conversión?
- Resume la actividad de hoy
- ¿Voy a alcanzar mi meta del mes?
- ¿Qué oportunidades están en riesgo?
- ¿Qué debo hacer primero hoy?
- ¿A quién le puedo vender un servicio adicional?
- ¿Dónde se pierde más gente en el embudo?
- ¿Cómo va el soporte?`;

// ---------------------------------------------------------------------------
//  Redactores deterministas — misma información, prosa de plantilla
// ---------------------------------------------------------------------------

const plural = (n, singular, prural) => `${n} ${n === 1 ? singular : prural}`;

const REDACTORES = {
  oportunidades_por_cerrar: (d) => {
    if (!d.total) return 'No tienes oportunidades con fecha de cierre en los próximos 30 días.';
    const lista = d.oportunidades.slice(0, 5).map((o) => {
      const p = o.ia_probabilidad ?? o.probabilidad;
      const cuando = o.dias_para_cierre < 0
        ? `venció hace ${Math.abs(o.dias_para_cierre)} d`
        : `en ${o.dias_para_cierre} d`;
      return `- ${o.cuenta} · ${formatearMXN(o.monto)} · ${p}% · ${cuando}`;
    }).join('\n');
    return `Tienes ${plural(d.total, 'oportunidad', 'oportunidades')} por cerrar en los próximos 30 días, `
      + `por ${formatearMXN(d.monto_total)} en total. Las más probables:\n${lista}`;
  },

  cuentas_sin_seguimiento: (d) => {
    if (!d.total) return 'Buenas noticias: no hay cuentas sin seguimiento en ese periodo.';
    const lista = d.cuentas.slice(0, 5).map((c) => {
      const dias = c.dias_sin_contacto ?? '—';
      const riesgo = c.riesgo_churn >= 55 ? ` · riesgo de fuga ${c.riesgo_churn}/100` : '';
      return `- ${c.nombre_comercial || c.nombre} · ${dias} d sin contacto · ${formatearMXN(c.ingresos_ano)} al año${riesgo}`;
    }).join('\n');
    return `Hay ${plural(d.total, 'cuenta', 'cuentas')} sin seguimiento, con ${formatearMXN(d.ingresos_en_juego)} `
      + `de facturación anual en juego. Las de mayor valor:\n${lista}\n\nEmpieza por la primera: es la que más pesa.`;
  },

  conversion_por_vendedor: (d) => {
    if (!d.vendedores.length) return 'Todavía no hay suficientes operaciones cerradas para comparar al equipo.';
    const mejor = d.vendedores[0];
    const lista = d.vendedores.slice(0, 5).map((v, i) =>
      `${i + 1}. ${v.nombre} · ${v.conversion}% de conversión · ${v.ganadas}/${v.cerradas} ganadas · ${formatearMXN(v.ingresos)}`,
    ).join('\n');
    return `${mejor.nombre} tiene la mejor conversión: ${mejor.conversion}% `
      + `(${mejor.ganadas} de ${mejor.cerradas} operaciones cerradas en ${d.periodo_meses} meses).\n\n${lista}`
      + `\n\n${d.criterio}`;
  },

  resumen_de_hoy: (d) => {
    const a = d.actividades;
    const partes = [];
    if (a.llamadas) partes.push(plural(a.llamadas, 'llamada', 'llamadas'));
    if (a.reuniones) partes.push(plural(a.reuniones, 'reunión', 'reuniones'));
    if (a.correos) partes.push(plural(a.correos, 'correo', 'correos'));
    if (a.whatsapp) partes.push(`${a.whatsapp} de WhatsApp`);
    if (a.seguimientos) partes.push(plural(a.seguimientos, 'seguimiento', 'seguimientos'));

    let texto = a.total
      ? `Hoy tienes ${a.total} ${a.total === 1 ? 'actividad' : 'actividades'}: ${partes.join(', ')}. `
        + `Ya completaste ${a.completadas} y quedan ${a.pendientes}.`
      : 'Hoy no tienes actividades agendadas.';

    if (d.cerradas_hoy.length) {
      const ganadas = d.cerradas_hoy.filter((o) => o.estado === 'ganada');
      if (ganadas.length) {
        texto += ` Se cerraron ${plural(ganadas.length, 'operación', 'operaciones')} por `
          + `${formatearMXN(ganadas.reduce((s, o) => s + Number(o.monto), 0))}.`;
      }
    }
    if (d.prospectos_nuevos) texto += ` Entraron ${plural(d.prospectos_nuevos, 'prospecto nuevo', 'prospectos nuevos')}.`;

    if (d.pendientes_hoy.length) {
      texto += `\n\nLo pendiente:\n${d.pendientes_hoy.slice(0, 6)
        .map((p) => `- ${p.tipo}: ${p.asunto}${p.relacionado ? ` · ${p.relacionado}` : ''}`).join('\n')}`;
    }
    return texto;
  },

  pronostico: (d) => {
    const base = `Cerrado en el mes: ${formatearMXN(d.cerrado)} de una meta de ${formatearMXN(d.meta)}. `
      + `La proyección es ${formatearMXN(d.proyeccion)}, en un rango de ${formatearMXN(d.rango.bajo)} `
      + `a ${formatearMXN(d.rango.alto)}.`;
    if (d.probabilidadMeta == null) return `${base} No hay meta definida para calcular la probabilidad.`;
    const juicio = d.probabilidadMeta >= 70 ? 'Vas bien.'
      : d.probabilidadMeta >= 45 ? 'Está en la balanza.'
        : 'Vas corto.';
    const falta = d.faltante > 0
      ? ` Faltan ${formatearMXN(d.faltante)} y quedan ${d.ritmo.diasRestantes} días: `
        + `necesitas ${formatearMXN(d.ritmo.requeridoDiario)} por día.`
      : ' Ya está cubierta la meta con lo proyectado.';
    return `Tienes un ${d.probabilidadMeta}% de probabilidad de superar tu objetivo este mes. ${juicio}\n\n${base}${falta}`
      + `\n\nDel pipeline del periodo: ${formatearMXN(d.tramos.comprometido)} comprometido, `
      + `${formatearMXN(d.tramos.probable)} probable y ${formatearMXN(d.tramos.optimista)} optimista.`;
  },

  riesgos_detectados: (d) => {
    if (!d.total) return 'No hay riesgos activos detectados. El pipeline está limpio.';
    const lista = d.riesgos.slice(0, 5).map((r) =>
      `- ${r.titulo} (${r.severidad}, ${formatearMXN(r.impacto)}): ${r.explicacion}`,
    ).join('\n');
    return `Detecté ${plural(d.total, 'riesgo', 'riesgos')} con ${formatearMXN(d.impacto_total)} en juego:\n${lista}`;
  },

  siguiente_mejor_accion: (d) => {
    if (!d.total) return 'No hay nada urgente en tu cartera ahora mismo.';
    const lista = d.acciones.map((a, i) => `${i + 1}. ${a.titulo} — ${a.detalle}`).join('\n');
    return `Esto es lo que conviene hacer, en orden de impacto:\n${lista}`;
  },

  mejores_prospectos: (d) => {
    if (!d.total) return 'No hay prospectos con puntuación alta en este momento.';
    const lista = d.prospectos.slice(0, 5).map((p) => {
      const motivo = (p.score_motivos ?? []).filter((m) => m.positivo)[0]?.etiqueta;
      return `- ${p.nombre}${p.empresa ? ` · ${p.empresa}` : ''} · score ${p.score}/100 (${p.temperatura})`
        + `${motivo ? ` — ${motivo}` : ''}`;
    }).join('\n');
    return `Estos son los prospectos que valen tu tiempo hoy:\n${lista}`;
  },

  venta_cruzada: (d) => {
    if (!d.total) return 'No hay oportunidades de venta cruzada detectadas por ahora.';
    const lista = d.sugerencias.slice(0, 5).map((s) =>
      `- ${s.titulo} · ${formatearMXN(s.impacto)} estimado a 6 meses (confianza ${s.confianza}%)`,
    ).join('\n');
    return `Hay ${plural(d.total, 'oportunidad', 'oportunidades')} de venta cruzada por `
      + `${formatearMXN(d.impacto_total)} en total:\n${lista}`;
  },

  embudo: (d) => {
    const lista = d.etapas.map((e) =>
      `- ${e.titulo}: ${e.alcanzaron} llegaron (${e.porcentajePaso}% de la etapa anterior)`,
    ).join('\n');
    const cuello = d.cuello_de_botella
      ? `\n\nEl cuello de botella está en ${d.cuello_de_botella.etapa}: solo pasa el `
        + `${d.cuello_de_botella.conversion}% y se quedan ${d.cuello_de_botella.se_pierden} en el camino.`
      : '';
    return `Embudo de los últimos 12 meses:\n${lista}${cuello}`;
  },

  estado_soporte: (d) => {
    const partes = [`${d.abiertos} tickets abiertos`];
    if (d.urgentes) partes.push(`${d.urgentes} urgentes`);
    if (d.sla_incumplido) partes.push(`${d.sla_incumplido} con SLA incumplido`);
    return `${partes.join(', ')}. Cumplimiento histórico de SLA: ${d.cumplimiento_sla ?? '—'}%, `
      + `primera respuesta en ${d.horas_primera_respuesta ?? '—'} h y CSAT de ${d.csat ?? '—'}/5. `
      + `${d.resueltos_ia ? `La IA resolvió ${d.resueltos_ia} tickets sin intervención.` : ''}`;
  },
};

function redactarCuenta(d) {
  const c = d.cuenta;
  const lineas = [
    `${c.nombre} · ${c.industria ?? 'industria no registrada'} · cliente ${c.tipo}.`,
    `Salud ${c.salud}/100, riesgo de fuga ${c.riesgo_churn}/100, ${formatearMXN(c.ingresos_ano)} facturados en el año.`,
  ];
  if (d.mapa_poder?.advertencia) lineas.push(d.mapa_poder.advertencia);
  if (d.oportunidades_abiertas.length) {
    lineas.push(`Tiene ${plural(d.oportunidades_abiertas.length, 'oportunidad abierta', 'oportunidades abiertas')}: `
      + d.oportunidades_abiertas.map((o) => `${o.nombre} (${formatearMXN(o.monto)}, ${o.etapa})`).join('; ') + '.');
  } else {
    lineas.push('No tiene oportunidades abiertas: es candidato a una propuesta nueva.');
  }
  if (d.insights.length) {
    lineas.push(`\nLo que detecté:\n${d.insights.map((i) => `- ${i.titulo}: ${i.explicacion}`).join('\n')}`);
  }
  if (d.facturacion.vencido > 0) lineas.push(`Ojo: tiene ${formatearMXN(d.facturacion.vencido)} de cartera vencida.`);
  return lineas.join(' ');
}

function redactarOportunidad(d) {
  const o = d.oportunidad;
  const lineas = [
    `${o.nombre} · ${o.cuenta} · ${formatearMXN(o.monto)} · etapa ${o.etapa}.`,
    `El vendedor le da ${o.probabilidad_vendedor}% de probabilidad; el modelo calcula ${o.probabilidad_ia}%.`,
  ];
  if (Math.abs(o.probabilidad_vendedor - o.probabilidad_ia) >= 20) {
    lineas.push('La diferencia es grande, vale revisar los supuestos.');
  }
  if (o.cierre_estimado) lineas.push(`Cierre estimado: ${formatearFechaCorta(o.cierre_estimado)}.`);
  if (d.riesgos.length) {
    lineas.push(`\nRiesgos:\n${d.riesgos.map((r) => `- ${r.titulo}: ${r.detalle}`).join('\n')}`);
  }
  if (d.acciones_recomendadas.length) {
    lineas.push(`\nQué hacer:\n${d.acciones_recomendadas.map((a) => `- ${a.titulo}: ${a.detalle}`).join('\n')}`);
  }
  return lineas.join(' ');
}

/** Sugerencias contextuales que se muestran al abrir el copiloto. */
export function sugerencias(contexto = {}) {
  const base = [
    '¿Cuáles son mis oportunidades más cercanas a cerrar?',
    '¿Qué clientes llevan más de 20 días sin seguimiento?',
    '¿Voy a alcanzar mi meta del mes?',
    'Resume la actividad de hoy',
  ];
  const porRuta = {
    '/prospectos': ['¿A quién le llamo primero hoy?', '¿Qué prospectos tienen mejor score y por qué?'],
    '/clientes': ['¿Qué clientes están en riesgo de fuga?', '¿A quién le puedo vender un servicio adicional?'],
    '/oportunidades': ['¿Qué oportunidades están estancadas?', '¿Dónde se pierde más gente en el embudo?'],
    '/cotizaciones': ['¿Qué cotizaciones llevan días sin respuesta?'],
    '/soporte': ['¿Cómo va el cumplimiento de SLA?', '¿Qué tickets están por incumplir?'],
    '/reportes': ['¿Qué vendedor tiene mejor conversión?', '¿Cuál es mi cuello de botella?'],
  };
  const especificas = {
    cuenta: ['¿Qué debo hacer con este cliente?', '¿Qué riesgo hay de perderlo?'],
    oportunidad: ['¿Qué tan probable es cerrar esta oportunidad?', '¿Qué riesgos tiene y qué hago?'],
    lead: ['¿Por qué tiene ese score este prospecto?'],
  };

  if (contexto.entidad_tipo && especificas[contexto.entidad_tipo]) {
    return [...especificas[contexto.entidad_tipo], ...base.slice(0, 2)];
  }
  const ruta = Object.keys(porRuta).find((r) => contexto.ruta?.startsWith(r));
  return ruta ? [...porRuta[ruta], ...base.slice(0, 2)] : base;
}

export default { preguntar, sugerencias, crearConversacion, listarConversaciones, mensajes, borrarConversacion };
