'use strict';
// Base de datos persistente en SQLite (modulo integrado de Node 22+).
// Crea el esquema completo al arrancar y siembra catalogos iniciales,
// configuracion y el usuario administrador si la base esta vacia.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword, ahora, tokenAleatorio } = require('./util');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tauro-crm.db');
fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

// ---------- Esquema ----------

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario       TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  telefono      TEXT NOT NULL DEFAULT '',
  rol           TEXT NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin','gerente','vendedor')),
  password_hash TEXT NOT NULL,
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
  token      TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada_en  TEXT NOT NULL,
  expira_en  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intentos_login (
  usuario         TEXT PRIMARY KEY,
  fallos          INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TEXT
);

CREATE TABLE IF NOT EXISTS rutas (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  origen  TEXT NOT NULL,
  destino TEXT NOT NULL,
  km      REAL NOT NULL DEFAULT 0,
  horas   REAL NOT NULL DEFAULT 0,
  activa  INTEGER NOT NULL DEFAULT 1,
  UNIQUE (origen, destino)
);

CREATE TABLE IF NOT EXISTS unidades (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre       TEXT NOT NULL UNIQUE,
  capacidad_kg REAL NOT NULL DEFAULT 0,
  descripcion  TEXT NOT NULL DEFAULT '',
  activa       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tarifas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ruta_id        INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
  unidad_id      INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  monto          REAL NOT NULL DEFAULT 0,
  notas          TEXT NOT NULL DEFAULT '',
  activa         INTEGER NOT NULL DEFAULT 1,
  actualizado_en TEXT NOT NULL,
  UNIQUE (ruta_id, unidad_id)
);

CREATE TABLE IF NOT EXISTS empresas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo           TEXT NOT NULL DEFAULT 'prospecto' CHECK (tipo IN ('prospecto','cliente')),
  nombre         TEXT NOT NULL,
  rfc            TEXT NOT NULL DEFAULT '',
  giro           TEXT NOT NULL DEFAULT '',
  origen_lead    TEXT NOT NULL DEFAULT '',
  telefono       TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  direccion      TEXT NOT NULL DEFAULT '',
  ciudad         TEXT NOT NULL DEFAULT '',
  estado_dir     TEXT NOT NULL DEFAULT '',
  etapa          TEXT NOT NULL DEFAULT 'nuevo' CHECK (etapa IN ('nuevo','contactado','calificado','propuesta','negociacion','ganado','perdido')),
  motivo_perdida TEXT NOT NULL DEFAULT '',
  vendedor_id    INTEGER REFERENCES usuarios(id),
  notas          TEXT NOT NULL DEFAULT '',
  creado_en      TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  convertido_en  TEXT
);

CREATE TABLE IF NOT EXISTS contactos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  puesto     TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  telefono   TEXT NOT NULL DEFAULT '',
  whatsapp   TEXT NOT NULL DEFAULT '',
  principal  INTEGER NOT NULL DEFAULT 0,
  notas      TEXT NOT NULL DEFAULT '',
  creado_en  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actividades (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id    INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
  cotizacion_id INTEGER,
  servicio_id   INTEGER,
  tarea_id      INTEGER,
  usuario_id    INTEGER REFERENCES usuarios(id),
  tipo          TEXT NOT NULL CHECK (tipo IN ('llamada','whatsapp','correo','reunion','visita','nota','cambio','sistema')),
  titulo        TEXT NOT NULL,
  descripcion   TEXT NOT NULL DEFAULT '',
  fecha         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tareas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo        TEXT NOT NULL,
  descripcion   TEXT NOT NULL DEFAULT '',
  empresa_id    INTEGER REFERENCES empresas(id) ON DELETE SET NULL,
  asignado_a    INTEGER NOT NULL REFERENCES usuarios(id),
  creado_por    INTEGER REFERENCES usuarios(id),
  vence_en      TEXT,
  prioridad     TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta','media','baja')),
  estatus       TEXT NOT NULL DEFAULT 'pendiente' CHECK (estatus IN ('pendiente','completada')),
  completada_en TEXT,
  creado_en     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cotizaciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  folio          TEXT NOT NULL UNIQUE,
  publico_token  TEXT NOT NULL UNIQUE,
  empresa_id     INTEGER NOT NULL REFERENCES empresas(id),
  contacto_id    INTEGER REFERENCES contactos(id) ON DELETE SET NULL,
  vendedor_id    INTEGER NOT NULL REFERENCES usuarios(id),
  origen         TEXT NOT NULL,
  destino        TEXT NOT NULL,
  tipo_servicio  TEXT NOT NULL DEFAULT 'sencillo' CHECK (tipo_servicio IN ('sencillo','redondo','dedicado')),
  unidad_id      INTEGER REFERENCES unidades(id),
  unidad_texto   TEXT NOT NULL DEFAULT '',
  mercancia      TEXT NOT NULL DEFAULT '',
  peso_kg        REAL NOT NULL DEFAULT 0,
  tarifa         REAL NOT NULL DEFAULT 0,
  maniobras      REAL NOT NULL DEFAULT 0,
  seguro         REAL NOT NULL DEFAULT 0,
  otros          REAL NOT NULL DEFAULT 0,
  otros_desc     TEXT NOT NULL DEFAULT '',
  subtotal       REAL NOT NULL DEFAULT 0,
  iva_pct        REAL NOT NULL DEFAULT 16,
  iva            REAL NOT NULL DEFAULT 0,
  ret_pct        REAL NOT NULL DEFAULT 4,
  retencion      REAL NOT NULL DEFAULT 0,
  total          REAL NOT NULL DEFAULT 0,
  moneda         TEXT NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('MXN','USD')),
  vigencia_dias  INTEGER NOT NULL DEFAULT 15,
  vigente_hasta  TEXT,
  condiciones    TEXT NOT NULL DEFAULT '',
  estatus        TEXT NOT NULL DEFAULT 'borrador' CHECK (estatus IN ('borrador','enviada','aceptada','rechazada','vencida','convertida')),
  notas          TEXT NOT NULL DEFAULT '',
  creado_en      TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  enviada_en     TEXT,
  resuelta_en    TEXT
);

