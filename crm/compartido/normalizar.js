/**
 * Normalizadores de datos mexicanos, compartidos por la API y el asistente de
 * importación.
 *
 * Viven aquí y no en cada lado porque el navegador necesita validar 50 000 filas
 * al instante (sin ir al servidor) y el servidor necesita volver a validarlas
 * antes de escribir. Si las reglas estuvieran duplicadas, tarde o temprano el
 * navegador aceptaría algo que el servidor rechaza —o peor, al revés—.
 *
 * Contrato de cada normalizador: recibe lo que venga (celda de Excel, texto,
 * número, null) y devuelve `{ valor, aviso }`. `valor` es el dato ya limpio o
 * `null` si no se pudo usar; `aviso` es texto para el usuario o `null`.
 * Ninguno lanza excepciones: en una importación, una celda rara es un aviso,
 * no una caída.
 */

const ok = (valor) => ({ valor, aviso: null });
const con = (valor, aviso) => ({ valor, aviso });

/** Texto plano: recorta, colapsa espacios y descarta lo vacío. */
export function limpiar(bruto) {
  if (bruto === null || bruto === undefined) return null;
  const s = String(bruto).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

/** Quita acentos y baja a minúsculas. Base de toda comparación difusa. */
export const plegar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Clave de comparación: solo letras y dígitos. «S.A. de C.V.» y «SA de CV» coinciden. */
export const clave = (s) => plegar(s).replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------------------
//  RFC
// ---------------------------------------------------------------------------

// Moral: 3 letras + AAMMDD + homoclave. Física: 4 letras + AAMMDD + homoclave.
const RFC_RE = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{2})([A-Z\d])$/;

/**
 * Valida el RFC de verdad: además del patrón comprueba que la fecha exista.
 * «XAXX010101000» (RFC genérico de público en general) se acepta tal cual
 * porque es legítimo y aparece muchísimo en bases reales.
 */
export function rfc(bruto) {
  const s = limpiar(bruto);
  if (!s) return ok(null);

  const normal = s.toUpperCase().replace(/[\s-]/g, '');
  const m = RFC_RE.exec(normal);
  if (!m) {
    return con(normal, `RFC con formato inusual: «${s}». Se guarda tal cual, revísalo después.`);
  }

  const [, , aa, mm, dd] = m;
  const mes = Number(mm);
  const dia = Number(dd);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return con(normal, `El RFC «${normal}» tiene una fecha imposible (${dd}/${mm}/${aa}).`);
  }
  return ok(normal);
}

export const esRfcGenerico = (v) => ['XAXX010101000', 'XEXX010101000'].includes(String(v ?? '').toUpperCase());

// ---------------------------------------------------------------------------
//  Correo
// ---------------------------------------------------------------------------

const CORREO_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

/** Si la celda trae varios correos separados por coma o «/», se queda con el primero. */
export function email(bruto) {
  const s = limpiar(bruto);
  if (!s) return ok(null);

  const partes = s.split(/[,;/|]+/).map((p) => p.trim()).filter(Boolean);
  const primero = partes[0] ?? '';
  const normal = primero.toLowerCase();

  if (!CORREO_RE.test(normal)) {
    return con(null, `Correo inválido: «${s}». El cliente se importa sin correo.`);
  }
  if (partes.length > 1) {
    return con(normal, `La celda traía ${partes.length} correos; se usó el primero.`);
  }
  return ok(normal);
}

// ---------------------------------------------------------------------------
//  Teléfono
// ---------------------------------------------------------------------------

/**
 * Deja el teléfono en 10 dígitos con formato legible. Acepta lo que la gente
 * escribe de verdad: «+52 81 8123 4567», «(81) 8123-4567», «01 81 81234567»,
 * «8181234567 ext 102».
 */
export function telefono(bruto) {
  const s = limpiar(bruto);
  if (!s) return ok(null);

  // La extensión se conserva aparte: perderla molesta a quien luego llama.
  const mExt = /(?:ext|extensi[oó]n|x)\.?\s*(\d{1,6})\s*$/i.exec(s);
  const extension = mExt ? mExt[1] : null;
  const sinExt = mExt ? s.slice(0, mExt.index) : s;

  let digitos = sinExt.replace(/\D/g, '');
  if (digitos.startsWith('52') && digitos.length === 12) digitos = digitos.slice(2);
  else if (digitos.startsWith('521') && digitos.length === 13) digitos = digitos.slice(3);
  else if (digitos.startsWith('01') && digitos.length === 12) digitos = digitos.slice(2);
  else if (digitos.startsWith('1') && digitos.length === 11) digitos = digitos.slice(1);

  const sufijo = extension ? ` ext. ${extension}` : '';

  if (digitos.length === 10) {
    const bonito = `${digitos.slice(0, 2)} ${digitos.slice(2, 6)} ${digitos.slice(6)}`;
    return ok(bonito + sufijo);
  }
  if (digitos.length === 0) {
    return con(null, `Teléfono sin dígitos: «${s}».`);
  }
  return con(digitos + sufijo, `Teléfono de ${digitos.length} dígitos (se esperan 10): «${s}». Se guarda sin formato.`);
}

