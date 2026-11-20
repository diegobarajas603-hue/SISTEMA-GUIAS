// Conexion con el SAD (sistema de facturacion de Tauro, hospedado por DISA).
//
// Cada guia nace en el SAD: se arma un embarque, se factura, y el folio de la
// factura ES el numero de guia (AN... sale de MTY, BN... sale de CDMX). Este
// modulo lee el SAD cada pocos minutos y guarda en la tabla facturas_sad lo
// que encuentra, para que el sistema de guias sepa de una guia ANTES de que
// alguien la escanee:
//
//  - "Por salir": guias facturadas que nadie ha escaneado todavia.
//  - Las que el SAD ya tiene en "Transito" se dan de alta en transito solas.
//  - Aviso al escanear una guia nueva que no aparece en el SAD o cuya
//    factura esta cancelada.
//  - El cliente ve "Tu envio fue documentado" desde que se factura.
//  - Cliente, destinatario, telefono y si va a ocurre o a domicilio.
//
// Solo LEE el SAD: nunca crea, modifica ni cancela nada alla. El SAD no tiene
// API, asi que se inicia sesion como lo haria una persona y se leen sus
// pantallas. Si DISA cambia esas pantallas, este modulo es lo unico que hay
// que ajustar; el escaneo sigue funcionando igual aunque el SAD falle.
//
// Variables de entorno:
//   SAD_USUARIO, SAD_PASSWORD  usuario de solo consulta en el SAD. Sin ellas
//                              la sincronizacion queda apagada.
//   SAD_URL                    raiz del SAD (por omision la de Tauro).
//   SAD_INTERVALO_MIN          minutos entre lecturas (5 por omision).
//   SAD_DIAS                   dias hacia atras que se revisan (2 por omision).
//   SAD_ZONA_UTC               desfase horario del SAD (-06:00, Monterrey).

const { pool } = require('./db');

const BASE = (process.env.SAD_URL || 'https://srvr1disa.ddns.net/customer/tauro/sad').replace(/\/+$/, '');
const USUARIO = process.env.SAD_USUARIO || '';
const PASSWORD = process.env.SAD_PASSWORD || '';
const INTERVALO_MIN = Math.max(Number(process.env.SAD_INTERVALO_MIN) || 5, 1);
const DIAS = Math.min(Math.max(Number(process.env.SAD_DIAS) || 2, 1), 15);
const ZONA = /^[+-]\d{2}:\d{2}$/.test(process.env.SAD_ZONA_UTC || '') ? process.env.SAD_ZONA_UTC : '-06:00';

// Topes para no cargar al SAD: paginas de embarques por ciclo y facturas de
// las que se consulta el detalle por ciclo (las demas esperan al siguiente).
const MAX_PAGINAS = 12;
const DETALLES_POR_CICLO = 30;
const TIEMPO_LIMITE_MS = 30 * 1000;

const FOLIO_GUIA = /^(AN|BN)\d+$/;
const PLAZA_DE_SERIE = { AN: 'MTY', BN: 'CDMX' };

const habilitado = Boolean(USUARIO && PASSWORD);

// ---------- Estado (lo muestra el panel) ----------

const estado = {
  habilitado,
  intervaloMin: INTERVALO_MIN,
  enCurso: false,
  ultimoIntento: null,
  ultimoExito: null,
  ultimoError: null,
  ultimoResumen: null,
};

function estadoSincronizacion() {
  return { ...estado };
}

// ---------- Tabla ----------

