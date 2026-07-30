import { consultar, uno, tx } from '../db/pool.js';
import { noEncontrado, peticionInvalida } from '../lib/errores.js';
import { CAMPOS, POR_CLAVE, ESTADOS_MX, normalizar, clave, plegar } from '@aura/compartido';
import * as cuentas from './cuentas.js';
import * as bitacora from './bitacora.js';

/**
 * Importación de clientes desde Excel.
 *
 * Reparto de trabajo entre navegador y servidor:
 *
 *   - El **navegador** lee el archivo, agrupa filas por cliente y aplica los
 *     normalizadores de `@aura/compartido` para dar respuesta inmediata sobre
 *     50 000 filas sin subir un archivo enorme ni bloquear la interfaz.
 *   - El **servidor** vuelve a normalizar todo lo que recibe antes de escribir.
 *     Lo que llega del cliente es una propuesta, nunca la verdad: si alguien
 *     manipula la petición, aquí se corrige o se rechaza.
 *
 * Ambos usan exactamente el mismo módulo de normalización, así que la vista
 * previa y lo que acaba en la base coinciden.
 */

const MAX_CLIENTES_POR_LOTE = 500;
const MAX_ERRORES_GUARDADOS = 500;

// ---------------------------------------------------------------------------
//  Catálogo
// ---------------------------------------------------------------------------

/** Todo lo que el asistente necesita para construirse: campos, estados y ejecutivos. */
export async function catalogo() {
  const usuarios = await consultar(
    `SELECT id, nombre, email, rol, zona, avatar_tono, activo
       FROM usuarios WHERE activo ORDER BY nombre`,
  );
  return { campos: CAMPOS, estados: ESTADOS_MX, usuarios };
}

// ---------------------------------------------------------------------------
//  Resolución de ejecutivos
// ---------------------------------------------------------------------------

/**
 * Índice de búsqueda de usuarios por nombre, correo, ID, alias del correo
 * (lo de antes de la arroba) y «nombre apellido» sin acentos. Se arma una vez
 * por importación, no por fila.
 */
async function indiceUsuarios() {
  const usuarios = await consultar('SELECT id, nombre, email FROM usuarios WHERE activo');
  const indice = new Map();
  const registrar = (llave, id) => {
    if (!llave) return;
    // Una llave ambigua (dos «Juan») se marca para no asignar al azar.
    if (indice.has(llave) && indice.get(llave) !== id) indice.set(llave, 'ambiguo');
    else indice.set(llave, id);
  };

  for (const u of usuarios) {
    registrar(String(u.id), u.id);
    registrar(clave(u.email), u.id);
    registrar(clave(u.email.split('@')[0]), u.id);
    registrar(clave(u.nombre), u.id);

    // Nombre y primer apellido: en los Excel casi nunca viene el nombre completo.
    const partes = plegar(u.nombre).split(' ').filter(Boolean);
    if (partes.length >= 2) registrar(clave(`${partes[0]} ${partes[1]}`), u.id);
    if (partes.length >= 1) registrar(clave(partes[0]), u.id);
  }
  return { indice, usuarios };
}

function resolverEjecutivo(texto, indice) {
  const k = clave(texto);
  if (!k) return { id: null, aviso: null };
  const encontrado = indice.get(k);
  if (encontrado === 'ambiguo') {
    return { id: null, aviso: `«${texto}» coincide con más de un usuario; asígnalo a mano.` };
  }
  if (typeof encontrado === 'number') return { id: encontrado, aviso: null };
  return { id: null, aviso: `El ejecutivo «${texto}» no existe en el CRM. El cliente queda sin asignar.` };
}

// ---------------------------------------------------------------------------
//  Normalización de un cliente
// ---------------------------------------------------------------------------

/**
 * Normaliza los campos de un cliente propuesto por el cliente HTTP.
 * Devuelve los datos listos para `cuentas.crear` y la lista de avisos.
 */