CREATE TABLE IF NOT EXISTS servicios (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  folio          TEXT NOT NULL UNIQUE,
  cotizacion_id  INTEGER REFERENCES cotizaciones(id) ON DELETE SET NULL,
  empresa_id     INTEGER NOT NULL REFERENCES empresas(id),
  vendedor_id    INTEGER REFERENCES usuarios(id),
  origen         TEXT NOT NULL,
  destino        TEXT NOT NULL,
  unidad_texto   TEXT NOT NULL DEFAULT '',
  operador       TEXT NOT NULL DEFAULT '',
  mercancia      TEXT NOT NULL DEFAULT '',
  peso_kg        REAL NOT NULL DEFAULT 0,
  fecha_carga    TEXT,
  fecha_entrega  TEXT,
  monto          REAL NOT NULL DEFAULT 0,
  moneda         TEXT NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('MXN','USD')),
  estatus        TEXT NOT NULL DEFAULT 'programado' CHECK (estatus IN ('programado','en_transito','entregado','facturado','pagado','cancelado')),
  factura        TEXT NOT NULL DEFAULT '',
  notas          TEXT NOT NULL DEFAULT '',
  creado_en      TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS folios (
  tipo        TEXT NOT NULL,
  anio        INTEGER NOT NULL,
  consecutivo INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tipo, anio)
);

