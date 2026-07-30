/// <reference lib="webworker" />
import * as XLSX from 'xlsx';
import { detectarMapeo, normalizar, POR_CLAVE, clave as llaveDe, limpiar } from '@aura/compartido';
import type {
  Celda, ClientePreparado, PeticionWorker, ProblemaFila, RespuestaWorker, ResumenAgrupado,
  EstrategiaDuplicado,
} from './tipos';

/**
 * Todo el trabajo pesado de la importación vive aquí: leer el archivo, agrupar
 * por cliente y validar cada celda. Con 50 000 filas eso son varios segundos de
 * CPU, y en el hilo principal congelaría la interfaz por completo.
 *
 * El worker **conserva** el estado agrupado y lo entrega por lotes cuando el
 * hilo principal se los pide. Así no se transfieren 60 MB de objetos de golpe:
 * la memoria vive en un solo sitio y el envío al servidor va troceado.
 */

let filas: Celda[][] = [];
let encabezados: string[] = [];
let agrupados: ClientePreparado[] = [];

const responder = (m: RespuestaWorker) => self.postMessage(m);

self.onmessage = (e: MessageEvent<PeticionWorker>) => {
  try {
    const m = e.data;
    if (m.tipo === 'analizar') analizar(m.archivo, m.hoja);
    else if (m.tipo === 'agrupar') agrupar(m.mapeo);
    else if (m.tipo === 'llaves') enviarLlaves();
    else if (m.tipo === 'lote') enviarLote(m.desde, m.cantidad);
    else if (m.tipo === 'decisiones') aplicarDecisiones(m.decisiones);
  } catch (error) {
    responder({ tipo: 'error', mensaje: error instanceof Error ? error.message : 'Error al procesar el archivo.' });
  }
};

// ---------------------------------------------------------------------------
//  Lectura
// ---------------------------------------------------------------------------

function analizar(archivo: File, hojaPedida?: string) {
  responder({ tipo: 'progreso', fase: 'leyendo', porcentaje: 10 });

  const buffer = new FileReaderSync().readAsArrayBuffer(archivo);
  // `cellDates` deja que SheetJS entregue objetos Date en vez del número de
  // serie de Excel; el normalizador de fechas acepta ambos, pero así se acierta
  // más con formatos ambiguos.
  const libro = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true });
  responder({ tipo: 'progreso', fase: 'leyendo', porcentaje: 55 });

  const hojas = libro.SheetNames;
  const hoja = hojaPedida && hojas.includes(hojaPedida) ? hojaPedida : hojas[0];
  if (!hoja) throw new Error('El archivo no contiene ninguna hoja.');

  const matriz = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[hoja], {
    header: 1, raw: true, defval: null, blankrows: false,
  });
  responder({ tipo: 'progreso', fase: 'leyendo', porcentaje: 85 });

  // La primera fila con contenido manda; las hojas reales suelen traer títulos
  // o logotipos encima de la tabla.
  const iEncabezado = matriz.findIndex((f) => f.filter((c) => limpiar(c) !== null).length >= 2);
  if (iEncabezado === -1) throw new Error('No se encontró una fila de encabezados con al menos dos columnas.');

  encabezados = (matriz[iEncabezado] ?? []).map((c, i) => limpiar(c) ?? `Columna ${i + 1}`);
  filas = matriz.slice(iEncabezado + 1).filter((f) => f.some((c) => limpiar(c) !== null));

  const detectado = detectarMapeo(encabezados);
  const columnas = detectado.map((d) => ({
    ...d,
    muestra: filas.slice(0, 3).map((f) => String(limpiar(f[d.indice]) ?? '')).filter(Boolean),
  }));

  responder({
    tipo: 'analizado',
    datos: { hojas, hoja, encabezados, columnas, muestra: filas.slice(0, 20), totalFilas: filas.length },
  });
}

// ---------------------------------------------------------------------------
//  Agrupación por cliente
// ---------------------------------------------------------------------------

/**
 * Convierte filas en clientes. Varias filas con el mismo RFC —o el mismo nombre
 * si no hay RFC— son **un solo cliente con varios contactos**, que es como
 * vienen de verdad las bases exportadas de un ERP.
 */