function normalizarCliente(bruto, indice) {
  const avisos = [];
  const cuenta = {};
  const entrada = bruto.campos ?? {};

  for (const campo of CAMPOS) {
    if (campo.destino !== 'cuenta') continue;
    if (campo.clave === 'propietario') continue; // se resuelve más abajo
    if (!(campo.clave in entrada)) continue;
    const { valor, aviso } = normalizar(campo.tipo, entrada[campo.clave]);
    if (aviso) avisos.push(aviso);
    if (valor === null || valor === undefined) continue;
    cuenta[campo.clave] = valor;
  }

  // Ejecutivo: texto libre del Excel → id de usuario.
  const textoEjecutivo = entrada.propietario;
  if (textoEjecutivo) {
    const { id, aviso } = resolverEjecutivo(textoEjecutivo, indice);
    if (aviso) avisos.push(aviso);
    if (id) cuenta.propietario_id = id;
  }

  // Un archivo de clientes trae clientes; sin `tipo` explícito eso es lo que son.
  if (!cuenta.tipo) cuenta.tipo = 'cliente';
  if (!cuenta.pais) cuenta.pais = 'México';

  const contactos = [];
  for (const c of bruto.contactos ?? []) {
    const datos = {};
    for (const campo of CAMPOS) {
      if (campo.destino !== 'contacto') continue;
      if (!(campo.clave in c)) continue;
      const { valor, aviso } = normalizar(campo.tipo, c[campo.clave]);
      if (aviso) avisos.push(aviso);
      if (valor === null || valor === undefined) continue;
      datos[campo.clave.replace(/^contacto_/, '')] = valor;
    }
    if (datos.nombre) contactos.push(datos);
  }

  return { cuenta, contactos, avisos };
}

// ---------------------------------------------------------------------------
//  Análisis previo
// ---------------------------------------------------------------------------

/**
 * Antes de escribir nada: qué clientes ya existen y qué ejecutivos no se
 * reconocen. Es lo que permite mostrar «encontramos 34 duplicados» y elegir
 * estrategia con conocimiento de causa.
 *
 * Dos consultas para todo el archivo, no una por fila.
 */
export async function analizar(clientes, usuario) {
  if (!Array.isArray(clientes)) throw peticionInvalida('Se esperaba una lista de clientes.');
  if (clientes.length > 20_000) {
    throw peticionInvalida('El análisis admite hasta 20 000 clientes por petición.');
  }

  const { indice } = await indiceUsuarios();

  const rfcs = [];
  const nombres = [];
  const normalizados = clientes.map((c) => {
    const { cuenta, contactos, avisos } = normalizarCliente(c, indice);
    if (cuenta.rfc) rfcs.push(cuenta.rfc.toUpperCase());
    if (cuenta.nombre) nombres.push(cuenta.nombre.toLowerCase());
    return { llave: c.llave, cuenta, contactos, avisos };
  });

  const [porRfc, porNombre] = await Promise.all([
    rfcs.length
      ? consultar(
        `SELECT id, nombre, rfc, tipo, upper(rfc) AS k FROM cuentas
          WHERE rfc IS NOT NULL AND upper(rfc) = ANY($1::text[])`, [[...new Set(rfcs)]])
      : [],
    nombres.length
      ? consultar(
        `SELECT id, nombre, rfc, tipo, lower(nombre) AS k FROM cuentas
          WHERE lower(nombre) = ANY($1::text[])`, [[...new Set(nombres)]])
      : [],
  ]);

  const mapaRfc = new Map(porRfc.map((c) => [c.k, c]));
  const mapaNombre = new Map(porNombre.map((c) => [c.k, c]));

  const duplicados = [];
  const avisosEjecutivo = new Set();

  for (const n of normalizados) {
    // Misma regla que `buscarExistente`, o la vista previa prometería duplicados
    // que la importación luego no trata como tales.
    const porRfcExacto = n.cuenta.rfc ? mapaRfc.get(n.cuenta.rfc.toUpperCase()) : null;
    let existente = porRfcExacto ?? null;
    let motivo = 'rfc';

    if (!existente && n.cuenta.nombre) {
      const candidato = mapaNombre.get(n.cuenta.nombre.toLowerCase());
      // Un RFC distinto desmiente la coincidencia de nombre: son empresas
      // distintas que se llaman igual.
      const contradice = candidato && n.cuenta.rfc && candidato.rfc
        && candidato.rfc.toUpperCase() !== n.cuenta.rfc.toUpperCase();
      if (candidato && !contradice) { existente = candidato; motivo = 'nombre'; }
    }

    if (existente) {
      duplicados.push({
        llave: n.llave,
        nombre: n.cuenta.nombre,
        cuenta_id: existente.id,
        cuenta_nombre: existente.nombre,
        cuenta_rfc: existente.rfc,
        motivo,
      });
    }
    for (const a of n.avisos) if (a.includes('ejecutivo')) avisosEjecutivo.add(a);
  }

  const avisosPorLlave = Object.fromEntries(
    normalizados.filter((n) => n.avisos.length).map((n) => [n.llave, n.avisos]),
  );

  return {
    total: clientes.length,
    duplicados,
    totalDuplicados: duplicados.length,
    avisos: avisosPorLlave,
    ejecutivosDesconocidos: [...avisosEjecutivo],
    usuario_id: usuario.id,
  };
}

