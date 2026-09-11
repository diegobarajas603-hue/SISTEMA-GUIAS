const { Pool } = require('pg');

// Pool de conexiones afinado para una base de datos REMOTA (Railway, Render,
// Supabase...). Con los valores por omision de pg, una conexion que lleva
// 10 segundos sin usarse se cierra; entre guia y guia suelen pasar mas de
// 10 segundos, asi que cada escaneo pagaba abrir una conexion nueva (TCP,
// TLS y autenticacion) antes de la primera consulta: cientos de milisegundos
// que se sentian como un sistema lento. Aqui las conexiones se conservan y
// se mantienen vivas.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Conexiones maximas. Un escaneo usa una conexion unos milisegundos, asi
  // que con pocas sobra incluso con varias pistolas escaneando a la vez.
  max: Number(process.env.DB_POOL_MAX) || 10,
  // Estas nunca se cierran por inactividad: siempre hay conexiones listas.
  min: Number(process.env.DB_POOL_MIN) || 2,
  // Las demas se cierran solo despues de media hora sin uso.
  idleTimeoutMillis: 30 * 60 * 1000,
  // Sondas TCP para que ningun proxy intermedio tire la conexion por inactiva
  keepAlive: true,
  keepAliveInitialDelayMillis: 10 * 1000,
  // Una base que no contesta debe fallar, no dejar colgada la peticion para
  // siempre. Holgado para que las migraciones del arranque (crear un indice
  // sobre una tabla grande) no se corten a medias.
  connectionTimeoutMillis: 10 * 1000,
  query_timeout: 60 * 1000,
});

