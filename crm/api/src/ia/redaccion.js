/**
 * Redacción asistida: correos y propuestas comerciales.
 *
 * Con `ANTHROPIC_API_KEY` el modelo escribe a partir del contexto real del CRM.
 * Sin llave, se generan con plantillas que usan **los mismos datos**. En ambos casos
 * el texto es un borrador: se devuelve para que el ejecutivo lo revise y edite, no
 * se envía solo. Un correo enviado sin revisión a nombre de la empresa es un riesgo
 * comercial, no una comodidad.
 */

import { uno, consultar } from '../db/pool.js';
import { noEncontrado, peticionInvalida } from '../lib/errores.js';
import proveedor from './proveedor.js';
import motor from './motor.js';
import { formatearMXN, formatearMXNExacto, formatearFecha } from '../lib/formato.js';

const FIRMA = (usuario) =>
  `${usuario.nombre}\n${usuario.puesto ?? 'Ejecutivo de Cuenta'} · Fletes Tauro`
  + `${usuario.telefono ? `\n${usuario.telefono}` : ''}\n${usuario.email}`;

const SISTEMA_CORREO = `Redactas correos comerciales para Fletes Tauro, empresa mexicana de
transporte de carga en la ruta Monterrey ↔ Ciudad de México (consolidado, tráiler
completo, última milla, almacenaje, cross-docking, carga refrigerada, servicio dedicado).

REGLAS
- Español de México, trato de usted, profesional y cálido sin ser empalagoso.
- Máximo 150 palabras. Un solo llamado a la acción claro.
- Usa ÚNICAMENTE los datos que se te dan. Si no conoces un precio, un plazo o un dato
  del cliente, no lo inventes: omítelo o pide la información.
- Diferénciate por tiempos de tránsito comprometidos y trazabilidad por guía, no por
  ser «los mejores» ni por precio.
- Nunca prometas descuentos, plazos ni capacidades que no vengan en el contexto.
- Devuelve el resultado como:
  ASUNTO: <asunto>
  ---
  <cuerpo del correo, sin firma>`;

/**
 * @param {object} opciones
 * @param {string} opciones.tipo      primer_contacto | seguimiento | propuesta | reactivacion | agradecimiento
 * @param {number} [opciones.lead_id]
 * @param {number} [opciones.cuenta_id]
 * @param {number} [opciones.oportunidad_id]
 * @param {string} [opciones.instrucciones]  matices que pida el ejecutivo
 */
export async function redactarCorreo(opciones, usuario) {
  const contexto = await armarContexto(opciones);
  const tipo = opciones.tipo ?? 'seguimiento';

  const r = await proveedor.intentar({
    sistema: SISTEMA_CORREO,
    temperatura: 0.6,
    maxTokens: 900,
    mensajes: [{
      role: 'user',
      content: `Redacta un correo de tipo «${tipo}».

DATOS DISPONIBLES
${JSON.stringify(contexto.paraModelo, null, 2)}

${opciones.instrucciones ? `INDICACIONES DEL EJECUTIVO: ${opciones.instrucciones}` : ''}`,
    }],
  });

  if (r?.texto) {
    const partes = r.texto.split(/\n-{3,}\n/);
    const asunto = (partes[0] ?? '').replace(/^ASUNTO:\s*/i, '').trim();
    const cuerpo = (partes[1] ?? r.texto).trim();
    return {
      asunto: asunto || asuntoPlantilla(tipo, contexto),
      cuerpo: `${cuerpo}\n\n${FIRMA(usuario)}`,
      destinatario: contexto.destinatario,
      generado_por: r.modelo,
      revisar: true,
      aviso: 'Borrador generado con IA a partir de los datos del CRM. Revísalo antes de enviarlo.',
    };
  }

  // Camino determinista con los mismos datos.
  const plantilla = PLANTILLAS[tipo] ?? PLANTILLAS.seguimiento;
  return {
    asunto: asuntoPlantilla(tipo, contexto),
    cuerpo: `${plantilla(contexto)}\n\n${FIRMA(usuario)}`,
    destinatario: contexto.destinatario,
    generado_por: 'plantilla',
    revisar: true,
    aviso: 'Borrador armado con plantilla y los datos del CRM. Revísalo y personalízalo antes de enviarlo.',
  };
}

