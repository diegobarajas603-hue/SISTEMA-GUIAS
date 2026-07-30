import { clave } from './normalizar.js';

/**
 * Catálogo de campos destino del importador de clientes.
 *
 * Es la fuente única: la API valida contra esto y el asistente construye desde
 * esto los desplegables de mapeo y la detección automática. Añadir un campo aquí
 * lo habilita en ambos lados sin tocar nada más.
 *
 * - `grupo`   dónde se agrupa en la interfaz de mapeo
 * - `tipo`    normalizador de `normalizar.js` que se le aplica
 * - `destino` 'cuenta' escribe en `cuentas`, 'contacto' en `contactos`
 * - `sinonimos` encabezados de Excel que apuntan a este campo
 * - `requerido` sin él la fila no se puede importar
 */
export const CAMPOS = [
  // ------------------------------------------------------------- identidad
  {
    clave: 'nombre', etiqueta: 'Nombre del cliente', grupo: 'Identidad',
    tipo: 'texto', destino: 'cuenta', requerido: true,
    ayuda: 'Con lo que tu equipo lo conoce. Es el único campo obligatorio.',
    sinonimos: ['cliente', 'nombre', 'nombre cliente', 'nombre del cliente', 'empresa',
      'nombre comercial', 'compania', 'company', 'account', 'cuenta', 'nombre empresa',
      'razon comercial', 'customer', 'nombre de la empresa'],
  },
  {
    clave: 'nombre_comercial', etiqueta: 'Razón social', grupo: 'Identidad',
    tipo: 'texto', destino: 'cuenta',
    ayuda: 'El nombre legal, como aparece en la factura.',
    sinonimos: ['razon social', 'razón social', 'razon', 'legal', 'nombre legal',
      'denominacion social', 'legal name', 'razon social completa'],
  },
  {
    clave: 'rfc', etiqueta: 'RFC', grupo: 'Identidad',
    tipo: 'rfc', destino: 'cuenta',
    ayuda: 'Se usa para detectar duplicados antes que el nombre.',
    sinonimos: ['rfc', 'r f c', 'registro federal', 'registro federal de contribuyentes',
      'tax id', 'taxid', 'rfc cliente'],
  },
  {
    clave: 'industria', etiqueta: 'Industria', grupo: 'Identidad',
    tipo: 'texto', destino: 'cuenta',
    sinonimos: ['industria', 'giro', 'sector', 'ramo', 'actividad', 'industry',
      'giro comercial', 'actividad economica'],
  },
  {
    clave: 'tamano', etiqueta: 'Tamaño de empresa', grupo: 'Identidad',
    tipo: 'tamano', destino: 'cuenta',
    ayuda: 'micro · pequeña · mediana · grande · corporativo',
    sinonimos: ['tamano', 'tamaño', 'tamano empresa', 'size', 'clasificacion', 'segmento'],
  },
  {
    clave: 'tipo', etiqueta: 'Tipo de cuenta', grupo: 'Identidad',
    tipo: 'tipo_cuenta', destino: 'cuenta',
    ayuda: 'prospecto · cliente · inactivo · perdido. Si se omite, entra como cliente.',
    sinonimos: ['tipo', 'tipo cuenta', 'estatus', 'estado cliente', 'status', 'situacion'],
  },

  // -------------------------------------------------------------- contacto
  {
    clave: 'telefono', etiqueta: 'Teléfono', grupo: 'Contacto de la empresa',
    tipo: 'telefono', destino: 'cuenta',
    sinonimos: ['telefono', 'teléfono', 'tel', 'tel.', 'telefono empresa', 'phone',
      'telefono oficina', 'conmutador', 'numero', 'num telefono', 'celular empresa'],
  },
  {
    clave: 'email', etiqueta: 'Correo', grupo: 'Contacto de la empresa',
    tipo: 'email', destino: 'cuenta',
    sinonimos: ['email', 'correo', 'e mail', 'mail', 'correo electronico',
      'correo empresa', 'email empresa'],
  },
  {
    clave: 'sitio_web', etiqueta: 'Sitio web', grupo: 'Contacto de la empresa',
    tipo: 'sitio_web', destino: 'cuenta',
    sinonimos: ['sitio web', 'web', 'pagina web', 'website', 'url', 'sitio', 'pagina'],
  },

  // -------------------------------------------------------------- dirección
  {
    clave: 'calle', etiqueta: 'Calle', grupo: 'Dirección',
    tipo: 'texto', destino: 'cuenta',
    ayuda: 'Si tu Excel trae la dirección completa en una sola columna, mapéala aquí.',
    sinonimos: ['calle', 'direccion', 'dirección', 'domicilio', 'street', 'address',
      'direccion fiscal', 'domicilio fiscal', 'ubicacion'],
  },
  {
    clave: 'numero', etiqueta: 'Número', grupo: 'Dirección',
    tipo: 'texto', destino: 'cuenta',
    sinonimos: ['numero', 'número', 'num', 'no', 'no.', 'numero exterior', 'num ext',
      'exterior', 'numero interior', 'int'],
  },
  {
    clave: 'colonia', etiqueta: 'Colonia', grupo: 'Dirección',
    tipo: 'texto', destino: 'cuenta',
    sinonimos: ['colonia', 'col', 'col.', 'fraccionamiento', 'barrio', 'sector',
      'parque industrial', 'zona'],
  },
  {
    clave: 'ciudad', etiqueta: 'Ciudad', grupo: 'Dirección',
    tipo: 'texto', destino: 'cuenta',
    sinonimos: ['ciudad', 'municipio', 'city', 'delegacion', 'alcaldia', 'localidad', 'plaza'],
  },
  {
    clave: 'estado', etiqueta: 'Estado', grupo: 'Dirección',
    tipo: 'estado', destino: 'cuenta',
    ayuda: 'Reconoce abreviaturas: NL, CDMX, Qro, Edomex…',
    sinonimos: ['estado', 'entidad', 'entidad federativa', 'state', 'provincia', 'edo'],
  },
  {
    clave: 'codigo_postal', etiqueta: 'Código postal', grupo: 'Dirección',
    tipo: 'codigo_postal', destino: 'cuenta',
    ayuda: 'Recupera los ceros a la izquierda que Excel se come.',
    sinonimos: ['codigo postal', 'código postal', 'cp', 'c p', 'c.p.', 'zip', 'postal',
      'zip code', 'codigo'],
  },
  {
    clave: 'pais', etiqueta: 'País', grupo: 'Dirección',
    tipo: 'texto', destino: 'cuenta',
    ayuda: 'Si se omite, se asume México.',
    sinonimos: ['pais', 'país', 'country', 'nacion'],
  },

  // ------------------------------------------------------------- comercial
  {
    clave: 'propietario', etiqueta: 'Ejecutivo asignado', grupo: 'Comercial',
    tipo: 'usuario', destino: 'cuenta',
    ayuda: 'Se busca por nombre, correo, alias o ID entre los usuarios del CRM.',
    sinonimos: ['ejecutivo', 'ejecutivo asignado', 'asesor', 'vendedor', 'responsable',
      'propietario', 'owner', 'agente', 'representante', 'kam', 'account manager',
      'ejecutivo de cuenta', 'asesor comercial'],
  },
  {
    clave: 'origen', etiqueta: 'Origen', grupo: 'Comercial',
    tipo: 'texto', destino: 'cuenta',
    sinonimos: ['origen', 'fuente', 'source', 'canal', 'como nos conocio', 'procedencia'],
  },
  {
    clave: 'dias_credito', etiqueta: 'Días de crédito', grupo: 'Comercial',
    tipo: 'entero', destino: 'cuenta',
    sinonimos: ['dias credito', 'días de crédito', 'credito', 'plazo', 'condiciones de pago',
      'dias de pago', 'terminos'],
  },
  {
    clave: 'cliente_desde', etiqueta: 'Cliente desde', grupo: 'Comercial',
    tipo: 'fecha', destino: 'cuenta',
    ayuda: 'Entiende dd/mm/aaaa y el número de serie de Excel.',
    sinonimos: ['cliente desde', 'fecha alta', 'alta', 'fecha de alta', 'antiguedad',
      'fecha registro', 'fecha ingreso'],
  },
  {
    clave: 'etiquetas', etiqueta: 'Etiquetas', grupo: 'Comercial',
    tipo: 'etiquetas', destino: 'cuenta',
    ayuda: 'Separadas por coma.',
    sinonimos: ['etiquetas', 'tags', 'categorias', 'clasificaciones', 'marcas'],
  },
  {
    clave: 'notas', etiqueta: 'Observaciones', grupo: 'Comercial',
    tipo: 'texto_largo', destino: 'cuenta',
    sinonimos: ['observaciones', 'notas', 'comentarios', 'nota', 'notes', 'remarks',
      'observacion', 'detalle', 'comentario'],
  },

  // -------------------------------------------------- contacto de la cuenta
  {
    clave: 'contacto_nombre', etiqueta: 'Nombre del contacto', grupo: 'Contacto principal',
    tipo: 'texto', destino: 'contacto',
    ayuda: 'Si varias filas comparten cliente, se crea un cliente con varios contactos.',
    sinonimos: ['contacto', 'contacto principal', 'nombre contacto', 'atencion',
      'persona de contacto', 'contact', 'atn', 'responsable contacto', 'nombre del contacto'],
  },
  {
    clave: 'contacto_puesto', etiqueta: 'Puesto del contacto', grupo: 'Contacto principal',
    tipo: 'texto', destino: 'contacto',
    sinonimos: ['puesto', 'cargo', 'position', 'title', 'puesto contacto', 'rol'],
  },
  {
    clave: 'contacto_email', etiqueta: 'Correo del contacto', grupo: 'Contacto principal',
    tipo: 'email', destino: 'contacto',
    sinonimos: ['correo contacto', 'email contacto', 'mail contacto', 'correo personal'],
  },
  {
    clave: 'contacto_telefono', etiqueta: 'Teléfono del contacto', grupo: 'Contacto principal',
    tipo: 'telefono', destino: 'contacto',
    sinonimos: ['telefono contacto', 'tel contacto', 'celular', 'movil', 'móvil',
      'celular contacto', 'mobile'],
  },
  {
    clave: 'contacto_whatsapp', etiqueta: 'WhatsApp del contacto', grupo: 'Contacto principal',
    tipo: 'telefono', destino: 'contacto',
    sinonimos: ['whatsapp', 'wa', 'whats', 'whatsapp contacto'],
  },
  {
    clave: 'contacto_rol_compra', etiqueta: 'Rol de compra', grupo: 'Contacto principal',
    tipo: 'rol_compra', destino: 'contacto',
    ayuda: 'decisor · influenciador · usuario · bloqueador · campeón',
    sinonimos: ['rol de compra', 'rol compra', 'tipo contacto', 'perfil'],
  },
];

