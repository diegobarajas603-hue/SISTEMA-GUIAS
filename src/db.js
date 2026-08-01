const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

    CREATE INDEX IF NOT EXISTS idx_eventos_numero_guia ON eventos (numero_guia);
    CREATE INDEX IF NOT EXISTS idx_guias_actualizado_en ON guias (actualizado_en DESC);

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
}

module.exports = { pool, init };