async function initSad() {
  await pool.query(`
    -- Lo que el SAD sabe de cada guia. Es una copia de consulta: la llena la
    -- sincronizacion y nunca se edita a mano. A proposito NO tiene llave
    -- foranea contra guias: casi siempre la factura existe antes que la guia.
    CREATE TABLE IF NOT EXISTS facturas_sad (
      numero_guia TEXT PRIMARY KEY,       -- folio de la factura (AN.../BN...)
      plaza_origen TEXT NOT NULL,         -- MTY (AN) o CDMX (BN)
      embarque TEXT,                      -- folio del embarque (MTY147810)
      embarque_id INTEGER,
      venta_id INTEGER,
      cliente TEXT,
      fecha_embarque DATE,
      estatus_sad TEXT,                   -- Cedis-Local, Transito, Cancelado...
      cancelada BOOLEAN NOT NULL DEFAULT FALSE,
      remitente_sucursal TEXT,
      destinatario TEXT,
      destinatario_sucursal TEXT,
      tipo_entrega TEXT,                  -- ocurre o domicilio
      telefono TEXT,
      direccion TEXT,
      registrada_en TIMESTAMPTZ,          -- cuando se capturo en el SAD
      detalle_en TIMESTAMPTZ,             -- cuando se leyo su detalle
      visto_en TIMESTAMPTZ NOT NULL,      -- primera vez que se vio aqui
      actualizado_en TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_facturas_sad_visto_en ON facturas_sad (visto_en DESC);
    -- Veces que fallo leer el detalle; despues de 3 se deja de intentar para
    -- que una factura rota no frene a las demas
    ALTER TABLE facturas_sad ADD COLUMN IF NOT EXISTS detalle_fallos INTEGER NOT NULL DEFAULT 0;

    -- Cuando una factura se cancela en el SAD despues de que su guia ya
    -- existe aqui, se avisa en el panel hasta que un administrador lo revisa.
    -- cancelada_en: cuando se detecto la cancelacion.
    ALTER TABLE facturas_sad ADD COLUMN IF NOT EXISTS cancelada_en TIMESTAMPTZ;
    ALTER TABLE facturas_sad ADD COLUMN IF NOT EXISTS cancelacion_revisada_en TIMESTAMPTZ;
    ALTER TABLE facturas_sad ADD COLUMN IF NOT EXISTS cancelacion_revisada_por TEXT;
    CREATE INDEX IF NOT EXISTS idx_facturas_sad_sin_detalle ON facturas_sad (venta_id) WHERE detalle_en IS NULL;
  `);
}

// ---------- Cliente HTTP con sesion ----------

let cookies = {};

function guardarCookies(res) {
  const lista = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of lista) {
    const [par] = c.split(';');
    const i = par.indexOf('=');
    if (i > 0) cookies[par.slice(0, i).trim()] = par.slice(i + 1).trim();
  }
}

function cabeceraCookies() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function pedir(ruta, opciones = {}) {
  const res = await fetch(ruta.startsWith('http') ? ruta : BASE + ruta, {
    ...opciones,
    redirect: 'manual',
    signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    headers: { 'User-Agent': 'SistemaGuias/1.0', Cookie: cabeceraCookies(), ...(opciones.headers || {}) },
  });
  guardarCookies(res);
  return res;
}

const esPantallaDeAcceso = (res) =>
  res.status >= 300 && res.status < 400 && /\/access\//.test(res.headers.get('location') || '');

