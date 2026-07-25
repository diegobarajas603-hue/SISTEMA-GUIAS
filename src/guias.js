const { pool } = require('./db');
const {
  PLAZAS,
  ACCIONES,
  otraPlaza,
  enTransitoA,
  enBodega,
  enRutaEntrega,
  entregado,
} = require('./estatus');

const MODOS = ['bodega', 'domicilio', 'ocurre'];

function now() {
  return new Date();
}

// Acciones que no representan un escaneo con estatus propio: se ignoran al
// reconstruir la pila de escaneos vigentes para revertir.
const ACCIONES_ADMINISTRATIVAS = [
  ACCIONES.ESCANEO_REPETIDO,
  ACCIONES.CORRECCION,
  ACCIONES.CAMBIO_NUMERO,
  ACCIONES.COMPLEMENTO,
];

async function registrarEvento(numeroGuia, accion, estatus, plaza, descripcion, db = pool) {
  await db.query(
    'INSERT INTO eventos (numero_guia, accion, estatus, plaza, descripcion, creado_en) VALUES ($1, $2, $3, $4, $5, $6)',
    [numeroGuia, accion, estatus, plaza, descripcion, now()]
  );
}

async function obtenerGuia(numeroGuia, db = pool) {
  const { rows } = await db.query('SELECT * FROM guias WHERE numero_guia = $1', [numeroGuia]);
  return rows[0];
}

// Busca una guia por su numero principal o por su numero de complemento, de
// modo que cualquiera de los dos numeros sirva para rastrear y escanear.
async function buscarGuia(numero, db = pool) {
  const { rows } = await db.query('SELECT * FROM guias WHERE numero_guia = $1 OR complemento = $1', [numero]);
  return rows[0];
}

const FORMATO_NUMERO = /^[A-Z0-9-]{3,40}$/;

function normalizarNumero(numero, etiqueta) {
  const n = String(numero || '').trim().toUpperCase();
  if (!FORMATO_NUMERO.test(n)) {
    throw new Error(`${etiqueta} invalido: usa de 3 a 40 letras, numeros o guiones`);
  }
  return n;
}

// Rechaza un numero que ya este ocupado como numero principal o complemento
async function verificarNumeroDisponible(numero, db) {
  const { rows } = await db.query('SELECT numero_guia FROM guias WHERE numero_guia = $1 OR complemento = $1', [
    numero,
  ]);
  if (rows.length) throw new Error(`El numero ${numero} ya esta en uso por la guia ${rows[0].numero_guia}`);
}

async function obtenerHistorial(numeroGuia) {
  const { rows } = await pool.query(
    'SELECT accion, estatus, plaza, descripcion, revertido, creado_en FROM eventos WHERE numero_guia = $1 ORDER BY id DESC',
    [numeroGuia]
  );
  return rows;
}

async function actualizarEstatus(numeroGuia, estatus) {
  await pool.query('UPDATE guias SET estatus = $1, actualizado_en = $2 WHERE numero_guia = $3', [
    estatus,
    now(),
    numeroGuia,
  ]);
}

// Prefijo del numero de guia segun la plaza de la que sale:
// AN = salidas de MTY, BN = salidas de CDMX.
const PREFIJO_PLAZA = { MTY: 'AN', CDMX: 'BN' };

// Valida que una guia pueda REGISTRAR SU SALIDA desde la plaza indicada.
// (Las llegadas y entregas no pasan por aqui: una AN si se escanea en CDMX
// para darle llegada o entregarla, porque ahi termina su recorrido.)
function validarPrefijoSalida(numeroGuia, plaza) {
  const propio = PREFIJO_PLAZA[plaza];
  const otro = PREFIJO_PLAZA[otraPlaza(plaza)];
  if (numeroGuia.startsWith(propio)) return;
  if (numeroGuia.startsWith(otro)) {
    throw new Error(
      `La guia ${numeroGuia} es una salida de ${otraPlaza(plaza)} (prefijo ${otro}); no se puede registrar como salida de ${plaza}`
    );
  }
  throw new Error(`Numero de guia invalido: las salidas de ${plaza} empiezan con ${propio}`);
}