export const POR_CLAVE = Object.fromEntries(CAMPOS.map((c) => [c.clave, c]));
export const CLAVES = CAMPOS.map((c) => c.clave);
export const CAMPOS_CUENTA = CAMPOS.filter((c) => c.destino === 'cuenta');
export const CAMPOS_CONTACTO = CAMPOS.filter((c) => c.destino === 'contacto');
export const GRUPOS = [...new Set(CAMPOS.map((c) => c.grupo))];

/** Índice sinónimo → clave, precalculado una vez. */
const INDICE_SINONIMOS = (() => {
  const mapa = new Map();
  for (const campo of CAMPOS) {
    mapa.set(clave(campo.clave), campo.clave);
    mapa.set(clave(campo.etiqueta), campo.clave);
    for (const s of campo.sinonimos) {
      // El primero que reclama un sinónimo se lo queda: el orden del catálogo
      // define la prioridad y por eso «nombre» cae en el cliente, no en el contacto.
      if (!mapa.has(clave(s))) mapa.set(clave(s), campo.clave);
    }
  }
  return mapa;
})();

/**
 * Adivina a qué campo del CRM corresponde un encabezado de Excel.
 * Devuelve `{ campo, confianza }` con confianza 'alta' | 'media' | null.
 *
 * Tres pasadas, de más a menos estricta. La difusa exige que el sinónimo sea
 * largo para no emparejar «no» dentro de «nombre».
 */
