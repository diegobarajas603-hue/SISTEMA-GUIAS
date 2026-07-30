/**
 * ============================================================================
 *  MOTOR DE INTELIGENCIA COMERCIAL — cálculo determinista y explicable
 * ============================================================================
 *
 *  Regla de oro del producto: **ningún número que ve el usuario sale de un modelo
 *  de lenguaje.** Todo se calcula aquí, con funciones puras, auditables y
 *  reproducibles. El modelo de lenguaje (ver `proveedor.js`) solo redacta y
 *  conversa sobre estos resultados.
 *
 *  Por qué importa: si el dashboard dice «82 % de probabilidad de superar tu
 *  objetivo», alguien va a tomar una decisión con esa cifra. Tiene que ser
 *  defendible línea por línea, y tiene que dar el mismo resultado mañana.
 *
 *  Todas las funciones reciben objetos planos y no tocan la base de datos, de modo
 *  que sirven igual en la semilla, en la API y en las pruebas.
 */

import { diasEntre, inicioMes, finMes } from '../lib/fechas.js';

const acotar = (n, min, max) => Math.max(min, Math.min(max, n));
const redondear = (n) => Math.round(n);

// ---------------------------------------------------------------------------
//  Parámetros del modelo — en un solo lugar para poder recalibrarlos
// ---------------------------------------------------------------------------

/** Techo de puntos por dimensión del lead score. Suman 100. */
export const PESOS_SCORE = {
  comportamiento: 30,
  ajuste: 25,
  intencion: 20,
  interaccion: 15,
  recencia: 10,
};

/** Puntos por señal y tope por tipo, para que 40 aperturas no valgan 80 puntos. */
const SENALES = {
  visita_precios:      { puntos: 6,   tope: 12, texto: (n) => `Visitó la página de precios ${n} ${n === 1 ? 'vez' : 'veces'}` },
  cotizacion_vista:    { puntos: 8,   tope: 16, texto: (n) => `Abrió la cotización ${n} ${n === 1 ? 'vez' : 'veces'}` },
  correo_clic:         { puntos: 4,   tope: 10, texto: (n) => `Hizo clic en ${n} ${n === 1 ? 'enlace' : 'enlaces'} del correo` },
  descarga:            { puntos: 4,   tope: 8,  texto: (n) => `Descargó ${n} ${n === 1 ? 'documento' : 'documentos'}` },
  formulario:          { puntos: 5,   tope: 10, texto: (n) => `Llenó ${n} ${n === 1 ? 'formulario' : 'formularios'}` },
  chat_iniciado:       { puntos: 3,   tope: 6,  texto: (n) => `Inició ${n} ${n === 1 ? 'conversación' : 'conversaciones'} por chat` },
  correo_abierto:      { puntos: 2,   tope: 8,  texto: (n) => `Abrió el correo ${n} ${n === 1 ? 'vez' : 'veces'}` },
  visita_web:          { puntos: 1.5, tope: 6,  texto: (n) => `${n} ${n === 1 ? 'visita' : 'visitas'} al sitio` },
  evento_asistido:     { puntos: 5,   tope: 10, texto: (n) => `Asistió a ${n} ${n === 1 ? 'evento' : 'eventos'}` },
  // Señales de interacción bidireccional: cuentan en otra dimensión.
  correo_respondido:   { puntos: 6,   tope: 12, texto: (n) => `Respondió ${n} ${n === 1 ? 'correo' : 'correos'}`,        dimension: 'interaccion' },
  llamada_atendida:    { puntos: 5,   tope: 10, texto: (n) => `Atendió ${n} ${n === 1 ? 'llamada' : 'llamadas'}`,        dimension: 'interaccion' },
  reunion_aceptada:    { puntos: 8,   tope: 15, texto: (n) => `Aceptó ${n} ${n === 1 ? 'reunión' : 'reuniones'}`,         dimension: 'interaccion' },
  whatsapp_respondido: { puntos: 4,   tope: 8,  texto: (n) => `Respondió ${n} ${n === 1 ? 'mensaje' : 'mensajes'} de WhatsApp`, dimension: 'interaccion' },
};

/** Industrias donde el flete MTY↔CDMX tiene mejor ajuste histórico. */
export const INDUSTRIAS_OBJETIVO = [
  'Manufactura', 'Automotriz', 'Alimentos y Bebidas', 'Retail',
  'Electrónica', 'Farmacéutica', 'Logística 3PL',
];

const PUNTOS_TAMANO = { corporativo: 10, grande: 8, mediana: 6, pequena: 3, micro: 1 };
const PUNTOS_INTENCION = { compra: 20, renovacion: 16, comparacion: 13, exploracion: 6 };

/** Probabilidad base por etapa, calibrada sobre el histórico de la semilla. */
export const PROBABILIDAD_ETAPA = {
  calificado: 25,
  propuesta: 45,
  negociacion: 68,
  ganado: 100,
  perdido: 0,
};

// ---------------------------------------------------------------------------
//  1. LEAD SCORE — 0 a 100 con desglose punto por punto
// ---------------------------------------------------------------------------

/**
 * @param {object} lead     fila de `leads`
 * @param {Array}  senales  filas de `senales` del lead
 * @returns {{score:number, motivos:Array, temperatura:string, desglose:object}}
 *
 * Cada punto es rastreable: `motivos` explica de dónde salió cada bloque, y eso es
 * lo que la interfaz muestra al pasar el cursor sobre el anillo del score.
 */