// ---------------------------------------------------------------------------
//  Ciclo de importación
// ---------------------------------------------------------------------------

const ESTRATEGIAS = ['omitir', 'actualizar', 'crear_nuevo', 'caso_por_caso'];

export async function iniciar(datos, usuario) {
  const estrategia = ESTRATEGIAS.includes(datos.estrategia) ? datos.estrategia : 'omitir';
  return uno(
    `INSERT INTO importaciones (usuario_id, archivo, tamano_bytes, estrategia,
                                total_filas, total_clientes, mapeo)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
    [
      usuario.id, datos.archivo ?? 'sin-nombre.xlsx', datos.tamano_bytes ?? 0, estrategia,
      datos.total_filas ?? 0, datos.total_clientes ?? 0, JSON.stringify(datos.mapeo ?? {}),
    ],
  );
}

/**
 * Procesa un lote de clientes.
 *
 * Una transacción **por cliente**, no por lote: así la cuenta y sus contactos
 * entran o no entran juntos —nunca queda una cuenta a medias— y a la vez una
 * fila con problemas no arrastra a las otras 499, que es justo lo que se pide de
 * un importador.
 */
export async function procesarLote(importacionId, clientes, opciones, usuario) {
  const importacion = await uno('SELECT * FROM importaciones WHERE id = $1', [importacionId]);
  if (!importacion) throw noEncontrado('importación');
  if (!Array.isArray(clientes)) throw peticionInvalida('Se esperaba una lista de clientes.');
  if (clientes.length > MAX_CLIENTES_POR_LOTE) {
    throw peticionInvalida(`Máximo ${MAX_CLIENTES_POR_LOTE} clientes por lote.`);
  }

  const estrategiaGlobal = ESTRATEGIAS.includes(opciones?.estrategia)
    ? opciones.estrategia : importacion.estrategia;
  const { indice } = await indiceUsuarios();

  const resultados = [];
  const conteo = { creados: 0, actualizados: 0, omitidos: 0, fallidos: 0, contactos: 0 };
  const erroresNuevos = [];

  for (const bruto of clientes) {
    const fila = bruto.fila ?? null;
    try {
      const { cuenta, contactos, avisos } = normalizarCliente(bruto, indice);

      if (!cuenta.nombre) {
        conteo.fallidos += 1;
        const error = { llave: bruto.llave, fila, nombre: null, error: 'Sin nombre de cliente: la fila no se puede importar.' };
        erroresNuevos.push(error);
        resultados.push({ ...error, resultado: 'error' });
        continue;
      }

      // La decisión caso por caso llega por cliente; si no, manda la global.
      const decision = estrategiaGlobal === 'caso_por_caso'
        ? (ESTRATEGIAS.includes(bruto.decision) ? bruto.decision : 'omitir')
        : estrategiaGlobal;

      const salida = await tx(async (t) => {
        const existente = decision === 'crear_nuevo' ? null : await buscarExistente(cuenta, t);

        if (existente && decision === 'omitir') {
          return { resultado: 'omitido', cuenta_id: existente.id, contactos: 0 };
        }

        if (existente && decision === 'actualizar') {
          // Fusión conservadora: lo que trae el archivo actualiza, lo que no trae
          // se respeta. Un Excel incompleto no debe vaciar datos ya capturados.
          const parche = Object.fromEntries(
            Object.entries(cuenta).filter(([, v]) => v !== null && v !== undefined && v !== ''),
          );
          delete parche.tipo; // no degradar un cliente a prospecto por un default
          await cuentas.actualizar(existente.id, parche, usuario, t);
          const nuevos = await sincronizarContactos(existente.id, contactos, usuario, t);
          await bitacora.registrar({
            entidad_tipo: 'cuenta', entidad_id: existente.id, cuenta_id: existente.id,
            tipo: 'actualizado', titulo: 'Actualizado por importación',
            detalle: `Archivo «${importacion.archivo}».`, usuario_id: usuario.id,
            metadata: { importacion_id: importacionId, fila },
          }, t);
          return { resultado: 'actualizado', cuenta_id: existente.id, contactos: nuevos };
        }

        const creada = await cuentas.crear(
          { ...cuenta, origen: cuenta.origen ?? 'importacion', origen_alta: 'importacion' },
          usuario, t,
        );
        const nuevos = await sincronizarContactos(creada.id, contactos, usuario, t);
        return { resultado: 'creado', cuenta_id: creada.id, contactos: nuevos };
      });

      conteo.contactos += salida.contactos;
      if (salida.resultado === 'creado') conteo.creados += 1;
      else if (salida.resultado === 'actualizado') conteo.actualizados += 1;
      else conteo.omitidos += 1;

      resultados.push({
        llave: bruto.llave, fila, nombre: cuenta.nombre,
        resultado: salida.resultado, cuenta_id: salida.cuenta_id, avisos,
      });
    } catch (error) {
      conteo.fallidos += 1;
      const registro = {
        llave: bruto.llave, fila,
        nombre: bruto.campos?.nombre ?? null,
        error: error.mensaje ?? error.message ?? 'Error desconocido',
      };
      erroresNuevos.push(registro);
      resultados.push({ ...registro, resultado: 'error' });
    }
  }

  await uno(
    `UPDATE importaciones
        SET creados = creados + $2, actualizados = actualizados + $3,
            omitidos = omitidos + $4, fallidos = fallidos + $5,
            contactos = contactos + $6,
            errores = (
              SELECT COALESCE(jsonb_agg(valor), '[]'::jsonb)
                FROM (SELECT valor
                        FROM jsonb_array_elements(errores || $7::jsonb) AS t(valor)
                       LIMIT $8) s
            )
      WHERE id = $1 RETURNING id`,
    [
      importacionId, conteo.creados, conteo.actualizados, conteo.omitidos,
      conteo.fallidos, conteo.contactos, JSON.stringify(erroresNuevos), MAX_ERRORES_GUARDADOS,
    ],
  );

  return { resultados, conteo };
}

/**
 * Busca la cuenta ya existente. El RFC manda; el nombre solo decide cuando no hay
 * forma de contradecirlo.
 *
 * El matiz importa: dos razones sociales pueden llamarse igual siendo empresas
 * distintas —«Transportes del Norte» hay decenas— y lo que las separa es el RFC.
 * Por eso, si el registro entrante trae RFC y el candidato por nombre tiene otro
 * distinto, **no son la misma empresa** y se da de alta aparte. Solo se fusiona
 * por nombre cuando alguno de los dos lados no tiene RFC que lo desmienta.
 */
async function buscarExistente(cuenta, t) {
  if (cuenta.rfc) {
    const porRfc = await t.uno(
      'SELECT id, nombre, rfc FROM cuentas WHERE rfc IS NOT NULL AND upper(rfc) = upper($1) LIMIT 1',
      [cuenta.rfc],
    );
    if (porRfc) return porRfc;
  }

  const porNombre = await t.uno(
    'SELECT id, nombre, rfc FROM cuentas WHERE lower(nombre) = lower($1) LIMIT 1',
    [cuenta.nombre],
  );
  if (!porNombre) return null;
  if (cuenta.rfc && porNombre.rfc && porNombre.rfc.toUpperCase() !== cuenta.rfc.toUpperCase()) {
    return null;
  }
  return porNombre;
}

/**
 * Añade los contactos que faltan sin duplicar. Cuando varias filas del Excel son
 * el mismo cliente con distinta persona, aquí es donde acaban conviviendo en una
 * sola cuenta.
 */
async function sincronizarContactos(cuentaId, contactos, usuario, t) {
  if (!contactos.length) return 0;

  const existentes = await t.consultar(
    'SELECT id, nombre, email FROM contactos WHERE cuenta_id = $1', [cuentaId],
  );
  const vistos = new Set(existentes.map((c) => clave(c.email || c.nombre)));
  let creados = 0;

  for (const [i, datos] of contactos.entries()) {
    const k = clave(datos.email || datos.nombre);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    await cuentas.crearContacto(
      cuentaId,
      { ...datos, es_principal: existentes.length === 0 && i === 0 },
      usuario, t,
    );
    creados += 1;
  }
  return creados;
}

export async function finalizar(id, datos, usuario) {
  const importacion = await uno('SELECT * FROM importaciones WHERE id = $1', [id]);
  if (!importacion) throw noEncontrado('importación');

  const estado = ['completada', 'cancelada', 'fallida'].includes(datos?.estado)
    ? datos.estado : 'completada';

  const final = await uno(
    `UPDATE importaciones
        SET estado = $2, terminado_en = now(),
            duracion_ms = GREATEST(0, EXTRACT(epoch FROM (now() - creado_en)) * 1000)::int
      WHERE id = $1 RETURNING *`,
    [id, estado],
  );

  if (estado === 'completada' && final.creados + final.actualizados > 0) {
    await bitacora.notificar({
      usuario_id: usuario.id, tipo: 'info',
      titulo: 'Importación terminada',
      cuerpo: `${final.creados} clientes nuevos y ${final.actualizados} actualizados desde «${final.archivo}».`,
      enlace: '/clientes',
    });
  }
  return final;
}

// ---------------------------------------------------------------------------
//  Historial
// ---------------------------------------------------------------------------

export const historial = ({ limite = 30 } = {}) =>
  consultar(
    `SELECT i.id, i.archivo, i.tamano_bytes, i.estado, i.estrategia, i.total_filas,
            i.total_clientes, i.creados, i.actualizados, i.omitidos, i.fallidos,
            i.contactos, i.duracion_ms, i.creado_en, i.terminado_en,
            u.nombre AS usuario_nombre, u.avatar_tono AS usuario_tono,
            jsonb_array_length(i.errores) AS errores_guardados
       FROM importaciones i
       LEFT JOIN usuarios u ON u.id = i.usuario_id
      ORDER BY i.creado_en DESC LIMIT $1`,
    [limite],
  );

export async function porId(id) {
  const fila = await uno(
    `SELECT i.*, u.nombre AS usuario_nombre, u.avatar_tono AS usuario_tono
       FROM importaciones i LEFT JOIN usuarios u ON u.id = i.usuario_id
      WHERE i.id = $1`, [id],
  );
  if (!fila) throw noEncontrado('importación');
  return fila;
}