function agrupar(mapeo: Record<number, string | null>) {
  const columnasPorCampo = new Map<string, number>();
  for (const [indice, campo] of Object.entries(mapeo)) {
    if (campo) columnasPorCampo.set(campo, Number(indice));
  }

  const porLlave = new Map<string, ClientePreparado>();
  const problemas: ProblemaFila[] = [];
  const porCampo: Record<string, number> = {};
  let totalContactos = 0;
  let filasFusionadas = 0;

  const leer = (fila: Celda[], campo: string): Celda => {
    const i = columnasPorCampo.get(campo);
    return i === undefined ? null : fila[i] ?? null;
  };

  for (let f = 0; f < filas.length; f += 1) {
    if (f % 2000 === 0) {
      responder({ tipo: 'progreso', fase: 'agrupando', porcentaje: Math.round((f / filas.length) * 100) });
    }
    const fila = filas[f];
    const numeroFila = f + 2; // +1 por el encabezado, +1 porque Excel empieza en 1
    const avisosFila: string[] = [];

    // --- campos de la cuenta ---
    const campos: Record<string, Celda> = {};
    for (const [campo, indice] of columnasPorCampo) {
      const def = POR_CLAVE[campo];
      if (!def || def.destino !== 'cuenta') continue;
      const bruto = fila[indice] ?? null;
      if (limpiar(bruto) === null) continue;
      const { valor, aviso } = normalizar(def.tipo, bruto);
      if (aviso) {
        avisosFila.push(aviso);
        porCampo[campo] = (porCampo[campo] ?? 0) + 1;
      }
      if (valor !== null && valor !== undefined) campos[campo] = valor as Celda;
    }

    const nombre = limpiar(campos.nombre ?? leer(fila, 'nombre'));
    if (!nombre) {
      problemas.push({
        llave: `f${numeroFila}`, fila: numeroFila, nombre: null, nivel: 'error',
        campo: 'nombre',
        mensaje: 'Sin nombre de cliente: la fila no se puede importar.',
      });
      continue;
    }
    campos.nombre = nombre;

    // --- contacto de la fila ---
    const contacto: Record<string, Celda> = {};
    for (const [campo, indice] of columnasPorCampo) {
      const def = POR_CLAVE[campo];
      if (!def || def.destino !== 'contacto') continue;
      const bruto = fila[indice] ?? null;
      if (limpiar(bruto) === null) continue;
      const { valor, aviso } = normalizar(def.tipo, bruto);
      if (aviso) {
        avisosFila.push(aviso);
        porCampo[campo] = (porCampo[campo] ?? 0) + 1;
      }
      if (valor !== null && valor !== undefined) contacto[campo] = valor as Celda;
    }

    // El RFC identifica mejor que el nombre; sin él se usa el nombre plegado.
    const rfc = campos.rfc ? String(campos.rfc).toUpperCase() : null;
    const llave = rfc ? `rfc:${rfc}` : `nom:${llaveDe(nombre)}`;

    const existente = porLlave.get(llave);
    if (existente) {
      filasFusionadas += 1;
      existente.filas.push(numeroFila);
      // La primera fila define los datos de la cuenta; las siguientes solo
      // rellenan huecos, para que un dato vacío no pise a uno bueno.
      for (const [k, v] of Object.entries(campos)) {
        if (existente.campos[k] === undefined || existente.campos[k] === null) existente.campos[k] = v;
      }
      if (contacto.contacto_nombre) {
        const yaEsta = existente.contactos.some(
          (c) => llaveDe(c.contacto_email ?? c.contacto_nombre) === llaveDe(contacto.contacto_email ?? contacto.contacto_nombre),
        );
        if (!yaEsta) { existente.contactos.push(contacto); totalContactos += 1; }
      }
    } else {
      const nuevo: ClientePreparado = {
        llave, fila: numeroFila, campos,
        contactos: contacto.contacto_nombre ? [contacto] : [],
        filas: [numeroFila],
      };
      if (contacto.contacto_nombre) totalContactos += 1;
      porLlave.set(llave, nuevo);
    }

    for (const mensaje of avisosFila) {
      problemas.push({ llave, fila: numeroFila, nombre, nivel: 'aviso', mensaje });
    }
  }

  agrupados = [...porLlave.values()];

  const resumen: ResumenAgrupado = {
    totalFilas: filas.length,
    totalClientes: agrupados.length,
    totalContactos,
    filasFusionadas,
    conError: problemas.filter((p) => p.nivel === 'error').length,
    conAviso: problemas.filter((p) => p.nivel === 'aviso').length,
    // Se mandan los primeros 300 para pintar la tabla; el resto se cuenta pero
    // no viaja, que es lo que evita transferir megas de avisos repetidos.
    problemas: problemas.slice(0, 300),
    porCampo,
  };
  responder({ tipo: 'agrupado', resumen });
}

/** Payload mínimo para el análisis de duplicados del servidor. */
function enviarLlaves() {
  responder({
    tipo: 'llaves',
    clientes: agrupados.map((c) => ({
      llave: c.llave,
      fila: c.fila,
      campos: {
        nombre: c.campos.nombre ?? null,
        rfc: c.campos.rfc ?? null,
        propietario: c.campos.propietario ?? null,
      },
    })),
  });
}

function enviarLote(desde: number, cantidad: number) {
  responder({ tipo: 'lote', clientes: agrupados.slice(desde, desde + cantidad) });
}

function aplicarDecisiones(decisiones: Record<string, EstrategiaDuplicado>) {
  for (const c of agrupados) {
    const d = decisiones[c.llave];
    if (d) c.decision = d;
  }
  responder({ tipo: 'listo' });
}