CREATE INDEX IF NOT EXISTS idx_empresas_etapa     ON empresas(etapa);
CREATE INDEX IF NOT EXISTS idx_empresas_tipo      ON empresas(tipo);
CREATE INDEX IF NOT EXISTS idx_empresas_vendedor  ON empresas(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_contactos_empresa  ON contactos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_actividades_emp    ON actividades(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_actividades_fecha  ON actividades(fecha);
CREATE INDEX IF NOT EXISTS idx_tareas_asignado    ON tareas(asignado_a, estatus);
CREATE INDEX IF NOT EXISTS idx_cot_estatus        ON cotizaciones(estatus);
CREATE INDEX IF NOT EXISTS idx_cot_empresa        ON cotizaciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_srv_empresa        ON servicios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_srv_estatus        ON servicios(estatus);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario   ON sesiones(usuario_id);
`);

// ---------- Helpers de acceso ----------

function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}

function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

// Ejecuta fn dentro de una transaccion
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* sin transaccion activa */ }
    throw err;
  }
}

// Folio consecutivo por tipo y anio: COT-2026-0001, SRV-2026-0001
function siguienteFolio(tipo) {
  const anio = new Date().getFullYear();
  run('INSERT INTO folios (tipo, anio, consecutivo) VALUES (?, ?, 0) ON CONFLICT(tipo, anio) DO NOTHING', tipo, anio);
  run('UPDATE folios SET consecutivo = consecutivo + 1 WHERE tipo = ? AND anio = ?', tipo, anio);
  const fila = get('SELECT consecutivo FROM folios WHERE tipo = ? AND anio = ?', tipo, anio);
  return `${tipo}-${anio}-${String(fila.consecutivo).padStart(4, '0')}`;
}

// Historial: registra una entrada en la bitacora de actividades
function registrarActividad({ empresa_id = null, cotizacion_id = null, servicio_id = null, tarea_id = null, usuario_id = null, tipo, titulo, descripcion = '' }) {
  run(
    `INSERT INTO actividades (empresa_id, cotizacion_id, servicio_id, tarea_id, usuario_id, tipo, titulo, descripcion, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    empresa_id, cotizacion_id, servicio_id, tarea_id, usuario_id, tipo, titulo, descripcion, ahora()
  );
}

// ---------- Configuracion (con respaldo en variables de entorno) ----------

const CFG_ENV = {
  smtp_host: 'SMTP_HOST',
  smtp_port: 'SMTP_PORT',
  smtp_secure: 'SMTP_SECURE',
  smtp_user: 'SMTP_USER',
  smtp_pass: 'SMTP_PASS',
  correo_de: 'CORREO_DE',
  base_url: 'BASE_URL',
  whatsapp_token: 'WHATSAPP_TOKEN',
  whatsapp_phone_id: 'WHATSAPP_PHONE_NUMBER_ID',
};

function cfg(clave, defecto = '') {
  const fila = get('SELECT valor FROM configuracion WHERE clave = ?', clave);
  if (fila && fila.valor !== '') return fila.valor;
  const env = CFG_ENV[clave];
  if (env && process.env[env]) return process.env[env];
  return defecto;
}

function setCfg(clave, valor) {
  run(
    'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor',
    clave, String(valor == null ? '' : valor)
  );
}

// ---------- Datos iniciales ----------

const CONDICIONES_DEFAULT = [
  'Precios expresados en pesos mexicanos (MXN), mas IVA y retenciones aplicables.',
  'La tarifa aplica para las condiciones de carga descritas; cambios de peso, volumen o ruta pueden modificarla.',
  'No incluye maniobras de carga y descarga ni estadias, salvo que se indiquen en esta cotizacion.',
  'Estadia: se cobra a partir de la segunda hora de espera en origen o destino.',
  'El seguro de mercancia aplica unicamente si se contrata y se declara el valor de la carga.',
  'Servicio sujeto a disponibilidad de unidad al momento de la confirmacion.',
  'Forma de pago: segun condiciones acordadas y credito previamente autorizado.',
  'Esta cotizacion no representa compromiso de servicio hasta recibir orden de confirmacion por escrito.',
].join('\n');

function sembrar() {
  const defaults = {
    empresa_nombre: 'FLETES TAURO',
    empresa_razon: '',
    empresa_rfc: '',
    empresa_direccion: '',
    empresa_telefono: '',
    empresa_email: '',
    empresa_web: '',
    iva_pct: '16',
    ret_pct: '4',
    vigencia_dias: '15',
    condiciones_default: CONDICIONES_DEFAULT,
    pdf_leyenda: 'Gracias por su preferencia. En Fletes Tauro movemos su carga con seguridad y puntualidad.',
  };
  for (const [clave, valor] of Object.entries(defaults)) {
    run('INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO NOTHING', clave, valor);
  }

  const hayUnidades = get('SELECT COUNT(*) AS n FROM unidades').n;
  if (!hayUnidades) {
    const unidades = [
      ['Camioneta 1.5 ton', 1500, 'Caja seca chica'],
      ['Camioneta 3.5 ton', 3500, 'Caja seca'],
      ['Rabon', 8000, 'Caja seca 7.5 m'],
      ['Torton', 17000, 'Caja seca 9.5 m'],
      ['Trailer caja seca 48 pies', 25000, 'Caja seca 14.6 m'],
      ['Trailer caja seca 53 pies', 28000, 'Caja seca 16.15 m'],
      ['Plataforma 40 pies', 25000, 'Carga que no requiere caja cerrada'],
      ['Full (doble remolque)', 50000, 'Dos cajas secas'],
    ];
    for (const [nombre, cap, desc] of unidades) {
      run('INSERT INTO unidades (nombre, capacidad_kg, descripcion, activa) VALUES (?, ?, ?, 1)', nombre, cap, desc);
    }
  }

  const hayRutas = get('SELECT COUNT(*) AS n FROM rutas').n;
  if (!hayRutas) {
    const rutas = [
      ['Monterrey, N.L.', 'Ciudad de Mexico', 900, 10],
      ['Ciudad de Mexico', 'Monterrey, N.L.', 900, 10],
      ['Monterrey, N.L.', 'Guadalajara, Jal.', 700, 8],
      ['Guadalajara, Jal.', 'Monterrey, N.L.', 700, 8],
      ['Ciudad de Mexico', 'Guadalajara, Jal.', 540, 6.5],
      ['Guadalajara, Jal.', 'Ciudad de Mexico', 540, 6.5],
      ['Monterrey, N.L.', 'Nuevo Laredo, Tamps.', 220, 2.5],
      ['Nuevo Laredo, Tamps.', 'Monterrey, N.L.', 220, 2.5],
    ];
    for (const [origen, destino, km, horas] of rutas) {
      run('INSERT INTO rutas (origen, destino, km, horas, activa) VALUES (?, ?, ?, ?, 1)', origen, destino, km, horas);
    }
  }

  const hayUsuarios = get('SELECT COUNT(*) AS n FROM usuarios').n;
  if (!hayUsuarios) {
    const usuario = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    run(
      `INSERT INTO usuarios (usuario, nombre, email, telefono, rol, password_hash, activo, creado_en)
       VALUES (?, ?, '', '', 'admin', ?, 1, ?)`,
      usuario, 'Administrador', hashPassword(password), ahora()
    );
    console.log(`[db] Usuario administrador inicial creado: "${usuario}" (cambia la contrasena en cuanto entres).`);
  }
}

sembrar();

module.exports = {
  db, get, all, run, tx,
  siguienteFolio, registrarActividad,
  cfg, setCfg, tokenAleatorio,
};
