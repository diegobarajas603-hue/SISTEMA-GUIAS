import { consultar, uno } from '../db/pool.js';
import { noEncontrado } from '../lib/errores.js';

export const productos = ({ soloActivos = true } = {}) =>
  consultar(
    `SELECT p.*,
            (SELECT count(DISTINCT o.id)::int FROM oportunidad_productos op
               JOIN oportunidades o ON o.id = op.oportunidad_id
              WHERE op.producto_id = p.id AND o.estado = 'ganada') AS operaciones
       FROM productos p
      WHERE ($1 = false OR p.activo)
      ORDER BY p.categoria, p.nombre`,
    [soloActivos],
  );

export async function crearProducto(datos) {
  return uno(
    `INSERT INTO productos (sku, nombre, descripcion, categoria, unidad, precio_base, costo_base,
                            margen_meta, volumen_mensual, recurrente)
     VALUES ($1,$2,$3,$4,COALESCE($5,'servicio'),COALESCE($6,0),COALESCE($7,0),
             COALESCE($8,25),COALESCE($9,1),COALESCE($10,false)) RETURNING *`,
    [
      datos.sku, datos.nombre, datos.descripcion ?? null, datos.categoria ?? null,
      datos.unidad ?? null, datos.precio_base ?? null, datos.costo_base ?? null,
      datos.margen_meta ?? null, datos.volumen_mensual ?? null, datos.recurrente ?? null,
    ],
  );
}

export async function actualizarProducto(id, datos) {
  const permitidas = ['nombre', 'descripcion', 'categoria', 'unidad', 'precio_base', 'costo_base',
    'margen_meta', 'volumen_mensual', 'recurrente', 'activo'];
  const columnas = Object.keys(datos).filter((k) => permitidas.includes(k) && datos[k] !== undefined);
  if (!columnas.length) return uno('SELECT * FROM productos WHERE id = $1', [id]);
  const asignaciones = columnas.map((k, i) => `${k} = $${i + 1}`);
  const fila = await uno(
    `UPDATE productos SET ${asignaciones.join(', ')} WHERE id = $${columnas.length + 1} RETURNING *`,
    [...columnas.map((k) => datos[k]), id],
  );
  if (!fila) throw noEncontrado('producto');
  return fila;
}

/**
 * BÚSQUEDA GLOBAL (⌘K)
 *
 * Una sola consulta con `UNION ALL` sobre las seis entidades buscables. Los índices
 * sobre `lower(nombre)` la mantienen rápida sin necesidad de un motor de texto
 * completo, que sería desproporcionado para búsquedas por prefijo de nombre, folio
 * o RFC.
 *
 * El campo `relevancia` prioriza coincidencias al inicio del nombre: cuando alguien
 * escribe «ace» quiere «Aceros del Norte», no una cuenta que menciona «aceros» a la
 * mitad.
 */
export async function buscar(termino, { limite = 24 } = {}) {
  const q = String(termino ?? '').trim().toLowerCase();
  if (q.length < 2) return { termino: q, resultados: [], total: 0 };

  const patron = `%${q}%`;
  const prefijo = `${q}%`;

  const resultados = await consultar(
    `WITH hallazgos AS (
       SELECT 'cuenta' AS tipo, c.id, c.nombre AS titulo,
              COALESCE(c.nombre_comercial, c.industria, '') AS subtitulo,
              c.tipo AS etiqueta,
              CASE WHEN lower(c.nombre) LIKE $2 THEN 3 ELSE 1 END
                + CASE WHEN c.tipo = 'cliente' THEN 1 ELSE 0 END AS relevancia,
              c.ingresos_ano AS orden_valor
         FROM cuentas c
        WHERE lower(c.nombre) LIKE $1 OR lower(COALESCE(c.nombre_comercial,'')) LIKE $1
           OR lower(COALESCE(c.rfc,'')) LIKE $1

       UNION ALL
       SELECT 'contacto', ct.id, ct.nombre,
              COALESCE(ct.puesto || ' · ', '') || COALESCE(cu.nombre_comercial, cu.nombre, ''),
              ct.rol_compra,
              CASE WHEN lower(ct.nombre) LIKE $2 THEN 3 ELSE 1 END, 0::bigint
         FROM contactos ct LEFT JOIN cuentas cu ON cu.id = ct.cuenta_id
        WHERE lower(ct.nombre) LIKE $1 OR lower(COALESCE(ct.email,'')) LIKE $1

       UNION ALL
       SELECT 'lead', l.id, l.nombre, COALESCE(l.empresa, ''), l.etapa,
              CASE WHEN lower(l.nombre) LIKE $2 THEN 3 ELSE 1 END
                + CASE WHEN l.score >= 70 THEN 1 ELSE 0 END,
              l.valor_estimado
         FROM leads l
        WHERE lower(l.nombre) LIKE $1 OR lower(COALESCE(l.empresa,'')) LIKE $1
           OR lower(COALESCE(l.email,'')) LIKE $1

       UNION ALL
       SELECT 'oportunidad', o.id, o.nombre, cu.nombre_comercial, o.etapa,
              CASE WHEN lower(o.nombre) LIKE $2 THEN 3 ELSE 1 END
                + CASE WHEN o.estado = 'abierta' THEN 2 ELSE 0 END,
              o.monto
         FROM oportunidades o JOIN cuentas cu ON cu.id = o.cuenta_id
        WHERE lower(o.nombre) LIKE $1 OR lower(cu.nombre) LIKE $1

       UNION ALL
       SELECT 'cotizacion', q.id, q.folio, cu.nombre_comercial, q.estado,
              CASE WHEN lower(q.folio) LIKE $2 THEN 4 ELSE 1 END, q.total
         FROM cotizaciones q JOIN cuentas cu ON cu.id = q.cuenta_id
        WHERE lower(q.folio) LIKE $1 OR lower(cu.nombre) LIKE $1

       UNION ALL
       SELECT 'ticket', t.id, t.folio || ' · ' || t.asunto,
              COALESCE(cu.nombre_comercial, ''), t.estado,
              CASE WHEN lower(t.folio) LIKE $2 THEN 4 ELSE 1 END
                + CASE WHEN t.estado IN ('nuevo','abierto') THEN 1 ELSE 0 END, 0::bigint
         FROM tickets t LEFT JOIN cuentas cu ON cu.id = t.cuenta_id
        WHERE lower(t.asunto) LIKE $1 OR lower(t.folio) LIKE $1
           OR lower(COALESCE(t.guia_relacionada,'')) LIKE $1
     )
     SELECT * FROM hallazgos ORDER BY relevancia DESC, orden_valor DESC NULLS LAST, titulo
     LIMIT $3`,
    [patron, prefijo, limite],
  );

  // Se agrupan por tipo para que la paleta ⌘K pinte secciones sin recorrer el arreglo.
  const porTipo = {};
  for (const r of resultados) {
    (porTipo[r.tipo] ??= []).push(r);
  }

  return { termino: q, resultados, porTipo, total: resultados.length };
}
