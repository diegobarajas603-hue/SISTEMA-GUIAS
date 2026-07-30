import { Router } from 'express';
import copiloto from '../ia/copiloto.js';
import redaccion from '../ia/redaccion.js';
import proveedor from '../ia/proveedor.js';
import motor from '../ia/motor.js';
import { recalcularIA } from '../servicios/ia-tareas.js';
import { consultar, uno, pool } from '../db/pool.js';
import { asincrono, noEncontrado } from '../lib/errores.js';
import { texto, entero, unoDe } from '../lib/validar.js';
import { limitar, exigirRol } from '../middleware/sesion.js';

const r = Router();

// Dos presupuestos distintos: las lecturas (estado, sugerencias, insights) son
// consultas normales y las hace cualquier pantalla al abrirse, así que compartir
// cupo con la generación acababa cortándole la navegación a un usuario que solo
// mira. Lo caro —lo que llama al modelo o recorre toda la base— se limita aparte.
r.use(limitar({ maximo: 160, ventanaMs: 60_000, clave: 'ia-lectura' }));
const limiteGeneracion = limitar({ maximo: 20, ventanaMs: 60_000, clave: 'ia-generacion' });

/** Estado de la capa de IA: la interfaz lo usa para etiquetar de dónde viene cada texto. */
r.get('/estado', (_req, res) => {
  res.json({
    generativa: proveedor.disponible(),
    modelo: proveedor.disponible() ? proveedor.modelo() : null,
    motor_determinista: true,
    // Se dice explícitamente qué se calcula y qué se redacta: es la promesa central
    // del producto y el usuario merece verla.
    nota: proveedor.disponible()
      ? 'Las cifras las calcula el motor determinista; el modelo de lenguaje solo las redacta y conversa.'
      : 'Sin IA generativa configurada. Todas las funciones de análisis operan con el motor determinista; '
        + 'los textos se generan con plantillas.',
    pesos_score: motor.PESOS_SCORE,
  });
});

// ------------------------------------------------------------------- copiloto

r.post('/preguntar', limiteGeneracion, asincrono(async (req, res) => {
  const pregunta = texto(req.body?.pregunta, 'pregunta', { requerido: true, max: 2000 });
  const contexto = {
    ruta: texto(req.body?.contexto?.ruta, 'ruta', { max: 120 }),
    entidad_tipo: unoDe(req.body?.contexto?.entidad_tipo, 'entidad_tipo',
      ['lead', 'cuenta', 'oportunidad', 'cotizacion', 'ticket']),
    entidad_id: entero(req.body?.contexto?.entidad_id, 'entidad_id'),
  };
  res.json(await copiloto.preguntar(pregunta, req.usuario, {
    conversacionId: entero(req.body?.conversacion_id, 'conversacion_id'),
    contexto,
  }));
}));

r.get('/sugerencias', (req, res) => {
  res.json(copiloto.sugerencias({
    ruta: req.query.ruta,
    entidad_tipo: req.query.entidad_tipo,
    entidad_id: req.query.entidad_id,
  }));
});

r.get('/conversaciones', asincrono(async (req, res) => {
  res.json(await copiloto.listarConversaciones(req.usuario.id));
}));

r.get('/conversaciones/:id', asincrono(async (req, res) => {
  res.json(await copiloto.mensajes(entero(req.params.id, 'id', { requerido: true }), req.usuario.id));
}));

