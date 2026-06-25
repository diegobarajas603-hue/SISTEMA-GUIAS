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
  `);
}

module.exports = { pool, init };
