/**
 * Cliente del modelo de lenguaje (Claude API).
 *
 *  Regla que gobierna este archivo: **el modelo redacta, nunca calcula.** Todo dato
 *  numérico llega ya resuelto por `motor.js` y las herramientas de `herramientas.js`;
 *  el modelo solo elige palabras y decide qué herramienta usar.
 *
 *  Si no hay `ANTHROPIC_API_KEY`, `disponible` es false y quien llama usa el camino
 *  determinista. El producto no se degrada a un mensaje de error: se degrada a prosa
 *  de plantilla con exactamente las mismas cifras.
 */

import { config } from '../config.js';

const URL_API = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

export const disponible = () => config.ia.habilitada;

export const modelo = () => config.ia.modelo;

/**
 * Llamada única al modelo.
 *
 * @param {object}   opciones
 * @param {string}   opciones.sistema      instrucciones de sistema
 * @param {Array}    opciones.mensajes     [{ role, content }]
 * @param {Array}    [opciones.herramientas] definiciones de herramientas
 * @param {number}   [opciones.maxTokens]
 * @param {number}   [opciones.temperatura]
 * @param {number}   [opciones.timeoutMs]
 */
export async function completar({
  sistema,
  mensajes,
  herramientas = null,
  maxTokens = config.ia.maxTokens,
  temperatura = 0.3,
  timeoutMs = 45_000,
} = {}) {
  if (!disponible()) {
    throw new Error('IA generativa no configurada (falta ANTHROPIC_API_KEY).');
  }

  const cuerpo = {
    model: config.ia.modelo,
    max_tokens: maxTokens,
    temperature: temperatura,
    system: sistema,
    messages: mensajes,
  };
  if (herramientas?.length) cuerpo.tools = herramientas;

  // Un usuario esperando una respuesta del copiloto no debe quedarse colgado por un
  // proveedor lento: se aborta y se cae al camino determinista.
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), timeoutMs);

  try {
    const respuesta = await fetch(URL_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.ia.apiKey,
        'anthropic-version': VERSION,
      },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Claude API ${respuesta.status}: ${detalle.slice(0, 300)}`);
    }

    const datos = await respuesta.json();
    return {
      texto: (datos.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim(),
      usoHerramientas: (datos.content ?? []).filter((b) => b.type === 'tool_use'),
      motivoFin: datos.stop_reason,
      modelo: datos.model,
      contenido: datos.content ?? [],
      uso: datos.usage,
    };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Envoltura tolerante a fallos: si el proveedor falla por cualquier razón (sin
 * llave, timeout, límite de cuota, 500), devuelve null y quien llama sigue con la
 * ruta determinista. Nunca propaga el error al usuario, porque desde su punto de
 * vista el CRM simplemente respondió con menos florituras.
 */
export async function intentar(opciones) {
  if (!disponible()) return null;
  try {
    return await completar(opciones);
  } catch (error) {
    console.warn('[ia] el proveedor falló, se usa el motor determinista:', error.message);
    return null;
  }
}

export default { disponible, modelo, completar, intentar };