r.delete('/conversaciones/:id', asincrono(async (req, res) => {
  await copiloto.borrarConversacion(entero(req.params.id, 'id', { requerido: true }), req.usuario.id);
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ redacción

r.post('/redactar-correo', limiteGeneracion, asincrono(async (req, res) => {
  res.json(await redaccion.redactarCorreo({
    tipo: unoDe(req.body?.tipo, 'tipo',
      ['primer_contacto', 'seguimiento', 'propuesta', 'reactivacion', 'agradecimiento']) ?? 'seguimiento',
    lead_id: entero(req.body?.lead_id, 'lead_id'),
    cuenta_id: entero(req.body?.cuenta_id, 'cuenta_id'),
    oportunidad_id: entero(req.body?.oportunidad_id, 'oportunidad_id'),
    instrucciones: texto(req.body?.instrucciones, 'instrucciones', { max: 600 }),
  }, req.usuario));
}));

r.post('/generar-propuesta', limiteGeneracion, asincrono(async (req, res) => {
  const id = entero(req.body?.oportunidad_id, 'oportunidad_id', { requerido: true });
  res.json(await redaccion.generarPropuesta(id, req.usuario, {
    instrucciones: texto(req.body?.instrucciones, 'instrucciones', { max: 600 }),
  }));
}));

r.post('/analizar-conversacion', limiteGeneracion, asincrono(async (req, res) => {
  res.json(await redaccion.analizarConversacion(
    texto(req.body?.texto, 'texto', { requerido: true, max: 20_000 }),
  ));
}));

// -------------------------------------------------------------------- insights

r.get('/insights', asincrono(async (req, res) => {
  const tipo = unoDe(req.query.tipo, 'tipo',
    ['riesgo', 'oportunidad', 'venta_cruzada', 'churn', 'nba', 'pronostico', 'estancada', 'reactivacion']);
  const soloMios = req.usuario.rol === 'ejecutivo';
  res.json(await consultar(
    `SELECT i.*,
            CASE i.entidad_tipo
              WHEN 'cuenta' THEN (SELECT nombre_comercial FROM cuentas WHERE id = i.entidad_id)
              WHEN 'oportunidad' THEN (SELECT nombre FROM oportunidades WHERE id = i.entidad_id)
              WHEN 'lead' THEN (SELECT nombre FROM leads WHERE id = i.entidad_id)
            END AS entidad_nombre
       FROM ia_insights i
      WHERE i.estado IN ('nuevo','visto')
        AND ($1::text IS NULL OR i.tipo = $1)
        AND ($2::int IS NULL OR i.usuario_id = $2)
      ORDER BY CASE i.severidad WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
                                WHEN 'media' THEN 2 ELSE 3 END, i.impacto DESC
      LIMIT 60`,
    [tipo ?? null, soloMios ? req.usuario.id : null],
  ));
}));

r.put('/insights/:id', asincrono(async (req, res) => {
  const id = entero(req.params.id, 'id', { requerido: true });
  const estado = unoDe(req.body?.estado, 'estado', ['nuevo', 'visto', 'aplicado', 'descartado'], { requerido: true });
  const fila = await uno('UPDATE ia_insights SET estado = $2 WHERE id = $1 RETURNING *', [id, estado]);
  if (!fila) throw noEncontrado('insight');
  res.json(fila);
}));

/** Siguiente mejor acción del usuario, calculada al momento. */
r.get('/siguiente-accion', asincrono(async (req, res) => {
  const { ejecutarHerramienta } = await import('../ia/herramientas.js');
  res.json(await ejecutarHerramienta('siguiente_mejor_accion', { limite: 12 }, req.usuario));
}));

/** Explicación del lead score: el desglose que se muestra al pasar el cursor. */
r.get('/score/:leadId', asincrono(async (req, res) => {
  const id = entero(req.params.leadId, 'leadId', { requerido: true });
  const lead = await uno('SELECT * FROM leads WHERE id = $1', [id]);
  if (!lead) throw noEncontrado('prospecto');
  const senales = await consultar('SELECT * FROM senales WHERE lead_id = $1 ORDER BY creado_en DESC', [id]);
  const resultado = motor.calcularLeadScore(lead, senales);
  res.json({ ...resultado, pesos: motor.PESOS_SCORE, senales_totales: senales.length });
}));

/**
 * Recálculo global. Es costoso, así que queda restringido a gerencia; el programador
 * lo corre solo una vez al día.
 */
r.post('/recalcular', limiteGeneracion, exigirRol('gerente'), asincrono(async (_req, res) => {
  const t0 = Date.now();
  const resultado = await recalcularIA();
  res.json({ ...resultado, ms: Date.now() - t0 });
}));

/** Diagnóstico del motor: pesos y umbrales, para que el modelo sea auditable. */
r.get('/modelo', (_req, res) => {
  res.json({
    lead_score: {
      pesos: motor.PESOS_SCORE,
      industrias_objetivo: motor.INDUSTRIAS_OBJETIVO,
      umbrales_temperatura: { ardiente: 80, caliente: 62, tibio: 40, frio: 0 },
    },
    probabilidad_por_etapa: motor.PROBABILIDAD_ETAPA,
    etapas_embudo: motor.ETAPAS_EMBUDO,
    pronostico: {
      metodo: 'Suma de Bernoulli ponderada por monto con aproximación normal',
      intervalo: '80 % de confianza (±1.28σ)',
    },
  });
});

/** Marca todas las notificaciones de IA como leídas: usado por el panel del copiloto. */
r.put('/notificaciones/leidas', asincrono(async (req, res) => {
  await pool.query(
    `UPDATE notificaciones SET leida = true WHERE usuario_id = $1 AND tipo = 'ia'`,
    [req.usuario.id],
  );
  res.json({ ok: true });
}));

export default r;