async function marcarSalida(numeroGuia, plaza, destino) {
  validarPrefijoSalida(numeroGuia, plaza);
  const estatus = enTransitoA(destino);
  await pool.query(
    'UPDATE guias SET origen = $1, destino = $2, estatus = $3, actualizado_en = $4 WHERE numero_guia = $5',
    [plaza, destino, estatus, now(), numeroGuia]
  );
  const descripcion = `Salio de bodega ${plaza} con destino a ${destino}`;
  await registrarEvento(numeroGuia, ACCIONES.SALIDA, estatus, plaza, descripcion);
  return { guia: await obtenerGuia(numeroGuia), tipo: 'salida', mensaje: descripcion };
}

// Escaneo inteligente: segun la plaza donde se escanea, el modo de operacion y
// el estado actual de la guia, decide automaticamente que significa el escaneo.
//
// Modo "bodega" (transito MTY <-> CDMX), estando en la plaza P (la otra es Q):
//  - La guia no existe          -> se registra y sale de P hacia Q (EN_TRANSITO_A_Q)
//  - EN_TRANSITO_A_P            -> llego: queda en bodega de P (EN_BODEGA_P)
//  - EN_BODEGA_P                -> vuelve a salir de P hacia Q (EN_TRANSITO_A_Q)
//  - EN_RUTA_ENTREGA_P          -> regreso de un intento de entrega (EN_BODEGA_P)
//  - ENTREGADO_*                -> nuevo embarque: sale de P hacia Q (EN_TRANSITO_A_Q)
//  - EN_TRANSITO_A_Q            -> escaneo repetido: ya se registro su salida, no cambia
//  - EN_BODEGA_Q                -> llego a P sin escaneo de salida en Q: queda EN_BODEGA_P
//
// Modo "domicilio" (entrega a domicilio), estando en la plaza P:
//  - EN_BODEGA_P                -> paquete en ruta de entrega (EN_RUTA_ENTREGA_P)
//  - EN_RUTA_ENTREGA_P          -> entregado a domicilio (ENTREGADO_P)
//  - EN_TRANSITO_A_P            -> error: primero debe registrarse la llegada
//                                  escaneando en modo bodega
//
// Modo "ocurre" (el cliente recoge en bodega), estando en la plaza P:
//  - EN_BODEGA_P                -> entregado en ocurre (ENTREGADO_P)
//  - EN_TRANSITO_A_P            -> error: primero debe registrarse la llegada
//                                  escaneando en modo bodega
//  - EN_RUTA_ENTREGA_P          -> error: el paquete anda en reparto; primero
//                                  debe registrarse su regreso a bodega
async function escanearGuia(numeroGuia, plaza, modo = 'bodega') {
  if (!PLAZAS.includes(plaza)) throw new Error('Plaza invalida, usa MTY o CDMX');
  if (!MODOS.includes(modo)) throw new Error('Modo invalido, usa bodega, domicilio u ocurre');
  if (modo !== 'bodega') return escanearEntrega(numeroGuia, plaza, modo);

  const destino = otraPlaza(plaza);
  // Si se escanea el numero de complemento, se opera sobre la guia principal
  const guia = await buscarGuia(numeroGuia);
  if (guia) numeroGuia = guia.numero_guia;

  if (!guia) {
    // Registrar una guia nueva es registrar su salida: el prefijo debe
    // corresponder a la plaza (AN sale de MTY, BN sale de CDMX)
    validarPrefijoSalida(numeroGuia, plaza);
    const estatus = enTransitoA(destino);
    await pool.query(
      `INSERT INTO guias (numero_guia, origen, destino, estatus, creado_en, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [numeroGuia, plaza, destino, estatus, now()]
    );
    const descripcion = `Salio de bodega ${plaza} con destino a ${destino}`;
    await registrarEvento(numeroGuia, ACCIONES.SALIDA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'salida', mensaje: descripcion };
  }

  if (guia.estatus === enTransitoA(plaza)) {
    const estatus = enBodega(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Llego a bodega ${plaza}`;
    await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'llegada', mensaje: descripcion };
  }

  if (guia.estatus === enBodega(plaza) || guia.estatus === entregado(plaza) || guia.estatus === entregado(destino)) {
    return marcarSalida(numeroGuia, plaza, destino);
  }

  if (guia.estatus === enRutaEntrega(plaza)) {
    const estatus = enBodega(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Regreso a bodega ${plaza} (entrega no completada)`;
    await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'llegada', mensaje: descripcion };
  }

  if (guia.estatus === enTransitoA(destino)) {
    const descripcion = `Escaneo repetido en bodega ${plaza}: el envio ya salio con destino a ${destino}`;
    await registrarEvento(numeroGuia, ACCIONES.ESCANEO_REPETIDO, guia.estatus, plaza, descripcion);
    return { guia, tipo: 'repetido', mensaje: descripcion };
  }

  // EN_BODEGA_Q o EN_RUTA_ENTREGA_Q: aparecio en P sin los escaneos previos en Q
  const estatus = enBodega(plaza);
  await pool.query(
    'UPDATE guias SET origen = $1, destino = $2, estatus = $3, actualizado_en = $4 WHERE numero_guia = $5',
    [destino, plaza, estatus, now(), numeroGuia]
  );
  const descripcion = `Llego a bodega ${plaza} (sin registro de salida de bodega ${destino})`;
  await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, descripcion);
  return { guia: await obtenerGuia(numeroGuia), tipo: 'llegada', mensaje: descripcion };
}

// Escaneos de entrega (a domicilio o en ocurre) en la plaza donde esta el paquete
async function escanearEntrega(numeroGuia, plaza, modo) {
  // Si se escanea el numero de complemento, se opera sobre la guia principal
  const guia = await buscarGuia(numeroGuia);
  if (!guia) throw new Error('Guia no registrada; escaneala primero en modo bodega');
  numeroGuia = guia.numero_guia;

  // La entrega exige que la llegada ya este registrada: si viene en transito,
  // primero hay que escanearla en modo bodega para darle llegada.
  if (guia.estatus === enTransitoA(plaza)) {
    throw new Error(
      `La guia viene en transito a ${plaza} y aun no se registra su llegada. Escaneala primero en modo bodega para darle llegada a ${plaza}.`
    );
  }

  if (guia.estatus === entregado(plaza) || guia.estatus === entregado(otraPlaza(plaza))) {
    const descripcion = 'Escaneo repetido: el envio ya fue entregado';
    await registrarEvento(numeroGuia, ACCIONES.ESCANEO_REPETIDO, guia.estatus, plaza, descripcion);
    return { guia, tipo: 'repetido', mensaje: descripcion };
  }

  if (modo === 'domicilio' && guia.estatus === enBodega(plaza)) {
    const estatus = enRutaEntrega(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Paquete en ruta de entrega en ${plaza}`;
    await registrarEvento(numeroGuia, ACCIONES.RUTA_ENTREGA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'ruta', mensaje: descripcion };
  }

  if (modo === 'domicilio' && guia.estatus === enRutaEntrega(plaza)) {
    const estatus = entregado(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Entregado a domicilio en ${plaza}`;
    await registrarEvento(numeroGuia, ACCIONES.ENTREGA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'entregado', mensaje: descripcion };
  }

  // Ocurre solo aplica a paquetes que estan fisicamente en la bodega: si el
  // paquete anda en ruta de entrega a domicilio, primero debe registrarse su
  // regreso a bodega (escaneo en modo bodega) y despues entregarse en ocurre.
  if (modo === 'ocurre' && guia.estatus === enRutaEntrega(plaza)) {
    throw new Error(
      `La guia esta en ruta de entrega a domicilio en ${plaza}. Si el paquete regreso a bodega, escaneala primero en modo bodega para registrar el regreso y despues entregala en ocurre.`
    );
  }

  if (modo === 'ocurre' && guia.estatus === enBodega(plaza)) {
    const estatus = entregado(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Entregado en ocurre (bodega ${plaza})`;
    await registrarEvento(numeroGuia, ACCIONES.ENTREGA, estatus, plaza, descripcion);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'entregado', mensaje: descripcion };
  }

  throw new Error(`La guia no esta disponible para entrega en ${plaza} (estatus actual: ${guia.estatus})`);
}

// Revierte el ultimo escaneo que cambio el estatus de la guia, regresandola
// al estatus que tenia antes (accion de administrador). El escaneo revertido
// no se borra del historial: se agrega un evento CORRECCION que documenta
// quien lo revirtio y que quedo deshecho.
//
// Ademas acepta una resolucion opcional que documenta que paso con la guia
// (caso tipico: el cliente no pago y la entrega no se completo):
//  - { tipo: 'cancelada', numero }   la guia se cancelo y se emitio una nueva:
//    la guia toma el numero nuevo conservando todo su historial, y el numero
//    anterior queda registrado (columna numero_anterior + evento CAMBIO_NUMERO).
//  - { tipo: 'complemento', numero } se emitio un complemento: la guia conserva
//    su numero y ademas el del complemento (columna complemento + evento
//    COMPLEMENTO); ambos numeros sirven para rastrear y escanear.
// Todo ocurre en una sola transaccion: si algo falla, no se revierte nada.
async function revertirUltimoEscaneo(numeroGuia, usuario, resolucion = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const guia = await obtenerGuia(numeroGuia, client);
    if (!guia) throw new Error('Guia no encontrada');

    const { rows: eventos } = await client.query(
      'SELECT id, accion, estatus, plaza, descripcion FROM eventos WHERE numero_guia = $1 AND NOT revertido ORDER BY id ASC',
      [numeroGuia]
    );

    // Pila de escaneos vigentes: los ya revertidos (marcados al corregir o por
    // las migraciones) quedan fuera, de modo que revertir varias veces sigue
    // caminando hacia atras en el historial (no rebota).
    const pila = eventos.filter((ev) => !ACCIONES_ADMINISTRATIVAS.includes(ev.accion));
    if (!resolucion && pila.length < 2) {
      throw new Error('No hay un estatus anterior: ese fue el escaneo con el que se registro la guia');
    }

    let estatusFinal = guia.estatus;
    let plazaEvento = guia.destino;
    let mensaje = '';

    // Con resolucion, si no hay escaneo que revertir (solo queda el registro
    // inicial) se aplica de todos modos la cancelacion o el complemento.
    if (pila.length >= 2) {
      const ultimo = pila[pila.length - 1];

      // Marca el escaneo deshecho para que deje de mostrarse al cliente
      await client.query('UPDATE eventos SET revertido = TRUE WHERE id = $1', [ultimo.id]);

      // El estatus indica en/hacia que plaza esta la guia; de ahi se reconstruye
      // la ruta (en este flujo MTY <-> CDMX el destino siempre es esa plaza)
      const estatus = pila[pila.length - 2].estatus;
      const plazaDelEstatus = estatus.endsWith('_MTY') ? 'MTY' : 'CDMX';
      await client.query(
        'UPDATE guias SET origen = $1, destino = $2, estatus = $3, actualizado_en = $4 WHERE numero_guia = $5',
        [otraPlaza(plazaDelEstatus), plazaDelEstatus, estatus, now(), numeroGuia]
      );

      mensaje = `Correccion de ${usuario}: se revirtio "${ultimo.descripcion || ultimo.accion}" y la guia regreso a su estatus anterior`;
      await registrarEvento(numeroGuia, ACCIONES.CORRECCION, estatus, ultimo.plaza, mensaje, client);
      estatusFinal = estatus;
      plazaEvento = ultimo.plaza;
    }

    let numeroFinal = numeroGuia;

    if (resolucion && resolucion.tipo === 'cancelada') {
      const nuevo = normalizarNumero(resolucion.numero, 'El nuevo numero de guia');
      if (nuevo === numeroGuia) throw new Error('El nuevo numero debe ser diferente al numero actual');
      // El numero nuevo pasa a ser el numero operativo de la guia y debe
      // conservar el prefijo de la guia cancelada: una AN se reemplaza con
      // otra AN y una BN con otra BN (el prefijo indica la plaza de salida).
      const prefijo = /^(AN|BN)/.exec(numeroGuia)?.[1];
      if (prefijo) {
        if (!nuevo.startsWith(prefijo)) {
          throw new Error(`La guia ${numeroGuia} es ${prefijo}: el nuevo numero tambien debe empezar con ${prefijo}`);
        }
      } else if (!nuevo.startsWith('AN') && !nuevo.startsWith('BN')) {
        // Guias antiguas sin prefijo: al menos exigir un prefijo valido
        throw new Error('El nuevo numero debe empezar con AN (guia de MTY) o BN (guia de CDMX)');
      }
      await verificarNumeroDisponible(nuevo, client);

      // Renumera conservando todo el historial: copia la fila con el numero
      // nuevo, traslada los eventos y elimina la fila anterior (la llave
      // foranea de eventos impide cambiar el numero con un UPDATE directo).
      await client.query(
        `INSERT INTO guias (numero_guia, origen, destino, estatus, creado_en, actualizado_en, numero_anterior, complemento)
         SELECT $1, origen, destino, estatus, creado_en, $3, numero_guia, complemento FROM guias WHERE numero_guia = $2`,
        [nuevo, numeroGuia, now()]
      );
      await client.query('UPDATE eventos SET numero_guia = $1 WHERE numero_guia = $2', [nuevo, numeroGuia]);
      await client.query('DELETE FROM guias WHERE numero_guia = $1', [numeroGuia]);

      mensaje = `${usuario} cancelo la guia ${numeroGuia} y la reemplazo por la nueva guia ${nuevo}; el historial se conserva`;
      await registrarEvento(nuevo, ACCIONES.CAMBIO_NUMERO, estatusFinal, plazaEvento, mensaje, client);
      numeroFinal = nuevo;
    }

    if (resolucion && resolucion.tipo === 'complemento') {
      const comp = normalizarNumero(resolucion.numero, 'El numero del complemento');
      if (comp === numeroGuia) throw new Error('El complemento debe ser diferente al numero de la guia');
      await verificarNumeroDisponible(comp, client);

      await client.query('UPDATE guias SET complemento = $1, actualizado_en = $2 WHERE numero_guia = $3', [
        comp,
        now(),
        numeroGuia,
      ]);
      mensaje = guia.complemento
        ? `${usuario} cambio el complemento ${guia.complemento} por ${comp}; la guia conserva sus dos numeros (${numeroGuia} y ${comp})`
        : `${usuario} registro el complemento ${comp}; la guia conserva sus dos numeros (${numeroGuia} y ${comp})`;
      await registrarEvento(numeroGuia, ACCIONES.COMPLEMENTO, estatusFinal, plazaEvento, mensaje, client);
    }

    await client.query('COMMIT');
    return { guia: await obtenerGuia(numeroFinal), tipo: 'correccion', mensaje };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Migracion idempotente al arrancar: marca como revertidos los escaneos que
// fueron deshechos por correcciones hechas antes de existir la columna
// "revertido", para que tampoco se muestren al cliente.
async function marcarRevertidosHistoricos() {
  const { rows } = await pool.query('SELECT DISTINCT numero_guia FROM eventos WHERE accion = $1', [
    ACCIONES.CORRECCION,
  ]);
  for (const { numero_guia } of rows) {
    const { rows: eventos } = await pool.query(
      'SELECT id, accion, revertido FROM eventos WHERE numero_guia = $1 ORDER BY id ASC',
      [numero_guia]
    );
    const pila = [];
    const deshechos = [];
    for (const ev of eventos) {
      if (ev.accion === ACCIONES.ESCANEO_REPETIDO || ev.accion === ACCIONES.CAMBIO_NUMERO || ev.accion === ACCIONES.COMPLEMENTO) continue;
      if (ev.accion === ACCIONES.CORRECCION) {
        const p = pila.pop();
        if (p && !p.revertido) deshechos.push(p.id);
      } else {
        pila.push(ev);
      }
    }
    if (deshechos.length) {
      await pool.query('UPDATE eventos SET revertido = TRUE WHERE id = ANY($1)', [deshechos]);
    }
  }
}

// Migracion idempotente al arrancar: oculta duplicados historicos causados
// por escaneos dobles casi simultaneos (el mismo evento registrado dos veces
// por una condicion de carrera que ahora previene el candado por guia).
async function marcarDuplicadosHistoricos() {
  const { rows } = await pool.query(
    `SELECT id, numero_guia, accion, estatus, plaza, creado_en, revertido FROM eventos
      WHERE accion NOT IN ($1, $2, $3, $4) ORDER BY numero_guia, id ASC`,
    ACCIONES_ADMINISTRATIVAS
  );
  const duplicados = [];
  let prev = null;
  for (const ev of rows) {
    const esDuplicado =
      prev &&
      !prev.revertido &&
      prev.numero_guia === ev.numero_guia &&
      prev.accion === ev.accion &&
      prev.estatus === ev.estatus &&
      prev.plaza === ev.plaza &&
      new Date(ev.creado_en) - new Date(prev.creado_en) < 2 * 60 * 1000;
    if (esDuplicado) {
      if (!ev.revertido) duplicados.push(ev.id);
      continue; // conserva prev para marcar tambien triples
    }
    prev = ev;
  }
  if (duplicados.length) {
    await pool.query('UPDATE eventos SET revertido = TRUE WHERE id = ANY($1)', [duplicados]);
    console.log(`[guias] ${duplicados.length} escaneo(s) duplicado(s) historicos ocultados del rastreo`);
  }
}

// Serializa las operaciones sobre una misma guia: si la pistola dispara dos
// veces casi al mismo tiempo, el segundo escaneo espera a que termine el
// primero y entonces se detecta como repetido en lugar de registrarse doble.
const candados = new Map(); // numero_guia -> promesa de la operacion en curso
async function conCandado(numeroGuia, fn) {
  const previa = candados.get(numeroGuia) || Promise.resolve();
  const actual = previa.catch(() => {}).then(fn);
  candados.set(numeroGuia, actual);
  try {
    return await actual;
  } finally {
    if (candados.get(numeroGuia) === actual) candados.delete(numeroGuia);
  }
}

async function listarGuias({ buscar, estatus, plaza, limit = 200 } = {}) {
  const condiciones = [];
  const params = [];
  if (buscar) {
    params.push(`%${buscar}%`);
    // Busca tambien por el numero de complemento y por el numero anterior
    // de guias canceladas y renumeradas
    condiciones.push(
      `(numero_guia ILIKE $${params.length} OR complemento ILIKE $${params.length} OR numero_anterior ILIKE $${params.length})`
    );
  }
  if (estatus) {
    params.push(estatus);
    condiciones.push(`estatus = $${params.length}`);
  }
  if (plaza && PLAZAS.includes(plaza)) {
    // Guias "de" una plaza: todas las que se enviaron desde ahi, en cualquier
    // punto de su recorrido (en transito a la otra plaza, en su bodega, en
    // reparto o ya entregadas alla)
    const destino = otraPlaza(plaza);
    params.push([enTransitoA(destino), enBodega(destino), enRutaEntrega(destino), entregado(destino)]);
    condiciones.push(`estatus = ANY($${params.length})`);
  }
  params.push(limit);
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM guias ${where} ORDER BY actualizado_en DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function listarEventos({ limit = 50 } = {}) {
  const { rows } = await pool.query(
    'SELECT numero_guia, accion, estatus, plaza, descripcion, revertido, creado_en FROM eventos ORDER BY id DESC LIMIT $1',
    [limit]
  );
  return rows;
}

// Borra TODAS las guias y sus eventos para dejar el sistema como nuevo.
// No toca usuarios ni sesiones. Devuelve cuantas guias se eliminaron.
async function borrarTodas() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM guias');
  await pool.query('DELETE FROM eventos');
  await pool.query('DELETE FROM guias');
  return rows[0].n;
}

// Actividad por dia para las graficas del dashboard: guias enviadas (eventos
// SALIDA por plaza de origen) y entregas, agrupadas por dia calendario en la
// zona horaria de Mexico. Devuelve todos los dias del rango, incluso sin
// movimientos, para que las graficas no tengan huecos.
async function estadisticas(dias = 14) {
  const n = Math.min(Math.max(Number(dias) || 14, 1), 90);
  const { rows } = await pool.query(
    `SELECT to_char(creado_en AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') AS dia,
            COUNT(*) FILTER (WHERE accion = 'SALIDA' AND plaza = 'MTY')::int AS enviadas_mty,
            COUNT(*) FILTER (WHERE accion = 'SALIDA' AND plaza = 'CDMX')::int AS enviadas_cdmx,
            COUNT(*) FILTER (WHERE accion = 'ENTREGA')::int AS entregadas
       FROM eventos
      WHERE NOT revertido AND accion IN ('SALIDA', 'ENTREGA')
        AND creado_en >= now() - make_interval(days => $1)
      GROUP BY dia`,
    [n]
  );
  const porDia = new Map(rows.map((r) => [r.dia, r]));

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const serie = [];
  const totales = { enviadas: 0, enviadasMty: 0, enviadasCdmx: 0, entregadas: 0 };
  for (let i = n - 1; i >= 0; i--) {
    const fecha = fmt.format(new Date(Date.now() - i * 86400000));
    const r = porDia.get(fecha) || { enviadas_mty: 0, enviadas_cdmx: 0, entregadas: 0 };
    serie.push({
      fecha,
      enviadasMty: r.enviadas_mty,
      enviadasCdmx: r.enviadas_cdmx,
      entregadas: r.entregadas,
    });
    totales.enviadasMty += r.enviadas_mty;
    totales.enviadasCdmx += r.enviadas_cdmx;
    totales.entregadas += r.entregadas;
  }
  totales.enviadas = totales.enviadasMty + totales.enviadasCdmx;
  return { dias: n, serie, totales };
}

async function resumen() {
  const { rows } = await pool.query('SELECT estatus, COUNT(*)::int AS total FROM guias GROUP BY estatus');
  const porEstatus = {};
  let totalGuias = 0;
  for (const r of rows) {
    porEstatus[r.estatus] = r.total;
    totalGuias += r.total;
  }
  const { rows: ev } = await pool.query(
    `SELECT COUNT(*)::int AS eventos, COUNT(*) FILTER (WHERE accion = 'ENTREGA')::int AS entregas
     FROM eventos WHERE creado_en >= now() - interval '24 hours'`
  );
  return { porEstatus, totalGuias, eventos24h: ev[0].eventos, entregas24h: ev[0].entregas };
}

module.exports = {
  escanearGuia: (numeroGuia, plaza, modo) => conCandado(numeroGuia, () => escanearGuia(numeroGuia, plaza, modo)),
  revertirUltimoEscaneo: (numeroGuia, usuario, resolucion) =>
    conCandado(numeroGuia, () => revertirUltimoEscaneo(numeroGuia, usuario, resolucion)),
  marcarRevertidosHistoricos,
  marcarDuplicadosHistoricos,
  borrarTodas,
  obtenerGuia,
  buscarGuia,
  obtenerHistorial,
  listarGuias,
  listarEventos,
  resumen,
  estadisticas,
};