async function armarContexto({ lead_id, cuenta_id, oportunidad_id }) {
  if (lead_id) {
    const lead = await uno('SELECT * FROM leads WHERE id = $1', [lead_id]);
    if (!lead) throw noEncontrado('prospecto');
    const senales = await consultar(
      'SELECT tipo, detalle, creado_en FROM senales WHERE lead_id = $1 ORDER BY creado_en DESC LIMIT 10',
      [lead_id],
    );
    const { motivos } = motor.calcularLeadScore(lead, senales);
    return {
      tipoEntidad: 'lead',
      nombre: lead.nombre,
      empresa: lead.empresa,
      destinatario: lead.email,
      necesidad: lead.necesidad,
      paraModelo: {
        contacto: lead.nombre,
        empresa: lead.empresa,
        puesto: lead.puesto,
        industria: lead.industria,
        ciudad: lead.ciudad,
        servicio_de_interes: lead.necesidad,
        mensaje_original_del_cliente: lead.mensaje,
        // Estas señales son lo que permite un correo que suena informado en lugar de
        // genérico: «vi que le interesan las tarifas» tiene un porqué real detrás.
        senales_de_interes: motivos.filter((m) => m.positivo).map((m) => m.etiqueta),
        intencion: lead.intencion,
        urgencia: lead.urgencia,
      },
    };
  }

  if (oportunidad_id) {
    const op = await uno(
      `SELECT o.*, c.nombre AS cuenta, c.industria, c.ciudad, ct.nombre AS contacto, ct.email
         FROM oportunidades o JOIN cuentas c ON c.id = o.cuenta_id
         LEFT JOIN contactos ct ON ct.id = o.contacto_id
        WHERE o.id = $1`, [oportunidad_id]);
    if (!op) throw noEncontrado('oportunidad');
    const productos = await consultar(
      `SELECT p.nombre, p.unidad, op.cantidad FROM oportunidad_productos op
         JOIN productos p ON p.id = op.producto_id WHERE op.oportunidad_id = $1`, [oportunidad_id]);
    return {
      tipoEntidad: 'oportunidad',
      nombre: op.contacto,
      empresa: op.cuenta,
      destinatario: op.email,
      necesidad: productos.map((p) => p.nombre).join(', '),
      monto: op.monto,
      paraModelo: {
        contacto: op.contacto,
        empresa: op.cuenta,
        industria: op.industria,
        etapa_de_la_negociacion: op.etapa,
        servicios_cotizados: productos.map((p) => `${p.nombre} (${p.cantidad} ${p.unidad})`),
        monto_pesos: Math.round(op.monto / 100),
        siguiente_paso_acordado: op.siguiente_paso,
        dias_sin_contacto: op.ultima_actividad_en
          ? Math.floor((Date.now() - new Date(op.ultima_actividad_en)) / 86_400_000) : null,
      },
    };
  }

  if (cuenta_id) {
    const cuenta = await uno('SELECT * FROM cuentas WHERE id = $1', [cuenta_id]);
    if (!cuenta) throw noEncontrado('cliente');
    const contacto = await uno(
      'SELECT * FROM contactos WHERE cuenta_id = $1 ORDER BY es_principal DESC LIMIT 1', [cuenta_id]);
    const servicios = await consultar(
      `SELECT DISTINCT p.nombre FROM oportunidades o
         JOIN oportunidad_productos op ON op.oportunidad_id = o.id
         JOIN productos p ON p.id = op.producto_id
        WHERE o.cuenta_id = $1 AND o.estado = 'ganada'`, [cuenta_id]);
    return {
      tipoEntidad: 'cuenta',
      nombre: contacto?.nombre ?? 'estimado cliente',
      empresa: cuenta.nombre_comercial || cuenta.nombre,
      destinatario: contacto?.email ?? cuenta.email,
      necesidad: servicios.map((s) => s.nombre).join(', '),
      paraModelo: {
        contacto: contacto?.nombre,
        puesto: contacto?.puesto,
        empresa: cuenta.nombre_comercial || cuenta.nombre,
        industria: cuenta.industria,
        ciudad: cuenta.ciudad,
        cliente_desde: cuenta.cliente_desde,
        servicios_que_ya_usa: servicios.map((s) => s.nombre),
        dias_sin_contacto: cuenta.ultima_actividad_en
          ? Math.floor((Date.now() - new Date(cuenta.ultima_actividad_en)) / 86_400_000) : null,
      },
    };
  }

  throw peticionInvalida('Indica de qué prospecto, cliente u oportunidad se trata.');
}