export function detectarCampo(encabezado) {
  const k = clave(encabezado);
  if (!k) return { campo: null, confianza: null };

  const exacto = INDICE_SINONIMOS.get(k);
  if (exacto) return { campo: exacto, confianza: 'alta' };

  for (const [sinonimo, campo] of INDICE_SINONIMOS) {
    if (sinonimo.length >= 4 && (k.startsWith(sinonimo) || sinonimo.startsWith(k))) {
      return { campo, confianza: 'media' };
    }
  }

  for (const [sinonimo, campo] of INDICE_SINONIMOS) {
    if (sinonimo.length >= 5 && k.includes(sinonimo)) {
      return { campo, confianza: 'media' };
    }
  }

  return { campo: null, confianza: null };
}

/**
 * Mapea una lista de encabezados completa. Un campo del CRM no puede recibir dos
 * columnas: si dos encabezados apuntan al mismo destino gana el de mayor
 * confianza y el otro queda sin asignar para que el usuario decida.
 */
export function detectarMapeo(encabezados) {
  const tomados = new Map();
  const resultado = encabezados.map((h, i) => ({ indice: i, encabezado: h, campo: null, confianza: null }));

  for (const orden of ['alta', 'media']) {
    resultado.forEach((col, i) => {
      if (col.campo) return;
      const { campo, confianza } = detectarCampo(encabezados[i]);
      if (!campo || confianza !== orden || tomados.has(campo)) return;
      col.campo = campo;
      col.confianza = confianza;
      tomados.set(campo, i);
    });
  }

  return resultado;
}