async function iniciarSesion() {
  cookies = {};
  await (await pedir('/access/')).arrayBuffer();
  const cuerpo = new URLSearchParams({
    unknown_data: USUARIO,
    password: PASSWORD,
    redirection: BASE + '/route/embarque/search/',
    submit2: 'enviar',
  });
  const res = await pedir('/access/in.php', {
    method: 'POST',
    body: cuerpo.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  await res.arrayBuffer();
  // Con datos correctos el SAD redirige a la pagina pedida; con datos
  // incorrectos regresa a la pantalla de acceso
  const destino = res.headers.get('location') || '';
  if (!(res.status >= 300 && res.status < 400) || /\/access\//.test(destino)) {
    bloqueadoHasta = Date.now() + 60 * 60 * 1000;
    throw new Error('El SAD rechazo el usuario o la contrasena (revisa SAD_USUARIO y SAD_PASSWORD)');
  }
}

// Pide una pagina del SAD; si la sesion vencio, vuelve a entrar una vez
async function pagina(ruta) {
  for (let intento = 0; intento < 2; intento++) {
    if (!Object.keys(cookies).length) await iniciarSesion();
    const res = await pedir(ruta);
    if (esPantallaDeAcceso(res)) {
      await res.arrayBuffer();
      cookies = {};
      continue;
    }
    if (!res.ok) throw new Error(`El SAD respondio ${res.status} en ${ruta}`);
    return res.text();
  }
  throw new Error('No se pudo mantener la sesion en el SAD');
}

// ---------- Lectura de pantallas ----------

function texto(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function idDeEnlace(html) {
  const m = /[?&]id=(\d+)/.exec(html || '');
  return m ? Number(m[1]) : null;
}

// Listado de embarques: folio, factura, cliente, fecha y estatus
function leerEmbarques(html) {
  const filas = [];
  const bloques = html.split('<div class="item">').slice(1);
  for (const b of bloques) {
    const celda = (clase) => {
      const m = new RegExp(`<div class="${clase}">([\\s\\S]*?)</div>`).exec(b);
      return m ? m[1] : '';
    };
    const embarque = celda('id embarque');
    const venta = celda('embarque sale');
    const fila = {
      embarque: texto(embarque),
      embarqueId: idDeEnlace(embarque),
      factura: texto(venta).toUpperCase(),
      ventaId: idDeEnlace(venta),
      cliente: texto(celda('embarque client')),
      fecha: texto(celda('embarque date')),
      estatus: texto(celda('embarque status')),
    };
    if (fila.embarque) filas.push(fila);
  }
  return filas;
}

// Listado de ventas filtrado por canceladas: solo interesan los folios
function leerCanceladas(html) {
  const folios = [];
  const re = /<div class="item CANCELED"[\s\S]*?<div class="folio">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) folios.push(texto(m[1]).toUpperCase());
  return folios;
}

// Detalle de una venta: remitente, destinatario, telefono, estatus y hora
function leerVenta(html) {
  const area22 = (clase) => {
    const m = new RegExp(`class="container ${clase}"[^>]*>[\\s\\S]*?class="area22">([\\s\\S]*?)</div>`).exec(html);
    return m ? texto(m[1]) : null;
  };
  const campo = (seg, clase) => {
    const m = new RegExp(`class="container ${clase}[^"]*">[\\s\\S]*?class="area2">([\\s\\S]*?)</div>`).exec(seg);
    return m ? texto(m[1]) : '';
  };
  const titulo = /<title>\s*venta # (\S+)/.exec(html);
  const iDest = html.indexOf('dataReceiverContainer');
  const dest = iDest >= 0 ? html.slice(iDest, iDest + 8000) : '';
  const estatus = /class="container statusContainer">[\s\S]*?class="area2">([\s\S]*?)<\/div>/.exec(html);
  const registro = /id="registred_by_oringin">[^<]*?(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/.exec(html);

  const destinatario = (area22('receiver receiverContainer') || '').replace(/^\d+\s*-\s*/, '') || null;
  const sucursal = area22('receiver receiverSubsidiaryContainer');
  const direccion = [campo(dest, 'client_address'), campo(dest, 'client_num'), campo(dest, 'client_ext'),
    campo(dest, 'client_suburb'), campo(dest, 'client_state'), campo(dest, 'client_cp')]
    .filter(Boolean).join(', ');
  return {
    folio: titulo ? titulo[1].toUpperCase() : null,
    remitenteSucursal: area22('sender senderSubsidiaryContainer'),
    destinatario,
    destinatarioSucursal: sucursal,
    tipoEntrega: sucursal ? (/OCURRE/i.test(sucursal) ? 'ocurre' : 'domicilio') : null,
    telefono: campo(dest, 'client_tel').replace(/[^\d+]/g, '') || null,
    direccion: direccion || null,
    estatus: estatus ? texto(estatus[1]).toLowerCase() : null,
    registradaEn: registro
      ? new Date(`${registro[3]}-${registro[2]}-${registro[1]}T${registro[4]}:${registro[5]}:00${ZONA}`)
      : null,
  };
}

// ---------- Sincronizacion ----------

// Fecha (AAAA-MM-DD) de hace `dias` dias en la hora del SAD, no en UTC: a
// las 7 pm de Monterrey en UTC ya es el dia siguiente
function hoyMenos(dias) {
  const signo = ZONA[0] === '-' ? -1 : 1;
  const desfaseMs = signo * (Number(ZONA.slice(1, 3)) * 60 + Number(ZONA.slice(4, 6))) * 60000;
  return new Date(Date.now() + desfaseMs - dias * 86400000).toISOString().slice(0, 10);
}

async function guardarEmbarques(filas) {
  let nuevas = 0;
  const ahora = new Date();
  for (const f of filas) {
    if (!FOLIO_GUIA.test(f.factura)) continue;
    const { rows } = await pool.query(
      `INSERT INTO facturas_sad (numero_guia, plaza_origen, embarque, embarque_id, venta_id, cliente,
                                 fecha_embarque, estatus_sad, cancelada, visto_en, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
       ON CONFLICT (numero_guia) DO UPDATE SET
         embarque = EXCLUDED.embarque, embarque_id = EXCLUDED.embarque_id,
         venta_id = COALESCE(EXCLUDED.venta_id, facturas_sad.venta_id),
         cliente = EXCLUDED.cliente, fecha_embarque = EXCLUDED.fecha_embarque,
         estatus_sad = EXCLUDED.estatus_sad,
         cancelada = facturas_sad.cancelada OR EXCLUDED.cancelada,
         cancelada_en = CASE WHEN EXCLUDED.cancelada AND NOT facturas_sad.cancelada
                             THEN EXCLUDED.actualizado_en ELSE facturas_sad.cancelada_en END,
         actualizado_en = CASE WHEN facturas_sad.estatus_sad IS DISTINCT FROM EXCLUDED.estatus_sad
                               THEN EXCLUDED.actualizado_en ELSE facturas_sad.actualizado_en END
       RETURNING (xmax = 0) AS nueva`,
      [
        f.factura,
        PLAZA_DE_SERIE[f.factura.slice(0, 2)],
        f.embarque,
        f.embarqueId,
        f.ventaId,
        f.cliente || null,
        /^\d{4}-\d{2}-\d{2}$/.test(f.fecha) ? f.fecha : null,
        f.estatus || null,
        /^cancelad/i.test(f.estatus),
        ahora,
      ]
    );
    if (rows[0]?.nueva) nuevas++;
  }
  return nuevas;
}

async function leerEmbarquesRecientes() {
  const limite = hoyMenos(DIAS);
  const filas = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const html = await pagina(`/route/embarque/search/?regs_offset=${p}&regs_display=50`);
    const pag = leerEmbarques(html);
    if (!pag.length) break;
    filas.push(...pag);
    const fechas = pag.map((f) => f.fecha).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort();
    if (fechas.length && fechas[0] < limite) break;
  }
  return filas;
}

async function marcarCanceladas() {
  const html = await pagina('/sale/search/?status=3&regs_display=50&submit_=buscar');
  const folios = leerCanceladas(html).filter((f) => FOLIO_GUIA.test(f));
  if (!folios.length) return 0;
  const ahora = new Date();
  const { rowCount } = await pool.query(
    `INSERT INTO facturas_sad (numero_guia, plaza_origen, cancelada, cancelada_en, visto_en, actualizado_en)
     SELECT f, CASE WHEN f LIKE 'AN%' THEN 'MTY' ELSE 'CDMX' END, TRUE, $2, $2, $2 FROM unnest($1::text[]) AS f
     ON CONFLICT (numero_guia) DO UPDATE SET cancelada = TRUE, cancelada_en = $2, actualizado_en = $2
       WHERE facturas_sad.cancelada = FALSE`,
    [folios, ahora]
  );
  return rowCount;
}

async function completarDetalles() {
  const { rows } = await pool.query(
    `SELECT numero_guia, venta_id FROM facturas_sad
      WHERE detalle_en IS NULL AND venta_id IS NOT NULL AND detalle_fallos < 3
      ORDER BY visto_en DESC LIMIT $1`,
    [DETALLES_POR_CICLO]
  );
  let leidos = 0;
  for (const r of rows) {
    let v;
    try {
      v = leerVenta(await pagina(`/sale/view/?id=${r.venta_id}`));
    } catch (e) {
      // Una factura que no carga no debe frenar el ciclo: se anota el fallo
      // y se sigue con la siguiente (se reintenta hasta 3 veces en total)
      console.warn(`[sad] No se pudo leer el detalle de ${r.numero_guia}:`, e.message);
      await pool.query('UPDATE facturas_sad SET detalle_fallos = detalle_fallos + 1 WHERE numero_guia = $1', [r.numero_guia]);
      continue;
    }
    // Si el folio de la pantalla no coincide, el id no corresponde: no se
    // guarda nada para no mezclar datos de otra factura
    if (v.folio && v.folio !== r.numero_guia) {
      console.warn(`[sad] La venta ${r.venta_id} es ${v.folio}, se esperaba ${r.numero_guia}`);
      await pool.query('UPDATE facturas_sad SET detalle_en = $2 WHERE numero_guia = $1', [r.numero_guia, new Date()]);
      continue;
    }
    await pool.query(
      `UPDATE facturas_sad SET remitente_sucursal = $2, destinatario = $3, destinatario_sucursal = $4,
              tipo_entrega = $5, telefono = $6, direccion = $7, registrada_en = $8,
              cancelada = cancelada OR $9,
              cancelada_en = CASE WHEN $9 AND NOT cancelada THEN $10 ELSE cancelada_en END,
              detalle_en = $10
        WHERE numero_guia = $1`,
      [r.numero_guia, v.remitenteSucursal, v.destinatario, v.destinatarioSucursal, v.tipoEntrega,
        v.telefono, v.direccion, v.registradaEn, v.estatus === 'cancelada', new Date()]
    );
    leidos++;
  }
  return leidos;
}

// Estatus de embarque del SAD que significan que el paquete ya salio de su
// plaza de origen
const ESTATUS_YA_SALIO = ['Transito', 'Cedis Destino'];

// Guias que el SAD ya tiene en camino y que nadie escaneo al salir: se dan de
// alta EN TRANSITO hacia la otra plaza, con una salida registrada por "SAD".
// Solo crea guias que no existen: una guia ya escaneada nunca se toca (el
// escaneo manda). Tampoco revive numeros que un administrador elimino o
// cancelo (quedan en la bitacora). Una sola sentencia: guia y evento entran
// juntos, y si en ese instante alguien escanea la guia, gana el escaneo.
async function marcarEnTransito() {
  const ahora = new Date();
  const { rows } = await pool.query(
    `WITH candidatas AS (
       SELECT f.numero_guia, f.plaza_origen AS origen,
              CASE WHEN f.plaza_origen = 'MTY' THEN 'CDMX' ELSE 'MTY' END AS destino
         FROM facturas_sad f
        WHERE NOT f.cancelada
          AND f.estatus_sad = ANY($2::text[])
          -- Solo lo que se acaba de leer: un estatus viejo que ya no se
          -- refresca no debe volver a crear guias (p. ej. tras "borrar todas")
          AND f.fecha_embarque >= $3::date
          AND NOT EXISTS (SELECT 1 FROM guias g WHERE g.numero_guia = f.numero_guia OR g.complemento = f.numero_guia)
          AND NOT EXISTS (SELECT 1 FROM bitacora b WHERE b.numero_guia = f.numero_guia)
     ), nuevas AS (
       INSERT INTO guias (numero_guia, origen, destino, estatus, creado_en, actualizado_en, estatus_desde)
       SELECT numero_guia, origen, destino, 'EN_TRANSITO_A_' || destino, $1, $1, $1 FROM candidatas
       ON CONFLICT (numero_guia) DO NOTHING
       RETURNING numero_guia, origen, destino, estatus
     )
     INSERT INTO eventos (numero_guia, accion, estatus, plaza, descripcion, creado_en, usuario)
     SELECT numero_guia, 'SALIDA', estatus, origen,
            'Salio de bodega ' || origen || ' con destino a ' || destino || ' (registrado en el SAD)', $1, 'SAD'
       FROM nuevas
     RETURNING numero_guia`,
    [ahora, ESTATUS_YA_SALIO, hoyMenos(DIAS)]
  );
  return rows.length;
}

let bloqueadoHasta = 0;

async function sincronizar({ forzar = false } = {}) {
  if (!habilitado) throw new Error('La conexion con el SAD no esta configurada (faltan SAD_USUARIO y SAD_PASSWORD)');
  if (estado.enCurso) return { enCurso: true };
  // Despues de un usuario o contrasena rechazados se espera una hora antes de
  // volver a intentar, para no bloquear la cuenta en el SAD
  if (bloqueadoHasta > Date.now() && !forzar) {
    throw new Error(`${estado.ultimoError || 'El SAD rechazo el acceso'} (se reintenta a las ${new Date(bloqueadoHasta).toISOString().slice(11, 16)} UTC)`);
  }
  estado.enCurso = true;
  estado.ultimoIntento = new Date().toISOString();
  const inicio = Date.now();
  try {
    const filas = await leerEmbarquesRecientes();
    const nuevas = await guardarEmbarques(filas);
    const canceladas = await marcarCanceladas();
    // Despues de las canceladas: una factura cancelada nunca sale en transito
    const enTransito = await marcarEnTransito();
    const detalles = await completarDetalles();
    const resumen = { embarques: filas.length, nuevas, canceladas, enTransito, detalles, ms: Date.now() - inicio };
    estado.ultimoExito = new Date().toISOString();
    estado.ultimoError = null;
    estado.ultimoResumen = resumen;
    console.log(
      `[sad] ${filas.length} embarques leidos, ${nuevas} nuevos, ${canceladas} cancelados, ` +
        `${enTransito} puestos en transito, ${detalles} detalles, ${resumen.ms} ms`
    );
    return resumen;
  } catch (e) {
    estado.ultimoError = e.message;
    console.error('[sad] Fallo la sincronizacion:', e.message);
    throw e;
  } finally {
    estado.enCurso = false;
  }
}

function arrancar() {
  if (!habilitado) {
    console.log('[sad] Sin SAD_USUARIO / SAD_PASSWORD: la conexion con el SAD esta apagada');
    return;
  }
  const ciclo = () => sincronizar().catch(() => {});
  setTimeout(ciclo, 5 * 1000).unref();
  setInterval(ciclo, INTERVALO_MIN * 60 * 1000).unref();
  console.log(`[sad] Conexion con el SAD activa: se lee cada ${INTERVALO_MIN} min`);
}

// ---------- Consultas para el resto del sistema ----------

async function facturaDe(numeroGuia, db = pool) {
  const { rows } = await db.query('SELECT * FROM facturas_sad WHERE numero_guia = $1', [numeroGuia]);
  return rows[0] || null;
}

// Aviso al registrar una guia nueva con el escaneo. Nunca bloquea el
// escaneo: el paquete fisico manda, el aviso es para que alguien lo revise.
async function avisoAlRegistrar(numeroGuia) {
  if (!habilitado || !estado.ultimoExito) return null;
  const f = await facturaDe(numeroGuia);
  if (f && f.cancelada) {
    return `La factura ${numeroGuia} esta CANCELADA en el SAD. Revisa que la etiqueta sea la correcta.`;
  }
  if (f) return null;
  // Los folios de cada serie son consecutivos. Solo se avisa si el numero cae
  // dentro de los embarques que ya se leyeron del SAD (no cuentan las
  // canceladas viejas, que llegan sin embarque desde otro listado): uno mas nuevo puede ser una factura
  // de hace un minuto que todavia no se sincroniza, y uno mas viejo queda
  // fuera de los dias que se revisan.
  const m = /^(AN|BN)(\d+)$/.exec(numeroGuia);
  if (!m) return null;
  const { rows } = await pool.query(
    `SELECT MIN(substr(numero_guia, 3)::bigint) AS min, MAX(substr(numero_guia, 3)::bigint) AS max
       FROM facturas_sad
      WHERE numero_guia LIKE $1 AND numero_guia ~ '^(AN|BN)[0-9]+$' AND embarque IS NOT NULL`,
    [m[1] + '%']
  );
  const n = Number(m[2]);
  const { min, max } = rows[0] || {};
  if (min != null && max != null && n >= Number(min) && n <= Number(max)) {
    return `La guia ${numeroGuia} no aparece en el SAD. Revisa que este facturada.`;
  }
  return null;
}

// Guias facturadas que todavia no se escanean: no existen en guias ni como
// numero principal ni como complemento, y su factura no esta cancelada
async function listarPorSalir({ plaza, limit = 500 } = {}) {
  const params = [];
  let filtro = '';
  if (plaza) {
    if (!['MTY', 'CDMX'].includes(plaza)) throw new Error('Plaza invalida, usa MTY o CDMX');
    params.push(plaza);
    filtro = `AND f.plaza_origen = $${params.length}`;
  }
  params.push(Math.min(Number(limit) || 500, 2000));
  // Conteo por plaza aparte de la lista: la lista lleva tope, el conteo no
  const { rows: conteo } = await pool.query(
    `SELECT f.plaza_origen, COUNT(*)::int AS n
       FROM facturas_sad f
      WHERE NOT f.cancelada
        AND NOT EXISTS (SELECT 1 FROM guias g WHERE g.numero_guia = f.numero_guia OR g.complemento = f.numero_guia)
      GROUP BY f.plaza_origen`
  );
  const porPlaza = { MTY: 0, CDMX: 0 };
  for (const c of conteo) porPlaza[c.plaza_origen] = c.n;
  const { rows } = await pool.query(
    `SELECT f.numero_guia, f.plaza_origen, f.embarque, f.cliente, f.destinatario, f.destinatario_sucursal,
            f.tipo_entrega, f.telefono, f.estatus_sad, f.fecha_embarque::text AS fecha_embarque,
            COALESCE(f.registrada_en, f.visto_en) AS facturada_en
       FROM facturas_sad f
      WHERE NOT f.cancelada
        AND NOT EXISTS (SELECT 1 FROM guias g WHERE g.numero_guia = f.numero_guia OR g.complemento = f.numero_guia)
        ${filtro}
      ORDER BY COALESCE(f.registrada_en, f.visto_en) ASC
      LIMIT $${params.length}`,
    params
  );
  return {
    sincronizacion: estadoSincronizacion(),
    conteo: { total: porPlaza.MTY + porPlaza.CDMX, ...porPlaza },
    guias: rows,
  };
}

// Guias que existen en el sistema y cuya factura se cancelo en el SAD, sin
// revisar todavia. No se borran ni se mueven solas: un administrador decide
// (cancelar la guia con su numero nuevo, eliminarla o dejarla como esta).
// Cuenta tanto el numero principal como el complemento.
async function listarCanceladasConGuia({ limit = 200 } = {}) {
  const { rows } = await pool.query(
    `SELECT g.numero_guia, f.numero_guia AS factura, g.estatus, g.actualizado_en, f.cliente,
            COALESCE(f.cancelada_en, f.actualizado_en) AS cancelada_en
       FROM facturas_sad f
       JOIN guias g ON g.numero_guia = f.numero_guia OR g.complemento = f.numero_guia
      WHERE f.cancelada AND f.cancelacion_revisada_en IS NULL
      ORDER BY COALESCE(f.cancelada_en, f.actualizado_en) DESC
      LIMIT $1`,
    [Math.min(Number(limit) || 200, 1000)]
  );
  return { total: rows.length, guias: rows };
}

async function marcarCancelacionRevisada(factura, usuario) {
  const { rows } = await pool.query(
    `UPDATE facturas_sad SET cancelacion_revisada_en = $2, cancelacion_revisada_por = $3
      WHERE numero_guia = $1 AND cancelada
      RETURNING numero_guia, cancelacion_revisada_en, cancelacion_revisada_por`,
    [factura, new Date(), usuario]
  );
  if (!rows[0]) throw new Error('Esa factura no esta cancelada en el SAD');
  return rows[0];
}

module.exports = {
  habilitado,
  listarCanceladasConGuia,
  marcarCancelacionRevisada,
  initSad,
  arrancar,
  sincronizar,
  estadoSincronizacion,
  facturaDe,
  avisoAlRegistrar,
  listarPorSalir,
  // Para pruebas
  leerEmbarques,
  leerCanceladas,
  leerVenta,
};