const asuntoPlantilla = (tipo, c) => ({
  primer_contacto: `${c.empresa ?? 'Su empresa'} · propuesta de transporte MTY–CDMX`,
  seguimiento: `Seguimiento · ${c.necesidad || 'servicio de transporte'}`,
  propuesta: `Propuesta comercial para ${c.empresa ?? 'su operación'}`,
  reactivacion: `¿Retomamos su operación con Fletes Tauro?`,
  agradecimiento: `Gracias por confiar en Fletes Tauro`,
}[tipo] ?? `Seguimiento · ${c.empresa ?? 'su operación'}`);

const PLANTILLAS = {
  primer_contacto: (c) => `Estimado(a) ${c.nombre}:

Le escribo de Fletes Tauro. ${c.paraModelo.senales_de_interes?.length
    ? `Noté su interés en ${(c.necesidad || 'nuestros servicios').toLowerCase()}`
    : `Me pongo en contacto por su interés en ${(c.necesidad || 'nuestros servicios').toLowerCase()}`} y quisiera entender mejor su operación para darle una propuesta a la medida.

Operamos la ruta Monterrey ↔ Ciudad de México con salidas diarias, tránsito comprometido de 24 a 36 horas y trazabilidad por número de guía en cada escaneo, desde la recolección hasta la entrega.

Para cotizar con precisión necesitaría tres datos: origen y destino exactos, volumen aproximado (tarimas o peso) y frecuencia estimada. ¿Le parece si lo revisamos en una llamada de 15 minutos esta semana?

Quedo a sus órdenes.`,

  seguimiento: (c) => `Estimado(a) ${c.nombre}:

Doy seguimiento a ${c.necesidad ? `la propuesta de ${c.necesidad.toLowerCase()}` : 'nuestra conversación'}${c.monto ? ` por ${formatearMXN(c.monto)}` : ''}.

${c.paraModelo.siguiente_paso_acordado
    ? `Quedamos en: ${c.paraModelo.siguiente_paso_acordado.toLowerCase()}.`
    : 'Quiero confirmar si la información que le compartí le fue de utilidad y si hay algún punto que convenga aclarar.'}

Si le resulta práctico, puedo ajustar la propuesta a un esquema de prueba con una o dos rutas para que evalúe el servicio sin comprometer toda su operación.

¿Le parece si lo comentamos esta semana?`,

  propuesta: (c) => `Estimado(a) ${c.nombre}:

Le comparto la propuesta para la operación de ${c.empresa}.

${c.paraModelo.servicios_cotizados?.length
    ? `Servicios considerados:\n${c.paraModelo.servicios_cotizados.map((s) => `· ${s}`).join('\n')}`
    : `Servicio considerado: ${c.necesidad || 'transporte de carga'}.`}

${c.monto ? `Inversión estimada: ${formatearMXNExacto(c.monto)} más IVA.\n` : ''}El servicio incluye trazabilidad por guía en cada escaneo, evidencia digital de entrega y un ejecutivo asignado a su cuenta.

Quedo al pendiente de sus comentarios para ajustar cualquier punto.`,

  reactivacion: (c) => `Estimado(a) ${c.nombre}:

Hace ${c.paraModelo.dias_sin_contacto ?? 'algún'} tiempo que no coordinamos embarques con ${c.empresa}${c.paraModelo.servicios_que_ya_usa?.length ? `, cuando manejábamos ${c.paraModelo.servicios_que_ya_usa.join(' y ').toLowerCase()}` : ''}.

Le escribo para saber cómo va su operación logística hoy y si hay algo en lo que podamos volver a apoyarle. Hemos reforzado la frecuencia de salidas en la ruta troncal y mejorado los tiempos de tránsito.

Si le parece bien, agendamos una llamada breve para revisar sus volúmenes actuales y ver si tiene sentido retomar.`,

  agradecimiento: (c) => `Estimado(a) ${c.nombre}:

Gracias por confiar su operación a Fletes Tauro. Ya quedó registrada el alta de ${c.empresa} y su ejecutivo asignado dará seguimiento puntual a cada embarque.

Puede consultar el estatus de cualquier guía en nuestro portal de rastreo en todo momento.

Cualquier cosa que necesite, estoy a un mensaje de distancia.`,
};