// ---------------------------------------------------------------------------
//  Código postal
// ---------------------------------------------------------------------------

/** Excel convierte «01000» en el número 1000; por eso se rellena con ceros. */
export function codigoPostal(bruto) {
  const s = limpiar(bruto);
  if (!s) return ok(null);

  const digitos = s.replace(/\D/g, '');
  if (digitos.length === 0) return con(null, `Código postal sin dígitos: «${s}».`);
  if (digitos.length > 5) return con(digitos.slice(0, 5), `Código postal de ${digitos.length} dígitos: «${s}». Se tomaron los primeros 5.`);

  const relleno = digitos.padStart(5, '0');
  if (digitos.length < 5) {
    return con(relleno, `El código postal «${s}» venía sin ceros a la izquierda; se guardó como ${relleno}.`);
  }
  return ok(relleno);
}

// ---------------------------------------------------------------------------
//  Estados de la República
// ---------------------------------------------------------------------------

export const ESTADOS_MX = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México',
  'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

/** Abreviaturas y variantes que aparecen en bases reales. */
const ALIAS_ESTADO = {
  ags: 'Aguascalientes', aguascalientes: 'Aguascalientes',
  bc: 'Baja California', bcn: 'Baja California', bajacalifornia: 'Baja California',
  bcs: 'Baja California Sur', bajacaliforniasur: 'Baja California Sur',
  camp: 'Campeche', campeche: 'Campeche',
  chis: 'Chiapas', chiapas: 'Chiapas',
  chih: 'Chihuahua', chihuahua: 'Chihuahua',
  cdmx: 'Ciudad de México', df: 'Ciudad de México', ciudaddemexico: 'Ciudad de México',
  distritofederal: 'Ciudad de México', mexicodf: 'Ciudad de México',
  coah: 'Coahuila', coahuila: 'Coahuila', coahuiladezaragoza: 'Coahuila',
  col: 'Colima', colima: 'Colima',
  dgo: 'Durango', durango: 'Durango',
  edomex: 'Estado de México', mex: 'Estado de México', estadodemexico: 'Estado de México',
  mexico: 'Estado de México',
  gto: 'Guanajuato', guanajuato: 'Guanajuato',
  gro: 'Guerrero', guerrero: 'Guerrero',
  hgo: 'Hidalgo', hidalgo: 'Hidalgo',
  jal: 'Jalisco', jalisco: 'Jalisco',
  mich: 'Michoacán', michoacan: 'Michoacán', michoacandeocampo: 'Michoacán',
  mor: 'Morelos', morelos: 'Morelos',
  nay: 'Nayarit', nayarit: 'Nayarit',
  nl: 'Nuevo León', nuevoleon: 'Nuevo León',
  oax: 'Oaxaca', oaxaca: 'Oaxaca',
  pue: 'Puebla', puebla: 'Puebla',
  qro: 'Querétaro', queretaro: 'Querétaro',
  qroo: 'Quintana Roo', quintanaroo: 'Quintana Roo',
  slp: 'San Luis Potosí', sanluispotosi: 'San Luis Potosí',
  sin: 'Sinaloa', sinaloa: 'Sinaloa',
  son: 'Sonora', sonora: 'Sonora',
  tab: 'Tabasco', tabasco: 'Tabasco',
  tamps: 'Tamaulipas', tamaulipas: 'Tamaulipas',
  tlax: 'Tlaxcala', tlaxcala: 'Tlaxcala',
  ver: 'Veracruz', veracruz: 'Veracruz', veracruzdeignaciodelallave: 'Veracruz',
  yuc: 'Yucatán', yucatan: 'Yucatán',
  zac: 'Zacatecas', zacatecas: 'Zacatecas',
};

export function estado(bruto) {
  const s = limpiar(bruto);
  if (!s) return ok(null);

  const k = clave(s);
  if (ALIAS_ESTADO[k]) return ok(ALIAS_ESTADO[k]);

  const exacto = ESTADOS_MX.find((e) => clave(e) === k);
  if (exacto) return ok(exacto);

  return con(s, `Estado no reconocido: «${s}». Se guarda tal cual.`);
}

// ---------------------------------------------------------------------------
//  Catálogos cerrados
// ---------------------------------------------------------------------------

const ALIAS_TAMANO = {
  micro: 'micro', microempresa: 'micro',
  pequena: 'pequena', pequenia: 'pequena', chica: 'pequena', small: 'pequena', pyme: 'pequena',
  mediana: 'mediana', medium: 'mediana', media: 'mediana',
  grande: 'grande', large: 'grande',
  corporativo: 'corporativo', corporativa: 'corporativo', corporate: 'corporativo', enterprise: 'corporativo',
};

const ALIAS_TIPO = {
  cliente: 'cliente', activo: 'cliente', client: 'cliente',
  prospecto: 'prospecto', prospect: 'prospecto', lead: 'prospecto', potencial: 'prospecto',
  inactivo: 'inactivo', inactive: 'inactivo', suspendido: 'inactivo',
  perdido: 'perdido', lost: 'perdido', baja: 'perdido', cancelado: 'perdido',
};

