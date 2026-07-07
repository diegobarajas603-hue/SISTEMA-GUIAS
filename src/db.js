const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

    CREATE INDEX IF NOT EXISTS idx_eventos_numero_guia ON eventos (numero_guia);
    CREATE INDEX IF NOT EXISTS idx_guias_actualizado_en ON guias (actualizado_en DESC);
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
