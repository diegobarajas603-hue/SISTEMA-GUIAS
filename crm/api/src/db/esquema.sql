-- ============================================================================
--  Aura CRM — esquema completo (PostgreSQL 16+)
--  Idempotente: se puede aplicar tantas veces como se quiera.
--
--  Convenciones
--   · Importes: BIGINT en centavos. Nunca punto flotante para dinero.
--   · Enumeraciones: TEXT + CHECK (migran sin ALTER TYPE, a diferencia de los
--     tipos ENUM de Postgres).
--   · Fechas: TIMESTAMPTZ, siempre en UTC. El formato es responsabilidad del
--     cliente.
--   · etapa / etapa_max: vocabulario compartido por leads y oportunidades para
--     que el embudo del dashboard sea UNA sola consulta.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  Organización: equipos, usuarios, sesiones, metas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS equipos (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL UNIQUE,
  zona          TEXT,                       -- MTY | CDMX | NACIONAL
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'ejecutivo'
                CHECK (rol IN ('admin','gerente','ejecutivo','marketing','soporte')),
  puesto        TEXT,
  telefono      TEXT,
  zona          TEXT,                       -- MTY | CDMX | AMBAS
  equipo_id     INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
  avatar_tono   SMALLINT NOT NULL DEFAULT 0,-- índice de paleta para el avatar
  meta_mensual  BIGINT NOT NULL DEFAULT 0,  -- centavos
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  intentos      SMALLINT NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ,
  ultimo_acceso TIMESTAMPTZ,
  preferencias  JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash    TEXT PRIMARY KEY,           -- SHA-256 del token; el token en claro nunca se guarda
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_en     TIMESTAMPTZ NOT NULL,
  ip            TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_sesiones_usuario ON sesiones (usuario_id);

CREATE TABLE IF NOT EXISTS metas (
  id            SERIAL PRIMARY KEY,
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  equipo_id     INTEGER REFERENCES equipos(id) ON DELETE CASCADE,
  periodo       DATE NOT NULL,              -- primer día del mes
  tipo          TEXT NOT NULL DEFAULT 'ingresos'
                CHECK (tipo IN ('ingresos','oportunidades','reuniones','llamadas','cotizaciones')),
  objetivo      BIGINT NOT NULL,            -- centavos si tipo=ingresos, unidades si no
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meta_unica UNIQUE (usuario_id, equipo_id, periodo, tipo)
);
CREATE INDEX IF NOT EXISTS ix_metas_periodo ON metas (periodo DESC, tipo);

-- ---------------------------------------------------------------------------
--  Comercial: cuentas, contactos, leads, señales
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cuentas (
  id              SERIAL PRIMARY KEY,
  nombre          TEXT NOT NULL,
  nombre_comercial TEXT,
  rfc             TEXT,
  industria       TEXT,
  tamano          TEXT CHECK (tamano IN ('micro','pequena','mediana','grande','corporativo')),
  sitio_web       TEXT,
  telefono        TEXT,
  email           TEXT,
  calle           TEXT,
  ciudad          TEXT,
  estado          TEXT,
  pais            TEXT NOT NULL DEFAULT 'México',
  codigo_postal   TEXT,
  tipo            TEXT NOT NULL DEFAULT 'cliente'
                  CHECK (tipo IN ('prospecto','cliente','inactivo','perdido')),
  propietario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  salud           SMALLINT NOT NULL DEFAULT 70 CHECK (salud BETWEEN 0 AND 100),
  riesgo_churn    SMALLINT NOT NULL DEFAULT 0 CHECK (riesgo_churn BETWEEN 0 AND 100),
  ingresos_ano    BIGINT NOT NULL DEFAULT 0,  -- facturado últimos 12 meses (centavos)
  valor_vida      BIGINT NOT NULL DEFAULT 0,  -- LTV histórico (centavos)
  dias_credito    SMALLINT NOT NULL DEFAULT 0,
  origen          TEXT,
  etiquetas       TEXT[] NOT NULL DEFAULT '{}',
  notas           TEXT,
  cliente_desde   DATE,
  ultima_actividad_en TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cuentas_propietario ON cuentas (propietario_id, tipo);
CREATE INDEX IF NOT EXISTS ix_cuentas_actividad ON cuentas (ultima_actividad_en DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ix_cuentas_churn ON cuentas (riesgo_churn DESC) WHERE tipo = 'cliente';
CREATE INDEX IF NOT EXISTS ix_cuentas_nombre ON cuentas (lower(nombre));

CREATE TABLE IF NOT EXISTS contactos (
  id            SERIAL PRIMARY KEY,
  cuenta_id     INTEGER REFERENCES cuentas(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  puesto        TEXT,
  email         TEXT,
  telefono      TEXT,
  whatsapp      TEXT,
  linkedin      TEXT,
  es_principal  BOOLEAN NOT NULL DEFAULT FALSE,
  rol_compra    TEXT CHECK (rol_compra IN ('decisor','influenciador','usuario','bloqueador','campeon')),
  notas         TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_contactos_cuenta ON contactos (cuenta_id);
CREATE INDEX IF NOT EXISTS ix_contactos_nombre ON contactos (lower(nombre));

CREATE TABLE IF NOT EXISTS leads (
  id              SERIAL PRIMARY KEY,
  nombre          TEXT NOT NULL,
  empresa         TEXT,
  puesto          TEXT,
  email           TEXT,
  telefono        TEXT,
  whatsapp        TEXT,
  origen          TEXT NOT NULL DEFAULT 'manual',
  campana_id      INTEGER,                  -- FK añadida tras crear campanas
  industria       TEXT,
  tamano_empresa  TEXT CHECK (tamano_empresa IN ('micro','pequena','mediana','grande','corporativo')),
  ciudad          TEXT,
  estado          TEXT,
  etapa           TEXT NOT NULL DEFAULT 'lead'
                  CHECK (etapa IN ('lead','contacto','calificado','propuesta','negociacion','ganado','perdido')),
  etapa_max       TEXT NOT NULL DEFAULT 'lead',
  score           SMALLINT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  score_motivos   JSONB NOT NULL DEFAULT '[]'::jsonb,
  temperatura     TEXT NOT NULL DEFAULT 'frio' CHECK (temperatura IN ('frio','tibio','caliente','ardiente')),
  intencion       TEXT CHECK (intencion IN ('exploracion','comparacion','compra','renovacion')),
  urgencia        TEXT CHECK (urgencia IN ('baja','media','alta','inmediata')),
  prioridad       SMALLINT NOT NULL DEFAULT 3 CHECK (prioridad BETWEEN 1 AND 5),
  valor_estimado  BIGINT NOT NULL DEFAULT 0,
  propietario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  etiquetas       TEXT[] NOT NULL DEFAULT '{}',
  necesidad       TEXT,
  mensaje         TEXT,
  cuenta_id       INTEGER REFERENCES cuentas(id) ON DELETE SET NULL,   -- al convertir
  oportunidad_id  INTEGER,                  -- FK añadida tras crear oportunidades
  motivo_perdida  TEXT,
  ultimo_contacto_en TIMESTAMPTZ,
  convertido_en   TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_leads_etapa ON leads (etapa, score DESC);
CREATE INDEX IF NOT EXISTS ix_leads_propietario ON leads (propietario_id, etapa);
CREATE INDEX IF NOT EXISTS ix_leads_creado ON leads (creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_leads_campana ON leads (campana_id);
CREATE INDEX IF NOT EXISTS ix_leads_nombre ON leads (lower(nombre));

-- Señales de comportamiento: la materia prima del lead score.
CREATE TABLE IF NOT EXISTS senales (
  id            SERIAL PRIMARY KEY,
  lead_id       INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  cuenta_id     INTEGER REFERENCES cuentas(id) ON DELETE CASCADE,
  contacto_id   INTEGER REFERENCES contactos(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL
                CHECK (tipo IN ('correo_abierto','correo_clic','correo_respondido','visita_web',
                                'visita_precios','descarga','formulario','llamada_atendida',
                                'reunion_aceptada','cotizacion_vista','whatsapp_respondido',
                                'evento_asistido','chat_iniciado')),
  peso          SMALLINT NOT NULL DEFAULT 1,
  detalle       TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_senales_lead ON senales (lead_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_senales_cuenta ON senales (cuenta_id, creado_en DESC);

-- ---------------------------------------------------------------------------
--  Catálogo y pipeline
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS productos (
  id            SERIAL PRIMARY KEY,
  sku           TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  categoria     TEXT,
  unidad        TEXT NOT NULL DEFAULT 'servicio',
  precio_base   BIGINT NOT NULL DEFAULT 0,  -- centavos, por unidad de medida
  costo_base    BIGINT NOT NULL DEFAULT 0,
  -- Volumen mensual típico que contrata una cuenta mediana. Necesario para poder
  -- estimar el valor de una venta cruzada: multiplicar un precio unitario por
  -- meses, sin volumen, daría cifras absurdas.
  volumen_mensual INTEGER NOT NULL DEFAULT 1,
  margen_meta   SMALLINT NOT NULL DEFAULT 25,
  recurrente    BOOLEAN NOT NULL DEFAULT FALSE,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oportunidades (
  id              SERIAL PRIMARY KEY,
  nombre          TEXT NOT NULL,
  cuenta_id       INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  contacto_id     INTEGER REFERENCES contactos(id) ON DELETE SET NULL,
  propietario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  lead_id         INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  campana_id      INTEGER,
  etapa           TEXT NOT NULL DEFAULT 'calificado'
                  CHECK (etapa IN ('calificado','propuesta','negociacion','ganado','perdido')),
  etapa_max       TEXT NOT NULL DEFAULT 'calificado',
  estado          TEXT NOT NULL DEFAULT 'abierta'
                  CHECK (estado IN ('abierta','ganada','perdida')),
  monto           BIGINT NOT NULL DEFAULT 0,   -- centavos
  monto_recurrente BIGINT NOT NULL DEFAULT 0,  -- mensual recurrente
  moneda          TEXT NOT NULL DEFAULT 'MXN',
  probabilidad    SMALLINT NOT NULL DEFAULT 20 CHECK (probabilidad BETWEEN 0 AND 100),
  ia_probabilidad SMALLINT CHECK (ia_probabilidad BETWEEN 0 AND 100),
  ia_riesgos      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ia_acciones     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ia_calculado_en TIMESTAMPTZ,
  cierre_estimado DATE,
  cerrado_en      TIMESTAMPTZ,
  competidor      TEXT,
  origen          TEXT,
  tipo            TEXT NOT NULL DEFAULT 'nuevo' CHECK (tipo IN ('nuevo','renovacion','expansion','venta_cruzada')),
  motivo_perdida  TEXT,
  siguiente_paso  TEXT,
  etiquetas       TEXT[] NOT NULL DEFAULT '{}',
  ultima_actividad_en TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_oport_etapa ON oportunidades (etapa, cierre_estimado);
CREATE INDEX IF NOT EXISTS ix_oport_propietario ON oportunidades (propietario_id, estado);
CREATE INDEX IF NOT EXISTS ix_oport_cuenta ON oportunidades (cuenta_id);
CREATE INDEX IF NOT EXISTS ix_oport_cierre ON oportunidades (cierre_estimado) WHERE estado = 'abierta';
CREATE INDEX IF NOT EXISTS ix_oport_cerrado ON oportunidades (cerrado_en DESC) WHERE estado <> 'abierta';
CREATE INDEX IF NOT EXISTS ix_oport_estancadas ON oportunidades (ultima_actividad_en) WHERE estado = 'abierta';

CREATE TABLE IF NOT EXISTS oportunidad_productos (
  id              SERIAL PRIMARY KEY,
  oportunidad_id  INTEGER NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  producto_id     INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad        NUMERIC(12,2) NOT NULL DEFAULT 1,
  precio_unitario BIGINT NOT NULL DEFAULT 0,
  descuento_pct   SMALLINT NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS ix_oport_prod ON oportunidad_productos (oportunidad_id);

-- Historial de etapas: alimenta velocidad de pipeline y detección de estancamiento.
CREATE TABLE IF NOT EXISTS etapa_historial (
  id            SERIAL PRIMARY KEY,
  entidad_tipo  TEXT NOT NULL CHECK (entidad_tipo IN ('lead','oportunidad')),
  entidad_id    INTEGER NOT NULL,
  etapa_anterior TEXT,
  etapa_nueva   TEXT NOT NULL,
  dias_en_anterior NUMERIC(8,2),
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_etapa_hist ON etapa_historial (entidad_tipo, entidad_id, creado_en);

-- ---------------------------------------------------------------------------
--  Cotizaciones
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cotizaciones (
  id              SERIAL PRIMARY KEY,
  folio           TEXT NOT NULL UNIQUE,
  oportunidad_id  INTEGER REFERENCES oportunidades(id) ON DELETE SET NULL,
  cuenta_id       INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  contacto_id     INTEGER REFERENCES contactos(id) ON DELETE SET NULL,
  propietario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  estado          TEXT NOT NULL DEFAULT 'borrador'
                  CHECK (estado IN ('borrador','enviada','vista','aceptada','rechazada','vencida')),
  subtotal        BIGINT NOT NULL DEFAULT 0,
  descuento       BIGINT NOT NULL DEFAULT 0,
  impuestos       BIGINT NOT NULL DEFAULT 0,
  total           BIGINT NOT NULL DEFAULT 0,
  moneda          TEXT NOT NULL DEFAULT 'MXN',
  condiciones     TEXT,
  notas           TEXT,
  valida_hasta    DATE,
  enviada_en      TIMESTAMPTZ,
  vista_en        TIMESTAMPTZ,
  resuelta_en     TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cotiz_cuenta ON cotizaciones (cuenta_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_cotiz_estado ON cotizaciones (estado, valida_hasta);

CREATE TABLE IF NOT EXISTS cotizacion_items (
  id              SERIAL PRIMARY KEY,
  cotizacion_id   INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  producto_id     INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  descripcion     TEXT NOT NULL,
  cantidad        NUMERIC(12,2) NOT NULL DEFAULT 1,
  precio_unitario BIGINT NOT NULL DEFAULT 0,
  descuento_pct   SMALLINT NOT NULL DEFAULT 0,
  importe         BIGINT NOT NULL DEFAULT 0,
  orden           SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_cotiz_items ON cotizacion_items (cotizacion_id, orden);

-- ---------------------------------------------------------------------------
--  Actividad, notas, archivos, contratos, facturas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS actividades (
  id              SERIAL PRIMARY KEY,
  tipo            TEXT NOT NULL
                  CHECK (tipo IN ('llamada','correo','reunion','whatsapp','tarea','visita','seguimiento','demo')),
  asunto          TEXT NOT NULL,
  descripcion     TEXT,
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','completada','cancelada')),
  prioridad       SMALLINT NOT NULL DEFAULT 3 CHECK (prioridad BETWEEN 1 AND 5),
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  cuenta_id       INTEGER REFERENCES cuentas(id) ON DELETE CASCADE,
  contacto_id     INTEGER REFERENCES contactos(id) ON DELETE SET NULL,
  lead_id         INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  oportunidad_id  INTEGER REFERENCES oportunidades(id) ON DELETE CASCADE,
  ticket_id       INTEGER,
  inicia_en       TIMESTAMPTZ,
  vence_en        TIMESTAMPTZ,
  duracion_min    SMALLINT,
  completada_en   TIMESTAMPTZ,
  resultado       TEXT,
  ubicacion       TEXT,
  origen          TEXT NOT NULL DEFAULT 'manual',  -- manual | ia | automatizacion
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_act_usuario_fecha ON actividades (usuario_id, vence_en);
CREATE INDEX IF NOT EXISTS ix_act_pendientes ON actividades (vence_en) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS ix_act_cuenta ON actividades (cuenta_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_act_oport ON actividades (oportunidad_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_act_lead ON actividades (lead_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS notas (
  id              SERIAL PRIMARY KEY,
  cuerpo          TEXT NOT NULL,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  cuenta_id       INTEGER REFERENCES cuentas(id) ON DELETE CASCADE,
  lead_id         INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  oportunidad_id  INTEGER REFERENCES oportunidades(id) ON DELETE CASCADE,
  contacto_id     INTEGER REFERENCES contactos(id) ON DELETE CASCADE,
  fijada          BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notas_cuenta ON notas (cuenta_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS archivos (
  id              SERIAL PRIMARY KEY,
  nombre          TEXT NOT NULL,
  tipo_mime       TEXT,
  tamano_bytes    BIGINT NOT NULL DEFAULT 0,
  url             TEXT,
  categoria       TEXT,                     -- contrato | cotizacion | evidencia | otro
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  cuenta_id       INTEGER REFERENCES cuentas(id) ON DELETE CASCADE,
  oportunidad_id  INTEGER REFERENCES oportunidades(id) ON DELETE CASCADE,
  ticket_id       INTEGER,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_archivos_cuenta ON archivos (cuenta_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS contratos (
  id              SERIAL PRIMARY KEY,
  folio           TEXT NOT NULL UNIQUE,
  cuenta_id       INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  oportunidad_id  INTEGER REFERENCES oportunidades(id) ON DELETE SET NULL,
  nombre          TEXT NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'vigente'
                  CHECK (estado IN ('borrador','en_firma','vigente','por_vencer','vencido','cancelado')),
  valor           BIGINT NOT NULL DEFAULT 0,
  inicia_en       DATE,
  termina_en      DATE,
  renovacion_auto BOOLEAN NOT NULL DEFAULT FALSE,
  condiciones     TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_contratos_cuenta ON contratos (cuenta_id);
CREATE INDEX IF NOT EXISTS ix_contratos_vence ON contratos (termina_en) WHERE estado = 'vigente';

CREATE TABLE IF NOT EXISTS facturas (
  id              SERIAL PRIMARY KEY,
  folio           TEXT NOT NULL UNIQUE,
  cuenta_id       INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  oportunidad_id  INTEGER REFERENCES oportunidades(id) ON DELETE SET NULL,
  estado          TEXT NOT NULL DEFAULT 'emitida'
                  CHECK (estado IN ('borrador','emitida','pagada','vencida','cancelada')),
  subtotal        BIGINT NOT NULL DEFAULT 0,
  impuestos       BIGINT NOT NULL DEFAULT 0,
  total           BIGINT NOT NULL DEFAULT 0,
  emitida_en      DATE NOT NULL DEFAULT CURRENT_DATE,
  vence_en        DATE,
  pagada_en       DATE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_facturas_cuenta ON facturas (cuenta_id, emitida_en DESC);
CREATE INDEX IF NOT EXISTS ix_facturas_estado ON facturas (estado, vence_en);

-- ---------------------------------------------------------------------------
--  Atención al cliente
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tickets (
  id                SERIAL PRIMARY KEY,
  folio             TEXT NOT NULL UNIQUE,
  asunto            TEXT NOT NULL,
  descripcion       TEXT,
  cuenta_id         INTEGER REFERENCES cuentas(id) ON DELETE CASCADE,
  contacto_id       INTEGER REFERENCES contactos(id) ON DELETE SET NULL,
  canal             TEXT NOT NULL DEFAULT 'correo'
                    CHECK (canal IN ('correo','whatsapp','chat','telefono','portal','presencial')),
  categoria         TEXT,
  prioridad         TEXT NOT NULL DEFAULT 'media'
                    CHECK (prioridad IN ('baja','media','alta','urgente')),
  estado            TEXT NOT NULL DEFAULT 'nuevo'
                    CHECK (estado IN ('nuevo','abierto','pendiente','resuelto','cerrado')),
  asignado_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  sla_horas         SMALLINT NOT NULL DEFAULT 24,
  sla_vence_en      TIMESTAMPTZ,
  primera_respuesta_en TIMESTAMPTZ,
  resuelto_en       TIMESTAMPTZ,
  cerrado_en        TIMESTAMPTZ,
  sentimiento       TEXT CHECK (sentimiento IN ('positivo','neutral','negativo','frustrado')),
  csat              SMALLINT CHECK (csat BETWEEN 1 AND 5),
  ia_sugerencia     TEXT,
  ia_resuelto       BOOLEAN NOT NULL DEFAULT FALSE,
  guia_relacionada  TEXT,                   -- puente con el sistema de guías
  etiquetas         TEXT[] NOT NULL DEFAULT '{}',
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tickets_estado ON tickets (estado, prioridad, sla_vence_en);
CREATE INDEX IF NOT EXISTS ix_tickets_cuenta ON tickets (cuenta_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_tickets_asignado ON tickets (asignado_id, estado);
CREATE INDEX IF NOT EXISTS ix_tickets_sla ON tickets (sla_vence_en) WHERE estado IN ('nuevo','abierto','pendiente');

CREATE TABLE IF NOT EXISTS ticket_mensajes (
  id            SERIAL PRIMARY KEY,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  autor_tipo    TEXT NOT NULL CHECK (autor_tipo IN ('cliente','agente','ia','sistema')),
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  cuerpo        TEXT NOT NULL,
  interno       BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tkmsg_ticket ON ticket_mensajes (ticket_id, creado_en);

CREATE TABLE IF NOT EXISTS articulos_kb (
  id            SERIAL PRIMARY KEY,
  titulo        TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  categoria     TEXT,
  cuerpo        TEXT NOT NULL,
  etiquetas     TEXT[] NOT NULL DEFAULT '{}',
  vistas        INTEGER NOT NULL DEFAULT 0,
  utiles        INTEGER NOT NULL DEFAULT 0,
  publicado     BOOLEAN NOT NULL DEFAULT TRUE,
  autor_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
--  Marketing
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campanas (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'email'
                CHECK (tipo IN ('email','social','paid','evento','webinar','referido','contenido','telemarketing')),
  estado        TEXT NOT NULL DEFAULT 'borrador'
                CHECK (estado IN ('borrador','programada','activa','pausada','finalizada')),
  canal         TEXT,
  presupuesto   BIGINT NOT NULL DEFAULT 0,
  costo         BIGINT NOT NULL DEFAULT 0,
  meta_leads    INTEGER NOT NULL DEFAULT 0,
  inicia_en     DATE,
  termina_en    DATE,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  responsable_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  descripcion   TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_campanas_estado ON campanas (estado, inicia_en DESC);

CREATE TABLE IF NOT EXISTS envios_email (
  id            SERIAL PRIMARY KEY,
  campana_id    INTEGER REFERENCES campanas(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  asunto        TEXT NOT NULL,
  plantilla     TEXT,
  segmento_id   INTEGER,
  estado        TEXT NOT NULL DEFAULT 'borrador'
                CHECK (estado IN ('borrador','programado','enviando','enviado')),
  enviados      INTEGER NOT NULL DEFAULT 0,
  entregados    INTEGER NOT NULL DEFAULT 0,
  abiertos      INTEGER NOT NULL DEFAULT 0,
  clics         INTEGER NOT NULL DEFAULT 0,
  rebotes       INTEGER NOT NULL DEFAULT 0,
  bajas         INTEGER NOT NULL DEFAULT 0,
  respuestas    INTEGER NOT NULL DEFAULT 0,
  enviado_en    TIMESTAMPTZ,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_envios_campana ON envios_email (campana_id, enviado_en DESC);

CREATE TABLE IF NOT EXISTS segmentos (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  entidad       TEXT NOT NULL DEFAULT 'lead' CHECK (entidad IN ('lead','cuenta','contacto')),
  definicion    JSONB NOT NULL DEFAULT '{"reglas":[]}'::jsonb,
  dinamico      BOOLEAN NOT NULL DEFAULT TRUE,
  total_cache   INTEGER NOT NULL DEFAULT 0,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS landing_pages (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  campana_id    INTEGER REFERENCES campanas(id) ON DELETE SET NULL,
  estado        TEXT NOT NULL DEFAULT 'publicada'
                CHECK (estado IN ('borrador','publicada','archivada')),
  visitas       INTEGER NOT NULL DEFAULT 0,
  conversiones  INTEGER NOT NULL DEFAULT 0,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
--  Automatizaciones (motor visual)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS automatizaciones (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  activa        BOOLEAN NOT NULL DEFAULT FALSE,
  evento        TEXT NOT NULL,              -- lead.creado | oportunidad.etapa | ticket.creado | cron.diario ...
  condiciones   JSONB NOT NULL DEFAULT '[]'::jsonb,
  nodos         JSONB NOT NULL DEFAULT '[]'::jsonb,
  aristas       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ejecuciones   INTEGER NOT NULL DEFAULT 0,
  exitos        INTEGER NOT NULL DEFAULT 0,
  fallos        INTEGER NOT NULL DEFAULT 0,
  ultimo_run_en TIMESTAMPTZ,
  creado_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_autom_evento ON automatizaciones (evento) WHERE activa;

CREATE TABLE IF NOT EXISTS automatizacion_ejecuciones (
  id                SERIAL PRIMARY KEY,
  automatizacion_id INTEGER NOT NULL REFERENCES automatizaciones(id) ON DELETE CASCADE,
  estado            TEXT NOT NULL DEFAULT 'ok'
                    CHECK (estado IN ('ok','error','parcial','omitida','esperando')),
  entidad_tipo      TEXT,
  entidad_id        INTEGER,
  pasos             JSONB NOT NULL DEFAULT '[]'::jsonb,
  duracion_ms       INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  -- Soporte para el nodo «esperar»: la ejecución se persiste a medio camino y el
  -- programador la reanuda. Guardarlo en la base (y no en un temporizador en
  -- memoria) es lo que hace que una espera sobreviva a un reinicio del servidor.
  reanudar_en       TIMESTAMPTZ,
  nodo_pendiente    TEXT,
  contexto          JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_autom_ejec ON automatizacion_ejecuciones (automatizacion_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_autom_reanudar ON automatizacion_ejecuciones (reanudar_en)
  WHERE estado = 'esperando';

-- ---------------------------------------------------------------------------
--  Importación de clientes
--  El historial existe para auditoría: quién subió qué archivo, cuándo, con qué
--  mapeo y con qué resultado. `errores` guarda un extracto acotado —el detalle
--  completo lo descarga el usuario al terminar— para que una carga de 50 000
--  filas con muchos rechazos no infle la tabla.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS importaciones (
  id             SERIAL PRIMARY KEY,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  archivo        TEXT NOT NULL,
  tamano_bytes   BIGINT NOT NULL DEFAULT 0,
  estado         TEXT NOT NULL DEFAULT 'en_proceso'
                 CHECK (estado IN ('en_proceso','completada','cancelada','fallida')),
  estrategia     TEXT NOT NULL DEFAULT 'omitir'
                 CHECK (estrategia IN ('omitir','actualizar','crear_nuevo','caso_por_caso')),
  total_filas    INTEGER NOT NULL DEFAULT 0,
  total_clientes INTEGER NOT NULL DEFAULT 0,
  creados        INTEGER NOT NULL DEFAULT 0,
  actualizados   INTEGER NOT NULL DEFAULT 0,
  omitidos       INTEGER NOT NULL DEFAULT 0,
  fallidos       INTEGER NOT NULL DEFAULT 0,
  contactos      INTEGER NOT NULL DEFAULT 0,
  duracion_ms    INTEGER NOT NULL DEFAULT 0,
  mapeo          JSONB NOT NULL DEFAULT '{}'::jsonb,
  errores        JSONB NOT NULL DEFAULT '[]'::jsonb,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminado_en   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_importaciones_usuario ON importaciones (usuario_id, creado_en DESC);

-- Dirección desglosada: el importador recibe calle, número y colonia por
-- separado y guardarlos concatenados impide volver a separarlos después.
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS numero  TEXT;
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS colonia TEXT;

-- Búsqueda de duplicados por RFC durante la importación. No es UNIQUE a
-- propósito: el usuario puede elegir «crear como nuevo» y una restricción dura
-- se lo impediría.
CREATE INDEX IF NOT EXISTS ix_cuentas_rfc ON cuentas (upper(rfc)) WHERE rfc IS NOT NULL;

-- ---------------------------------------------------------------------------
--  Bitácora unificada, notificaciones
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bitacora (
  id            BIGSERIAL PRIMARY KEY,
  entidad_tipo  TEXT NOT NULL,              -- lead | cuenta | oportunidad | ticket | cotizacion | contacto
  entidad_id    INTEGER NOT NULL,
  cuenta_id     INTEGER REFERENCES cuentas(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,              -- creado | etapa | nota | correo | llamada | ia | automatizacion ...
  titulo        TEXT NOT NULL,
  detalle       TEXT,
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_bitacora_entidad ON bitacora (entidad_tipo, entidad_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_bitacora_cuenta ON bitacora (cuenta_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_bitacora_fecha ON bitacora (creado_en DESC);

CREATE TABLE IF NOT EXISTS notificaciones (
  id            SERIAL PRIMARY KEY,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL DEFAULT 'info'
                CHECK (tipo IN ('info','exito','alerta','error','ia')),
  titulo        TEXT NOT NULL,
  cuerpo        TEXT,
  enlace        TEXT,
  leida         BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notif_usuario ON notificaciones (usuario_id, leida, creado_en DESC);

-- ---------------------------------------------------------------------------
--  Capa de IA
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ia_insights (
  id            SERIAL PRIMARY KEY,
  tipo          TEXT NOT NULL
                CHECK (tipo IN ('riesgo','oportunidad','venta_cruzada','churn','nba','pronostico','estancada','reactivacion')),
  entidad_tipo  TEXT NOT NULL,
  entidad_id    INTEGER NOT NULL,
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  explicacion   TEXT NOT NULL,
  confianza     SMALLINT NOT NULL DEFAULT 70 CHECK (confianza BETWEEN 0 AND 100),
  impacto       BIGINT NOT NULL DEFAULT 0,  -- centavos en juego
  severidad     TEXT NOT NULL DEFAULT 'media' CHECK (severidad IN ('baja','media','alta','critica')),
  acciones      JSONB NOT NULL DEFAULT '[]'::jsonb,
  estado        TEXT NOT NULL DEFAULT 'nuevo'
                CHECK (estado IN ('nuevo','visto','aplicado','descartado')),
  caduca_en     TIMESTAMPTZ,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_insights_usuario ON ia_insights (usuario_id, estado, severidad);
CREATE INDEX IF NOT EXISTS ix_insights_entidad ON ia_insights (entidad_tipo, entidad_id);

CREATE TABLE IF NOT EXISTS ia_conversaciones (
  id            SERIAL PRIMARY KEY,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL DEFAULT 'Nueva conversación',
  contexto      JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_iaconv_usuario ON ia_conversaciones (usuario_id, actualizado_en DESC);

CREATE TABLE IF NOT EXISTS ia_mensajes (
  id              BIGSERIAL PRIMARY KEY,
  conversacion_id INTEGER NOT NULL REFERENCES ia_conversaciones(id) ON DELETE CASCADE,
  rol             TEXT NOT NULL CHECK (rol IN ('usuario','asistente','sistema')),
  cuerpo          TEXT NOT NULL,
  datos           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- herramientas usadas, tablas, gráficas
  modelo          TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_iamsg_conv ON ia_mensajes (conversacion_id, creado_en);

-- ---------------------------------------------------------------------------
--  Nivel de etapa en el embudo
--  Espejo en SQL de `indiceEtapa` en ia/motor.js: mantiene el vocabulario de
--  etapas en un solo lugar también del lado de la base, y permite calcular el
--  embudo con `max()` en lugar de traer filas para ordenarlas en JS.
--  `perdido` devuelve -1: una operación perdida no "alcanzó" ninguna etapa nueva,
--  su avance real lo registra `etapa_max`.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION aura_nivel_etapa(etapa TEXT) RETURNS INT AS $$
  SELECT CASE etapa
    WHEN 'lead'        THEN 0
    WHEN 'contacto'    THEN 1
    WHEN 'calificado'  THEN 2
    WHEN 'propuesta'   THEN 3
    WHEN 'negociacion' THEN 4
    WHEN 'ganado'      THEN 5
    ELSE -1
  END;
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

-- ---------------------------------------------------------------------------
--  Llaves foráneas diferidas
--  Van al final porque cierran ciclos entre tablas (lead ↔ oportunidad,
--  lead ↔ campaña, actividad ↔ ticket). Postgres no soporta
--  ADD CONSTRAINT IF NOT EXISTS, de ahí el bloque guardado.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fks TEXT[][] := ARRAY[
    ['fk_leads_oportunidad', 'leads',        'oportunidad_id', 'oportunidades', 'SET NULL'],
    ['fk_leads_campana',     'leads',        'campana_id',     'campanas',      'SET NULL'],
    ['fk_oport_campana',     'oportunidades','campana_id',     'campanas',      'SET NULL'],
    ['fk_act_ticket',        'actividades',  'ticket_id',      'tickets',       'CASCADE'],
    ['fk_arch_ticket',       'archivos',     'ticket_id',      'tickets',       'CASCADE'],
    ['fk_envios_segmento',   'envios_email', 'segmento_id',    'segmentos',     'SET NULL']
  ];
  fk TEXT[];
BEGIN
  FOREACH fk SLICE 1 IN ARRAY fks LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk[1]) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE %s',
        fk[2], fk[1], fk[3], fk[4], fk[5]
      );
    END IF;
  END LOOP;
END $$;