const ALIAS_ROL_COMPRA = {
  decisor: 'decisor', decision: 'decisor', director: 'decisor', dueno: 'decisor',
  influenciador: 'influenciador', influencer: 'influenciador',
  usuario: 'usuario', user: 'usuario', operativo: 'usuario',
  bloqueador: 'bloqueador', blocker: 'bloqueador',
  campeon: 'campeon', champion: 'campeon', aliado: 'campeon',
};

function deCatalogo(bruto, alias, etiqueta) {
  const s = limpiar(bruto);
  if (!s) return ok(null);
  const encontrado = alias[clave(s)];
  if (encontrado) return ok(encontrado);
  return con(null, `${etiqueta} no reconocido: «${s}». Se deja vacío.`);
}

export const tamano = (v) => deCatalogo(v, ALIAS_TAMANO, 'Tamaño de empresa');
export const tipoCuenta = (v) => deCatalogo(v, ALIAS_TIPO, 'Tipo de cuenta');
export const rolCompra = (v) => deCatalogo(v, ALIAS_ROL_COMPRA, 'Rol de compra');

// ---------------------------------------------------------------------------
//  Números y fechas
// ---------------------------------------------------------------------------

export function entero(bruto, { min = 0, max = 3650 } = {}) {
  const s = limpiar(bruto);
  if (!s) return ok(null);
  const n = Number(s.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return con(null, `Se esperaba un número y llegó «${s}».`);
  const r = Math.round(n);
  if (r < min || r > max) return con(null, `El valor ${r} está fuera del rango permitido (${min}–${max}).`);
  return ok(r);
}

/**
 * Fechas de Excel. La hoja puede entregar un `Date`, un texto o el número de
 * serie de Excel (días desde 1899-12-30). Ese último caso es el que rompe a los
 * importadores ingenuos: 45 000 se convierte en el año 45 000, no en 2023.
 */
export function fecha(bruto) {
  if (bruto === null || bruto === undefined || bruto === '') return ok(null);

  if (bruto instanceof Date && !Number.isNaN(bruto.getTime())) {
    return ok(bruto.toISOString().slice(0, 10));
  }

  if (typeof bruto === 'number' && Number.isFinite(bruto)) {
    if (bruto < 1 || bruto > 2_958_465) return con(null, `Fecha fuera de rango: ${bruto}.`);
    const ms = Math.round((bruto - 25_569) * 86_400_000);
    return ok(new Date(ms).toISOString().slice(0, 10));
  }

  const s = limpiar(bruto);
  if (!s) return ok(null);

  // dd/mm/aaaa es lo normal en México; Date lo interpretaría como mm/dd.
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (m) {
    const [, d, mes, a] = m;
    const ano = a.length === 2 ? Number(a) + (Number(a) > 50 ? 1900 : 2000) : Number(a);
    const dt = new Date(Date.UTC(ano, Number(mes) - 1, Number(d)));
    if (Number.isNaN(dt.getTime()) || dt.getUTCMonth() !== Number(mes) - 1) {
      return con(null, `Fecha inválida: «${s}».`);
    }
    return ok(dt.toISOString().slice(0, 10));
  }

  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return con(null, `Fecha no reconocida: «${s}».`);
  return ok(dt.toISOString().slice(0, 10));
}

/** Etiquetas separadas por coma, punto y coma o barra. */
export function etiquetas(bruto) {
  const s = limpiar(bruto);
  if (!s) return ok([]);
  const lista = [...new Set(s.split(/[,;|]+/).map((t) => t.trim()).filter(Boolean))].slice(0, 20);
  return ok(lista);
}

export function sitioWeb(bruto) {
  const s = limpiar(bruto);
  if (!s) return ok(null);
  const sinProtocolo = s.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(sinProtocolo)) {
    return con(null, `Sitio web con formato inválido: «${s}».`);
  }
  return ok(`https://${sinProtocolo}`);
}

/** Texto libre con tope, para no guardar una celda de 40 000 caracteres. */
export function textoLargo(bruto, max = 4000) {
  const s = limpiar(bruto);
  if (!s) return ok(null);
  if (s.length > max) return con(s.slice(0, max), `Texto recortado a ${max} caracteres.`);
  return ok(s);
}

export const texto = (bruto, max = 300) => textoLargo(bruto, max);

/** Un normalizador por tipo declarado en el catálogo de campos. */
export const NORMALIZADORES = {
  texto: (v) => texto(v),
  texto_largo: (v) => textoLargo(v),
  rfc,
  email,
  telefono,
  codigo_postal: codigoPostal,
  estado,
  tamano,
  tipo_cuenta: tipoCuenta,
  rol_compra: rolCompra,
  entero,
  fecha,
  etiquetas,
  sitio_web: sitioWeb,
  usuario: (v) => texto(v, 200),
};

/** Aplica el normalizador que corresponda al tipo; si no existe, trata como texto. */
export function normalizar(tipo, valor) {
  const fn = NORMALIZADORES[tipo] ?? NORMALIZADORES.texto;
  return fn(valor);
}