export function calcularLeadScore(lead, senales = [], ahora = new Date()) {
  const motivos = [];
  const desglose = {};

  // --- Comportamiento (30) e Interacción (15): agrupadas por tipo de señal ---
  const conteos = new Map();
  for (const s of senales) {
    conteos.set(s.tipo, (conteos.get(s.tipo) || 0) + 1);
  }

  let comportamiento = 0;
  let interaccion = 0;
  // Ordenar por puntos descendentes hace que los motivos más contundentes queden
  // arriba en la interfaz, que es donde el vendedor mira primero.
  const tipos = [...conteos.entries()].sort(
    (a, b) => (SENALES[b[0]]?.puntos ?? 0) - (SENALES[a[0]]?.puntos ?? 0),
  );

  for (const [tipo, n] of tipos) {
    const def = SENALES[tipo];
    if (!def) continue;
    const puntos = Math.min(def.puntos * n, def.tope);
    if (def.dimension === 'interaccion') interaccion += puntos;
    else comportamiento += puntos;
    motivos.push({
      etiqueta: def.texto(n),
      puntos: redondear(puntos),
      dimension: def.dimension || 'comportamiento',
      positivo: true,
    });
  }

  comportamiento = Math.min(comportamiento, PESOS_SCORE.comportamiento);
  interaccion = Math.min(interaccion, PESOS_SCORE.interaccion);
  desglose.comportamiento = redondear(comportamiento);
  desglose.interaccion = redondear(interaccion);

  // --- Ajuste / fit (25) ---
  let ajuste = 0;
  const detallesAjuste = [];
  if (lead.industria && INDUSTRIAS_OBJETIVO.includes(lead.industria)) {
    ajuste += 10;
    detallesAjuste.push(`industria objetivo (${lead.industria})`);
  } else if (lead.industria) {
    ajuste += 3;
    detallesAjuste.push(`industria secundaria (${lead.industria})`);
  }
  const pTamano = PUNTOS_TAMANO[lead.tamano_empresa] ?? 0;
  if (pTamano) {
    ajuste += pTamano;
    detallesAjuste.push(`empresa ${lead.tamano_empresa}`);
  }
  // La ruta troncal de Fletes Tauro es Monterrey ↔ CDMX: un lead en el corredor
  // tiene ajuste operativo real, no solo comercial.
  const enCorredor = ['Nuevo León', 'Ciudad de México', 'Estado de México', 'Querétaro', 'Guanajuato']
    .includes(lead.estado || '');
  if (enCorredor) {
    ajuste += 5;
    detallesAjuste.push('dentro del corredor MTY–CDMX');
  }
  ajuste = Math.min(ajuste, PESOS_SCORE.ajuste);
  desglose.ajuste = redondear(ajuste);
  if (ajuste > 0) {
    motivos.push({
      etiqueta: `Perfil ideal: ${detallesAjuste.join(', ')}`,
      puntos: redondear(ajuste),
      dimension: 'ajuste',
      positivo: true,
    });
  }

  // --- Intención declarada (20) ---
  const intencion = Math.min(PUNTOS_INTENCION[lead.intencion] ?? 6, PESOS_SCORE.intencion);
  desglose.intencion = redondear(intencion);
  if (lead.intencion) {
    const glosa = {
      compra: 'Intención de compra explícita',
      renovacion: 'Busca renovar un servicio',
      comparacion: 'Está comparando proveedores',
      exploracion: 'Explorando opciones',
    }[lead.intencion];
    motivos.push({ etiqueta: glosa, puntos: redondear(intencion), dimension: 'intencion', positivo: intencion >= 13 });
  }

  // --- Recencia (10): el silencio enfría, y hay que decirlo ---
  const ultimo = lead.ultimo_contacto_en || lead.creado_en;
  const d = diasEntre(ultimo, ahora) ?? 999;
  let recencia = 0;
  if (d <= 2) recencia = 10;
  else if (d <= 7) recencia = 8;
  else if (d <= 14) recencia = 5;
  else if (d <= 30) recencia = 2;
  desglose.recencia = recencia;
  if (recencia >= 8) {
    motivos.push({ etiqueta: `Contacto reciente (hace ${Math.floor(d)} d)`, puntos: recencia, dimension: 'recencia', positivo: true });
  } else if (d > 20) {
    motivos.push({
      etiqueta: `Sin contacto desde hace ${Math.floor(d)} días`,
      puntos: recencia - 10,
      dimension: 'recencia',
      positivo: false,
    });
  }

  const score = acotar(redondear(comportamiento + interaccion + ajuste + intencion + recencia), 0, 100);

  return { score, motivos, temperatura: temperaturaDe(score), desglose };
}

export function temperaturaDe(score) {
  if (score >= 80) return 'ardiente';
  if (score >= 62) return 'caliente';
  if (score >= 40) return 'tibio';
  return 'frio';
}

/**
 * Clasificación automática del lead entrante: deduce intención, urgencia y
 * prioridad del texto libre y de los datos de la empresa.
 *
 * Es un clasificador léxico a propósito: es instantáneo, gratis, funciona sin
 * conexión y —sobre todo— es explicable. Cuando hay `ANTHROPIC_API_KEY`, el
 * proveedor puede refinar la extracción, pero el resultado base nunca falta.
 */
