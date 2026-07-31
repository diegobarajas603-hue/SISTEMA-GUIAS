/**
 * Cubicaje y tarifas de flete de Fletes Tauro.
 *
 * Vive en el paquete compartido porque la pantalla necesita recalcular en cada
 * tecla y el servidor tiene que volver a calcularlo antes de guardar. Si las dos
 * fórmulas vivieran por separado, el total que ve el cliente en pantalla y el que
 * sale en el PDF podrían no coincidir, y en una cotización eso es dinero.
 *
 * Reglas del negocio:
 *  · Peso volumétrico = largo × ancho × alto × 500, por pieza.
 *  · Se cobra el mayor entre el peso real y el volumétrico, renglón por renglón.
 *  · Mercancía no estibable ocupa 1.80 m de altura aunque mida menos: nadie puede
 *    poner nada encima, así que el espacio se pierde igual y se cobra.
 */

/** Factor volumétrico del autotransporte de carga en México. */
export const FACTOR_VOLUMETRICO = 500;

/** Altura que ocupa una tarima no estibable, en metros. */
export const ALTURA_NO_ESTIBABLE = 1.8;

/** Tarifas por kilogramo cobrable, en centavos para no arrastrar decimales. */
export const TARIFAS = {
  general: { clave: 'general', titulo: 'Carga general', centavosPorKg: 160 },
  quimico: { clave: 'quimico', titulo: 'Químico', centavosPorKg: 180 },
};

export const TIPOS_MERCANCIA = Object.values(TARIFAS);

export const tarifaDe = (tipo) => TARIFAS[tipo] ?? TARIFAS.general;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Redondeo a 2 decimales, para que sumar renglones no arrastre error binario. */
const dos = (n) => Math.round(n * 100) / 100;

/**
 * Altura que se debe usar en el cálculo.
 * Si no es estibable manda 1.80 m, sin importar lo que se haya capturado.
 */
export function alturaEfectiva({ estibable, alto }) {
  return estibable ? num(alto) : ALTURA_NO_ESTIBABLE;
}

/**
 * Calcula un renglón completo.
 *
 * `peso_real` es el peso de **todas** las piezas del renglón; el volumétrico se
 * obtiene por pieza y se multiplica por la cantidad, que es como se mide el
 * espacio ocupado en la caja.
 */
export function calcularRenglon(renglon, factor = FACTOR_VOLUMETRICO) {
  const cantidad = Math.max(1, Math.round(num(renglon.cantidad) || 1));
  const largo = num(renglon.largo);
  const ancho = num(renglon.ancho);
  const alto = alturaEfectiva(renglon);
  const pesoReal = dos(num(renglon.peso_real));

  const volumenPieza = dos(largo * ancho * alto);
  const volumetricoPieza = dos(volumenPieza * factor);
  const pesoVolumetrico = dos(volumetricoPieza * cantidad);
  const pesoCobrable = dos(Math.max(pesoReal, pesoVolumetrico));

  return {
    cantidad,
    largo,
    ancho,
    alto,
    estibable: !!renglon.estibable,
    peso_real: pesoReal,
    volumen_pieza: volumenPieza,
    peso_volumetrico_pieza: volumetricoPieza,
    peso_volumetrico: pesoVolumetrico,
    peso_cobrable: pesoCobrable,
    // Cuál de los dos ganó: la pantalla y el PDF lo señalan para que el cliente
    // entienda por qué se le cobra esa cifra.
    cobra_por: pesoVolumetrico > pesoReal ? 'volumetrico' : 'real',
  };
}

/**
 * Totales de la cotización. Devuelve también el importe en centavos, que es como
 * se guarda todo el dinero del sistema.
 */
export function calcularCotizacion(renglones = [], tipoMercancia = 'general', factor = FACTOR_VOLUMETRICO) {
  const calculados = renglones.map((r) => calcularRenglon(r, factor));
  const tarifa = tarifaDe(tipoMercancia);

  const pesoRealTotal = dos(calculados.reduce((s, r) => s + r.peso_real, 0));
  const pesoVolumetricoTotal = dos(calculados.reduce((s, r) => s + r.peso_volumetrico, 0));
  const pesoCobrableTotal = dos(calculados.reduce((s, r) => s + r.peso_cobrable, 0));
  const piezas = calculados.reduce((s, r) => s + r.cantidad, 0);

  // El importe se redondea al peso: una cotización con centavos sueltos se ve mal
  // y nadie los cobra.
  const importe = Math.round(pesoCobrableTotal * tarifa.centavosPorKg);

  return {
    renglones: calculados,
    piezas,
    peso_real_total: pesoRealTotal,
    peso_volumetrico_total: pesoVolumetricoTotal,
    peso_cobrable_total: pesoCobrableTotal,
    tipo_mercancia: tarifa.clave,
    tarifa_centavos_kg: tarifa.centavosPorKg,
    tarifa_titulo: tarifa.titulo,
    importe,
    factor_volumetrico: factor,
  };
}

/** Renglón vacío con los valores por omisión de una tarima estándar. */
export const renglonVacio = () => ({
  descripcion: '',
  cantidad: 1,
  peso_real: '',
  largo: '',
  ancho: '',
  alto: '',
  estibable: false,
});
