import pg from 'pg';
import { config } from '../config.js';

// Postgres devuelve BIGINT como texto para no perder precisión en JS. Todos
// nuestros bigint son centavos o conteos, muy por debajo de Number.MAX_SAFE_INTEGER,
// así que convertirlos a número es seguro y evita ensuciar toda la capa superior
// con strings. (int8 = OID 20)
pg.types.setTypeParser(20, (valor) => (valor === null ? null : Number(valor)));
// NUMERIC (OID 1700): cantidades con decimales, mismo razonamiento.
pg.types.setTypeParser(1700, (valor) => (valor === null ? null : Number(valor)));

export const pool = new pg.Pool({
  connectionString: config.db.url,
  max: config.db.maxConexiones,
  ssl: config.db.ssl,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (error) => {
  console.error('[db] error inesperado en cliente idle:', error.message);
});

/** Ejecuta una consulta y devuelve las filas. */
export async function consultar(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

/** Primera fila o null. Para búsquedas por id. */
export async function uno(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
}

/** Primer valor de la primera fila. Para COUNT y agregados sueltos. */
export async function valor(sql, params = []) {
  const fila = await uno(sql, params);
  if (!fila) return null;
  return Object.values(fila)[0];
}

/**
 * Transacción con rollback automático. El callback recibe un cliente con la misma
 * interfaz que los helpers de arriba, de forma que un servicio se escribe igual
 * dentro y fuera de una transacción.
 */
export async function tx(callback) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const api = {
      cliente,
      consultar: async (sql, params = []) => (await cliente.query(sql, params)).rows,
      uno: async (sql, params = []) => (await cliente.query(sql, params)).rows[0] ?? null,
      valor: async (sql, params = []) => {
        const fila = (await cliente.query(sql, params)).rows[0];
        return fila ? Object.values(fila)[0] : null;
      },
    };
    const resultado = await callback(api);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * Construye `INSERT ... RETURNING *` desde un objeto. Filtra `undefined` para que
 * los valores por defecto del esquema hagan su trabajo.
 */
export function armarInsert(tabla, datos) {
  const columnas = Object.keys(datos).filter((k) => datos[k] !== undefined);
  const valores = columnas.map((k) => datos[k]);
  const marcadores = columnas.map((_, i) => `$${i + 1}`);
  return {
    sql: `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores.join(', ')}) RETURNING *`,
    valores,
  };
}

/**
 * Construye `UPDATE ... SET ... WHERE id = $n RETURNING *` con lista blanca de
 * columnas. Ninguna clave que venga del cliente llega al SQL sin pasar por aquí.
 */
export function armarUpdate(tabla, id, datos, permitidas) {
  const columnas = Object.keys(datos).filter(
    (k) => datos[k] !== undefined && permitidas.includes(k),
  );
  if (columnas.length === 0) return null;
  const asignaciones = columnas.map((k, i) => `${k} = $${i + 1}`);
  const valores = columnas.map((k) => datos[k]);
  return {
    sql: `UPDATE ${tabla} SET ${asignaciones.join(', ')}, actualizado_en = now()
          WHERE id = $${columnas.length + 1} RETURNING *`,
    valores: [...valores, id],
  };
}

export async function cerrar() {
  await pool.end();
}