export function clasificarLead(lead) {
  const texto = `${lead.mensaje || ''} ${lead.necesidad || ''} ${lead.puesto || ''}`.toLowerCase();

  const hay = (...palabras) => palabras.some((p) => texto.includes(p));

  let intencion = 'exploracion';
  if (hay('cotiz', 'presupuesto', 'precio', 'tarifa', 'cuánto', 'cuanto cuesta')) intencion = 'compra';
  if (hay('comparar', 'propuesta de', 'otro proveedor', 'competencia', 'segunda opción')) intencion = 'comparacion';
  if (hay('renovar', 'renovación', 'vence mi contrato', 'contrato actual')) intencion = 'renovacion';

  let urgencia = 'media';
  if (hay('urgente', 'inmediato', 'hoy', 'mañana', 'esta semana', 'lo antes posible', 'ya mismo')) urgencia = 'inmediata';
  else if (hay('este mes', 'próxima semana', 'proxima semana', 'pronto', 'en días')) urgencia = 'alta';
  else if (hay('a futuro', 'más adelante', 'mas adelante', 'el próximo año', 'sin prisa')) urgencia = 'baja';

  // Prioridad 1 = máxima. Combina tamaño de empresa, intención y urgencia.
  const pesoTamano = { corporativo: 2, grande: 2, mediana: 1, pequena: 0, micro: 0 }[lead.tamano_empresa] ?? 0;
  const pesoIntencion = { compra: 2, renovacion: 2, comparacion: 1, exploracion: 0 }[intencion];
  const pesoUrgencia = { inmediata: 2, alta: 1, media: 0, baja: -1 }[urgencia];
  const prioridad = acotar(5 - (pesoTamano + pesoIntencion + pesoUrgencia), 1, 5);

  // Servicio de interés detectado: alimenta la sugerencia de siguiente acción.
  let servicio = null;
  if (hay('refriger', 'cadena de frío', 'cadena de frio', 'perecedero')) servicio = 'Carga refrigerada';
  else if (hay('completo', 'ftl', 'tráiler', 'trailer', 'caja seca')) servicio = 'Full Truck Load';
  else if (hay('consolidad', 'ltl', 'parcial')) servicio = 'Consolidado LTL';
  else if (hay('última milla', 'ultima milla', 'entrega a domicilio', 'reparto')) servicio = 'Última milla';
  else if (hay('almacen', 'bodega', 'resguardo')) servicio = 'Almacenaje';
  else if (hay('mudanza', 'proyecto', 'maquinaria')) servicio = 'Carga de proyecto';

  return { intencion, urgencia, prioridad, servicio };
}

/**
 * Asignación de ejecutivo: round-robin ponderado por carga y zona.
 * Regla: mismo estado/zona pesa el doble que la carga; entre iguales, el que
 * tiene menos leads abiertos.
 */
export function asignarEjecutivo(lead, ejecutivos) {
  if (!ejecutivos?.length) return null;
  const zonaLead = zonaDeEstado(lead.estado);
  const puntuados = ejecutivos.map((e) => {
    let puntos = 0;
    if (zonaLead && (e.zona === zonaLead || e.zona === 'AMBAS')) puntos += 20;
    puntos -= (e.carga ?? 0) * 2;                              // menos carga, mejor
    if (lead.tamano_empresa === 'corporativo' && e.rol === 'gerente') puntos += 6;
    return { ejecutivo: e, puntos };
  });
  puntuados.sort((a, b) => b.puntos - a.puntos);
  return puntuados[0].ejecutivo;
}

export function zonaDeEstado(estado) {
  if (!estado) return null;
  if (['Nuevo León', 'Coahuila', 'Tamaulipas', 'Chihuahua', 'Durango'].includes(estado)) return 'MTY';
  if (['Ciudad de México', 'Estado de México', 'Puebla', 'Querétaro', 'Hidalgo', 'Morelos'].includes(estado)) return 'CDMX';
  return null;
}

// ---------------------------------------------------------------------------
//  2. PROBABILIDAD DE CIERRE, RIESGOS Y ACCIONES POR OPORTUNIDAD
// ---------------------------------------------------------------------------

/**
 * @returns {{probabilidad:number, riesgos:Array, acciones:Array, factores:Array}}
 *
 * Parte de la probabilidad base de la etapa y la ajusta con señales observables.
 * Cada ajuste queda registrado en `factores`, así que la interfaz puede mostrar
 * exactamente por qué el modelo discrepa del vendedor.
 */
