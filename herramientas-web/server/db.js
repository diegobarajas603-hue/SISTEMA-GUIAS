const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'data', 'uploads');

function config() {
  if (process.env.MYSQL_URL) return process.env.MYSQL_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return {
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASS || '',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'control_herramientas'
  };
}

const base = config();
const comunes = { waitForConnections: true, connectionLimit: 8, charset: 'utf8mb4_general_ci', dateStrings: true };
const pool = typeof base === 'string'
  ? mysql.createPool({ uri: base, ...comunes })
  : mysql.createPool({ ...base, ...comunes });

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS departamentos (
    id_departamento INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) DEFAULT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS empleados (
    id_empleado INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) DEFAULT NULL,
    departamento_id INT DEFAULT NULL,
    activo TINYINT DEFAULT 1
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS categorias (
    id_categoria INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) DEFAULT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS herramientas (
    id_herramienta INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) DEFAULT NULL,
    descripcion TEXT DEFAULT NULL,
    stock INT DEFAULT 0,
    codigo VARCHAR(50) DEFAULT NULL,
    categoria VARCHAR(100) DEFAULT NULL,
    imagen VARCHAR(255) DEFAULT NULL,
    estado ENUM('Bueno','Dañado','En reparación') DEFAULT 'Bueno',
    categoria_id INT DEFAULT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS asignaciones (
    id_asignacion INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    empleado_id INT DEFAULT NULL,
    herramienta_id INT DEFAULT NULL,
    fecha_asignacion DATETIME DEFAULT NULL,
    comentarios TEXT DEFAULT NULL,
    activa TINYINT(1) DEFAULT 1,
    fecha_fin DATETIME DEFAULT NULL,
    cantidad INT DEFAULT 1
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS salidas_almacen (
    id_salida INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    folio VARCHAR(50) DEFAULT NULL,
    nombre VARCHAR(255) DEFAULT NULL,
    proveedor VARCHAR(255) DEFAULT NULL,
    observaciones LONGTEXT DEFAULT NULL,
    fecha DATE DEFAULT NULL,
    hora TIME DEFAULT NULL,
    pdf VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS usuarios (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    nombre VARCHAR(100) DEFAULT NULL,
    hash VARCHAR(100) NOT NULL,
    rol ENUM('admin','usuario') DEFAULT 'usuario',
    activo TINYINT DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
];

async function init() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  for (const sql of SCHEMA) await pool.query(sql);

  const [rows] = await pool.query('SELECT COUNT(*) c FROM usuarios');
  if (rows[0].c === 0) {
    const usuario = process.env.ADMIN_USER || 'admin';
    const pass = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(pass, 10);
    await pool.query(
      "INSERT INTO usuarios(usuario, nombre, hash, rol) VALUES(?,?,?,'admin')",
      [usuario, 'Administrador', hash]
    );
    console.log(`[init] Usuario administrador creado: ${usuario} (cambia la contraseña al entrar)`);
  }

  // copiar el logo a uploads si no existe (lo usan los PDFs y la interfaz)
  const logoDest = path.join(UPLOADS_DIR, 'logo-tauro.jpg');
  const logoSrc = path.join(__dirname, 'assets', 'logo-tauro.jpg');
  if (!fs.existsSync(logoDest) && fs.existsSync(logoSrc)) {
    fs.copyFileSync(logoSrc, logoDest);
  }
}

module.exports = { pool, init, UPLOADS_DIR };