// Un error en una conexion inactiva (p. ej. el servidor de base de datos se
// reinicia o corta la conexion) no debe tumbar el proceso: el pool descarta
// esa conexion y abre otra en el siguiente uso.
pool.on('error', (e) => {
  console.error('[db] Error en conexion inactiva del pool (se recupera solo):', e.message);
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guias (
      numero_guia TEXT PRIMARY KEY,
      origen TEXT NOT NULL,
      destino TEXT NOT NULL,
      estatus TEXT NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL,
      actualizado_en TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS eventos (
      id SERIAL PRIMARY KEY,
      numero_guia TEXT NOT NULL REFERENCES guias(numero_guia),
      accion TEXT NOT NULL,
      estatus TEXT NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL
    );

    ALTER TABLE eventos ADD COLUMN IF NOT EXISTS plaza TEXT;
    ALTER TABLE eventos ADD COLUMN IF NOT EXISTS descripcion TEXT;
    ALTER TABLE eventos ADD COLUMN IF NOT EXISTS revertido BOOLEAN NOT NULL DEFAULT FALSE;
    -- Quien hizo el escaneo. Los eventos anteriores a esta columna quedan en
    -- NULL y la interfaz los muestra como "sin registrar".
    ALTER TABLE eventos ADD COLUMN IF NOT EXISTS usuario TEXT;

    -- Numero que tenia la guia antes de cancelarse y reemplazarse por uno nuevo
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS numero_anterior TEXT;
    -- Numero del complemento (cobro adicional); la guia conserva ambos numeros
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS complemento TEXT;
    -- Momento en que la guia entro al estatus que tiene ahora. No es lo mismo
    -- que actualizado_en: un escaneo repetido o el alta de un complemento
    -- tocan la guia sin moverla de estatus. De aqui sale el aviso de guias
    -- estancadas ("lleva 3 dias en bodega MTY y nadie la ha sacado").
    ALTER TABLE guias ADD COLUMN IF NOT EXISTS estatus_desde TIMESTAMPTZ;

    -- Id unico que manda el panel con cada escaneo. Si la respuesta se
    -- pierde en el camino (red inestable, hosting dormido), el panel reenvia
    -- el mismo escaneo con el mismo id y el servidor lo reconoce en vez de
    -- aplicarlo dos veces: una llegada reenviada no se convierte en salida.
    ALTER TABLE eventos ADD COLUMN IF NOT EXISTS id_escaneo TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_id_escaneo ON eventos (id_escaneo) WHERE id_escaneo IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_eventos_numero_guia ON eventos (numero_guia);
    -- Todo lo que lista "lo mas reciente" (eventos, bitacora, reporte del
    -- dia, resumen de 24 h) ordena o filtra por fecha; sin este indice cada
    -- una de esas pantallas ordenaba la tabla completa de eventos.
    CREATE INDEX IF NOT EXISTS idx_eventos_creado_en ON eventos (creado_en DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_guias_actualizado_en ON guias (actualizado_en DESC);
    -- Cada escaneo busca la guia por numero_guia (ya es PK) O por complemento.
    -- Sin este indice esa segunda rama fuerza un recorrido completo de la
    -- tabla en cada escaneo, y se pone mas lento a medida que crecen las
    -- guias. Parcial porque casi ninguna guia tiene complemento.
    CREATE INDEX IF NOT EXISTS idx_guias_complemento ON guias (complemento) WHERE complemento IS NOT NULL;
    -- El aviso de estancadas pregunta por las guias mas viejas que siguen en
    -- proceso. Las entregadas quedan fuera del indice a proposito: son la
    -- mayoria de la tabla con el tiempo, y que lleven meses entregadas no es
    -- ninguna anomalia. La condicion se escribe igual en listarEstancadas().
    CREATE INDEX IF NOT EXISTS idx_guias_estancadas ON guias (estatus_desde)
      WHERE estatus NOT IN ('ENTREGADO_MTY', 'ENTREGADO_CDMX');

    -- Bitacora de eliminaciones y cancelaciones.
    --
    -- A proposito NO tiene llave foranea contra guias: su razon de existir es
    -- sobrevivir a la guia. Cuando un administrador elimina una guia, la fila
    -- de guias y todos sus eventos desaparecen; lo unico que queda para
    -- responder "quien la borro y por que" es este registro.
    CREATE TABLE IF NOT EXISTS bitacora (
      id SERIAL PRIMARY KEY,
      tipo TEXT NOT NULL,              -- ELIMINACION o CANCELACION
      numero_guia TEXT NOT NULL,       -- guia eliminada o cancelada
      numero_nuevo TEXT,               -- en una cancelacion, la guia que la reemplaza
      motivo TEXT NOT NULL,
      usuario TEXT,                    -- quien lo hizo (login)
      estatus TEXT,                    -- estatus que tenia en ese momento
      complemento TEXT,                -- complemento que tenia, si tenia
      eventos INTEGER,                 -- cuantos movimientos se perdieron (eliminacion)
      creado_en TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bitacora_creado_en ON bitacora (creado_en DESC);
    CREATE INDEX IF NOT EXISTS idx_bitacora_numero_guia ON bitacora (numero_guia);
  `);

  // Migra estatus del modelo anterior (EN_CAMINO_X / LLEGO_X) al modelo actual
  await pool.query(`
    UPDATE guias SET estatus = 'EN_TRANSITO_A_CDMX' WHERE estatus = 'EN_CAMINO_CDMX';
    UPDATE guias SET estatus = 'EN_TRANSITO_A_MTY' WHERE estatus = 'EN_CAMINO_MTY';
    UPDATE guias SET estatus = 'EN_BODEGA_CDMX' WHERE estatus = 'LLEGO_CDMX';
    UPDATE guias SET estatus = 'EN_BODEGA_MTY' WHERE estatus = 'LLEGO_MTY';
  `);

  // Guias anteriores a la columna estatus_desde: lo mejor que se sabe de ellas
  // es su ultimo movimiento, asi que se toma como el momento en que entraron a
  // su estatus actual. Solo corre una vez; despues la mantiene cada escaneo.
  await pool.query('UPDATE guias SET estatus_desde = actualizado_en WHERE estatus_desde IS NULL');

  await calentarPool();
}

// Abre de una vez las conexiones minimas del pool, para que el primer escaneo
// del dia no sea el que pague la conexion, y las mantiene en uso con una
// consulta trivial cada minuto: una conexion que trabaja no la cierra nadie.
async function calentarPool() {
  const n = pool.options.min || 1;
  const clientes = [];
  try {
    for (let i = 0; i < n; i++) clientes.push(await pool.connect());
  } catch (e) {
    console.warn('[db] No se pudieron abrir todas las conexiones iniciales:', e.message);
  } finally {
    for (const c of clientes) c.release();
  }
  setInterval(() => {
    pool.query('SELECT 1').catch((e) => console.warn('[db] Latido fallido:', e.message));
  }, 60 * 1000).unref();
}

// Milisegundos de un viaje redondo a la base de datos. Lo reporta /health:
// si aqui salen 200 ms, el problema es la distancia entre el servidor y la
// base, no el codigo.
async function latenciaBd() {
  const t = performance.now();
  await pool.query('SELECT 1');
  return Math.round(performance.now() - t);
}

// Estado del pool para diagnostico
function estadoPool() {
  return { total: pool.totalCount, libres: pool.idleCount, esperando: pool.waitingCount };
}

module.exports = { pool, init, latenciaBd, estadoPool };