export function analizarOportunidad(op, contexto = {}, ahora = new Date()) {
  const {
    actividades = [],
    cotizaciones = [],
    contactos = [],
    diasEnEtapa = null,
    montoPromedio = 0,
  } = contexto;

  if (op.estado === 'ganada') {
    return { probabilidad: 100, riesgos: [], acciones: [], factores: [] };
  }
  if (op.estado === 'perdida') {
    return { probabilidad: 0, riesgos: [], acciones: [], factores: [] };
  }

  let p = PROBABILIDAD_ETAPA[op.etapa] ?? 25;
  const factores = [];
  const riesgos = [];
  const acciones = [];

  const anota = (etiqueta, delta) => {
    if (delta === 0) return;
    p += delta;
    factores.push({ etiqueta, delta: redondear(delta) });
  };

  // --- Inactividad: el predictor más fuerte de una operación que se muere ---
  const dInactiva = diasEntre(op.ultima_actividad_en || op.creado_en, ahora) ?? 0;
  if (dInactiva > 7) {
    const castigo = -Math.min((dInactiva - 7) * 1.1, 22);
    anota(`${Math.floor(dInactiva)} días sin actividad`, castigo);
  }
  if (dInactiva > 14) {
    riesgos.push({
      titulo: 'Oportunidad estancada',
      severidad: dInactiva > 30 ? 'critica' : 'alta',
      detalle: `Sin ninguna interacción registrada desde hace ${Math.floor(dInactiva)} días. En el histórico, las operaciones que pasan de 30 días sin contacto cierran menos de la mitad de las veces.`,
    });
    acciones.push({
      titulo: 'Reactivar hoy con una llamada',
      detalle: 'Una llamada breve para confirmar si el proyecto sigue en pie y qué cambió.',
      tipo: 'llamada',
      impacto: 'alto',
    });
  }

  // --- Tiempo en la etapa actual ---
  if (diasEnEtapa != null && diasEnEtapa > 30) {
    anota(`${Math.floor(diasEnEtapa)} días en «${op.etapa}»`, -Math.min((diasEnEtapa - 30) * 0.3, 12));
    riesgos.push({
      titulo: `Atascada en ${op.etapa}`,
      severidad: 'media',
      detalle: `Lleva ${Math.floor(diasEnEtapa)} días en la misma etapa. El promedio saludable es de 18 días.`,
    });
  }

  // --- Fecha de cierre vencida ---
  if (op.cierre_estimado) {
    const dCierre = diasEntre(ahora, op.cierre_estimado);
    if (dCierre < 0) {
      anota('Fecha de cierre vencida', -14);
      riesgos.push({
        titulo: 'Fecha de cierre vencida',
        severidad: 'alta',
        detalle: `La fecha comprometida pasó hace ${Math.abs(Math.floor(dCierre))} días y sigue abierta. Contamina el pronóstico del mes.`,
      });
      acciones.push({
        titulo: 'Actualizar la fecha de cierre',
        detalle: 'Reagenda con una fecha realista o marca la etapa correcta para no distorsionar el pronóstico del equipo.',
        tipo: 'tarea',
        impacto: 'medio',
      });
    } else if (dCierre <= 7 && op.etapa === 'negociacion') {
      anota('Cierre inminente en negociación', 6);
    }
  }

  // --- Cotizaciones: abierta y no respondida es la mejor señal que existe ---
  const cotAceptada = cotizaciones.some((c) => c.estado === 'aceptada');
  const cotVista = cotizaciones.some((c) => c.estado === 'vista');
  const cotEnviada = cotizaciones.some((c) => ['enviada', 'vista'].includes(c.estado));
  if (cotAceptada) anota('Cotización aceptada', 18);
  else if (cotVista) anota('Cotización abierta por el cliente', 8);
  else if (cotEnviada) anota('Cotización enviada sin abrir', -3);
  else if (['propuesta', 'negociacion'].includes(op.etapa)) {
    anota('Sin cotización formal en una etapa avanzada', -8);
    acciones.push({
      titulo: 'Enviar la cotización formal',
      detalle: 'La oportunidad está en una etapa avanzada sin documento enviado; es el paso que la desatasca.',
      tipo: 'cotizacion',
      impacto: 'alto',
    });
  }

  // --- Mapa de poder: sin decisor identificado, se cierra por suerte ---
  const hayDecisor = contactos.some((c) => c.rol_compra === 'decisor');
  const hayCampeon = contactos.some((c) => c.rol_compra === 'campeon');
  if (hayDecisor) anota('Decisor identificado', 8);
  else {
    anota('Sin decisor identificado', -9);
    riesgos.push({
      titulo: 'No hay decisor identificado',
      severidad: 'alta',
      detalle: 'Ningún contacto de la cuenta está marcado como decisor. Negociar sin acceso a quien firma alarga el ciclo y suele terminar en «lo estamos evaluando».',
    });
    acciones.push({
      titulo: 'Pedir acceso al decisor',
      detalle: 'Solicita al contacto actual una reunión con quien autoriza el presupuesto.',
      tipo: 'reunion',
      impacto: 'alto',
    });
  }
  if (hayCampeon) anota('Hay un campeón interno', 5);
  if (contactos.some((c) => c.rol_compra === 'bloqueador')) {
    anota('Bloqueador detectado', -7);
    riesgos.push({
      titulo: 'Bloqueador en la cuenta',
      severidad: 'media',
      detalle: 'Un contacto está marcado como bloqueador. Conviene entender su objeción antes de escalar.',
    });
  }

  // --- Ritmo de interacción ---
  const recientes = actividades.filter(
    (a) => (diasEntre(a.creado_en, ahora) ?? 999) <= 14 && a.estado === 'completada',
  ).length;
  if (recientes >= 3) anota(`${recientes} interacciones en 14 días`, 7);
  else if (recientes === 0 && dInactiva > 5) anota('Sin interacciones completadas recientes', -5);

  // --- Competencia ---
  if (op.competidor) {
    anota(`Compite contra ${op.competidor}`, -6);
    riesgos.push({
      titulo: `Competencia activa: ${op.competidor}`,
      severidad: 'media',
      detalle: 'Hay un competidor identificado. Diferencia por tiempos de tránsito garantizados y trazabilidad, no por precio.',
    });
  }

  // --- Tamaño relativo del trato ---
  if (montoPromedio > 0 && op.monto > montoPromedio * 2.5) {
    anota('Monto muy por encima del promedio', -6);
    riesgos.push({
      titulo: 'Operación atípicamente grande',
      severidad: 'baja',
      detalle: `El monto es ${(op.monto / montoPromedio).toFixed(1)}× el promedio de la cartera. Suele implicar más autorizaciones y un ciclo más largo.`,
    });
  }

  // --- Sin siguiente paso definido ---
  if (!op.siguiente_paso) {
    anota('Sin siguiente paso definido', -4);
    acciones.push({
      titulo: 'Definir el siguiente paso',
      detalle: 'Toda oportunidad abierta debe tener una siguiente acción con fecha. Sin eso, se enfría sola.',
      tipo: 'tarea',
      impacto: 'medio',
    });
  }

  // Acciones de avance según la etapa, cuando no hay urgencias que atender.
  if (acciones.length === 0) {
    const porEtapa = {
      calificado: { titulo: 'Agendar reunión de descubrimiento', detalle: 'Confirma volúmenes, rutas y frecuencia para dimensionar la propuesta.', tipo: 'reunion' },
      propuesta: { titulo: 'Dar seguimiento a la propuesta', detalle: 'Confirma recepción y resuelve dudas antes de que se enfríe.', tipo: 'llamada' },
      negociacion: { titulo: 'Cerrar condiciones y fecha de arranque', detalle: 'Propón una fecha concreta de inicio de operación; ayuda a cerrar.', tipo: 'reunion' },
    }[op.etapa];
    if (porEtapa) acciones.push({ ...porEtapa, impacto: 'medio' });
  }

  return {
    probabilidad: acotar(redondear(p), 2, 97),
    riesgos,
    acciones,
    factores: factores.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
  };
}