// ---------------------------------------------------------------------------
//  Propuesta comercial estructurada
// ---------------------------------------------------------------------------

/**
 * Genera una propuesta comercial a partir de una oportunidad real. Devuelve secciones
 * estructuradas, no un blob de texto, para que la interfaz pueda mostrarlas y
 * permitir edición por bloque.
 */
export async function generarPropuesta(oportunidadId, usuario, opciones = {}) {
  const op = await uno(
    `SELECT o.*, c.nombre AS cuenta, c.nombre_comercial, c.industria, c.ciudad, c.estado,
            c.tamano, ct.nombre AS contacto, ct.puesto AS contacto_puesto, ct.email
       FROM oportunidades o
       JOIN cuentas c ON c.id = o.cuenta_id
       LEFT JOIN contactos ct ON ct.id = o.contacto_id
      WHERE o.id = $1`,
    [oportunidadId],
  );
  if (!op) throw noEncontrado('oportunidad');

  const productos = await consultar(
    `SELECT p.nombre, p.descripcion, p.unidad, p.categoria, op.cantidad, op.precio_unitario,
            op.descuento_pct,
            (op.cantidad * op.precio_unitario * (1 - op.descuento_pct/100.0))::bigint AS importe
       FROM oportunidad_productos op JOIN productos p ON p.id = op.producto_id
      WHERE op.oportunidad_id = $1`,
    [oportunidadId],
  );

  const subtotal = productos.reduce((s, p) => s + Number(p.importe), 0);
  const impuestos = Math.round(subtotal * 0.16);

  // El resumen ejecutivo es lo único que se le pide al modelo: el resto son datos.
  let resumen = null;
  const r = await proveedor.intentar({
    sistema: `Escribes resúmenes ejecutivos de propuestas comerciales para Fletes Tauro,
transportista mexicano de carga (ruta troncal Monterrey ↔ CDMX). Máximo 90 palabras,
español de México, trato de usted. Solo con los datos dados; no inventes cifras,
plazos ni beneficios. Habla del problema del cliente y de cómo la solución lo resuelve.`,
    temperatura: 0.5,
    maxTokens: 400,
    mensajes: [{
      role: 'user',
      content: `Cliente: ${op.nombre_comercial || op.cuenta} (${op.industria ?? 'industria no registrada'}, ${op.ciudad ?? ''}).
Servicios: ${productos.map((p) => `${p.nombre} — ${p.cantidad} ${p.unidad}`).join('; ')}.
Inversión: ${formatearMXN(subtotal)} más IVA.
${op.siguiente_paso ? `Contexto de la negociación: ${op.siguiente_paso}.` : ''}
${opciones.instrucciones ?? ''}`,
    }],
  });
  if (r?.texto) resumen = r.texto.trim();

  if (!resumen) {
    resumen = `${op.nombre_comercial || op.cuenta} requiere una solución de transporte confiable `
      + `para su operación${op.industria ? ` en el sector ${op.industria.toLowerCase()}` : ''}. `
      + `La propuesta contempla ${productos.length === 1 ? 'el servicio' : 'los servicios'} de `
      + `${productos.map((p) => p.nombre.toLowerCase()).join(', ')}, con tiempos de tránsito `
      + `comprometidos y trazabilidad por guía en cada escaneo. La inversión estimada es de `
      + `${formatearMXN(subtotal)} más IVA.`;
  }

  return {
    oportunidad_id: op.id,
    generado_por: r?.modelo ?? 'plantilla',
    encabezado: {
      titulo: `Propuesta comercial · ${op.nombre_comercial || op.cuenta}`,
      cliente: op.cuenta,
      contacto: op.contacto,
      contacto_puesto: op.contacto_puesto,
      fecha: formatearFecha(new Date()),
      folio: `PROP-${String(op.id).padStart(5, '0')}`,
      preparado_por: `${usuario.nombre} · ${usuario.puesto ?? 'Ejecutivo de Cuenta'}`,
    },
    secciones: [
      { titulo: 'Resumen ejecutivo', cuerpo: resumen },
      {
        titulo: 'Servicios propuestos',
        tabla: productos.map((p) => ({
          concepto: p.nombre,
          descripcion: p.descripcion,
          cantidad: `${p.cantidad} ${p.unidad}`,
          precio_unitario: formatearMXNExacto(p.precio_unitario),
          descuento: p.descuento_pct ? `${p.descuento_pct} %` : '—',
          importe: formatearMXNExacto(p.importe),
        })),
      },
      {
        titulo: 'Inversión',
        totales: {
          subtotal: formatearMXNExacto(subtotal),
          iva: formatearMXNExacto(impuestos),
          total: formatearMXNExacto(subtotal + impuestos),
        },
      },
      {
        titulo: 'Qué incluye el servicio',
        puntos: [
          'Salidas diarias en la ruta troncal Monterrey ↔ Ciudad de México.',
          'Tránsito comprometido de 24 a 36 horas en consolidado; 18 a 24 horas en unidad completa.',
          'Trazabilidad por número de guía con actualización en cada escaneo.',
          'Evidencia digital de entrega con firma y sello de recepción.',
          'Ejecutivo de cuenta asignado y reporte mensual de cumplimiento.',
          'Maniobra de piso en andén incluida.',
        ],
      },
      {
        titulo: 'Condiciones comerciales',
        puntos: [
          'Tarifas vigentes 30 días naturales a partir de la fecha de esta propuesta.',
          'Precios en pesos mexicanos, más IVA.',
          'No incluye maniobras especiales, estadías ni almacenaje adicional.',
          'Sujeto a disponibilidad de unidad en la fecha solicitada.',
          'Cuentas nuevas operan de contado los primeros tres meses; después se evalúa crédito.',
        ],
      },
    ],
    aviso: 'Borrador de propuesta. Revisa cifras y condiciones antes de enviarla al cliente.',
  };
}

