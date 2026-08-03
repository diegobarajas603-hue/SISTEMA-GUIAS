const { pool } = require('./db');
const {
  PLAZAS,
  ACCIONES,
  ESTATUS,
  plazaDeEstatus,
  eventoDeEstatus,
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

async function registrarEvento(numeroGuia, accion, estatus, plaza, descripcion, db = pool, usuario = null) {
  await db.query(
    'INSERT INTO eventos (numero_guia, accion, estatus, plaza, descripcion, creado_en, usuario) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [numeroGuia, accion, estatus, plaza, descripcion, now(), usuario]
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

// El motivo es obligatorio en las dos acciones que no se pueden deshacer
// (eliminar y cancelar). Se exige algo escrito de verdad: un motivo de dos
// letras no le sirve a nadie que revise la bitacora meses despues.
const MOTIVO_MINIMO = 5;
const MOTIVO_MAXIMO = 500;

function normalizarMotivo(motivo, accion) {
  const m = String(motivo == null ? '' : motivo).trim().replace(/\s+/g, ' ');
  if (!m) throw new Error(`Escribe el motivo de la ${accion}`);
  if (m.length < MOTIVO_MINIMO) {
    throw new Error(`El motivo de la ${accion} es muy corto: explica en pocas palabras que paso`);
  }
  return m.slice(0, MOTIVO_MAXIMO);
}

// Deja constancia de una eliminacion o una cancelacion. Se escribe dentro de
// la misma transaccion que la accion: o quedan las dos, o no queda ninguna.
async function registrarBitacora(db, datos) {
  await db.query(
    `INSERT INTO bitacora (tipo, numero_guia, numero_nuevo, motivo, usuario, estatus, complemento, eventos, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      datos.tipo,
      datos.numeroGuia,
      datos.numeroNuevo || null,
      datos.motivo,
      datos.usuario || null,
      datos.estatus || null,
      datos.complemento || null,
      datos.eventos == null ? null : datos.eventos,
      now(),
    ]
  );
}

// Historial de eliminaciones y cancelaciones, del mas reciente al mas antiguo.
// El nombre visible del responsable sale de usuarios con un LEFT JOIN: si la
// cuenta se borro, queda al menos el login que hizo la accion.
async function listarBitacora({ tipo, buscar, limit = 200 } = {}) {
  const cond = [];
  const params = [];
  if (tipo === 'ELIMINACION' || tipo === 'CANCELACION') {
    params.push(tipo);
    cond.push(`b.tipo = $${params.length}`);
  }
  if (buscar) {
    params.push('%' + String(buscar).trim().toUpperCase() + '%');
    cond.push(`(b.numero_guia LIKE $${params.length} OR b.numero_nuevo LIKE $${params.length})`);
  }
  params.push(Math.min(Number(limit) || 200, 500));
  const { rows } = await pool.query(
    `SELECT b.id, b.tipo, b.numero_guia, b.numero_nuevo, b.motivo, b.usuario,
            COALESCE(u.nombre, b.usuario) AS responsable,
            b.estatus, b.complemento, b.eventos, b.creado_en
       FROM bitacora b LEFT JOIN usuarios u ON u.usuario = b.usuario
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
      ORDER BY b.id DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

// Cuantas eliminaciones y cancelaciones hay, para rotular la pantalla
async function resumenBitacora() {
  const { rows } = await pool.query('SELECT tipo, COUNT(*)::int AS total FROM bitacora GROUP BY tipo');
  const r = { ELIMINACION: 0, CANCELACION: 0 };
  for (const f of rows) r[f.tipo] = f.total;
  return { eliminaciones: r.ELIMINACION, cancelaciones: r.CANCELACION, total: r.ELIMINACION + r.CANCELACION };
}

function normalizarEstatus(estatus) {
  const e = String(estatus || '').trim().toUpperCase();
  if (!ESTATUS.includes(e)) throw new Error(`Estatus invalido para la guia nueva: ${estatus}`);
  return e;
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
    // El nombre del operador se toma de la tabla de usuarios; si esa cuenta ya
    // no existe (o el evento es anterior a que se registrara quien escanea) se
    // queda en NULL y la interfaz lo muestra como "sin registrar".
    `SELECT e.accion, e.estatus, e.plaza, e.descripcion, e.revertido, e.usuario,
            COALESCE(u.nombre, e.usuario) AS operador, e.creado_en
       FROM eventos e LEFT JOIN usuarios u ON u.usuario = e.usuario
      -- Por fecha, no por orden de insercion: las notas administrativas
      -- (correcciones, complementos) se escriben con la fecha del momento,
      -- asi que ordenar por id dejaba la historia salteada en el tiempo. El
      -- id solo desempata cuando dos eventos caen en el mismo instante.
      WHERE e.numero_guia = $1 ORDER BY e.creado_en DESC, e.id DESC`,
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

async function marcarSalida(numeroGuia, plaza, destino, usuario) {
  validarPrefijoSalida(numeroGuia, plaza);
  const estatus = enTransitoA(destino);
  await pool.query(
    'UPDATE guias SET origen = $1, destino = $2, estatus = $3, actualizado_en = $4 WHERE numero_guia = $5',
    [plaza, destino, estatus, now(), numeroGuia]
  );
  const descripcion = `Salio de bodega ${plaza} con destino a ${destino}`;
  await registrarEvento(numeroGuia, ACCIONES.SALIDA, estatus, plaza, descripcion, pool, usuario);
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
async function escanearGuia(numeroGuia, plaza, modo = 'bodega', usuario = null) {
  if (!PLAZAS.includes(plaza)) throw new Error('Plaza invalida, usa MTY o CDMX');
  if (!MODOS.includes(modo)) throw new Error('Modo invalido, usa bodega, domicilio u ocurre');
  if (modo !== 'bodega') return escanearEntrega(numeroGuia, plaza, modo, usuario);

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
    await registrarEvento(numeroGuia, ACCIONES.SALIDA, estatus, plaza, descripcion, pool, usuario);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'salida', mensaje: descripcion };
  }

  if (guia.estatus === enTransitoA(plaza)) {
    const estatus = enBodega(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Llego a bodega ${plaza}`;
    await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, descripcion, pool, usuario);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'llegada', mensaje: descripcion };
  }

  if (guia.estatus === enBodega(plaza) || guia.estatus === entregado(plaza) || guia.estatus === entregado(destino)) {
    return marcarSalida(numeroGuia, plaza, destino, usuario);
  }

  if (guia.estatus === enRutaEntrega(plaza)) {
    const estatus = enBodega(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Regreso a bodega ${plaza} (entrega no completada)`;
    await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, descripcion, pool, usuario);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'llegada', mensaje: descripcion };
  }

  if (guia.estatus === enTransitoA(destino)) {
    const descripcion = `Escaneo repetido en bodega ${plaza}: el envio ya salio con destino a ${destino}`;
    await registrarEvento(numeroGuia, ACCIONES.ESCANEO_REPETIDO, guia.estatus, plaza, descripcion, pool, usuario);
    return { guia, tipo: 'repetido', mensaje: descripcion };
  }

  // EN_BODEGA_Q o EN_RUTA_ENTREGA_Q: aparecio en P sin los escaneos previos en Q
  const estatus = enBodega(plaza);
  await pool.query(
    'UPDATE guias SET origen = $1, destino = $2, estatus = $3, actualizado_en = $4 WHERE numero_guia = $5',
    [destino, plaza, estatus, now(), numeroGuia]
  );
  const descripcion = `Llego a bodega ${plaza} (sin registro de salida de bodega ${destino})`;
  await registrarEvento(numeroGuia, ACCIONES.LLEGADA, estatus, plaza, descripcion, pool, usuario);
  return { guia: await obtenerGuia(numeroGuia), tipo: 'llegada', mensaje: descripcion };
}

// Escaneos de entrega (a domicilio o en ocurre) en la plaza donde esta el paquete
async function escanearEntrega(numeroGuia, plaza, modo, usuario = null) {
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
    await registrarEvento(numeroGuia, ACCIONES.ESCANEO_REPETIDO, guia.estatus, plaza, descripcion, pool, usuario);
    return { guia, tipo: 'repetido', mensaje: descripcion };
  }

  if (modo === 'domicilio' && guia.estatus === enBodega(plaza)) {
    const estatus = enRutaEntrega(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Paquete en ruta de entrega en ${plaza}`;
    await registrarEvento(numeroGuia, ACCIONES.RUTA_ENTREGA, estatus, plaza, descripcion, pool, usuario);
    return { guia: await obtenerGuia(numeroGuia), tipo: 'ruta', mensaje: descripcion };
  }

  if (modo === 'domicilio' && guia.estatus === enRutaEntrega(plaza)) {
    const estatus = entregado(plaza);
    await actualizarEstatus(numeroGuia, estatus);
    const descripcion = `Entregado a domicilio en ${plaza}`;
    await registrarEvento(numeroGuia, ACCIONES.ENTREGA, estatus, plaza, descripcion, pool, usuario);
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
    await registrarEvento(numeroGuia, ACCIONES.ENTREGA, estatus, plaza, descripcion, pool, usuario);
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
//    Admite ademas:
//      · estatus: estatus con el que arranca la guia nueva. Si se indica, no se
//        deshace el ultimo escaneo (el estatus lo define el administrador) y se
//        deja en el historial el movimiento equivalente.
//      · conservarComplemento: por omision la guia nueva arranca SIN el
//        complemento de la cancelada, porque ese numero pertenecia a la guia
//        que se cancelo; con true se traslada a la guia nueva.
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

    // Al cancelar se puede fijar a mano el estatus con el que arranca la guia
    // nueva. En ese caso no se deshace el ultimo escaneo: el estatus lo decide
    // el administrador y no la reconstruccion del historial.
    const cancelada = resolucion && resolucion.tipo === 'cancelada';
    const estatusElegido = cancelada && resolucion.estatus ? normalizarEstatus(resolucion.estatus) : null;
    // Cancelar una guia es irreversible para el numero anterior: exige motivo,
    // igual que eliminar
    const motivoCancelacion = cancelada ? normalizarMotivo(resolucion.motivo, 'cancelacion') : null;

    let estatusFinal = guia.estatus;
    let plazaEvento = guia.destino;
    let mensaje = '';

    // Con resolucion, si no hay escaneo que revertir (solo queda el registro
    // inicial) se aplica de todos modos la cancelacion o el complemento.
    if (pila.length >= 2 && !estatusElegido) {
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
      await registrarEvento(numeroGuia, ACCIONES.CORRECCION, estatus, ultimo.plaza, mensaje, client, usuario);
      estatusFinal = estatus;
      plazaEvento = ultimo.plaza;
    }

    let numeroFinal = numeroGuia;

    if (cancelada) {
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

      // El complemento pertenece a la guia que se cancelo: la guia nueva
      // arranca sin el (y ese numero vuelve a quedar libre), salvo que se pida
      // conservarlo expresamente.
      const complemento = resolucion.conservarComplemento ? guia.complemento || null : null;

      // Renumera conservando todo el historial: copia la fila con el numero
      // nuevo, traslada los eventos y elimina la fila anterior (la llave
      // foranea de eventos impide cambiar el numero con un UPDATE directo).
      await client.query(
        `INSERT INTO guias (numero_guia, origen, destino, estatus, creado_en, actualizado_en, numero_anterior, complemento)
         SELECT $1, origen, destino, estatus, creado_en, $3, numero_guia, $4 FROM guias WHERE numero_guia = $2`,
        [nuevo, numeroGuia, now(), complemento]
      );
      await client.query('UPDATE eventos SET numero_guia = $1 WHERE numero_guia = $2', [nuevo, numeroGuia]);
      await client.query('DELETE FROM guias WHERE numero_guia = $1', [numeroGuia]);

      // Estatus elegido a mano: se fija en la guia nueva y se deja el escaneo
      // equivalente en el historial, para que el rastreo del cliente y las
      // correcciones posteriores partan de un historial coherente.
      const evEstatus = estatusElegido ? eventoDeEstatus(estatusElegido) : null;
      if (estatusElegido) {
        const plazaDestino = plazaDeEstatus(estatusElegido);
        await client.query(
          'UPDATE guias SET origen = $1, destino = $2, estatus = $3, actualizado_en = $4 WHERE numero_guia = $5',
          [otraPlaza(plazaDestino), plazaDestino, estatusElegido, now(), nuevo]
        );
        estatusFinal = estatusElegido;
        plazaEvento = evEstatus.plaza;
      }

      mensaje = `${usuario} cancelo la guia ${numeroGuia} y la reemplazo por la nueva guia ${nuevo}; el historial se conserva`;
      if (guia.complemento && !complemento) {
        mensaje += `. El complemento ${guia.complemento} quedo con la guia cancelada y ya no aplica a ${nuevo}`;
      }
      if (estatusElegido) mensaje += `. La guia nueva arranca en estatus ${estatusElegido}`;
      // El motivo viaja en el propio evento (para quien mira el historial de la
      // guia) y ademas en la bitacora (para quien revisa todas las
      // cancelaciones juntas)
      mensaje += `. Motivo: ${motivoCancelacion}`;
      await registrarEvento(nuevo, ACCIONES.CAMBIO_NUMERO, estatusFinal, plazaEvento, mensaje, client, usuario);
      await registrarBitacora(client, {
        tipo: 'CANCELACION',
        numeroGuia,
        numeroNuevo: nuevo,
        motivo: motivoCancelacion,
        usuario,
        estatus: guia.estatus,
        complemento: guia.complemento,
      });
      // El movimiento visible para el cliente va sin la nota interna
      if (evEstatus) {
        await registrarEvento(nuevo, evEstatus.accion, estatusElegido, evEstatus.plaza, evEstatus.descripcion, client, usuario);
      }
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
      await registrarEvento(numeroGuia, ACCIONES.COMPLEMENTO, estatusFinal, plazaEvento, mensaje, client, usuario);
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

// Valida una fecha en formato YYYY-MM-DD (la que produce <input type="date">)
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
function normalizarFecha(fecha, etiqueta) {
  const f = String(fecha || '').trim();
  if (!f) return null;
  if (!FORMATO_FECHA.test(f)) throw new Error(`${etiqueta} no es valida: usa el formato AAAA-MM-DD`);
  return f;
}

// Campos por los que se puede filtrar una fecha. "movimiento" es el ultimo
// escaneo (lo que muestra la columna Movimiento) y "registro" es cuando se dio
// de alta la guia. Son preguntas distintas: "que se movio hoy" y "que se
// capturo hoy".
const CAMPOS_FECHA = { movimiento: 'actualizado_en', registro: 'creado_en' };

async function listarGuias({ buscar, estatus, plaza, desde, hasta, campoFecha, limit = 200 } = {}) {
  const condiciones = [];
  const params = [];

  // El dia se calcula en horario de Mexico: de lo contrario, lo escaneado
  // despues de las 18:00 aparecia como del dia siguiente (la base guarda UTC)
  const columna = CAMPOS_FECHA[campoFecha] || CAMPOS_FECHA.movimiento;
  const d = normalizarFecha(desde, 'La fecha inicial');
  const h = normalizarFecha(hasta, 'La fecha final');
  if (d && h && d > h) throw new Error('La fecha inicial no puede ser posterior a la final');
  if (d) {
    params.push(d);
    condiciones.push(`(${columna} AT TIME ZONE 'America/Mexico_City')::date >= $${params.length}::date`);
  }
  if (h) {
    params.push(h);
    condiciones.push(`(${columna} AT TIME ZONE 'America/Mexico_City')::date <= $${params.length}::date`);
  }

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
    `SELECT e.numero_guia, e.accion, e.estatus, e.plaza, e.descripcion, e.revertido, e.usuario,
            COALESCE(u.nombre, e.usuario) AS operador, e.creado_en
       FROM eventos e LEFT JOIN usuarios u ON u.usuario = e.usuario
      ORDER BY e.creado_en DESC, e.id DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

// Borra UNA guia y todo su historial. Sirve para deshacer una captura
// equivocada (p. ej. un numero mal escaneado que creo una guia que no existe).
// Es definitivo: no queda rastro de la guia y su numero vuelve a quedar libre,
// junto con el de su complemento si tenia. Por eso solo lo hace un
// administrador y se pide confirmar el numero exacto.
async function borrarGuia(numeroGuia, usuario = null, motivo = null) {
  // El motivo se valida antes de abrir la transaccion: no tiene sentido tocar
  // la base si la peticion viene incompleta
  const motivoLimpio = normalizarMotivo(motivo, 'eliminacion');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const guia = await obtenerGuia(numeroGuia, client);
    if (!guia) throw new Error('Guia no encontrada');
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM eventos WHERE numero_guia = $1', [numeroGuia]);
    // La constancia se escribe ANTES de borrar: es lo unico que va a quedar
    await registrarBitacora(client, {
      tipo: 'ELIMINACION',
      numeroGuia,
      motivo: motivoLimpio,
      usuario,
      estatus: guia.estatus,
      complemento: guia.complemento,
      eventos: rows[0].n,
    });
    // Los eventos van primero: la llave foranea impide borrar la guia antes
    await client.query('DELETE FROM eventos WHERE numero_guia = $1', [numeroGuia]);
    await client.query('DELETE FROM guias WHERE numero_guia = $1', [numeroGuia]);
    await client.query('COMMIT');
    return { numeroGuia, estatus: guia.estatus, complemento: guia.complemento, eventos: rows[0].n, motivo: motivoLimpio };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
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
            COUNT(*) FILTER (WHERE accion = 'LLEGADA')::int AS llegadas,
            COUNT(*) FILTER (WHERE accion = 'ENTREGA')::int AS entregadas
       FROM eventos
      WHERE NOT revertido AND accion IN ('SALIDA', 'LLEGADA', 'ENTREGA')
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
  const totales = { enviadas: 0, enviadasMty: 0, enviadasCdmx: 0, llegadas: 0, entregadas: 0 };
  for (let i = n - 1; i >= 0; i--) {
    const fecha = fmt.format(new Date(Date.now() - i * 86400000));
    const r = porDia.get(fecha) || { enviadas_mty: 0, enviadas_cdmx: 0, llegadas: 0, entregadas: 0 };
    serie.push({
      fecha,
      enviadasMty: r.enviadas_mty,
      enviadasCdmx: r.enviadas_cdmx,
      llegadas: r.llegadas,
      entregadas: r.entregadas,
    });
    totales.enviadasMty += r.enviadas_mty;
    totales.enviadasCdmx += r.enviadas_cdmx;
    totales.llegadas += r.llegadas;
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

  // Operadores que han escaneado hoy (en horario de Mexico)
  const { rows: op } = await pool.query(
    `SELECT COUNT(DISTINCT usuario)::int AS n FROM eventos
      WHERE usuario IS NOT NULL AND NOT revertido
        AND (creado_en AT TIME ZONE 'America/Mexico_City')::date = (now() AT TIME ZONE 'America/Mexico_City')::date`
  );

  // Tiempo medio entre la salida de una guia y su llegada, sobre los ultimos
  // 30 dias. Es el indicador que de verdad mide el servicio.
  const { rows: t } = await pool.query(
    `WITH pares AS (
       SELECT e.numero_guia,
              MIN(e.creado_en) FILTER (WHERE e.accion = 'SALIDA')  AS salida,
              MIN(e.creado_en) FILTER (WHERE e.accion = 'LLEGADA') AS llegada
         FROM eventos e
        WHERE NOT e.revertido AND e.creado_en >= now() - interval '30 days'
        GROUP BY e.numero_guia
     )
     SELECT COUNT(*)::int AS n,
            COALESCE(AVG(EXTRACT(EPOCH FROM (llegada - salida))), 0)::float AS segundos
       FROM pares WHERE salida IS NOT NULL AND llegada IS NOT NULL AND llegada > salida`
  );

  return {
    porEstatus,
    totalGuias,
    eventos24h: ev[0].eventos,
    entregas24h: ev[0].entregas,
    operadoresHoy: op[0].n,
    transito: { guias: t[0].n, segundos: Math.round(t[0].segundos) },
  };
}

module.exports = {
  escanearGuia: (numeroGuia, plaza, modo, usuario) => conCandado(numeroGuia, () => escanearGuia(numeroGuia, plaza, modo, usuario)),
  revertirUltimoEscaneo: (numeroGuia, usuario, resolucion) =>
    conCandado(numeroGuia, () => revertirUltimoEscaneo(numeroGuia, usuario, resolucion)),
  marcarRevertidosHistoricos,
  marcarDuplicadosHistoricos,
  borrarGuia: (numeroGuia, usuario, motivo) => conCandado(numeroGuia, () => borrarGuia(numeroGuia, usuario, motivo)),
  listarBitacora,
  resumenBitacora,
  borrarTodas,
  obtenerGuia,
  buscarGuia,
  obtenerHistorial,
  listarGuias,
  listarEventos,
  resumen,
  estadisticas,
};