// ---------------------------------------------------------------------------
//  3. PRONÓSTICO — modelo probabilístico, no una regla de tres
// ---------------------------------------------------------------------------

/**
 * Suma de Bernoulli ponderada por monto. Cada oportunidad abierta es una variable
 * aleatoria que vale `monto` con probabilidad `p` y 0 con probabilidad `1-p`.
 *
 *   media    μ = cerrado + Σ pᵢ·mᵢ
 *   varianza σ² = Σ pᵢ(1-pᵢ)·mᵢ²
 *
 * Con suficientes operaciones independientes, el total se aproxima a una normal
 * (teorema del límite central), así que
 *
 *   P(total ≥ meta) = 1 − Φ((meta − μ) / σ)
 *
 * Eso es lo que produce la frase «tienes un 82 % de probabilidad de superar tu
 * objetivo»: no es una heurística, es la cola de una distribución. Las
 * correlaciones reales entre operaciones se ignoran (no son independientes del
 * todo), y por eso el intervalo se reporta como rango y no como certeza.
 */
export function pronosticar({ cerrado = 0, abiertas = [], meta = 0 }, ahora = new Date()) {
  const desde = inicioMes(ahora);
  const hasta = finMes(ahora);

  // Solo cuenta lo que puede cerrar dentro del periodo.
  const enPeriodo = abiertas.filter((o) => {
    if (!o.cierre_estimado) return false;
    const f = new Date(o.cierre_estimado);
    return f >= desde && f <= hasta;
  });

  let media = cerrado;
  let varianza = 0;
  const tramos = { comprometido: 0, probable: 0, optimista: 0 };

  for (const o of enPeriodo) {
    const p = acotar((o.ia_probabilidad ?? o.probabilidad ?? 20) / 100, 0, 1);
    const m = Number(o.monto) || 0;
    media += p * m;
    varianza += p * (1 - p) * m * m;
    if (p >= 0.7) tramos.comprometido += m;
    else if (p >= 0.4) tramos.probable += m;
    else tramos.optimista += m;
  }

  const sigma = Math.sqrt(varianza);
  const probabilidadMeta = meta <= 0
    ? null
    : acotar(redondear((1 - fiNormal((meta - media) / (sigma || 1))) * 100), 1, 99);

  const diasRestantes = Math.max(0, Math.ceil(diasEntre(ahora, hasta)));
  const diasTranscurridos = Math.max(1, Math.ceil(diasEntre(desde, ahora)));

  return {
    cerrado,
    proyeccion: redondear(media),
    // Intervalo de ~80 % de confianza (±1.28σ), acotado por abajo a lo ya cerrado.
    rango: {
      bajo: Math.max(cerrado, redondear(media - 1.28 * sigma)),
      alto: redondear(media + 1.28 * sigma),
    },
    desviacion: redondear(sigma),
    meta,
    probabilidadMeta,
    faltante: Math.max(0, meta - redondear(media)),
    tramos,
    oportunidadesEnPeriodo: enPeriodo.length,
    ritmo: {
      diasTranscurridos,
      diasRestantes,
      // Ritmo requerido por día hábil restante para alcanzar la meta.
      requeridoDiario: diasRestantes > 0 ? Math.max(0, redondear((meta - cerrado) / diasRestantes)) : 0,
      logradoDiario: redondear(cerrado / diasTranscurridos),
    },
  };
}

/** Función de distribución acumulada normal estándar (Abramowitz & Stegun 26.2.17). */
export function fiNormal(z) {
  const signo = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + signo * erf);
}