/**
 * Analiza una conversación pegada por el ejecutivo (correo, WhatsApp, notas de junta)
 * y extrae lo accionable. Sin llave devuelve un análisis léxico honesto sobre sus
 * límites en lugar de fingir comprensión.
 */
export async function analizarConversacion(texto, opciones = {}) {
  if (!texto || texto.trim().length < 20) {
    throw peticionInvalida('Pega la conversación que quieres analizar (al menos unas líneas).');
  }

  const r = await proveedor.intentar({
    sistema: `Analizas conversaciones comerciales de una transportista de carga mexicana.
Devuelve SOLO un JSON válido con esta forma, sin texto alrededor:
{
  "resumen": "2 frases máximo",
  "sentimiento": "positivo|neutral|negativo|frustrado",
  "intencion_de_compra": "alta|media|baja",
  "temas": ["tema1", "tema2"],
  "objeciones": ["objeción detectada"],
  "compromisos": [{"quien": "cliente|nosotros", "que": "...", "cuando": "... o null"}],
  "siguiente_accion": "una acción concreta",
  "señales_de_riesgo": ["..."],
  "datos_detectados": {"volumen": null, "rutas": [], "plazo": null}
}
No inventes nada que no esté en el texto: usa null o arreglos vacíos.`,
    temperatura: 0.2,
    maxTokens: 1200,
    mensajes: [{ role: 'user', content: texto.slice(0, 12_000) }],
  });

  if (r?.texto) {
    try {
      const limpio = r.texto.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      return { ...JSON.parse(limpio), generado_por: r.modelo };
    } catch {
      // Si el modelo no devolvió JSON válido, se cae al análisis léxico.
    }
  }

  // Análisis léxico: limitado, y se dice que lo es.
  const t = texto.toLowerCase();
  const hay = (...ps) => ps.some((p) => t.includes(p));
  const clasificado = motor.clasificarLead({ mensaje: texto });

  const objeciones = [];
  if (hay('caro', 'precio alto', 'presupuesto', 'más económico', 'mas economico')) objeciones.push('Precio');
  if (hay('tiempo', 'tarda', 'lento', 'tránsito', 'transito')) objeciones.push('Tiempos de tránsito');
  if (hay('ya tenemos', 'proveedor actual', 'contrato con')) objeciones.push('Proveedor actual');
  if (hay('capacidad', 'no hay unidad', 'disponibilidad')) objeciones.push('Capacidad');

  const riesgos = [];
  if (hay('lo veo difícil', 'no creo', 'cancelar', 'ya no')) riesgos.push('Señales de desinterés');
  if (hay('otra propuesta', 'cotizando con', 'comparando')) riesgos.push('Competencia activa');
  if (hay('molesto', 'inconforme', 'queja', 'reclamo')) riesgos.push('Insatisfacción con el servicio');

  return {
    resumen: `Conversación de ${texto.trim().split(/\s+/).length} palabras. Intención detectada: `
      + `${clasificado.intencion}, urgencia ${clasificado.urgencia}.`
      + (clasificado.servicio ? ` Servicio mencionado: ${clasificado.servicio}.` : ''),
    sentimiento: riesgos.length ? 'negativo' : hay('gracias', 'excelente', 'perfecto', 'de acuerdo') ? 'positivo' : 'neutral',
    intencion_de_compra: clasificado.intencion === 'compra' ? 'alta'
      : clasificado.intencion === 'comparacion' ? 'media' : 'baja',
    temas: [clasificado.servicio, ...objeciones].filter(Boolean),
    objeciones,
    compromisos: [],
    siguiente_accion: clasificado.urgencia === 'inmediata'
      ? 'Llamar hoy mismo: la conversación indica urgencia.'
      : 'Dar seguimiento con una propuesta concreta esta semana.',
    señales_de_riesgo: riesgos,
    datos_detectados: { volumen: null, rutas: [], plazo: null },
    generado_por: 'analisis-lexico',
    // Honestidad sobre el alcance: sin modelo esto detecta palabras clave, no matices.
    limitacion: 'Análisis por palabras clave, sin IA generativa configurada. Detecta temas y '
      + 'objeciones evidentes, pero no capta matices, ironía ni compromisos implícitos.',
  };
}

export default { redactarCorreo, generarPropuesta, analizarConversacion };