// ---------------------------------------------------------------------------
//  4. RIESGO DE FUGA (CHURN)
// ---------------------------------------------------------------------------

/**
 * Riesgo 0–100 con motivos. Un CRM que solo dice «riesgo alto» es inútil; lo que
 * el ejecutivo necesita saber es *qué* cambió para poder revertirlo.
 */
export function riesgoChurn(cuenta, contexto = {}, ahora = new Date()) {
  const {
    facturasRecientes = 0,      // importe últimos 90 días
    facturasPrevias = 0,        // importe de los 90 días anteriores
    ticketsNegativos = 0,
    csatPromedio = null,
    facturasVencidas = 0,
    contratoPorVencer = null,   // días para vencer, si aplica
    oportunidadesAbiertas = 0,
  } = contexto;

  let riesgo = 0;
  const motivos = [];
  const suma = (puntos, titulo, detalle) => {
    riesgo += puntos;
    motivos.push({ titulo, detalle, puntos });
  };

  const dSilencio = diasEntre(cuenta.ultima_actividad_en, ahora);
  if (dSilencio == null || dSilencio > 90) {
    suma(30, 'Silencio prolongado', `Sin actividad registrada en ${dSilencio ? Math.floor(dSilencio) : 'más de 90'} días.`);
  } else if (dSilencio > 45) {
    suma(16, 'Poca interacción', `Última actividad hace ${Math.floor(dSilencio)} días.`);
  }

  if (facturasPrevias > 0) {
    const caida = (facturasPrevias - facturasRecientes) / facturasPrevias;
    if (caida >= 0.5) suma(28, 'Caída fuerte de facturación', `Facturación ${Math.round(caida * 100)} % menor que el trimestre anterior.`);
    else if (caida >= 0.25) suma(15, 'Facturación a la baja', `Descenso de ${Math.round(caida * 100)} % respecto al trimestre anterior.`);
    else if (caida <= -0.2) suma(-8, 'Facturación creciendo', `Aumento de ${Math.round(-caida * 100)} % respecto al trimestre anterior.`);
  } else if (facturasRecientes === 0 && cuenta.tipo === 'cliente') {
    suma(20, 'Sin facturación reciente', 'No hay embarques facturados en los últimos 90 días.');
  }

  if (ticketsNegativos >= 3) suma(18, 'Incidencias acumuladas', `${ticketsNegativos} tickets con sentimiento negativo en el periodo.`);
  else if (ticketsNegativos > 0) suma(7, 'Incidencias de servicio', `${ticketsNegativos} ticket(s) con sentimiento negativo.`);

  if (csatPromedio != null && csatPromedio < 3) suma(12, 'Satisfacción baja', `CSAT promedio de ${csatPromedio.toFixed(1)} sobre 5.`);

  if (facturasVencidas > 0) suma(9, 'Cartera vencida', `${facturasVencidas} factura(s) vencida(s) sin pago.`);

  if (contratoPorVencer != null && contratoPorVencer <= 60 && !cuenta.renovacion_auto) {
    suma(15, 'Contrato por vencer', `Vence en ${contratoPorVencer} días y no tiene renovación automática.`);
  }

  if (oportunidadesAbiertas > 0) suma(-10, 'Hay oportunidades activas', `${oportunidadesAbiertas} oportunidad(es) abierta(s) con esta cuenta.`);

  return {
    riesgo: acotar(redondear(riesgo), 0, 100),
    motivos: motivos.filter((m) => m.puntos !== 0).sort((a, b) => b.puntos - a.puntos),
    nivel: riesgo >= 65 ? 'critico' : riesgo >= 40 ? 'alto' : riesgo >= 20 ? 'medio' : 'bajo',
  };
}

/** Salud de cuenta: la contraparte positiva del churn, para no leer todo en negativo. */
export function saludCuenta(cuenta, contexto = {}) {
  const { riesgo } = riesgoChurn(cuenta, contexto);
  const base = 100 - riesgo;
  const bonoLealtad = cuenta.cliente_desde
    ? Math.min(Math.floor((diasEntre(cuenta.cliente_desde) ?? 0) / 365) * 3, 12)
    : 0;
  return acotar(redondear(base * 0.9 + bonoLealtad), 0, 100);
}

// ---------------------------------------------------------------------------
//  5. VENTA CRUZADA Y ADICIONAL
// ---------------------------------------------------------------------------

/**
 * Afinidad entre servicios de carga. Deriva de cómo se combinan realmente los
 * servicios en logística: quien consolida acaba necesitando almacenaje; quien
 * mueve tráileres completos acaba necesitando cross-docking.
 */
const AFINIDAD = {
  'FT-LTL':  ['FT-ALM', 'FT-UM', 'FT-XD'],
  'FT-FTL':  ['FT-XD', 'FT-DED', 'FT-ALM'],
  'FT-UM':   ['FT-LTL', 'FT-EXP'],
  'FT-ALM':  ['FT-XD', 'FT-LTL'],
  'FT-REF':  ['FT-ALM', 'FT-DED'],
  'FT-EXP':  ['FT-UM', 'FT-LTL'],
  'FT-XD':   ['FT-ALM', 'FT-FTL'],
  'FT-DED':  ['FT-REF', 'FT-XD'],
  'FT-PROY': ['FT-FTL', 'FT-DED'],
  'FT-ADU':  ['FT-FTL', 'FT-ALM'],
};

export function ventaCruzada(cuenta, { skusComprados = [], catalogo = [], oportunidadesAbiertas = [] } = {}) {
  const tiene = new Set(skusComprados);
  const yaEnPipeline = new Set(oportunidadesAbiertas.flatMap((o) => o.skus || []));
  const puntos = new Map();

  for (const sku of tiene) {
    for (const sugerido of AFINIDAD[sku] || []) {
      if (tiene.has(sugerido) || yaEnPipeline.has(sugerido)) continue;
      puntos.set(sugerido, (puntos.get(sugerido) || 0) + 1);
    }
  }

  // Las cuentas grandes toleran servicios de mayor valor agregado.
  const factorTamano = { corporativo: 1.4, grande: 1.25, mediana: 1, pequena: 0.75, micro: 0.5 }[cuenta.tamano] ?? 1;

  const porSku = new Map(catalogo.map((p) => [p.sku, p]));
  return [...puntos.entries()]
    .map(([sku, afinidad]) => {
      const producto = porSku.get(sku);
      if (!producto) return null;
      // Estimación conservadora: 6 meses al volumen mensual típico del servicio,
      // ajustado por el tamaño de la cuenta.
      const volumen = Math.max(1, producto.volumen_mensual ?? 1);
      const impacto = redondear(producto.precio_base * volumen * 6 * factorTamano);
      const confianza = acotar(45 + afinidad * 15 + (factorTamano - 1) * 20, 40, 90);
      return {
        sku,
        producto: producto.nombre,
        producto_id: producto.id,
        impacto,
        confianza: redondear(confianza),
        motivo: `Ya usa ${[...tiene].filter((s) => (AFINIDAD[s] || []).includes(sku)).map((s) => porSku.get(s)?.nombre).filter(Boolean).join(' y ')}. En cuentas con ese perfil, ${producto.nombre} es el servicio que sigue con más frecuencia.`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.impacto * b.confianza - a.impacto * a.confianza)
    .slice(0, 3);
}

// ---------------------------------------------------------------------------
//  6. SIGUIENTE MEJOR ACCIÓN
// ---------------------------------------------------------------------------

/**
 * Ordena todo lo que el ejecutivo podría hacer por **valor esperado**
 * (dinero en juego × urgencia × probabilidad de que la acción cambie el resultado)
 * y devuelve las mejores. Es lo que convierte una lista de pendientes en una
 * agenda priorizada.
 */
export function siguienteMejorAccion({
  oportunidades = [],
  leads = [],
  cuentas = [],
  actividadesVencidas = [],
  cotizacionesSinRespuesta = [],
} = {}, ahora = new Date()) {
  const candidatas = [];

  for (const op of oportunidades) {
    if (op.estado !== 'abierta') continue;
    const dInactiva = diasEntre(op.ultima_actividad_en || op.creado_en, ahora) ?? 0;
    const p = (op.ia_probabilidad ?? op.probabilidad ?? 20) / 100;
    if (dInactiva > 10) {
      candidatas.push({
        tipo: 'reactivar_oportunidad',
        titulo: `Reactivar «${op.nombre}»`,
        detalle: `${Math.floor(dInactiva)} días sin contacto con ${op.cuenta_nombre || 'la cuenta'}. Cada día que pasa reduce la probabilidad de cierre.`,
        entidad: { tipo: 'oportunidad', id: op.id },
        valor: op.monto * p * Math.min(dInactiva / 30, 1.5),
        urgencia: dInactiva > 30 ? 'inmediata' : 'alta',
        accion: 'llamada',
      });
    }
    const dCierre = op.cierre_estimado ? diasEntre(ahora, op.cierre_estimado) : null;
    if (dCierre != null && dCierre >= 0 && dCierre <= 10 && op.etapa === 'negociacion') {
      candidatas.push({
        tipo: 'cerrar_oportunidad',
        titulo: `Cerrar «${op.nombre}»`,
        detalle: `Cierre comprometido en ${Math.floor(dCierre)} días y sigue en negociación. Es la que más mueve tu número del mes.`,
        entidad: { tipo: 'oportunidad', id: op.id },
        valor: op.monto * p * 2,
        urgencia: 'inmediata',
        accion: 'reunion',
      });
    }
  }

  for (const lead of leads) {
    if (['ganado', 'perdido'].includes(lead.etapa)) continue;
    const dSinContacto = diasEntre(lead.ultimo_contacto_en || lead.creado_en, ahora) ?? 0;
    if (lead.score >= 70 && dSinContacto >= 1) {
      candidatas.push({
        tipo: 'contactar_lead',
        titulo: `Contactar a ${lead.nombre}${lead.empresa ? ` · ${lead.empresa}` : ''}`,
        detalle: `Score ${lead.score}/100 y lleva ${Math.floor(dSinContacto)} día(s) esperando. Los leads calientes se enfrían en 72 horas.`,
        entidad: { tipo: 'lead', id: lead.id },
        valor: (lead.valor_estimado || 0) * (lead.score / 100) * 1.4,
        urgencia: lead.score >= 85 ? 'inmediata' : 'alta',
        accion: 'llamada',
      });
    }
  }

  for (const c of cotizacionesSinRespuesta) {
    const dEnviada = diasEntre(c.enviada_en, ahora) ?? 0;
    if (dEnviada >= 3) {
      candidatas.push({
        tipo: 'seguir_cotizacion',
        titulo: `Dar seguimiento a la cotización ${c.folio}`,
        detalle: c.vista_en
          ? `${c.cuenta_nombre} la abrió y no ha respondido. Es la señal de compra más clara que hay.`
          : `Enviada hace ${Math.floor(dEnviada)} días y aún sin abrir. Vale confirmar que llegó.`,
        entidad: { tipo: 'cotizacion', id: c.id },
        valor: c.total * (c.vista_en ? 0.55 : 0.25),
        urgencia: c.vista_en ? 'inmediata' : 'media',
        accion: 'llamada',
      });
    }
  }

  for (const cta of cuentas) {
    if (cta.riesgo_churn >= 55) {
      candidatas.push({
        tipo: 'retener_cuenta',
        titulo: `Retener a ${cta.nombre}`,
        detalle: `Riesgo de fuga ${cta.riesgo_churn}/100 con $${Math.round((cta.ingresos_ano || 0) / 100).toLocaleString('es-MX')} facturados en el año.`,
        entidad: { tipo: 'cuenta', id: cta.id },
        valor: (cta.ingresos_ano || 0) * (cta.riesgo_churn / 100) * 0.8,
        urgencia: cta.riesgo_churn >= 75 ? 'inmediata' : 'alta',
        accion: 'reunion',
      });
    }
  }

  for (const act of actividadesVencidas) {
    const dVencida = diasEntre(act.vence_en, ahora) ?? 0;
    candidatas.push({
      tipo: 'actividad_vencida',
      titulo: act.asunto,
      detalle: `Vencida hace ${Math.floor(dVencida)} día(s).`,
      entidad: { tipo: 'actividad', id: act.id },
      valor: 40_000 * Math.min(dVencida, 10),
      urgencia: dVencida > 3 ? 'alta' : 'media',
      accion: act.tipo,
    });
  }

  const pesoUrgencia = { inmediata: 2.2, alta: 1.5, media: 1, baja: 0.6 };
  return candidatas
    .map((c) => ({ ...c, prioridad: c.valor * (pesoUrgencia[c.urgencia] ?? 1) }))
    .sort((a, b) => b.prioridad - a.prioridad)
    .slice(0, 12);
}

// ---------------------------------------------------------------------------
//  7. EMBUDO CON CONVERSIÓN REAL
// ---------------------------------------------------------------------------

export const ETAPAS_EMBUDO = [
  { clave: 'lead',        titulo: 'Lead' },
  { clave: 'contacto',    titulo: 'Contacto' },
  { clave: 'calificado',  titulo: 'Calificado' },
  { clave: 'propuesta',   titulo: 'Propuesta' },
  { clave: 'negociacion', titulo: 'Negociación' },
  { clave: 'ganado',      titulo: 'Ganado' },
];

const ORDEN_ETAPA = Object.fromEntries(ETAPAS_EMBUDO.map((e, i) => [e.clave, i]));
export const indiceEtapa = (etapa) => ORDEN_ETAPA[etapa] ?? -1;

/** La etapa más avanzada de dos: mantiene `etapa_max` sin retroceder. */
export const etapaMayor = (a, b) => (indiceEtapa(a) >= indiceEtapa(b) ? a : b);

/**
 * Construye el embudo a partir de dos conteos: `enEtapa` (foto del presente) y
 * `alcanzaron` (cuántos llegaron alguna vez a esa etapa, vía `etapa_max`).
 *
 * La conversión se calcula sobre `alcanzaron`, que es lo correcto: si hoy hay 4 en
 * negociación no significa que solo 4 hayan llegado ahí este trimestre.
 */
export function construirEmbudo({ enEtapa = {}, alcanzaron = {} }) {
  const tope = alcanzaron[ETAPAS_EMBUDO[0].clave] || 0;
  return ETAPAS_EMBUDO.map((etapa, i) => {
    const llegaron = alcanzaron[etapa.clave] || 0;
    const previos = i === 0 ? tope : alcanzaron[ETAPAS_EMBUDO[i - 1].clave] || 0;
    return {
      ...etapa,
      enEtapa: enEtapa[etapa.clave] || 0,
      alcanzaron: llegaron,
      // Conversión respecto al total (para el ancho de la barra) y respecto a la
      // etapa anterior (para detectar dónde se pierde gente).
      //
      // Los porcentajes se acotan a 100: con una población bien construida el
      // embudo es monótono por definición, pero un registro creado directamente en
      // una etapa avanzada podría romper la monotonía, y una conversión del 133 %
      // destruiría la credibilidad de todo el tablero.
      porcentajeTotal: tope > 0 ? Math.min(redondear((llegaron / tope) * 100), 100) : 0,
      porcentajePaso: previos > 0 ? Math.min(redondear((llegaron / previos) * 100), 100) : 0,
      caida: Math.max(0, previos - llegaron),
    };
  });
}

export default {
  calcularLeadScore,
  clasificarLead,
  asignarEjecutivo,
  analizarOportunidad,
  pronosticar,
  riesgoChurn,
  saludCuenta,
  ventaCruzada,
  siguienteMejorAccion,
  construirEmbudo,
  temperaturaDe,
  etapaMayor,
  indiceEtapa,
  PESOS_SCORE,
  PROBABILIDAD_ETAPA,
  ETAPAS_EMBUDO,
  INDUSTRIAS_OBJETIVO,
};
