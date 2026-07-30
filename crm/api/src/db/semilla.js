/**
 * ============================================================================
 *  SEMILLA — 18 meses de historia comercial coherente de Fletes Tauro
 * ============================================================================
 *
 *  No es ruido aleatorio: las oportunidades nacen de leads, los leads tienen
 *  señales que **justifican** su score, las facturas provienen de oportunidades
 *  ganadas, los tickets pertenecen a clientes con embarques, y las cuentas en
 *  riesgo tienen de verdad una caída de facturación detrás.
 *
 *  Es determinista (PRNG con semilla fija): dos ejecuciones producen la misma
 *  base. Eso hace que capturas, demos y pruebas sean reproducibles.
 */

import { pool, cerrar } from './pool.js';
import { migrar } from './migrar.js';
import { config } from '../config.js';
import { hashPassword, folio } from '../lib/cripto.js';
import { sumarDias, sumarMeses, inicioMes, isoFecha, diasEntre } from '../lib/fechas.js';
import motor from '../ia/motor.js';
import { recalcularIA } from '../servicios/ia-tareas.js';

// ---------------------------------------------------------------------------
//  Azar reproducible
// ---------------------------------------------------------------------------

function mulberry32(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(config.semilla.semilla);
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const elegir = (arr) => arr[Math.floor(rnd() * arr.length)];
const quizas = (p) => rnd() < p;
const decimal = (a, b) => a + rnd() * (b - a);

/** Normal truncada: los montos reales se agrupan al centro, no son uniformes. */
function normal(media, desviacion, min, max) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(min, Math.min(max, media + z * desviacion));
}

const elegirVarios = (arr, n) => {
  const copia = [...arr];
  const salida = [];
  for (let i = 0; i < n && copia.length; i += 1) {
    salida.push(copia.splice(Math.floor(rnd() * copia.length), 1)[0]);
  }
  return salida;
};

const fechaEntre = (desde, hasta) =>
  new Date(desde.getTime() + rnd() * (hasta.getTime() - desde.getTime()));

const AHORA = new Date();
const INICIO = sumarMeses(inicioMes(AHORA), -17);

// ---------------------------------------------------------------------------
//  Inserción por lotes
// ---------------------------------------------------------------------------

/**
 * Postgres admite 65 535 parámetros por sentencia. Este helper trocea el lote para
 * no rebasarlo y devuelve las filas insertadas (con su id).
 */
async function insertar(tabla, columnas, filas, { retornar = 'id' } = {}) {
  if (!filas.length) return [];
  const porLote = Math.max(1, Math.floor(60000 / columnas.length));
  const resultado = [];
  for (let i = 0; i < filas.length; i += porLote) {
    const trozo = filas.slice(i, i + porLote);
    const params = [];
    const grupos = trozo.map((fila) => {
      const marcas = columnas.map((col) => {
        params.push(fila[col] === undefined ? null : fila[col]);
        return `$${params.length}`;
      });
      return `(${marcas.join(', ')})`;
    });
    const { rows } = await pool.query(
      `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES ${grupos.join(', ')} RETURNING ${retornar}`,
      params,
    );
    resultado.push(...rows);
  }
  return resultado;
}

// ---------------------------------------------------------------------------
//  Catálogos de datos verosímiles
// ---------------------------------------------------------------------------

const NOMBRES = ['Alejandro', 'Mariana', 'Ricardo', 'Fernanda', 'Javier', 'Paulina', 'Sergio', 'Daniela', 'Emilio', 'Regina', 'Óscar', 'Valeria', 'Héctor', 'Ximena', 'Rodrigo', 'Andrea', 'Iván', 'Carolina', 'Gerardo', 'Sofía', 'Arturo', 'Gabriela', 'Manuel', 'Renata', 'Eduardo', 'Alejandra', 'Marco', 'Lucía', 'Raúl', 'Isabel', 'Ernesto', 'Claudia', 'Diego', 'Verónica', 'Salvador', 'Adriana', 'Joaquín', 'Patricia', 'Tomás', 'Elena', 'Bruno', 'Natalia', 'Felipe', 'Mónica', 'Alberto', 'Cecilia'];
const APELLIDOS = ['Treviño', 'Garza', 'Villarreal', 'Cantú', 'Guerra', 'Ramírez', 'Hernández', 'González', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Flores', 'Rivera', 'Torres', 'Domínguez', 'Cárdenas', 'Zúñiga', 'Elizondo', 'Sepúlveda', 'Ibarra', 'Salinas', 'Montemayor', 'Ochoa', 'Aguilar', 'Robles', 'Mendoza', 'Vega', 'Chávez', 'Núñez', 'Padilla', 'Escobedo', 'Lozano', 'Reyna', 'Alanís', 'Quiroga', 'Barrera', 'Fuentes', 'Maldonado', 'Peña'];

const GIROS = [
  { tipo: 'Aceros',        industria: 'Manufactura' },
  { tipo: 'Autopartes',    industria: 'Automotriz' },
  { tipo: 'Empaques',      industria: 'Manufactura' },
  { tipo: 'Plásticos',     industria: 'Manufactura' },
  { tipo: 'Alimentos',     industria: 'Alimentos y Bebidas' },
  { tipo: 'Bebidas',       industria: 'Alimentos y Bebidas' },
  { tipo: 'Textiles',      industria: 'Textil' },
  { tipo: 'Químicos',      industria: 'Química' },
  { tipo: 'Electrónica',   industria: 'Electrónica' },
  { tipo: 'Farmacéutica',  industria: 'Farmacéutica' },
  { tipo: 'Muebles',       industria: 'Manufactura' },
  { tipo: 'Cementos',      industria: 'Construcción' },
  { tipo: 'Herrajes',      industria: 'Manufactura' },
  { tipo: 'Cables',        industria: 'Manufactura' },
  { tipo: 'Papel',         industria: 'Manufactura' },
  { tipo: 'Pinturas',      industria: 'Química' },
  { tipo: 'Vidrios',       industria: 'Construcción' },
  { tipo: 'Agroproductos', industria: 'Agroindustria' },
  { tipo: 'Refacciones',   industria: 'Automotriz' },
  { tipo: 'Comercializadora', industria: 'Retail' },
  { tipo: 'Distribuidora', industria: 'Retail' },
  { tipo: 'Logística',     industria: 'Logística 3PL' },
];

const NUCLEOS = ['del Norte', 'Regiomontana', 'de México', 'del Bajío', 'Anáhuac', 'Cumbres', 'Monarca', 'Delta', 'Titán', 'Prisma', 'Vanguardia', 'Meridiano', 'Bravo', 'Zenit', 'Cóndor', 'Quetzal', 'Nogal', 'Encino', 'Altamira', 'San Jerónimo', 'Valle Alto', 'Pacífico', 'del Golfo', 'Sierra Madre', 'Aztlán', 'Continental', 'Peninsular', 'Metropolitana'];
const SUFIJOS = ['S.A. de C.V.', 'S. de R.L. de C.V.', 'S.A.P.I. de C.V.'];

const PLAZAS = [
  { ciudad: 'Monterrey', estado: 'Nuevo León', zona: 'MTY', peso: 12 },
  { ciudad: 'Apodaca', estado: 'Nuevo León', zona: 'MTY', peso: 8 },
  { ciudad: 'Santa Catarina', estado: 'Nuevo León', zona: 'MTY', peso: 6 },
  { ciudad: 'San Nicolás de los Garza', estado: 'Nuevo León', zona: 'MTY', peso: 6 },
  { ciudad: 'García', estado: 'Nuevo León', zona: 'MTY', peso: 4 },
  { ciudad: 'Guadalupe', estado: 'Nuevo León', zona: 'MTY', peso: 4 },
  { ciudad: 'Saltillo', estado: 'Coahuila', zona: 'MTY', peso: 4 },
  { ciudad: 'Ramos Arizpe', estado: 'Coahuila', zona: 'MTY', peso: 3 },
  { ciudad: 'Ciudad de México', estado: 'Ciudad de México', zona: 'CDMX', peso: 12 },
  { ciudad: 'Tlalnepantla', estado: 'Estado de México', zona: 'CDMX', peso: 7 },
  { ciudad: 'Naucalpan', estado: 'Estado de México', zona: 'CDMX', peso: 6 },
  { ciudad: 'Cuautitlán Izcalli', estado: 'Estado de México', zona: 'CDMX', peso: 5 },
  { ciudad: 'Toluca', estado: 'Estado de México', zona: 'CDMX', peso: 4 },
  { ciudad: 'Querétaro', estado: 'Querétaro', zona: 'CDMX', peso: 5 },
  { ciudad: 'Puebla', estado: 'Puebla', zona: 'CDMX', peso: 3 },
  { ciudad: 'Silao', estado: 'Guanajuato', zona: 'CDMX', peso: 3 },
  { ciudad: 'León', estado: 'Guanajuato', zona: 'CDMX', peso: 2 },
  { ciudad: 'San Luis Potosí', estado: 'San Luis Potosí', zona: 'CDMX', peso: 2 },
  { ciudad: 'Guadalajara', estado: 'Jalisco', zona: 'CDMX', peso: 2 },
  { ciudad: 'Reynosa', estado: 'Tamaulipas', zona: 'MTY', peso: 2 },
];

const PLAZAS_PONDERADAS = PLAZAS.flatMap((p) => Array(p.peso).fill(p));

const PUESTOS = ['Gerente de Logística', 'Director de Operaciones', 'Jefe de Almacén', 'Coordinador de Embarques', 'Gerente de Compras', 'Director de Cadena de Suministro', 'Analista de Transporte', 'Gerente de Planta', 'Jefe de Tráfico', 'Comprador Senior', 'Director General', 'Gerente de Distribución'];

const ORIGENES = ['sitio_web', 'referido', 'llamada_entrante', 'linkedin', 'campana_email', 'feria_industrial', 'google_ads', 'whatsapp', 'recomendacion_cliente', 'base_frio'];

const COMPETIDORES = ['Paquetexpress', 'Estafeta Carga', 'Transportes Castores', 'TUM', 'Fletes México', 'Grupo Senda Carga', 'Ryder', 'Transportadora Egoba'];

const ETIQUETAS_CUENTA = ['alto_volumen', 'cuenta_clave', 'pago_puntual', 'requiere_maniobras', 'temporada_alta', 'multi_sitio', 'contrato_anual', 'sensible_precio', 'exporta', 'refrigerado'];

const MENSAJES_LEAD = [
  'Necesitamos cotizar traslados semanales de tarimas de Monterrey a la Ciudad de México, urgente para este mes.',
  'Buenas tardes, quisiera saber precios de flete consolidado hacia CDMX. Manejamos 4 tarimas por semana.',
  'Estamos comparando proveedores para nuestra ruta Monterrey–Toluca. ¿Manejan tráiler completo?',
  'Requiero servicio de última milla en el área metropolitana de Monterrey, entregas diarias.',
  'Nos vence el contrato con nuestro transportista actual y queremos renovar con otra opción.',
  'Manejamos producto perecedero, necesitamos cadena de frío MTY–CDMX. ¿Tienen unidades refrigeradas?',
  'Solicito cotización para almacenaje en bodega y cross-docking en Apodaca.',
  'Buen día, me interesa información general de sus servicios. Estamos explorando opciones a futuro.',
  'Tenemos un embarque de maquinaria sobredimensionada, es un proyecto único. ¿Lo pueden manejar?',
  'Necesito paquetería express, envíos pequeños pero muy frecuentes. ¿Cuánto cuesta?',
  'Nos recomendaron con ustedes. Movemos 12 tráileres al mes y buscamos mejor tiempo de tránsito.',
  'Queremos consolidar nuestros embarques con un solo proveedor. Somos planta automotriz en Ramos Arizpe.',
];

const NECESIDADES = ['Ruta MTY–CDMX semanal', 'Tráiler completo mensual', 'Última milla metropolitana', 'Almacenaje y resguardo', 'Cadena de frío', 'Paquetería express', 'Cross-docking', 'Servicio dedicado', 'Carga de proyecto', 'Consolidado LTL'];

// `cantidad` es el rango de unidades que se contratan en una operación anualizada:
// una oportunidad de flete se cotiza por volumen comprometido, no por un embarque
// suelto. Respetar la unidad de medida es lo que mantiene los montos creíbles.
const PRODUCTOS = [
  { sku: 'FT-LTL',  nombre: 'Consolidado LTL MTY–CDMX', categoria: 'Transporte terrestre', precio_base: 980_00,     costo_base: 640_00,     unidad: 'embarque', cantidad: [40, 300], recurrente: false, descripcion: 'Carga consolidada en la ruta troncal Monterrey–Ciudad de México con salidas diarias y trazabilidad por guía.' },
  { sku: 'FT-FTL',  nombre: 'Full Truck Load (tráiler completo)', categoria: 'Transporte terrestre', precio_base: 3_850_00, costo_base: 2_720_00, unidad: 'viaje', cantidad: [10, 90], recurrente: false, descripcion: 'Unidad completa dedicada punto a punto, caja seca de 53 pies con GPS y sello de seguridad.' },
  { sku: 'FT-UM',   nombre: 'Última milla metropolitana', categoria: 'Distribución', precio_base: 240_00, costo_base: 155_00, unidad: 'entrega', cantidad: [200, 2400], recurrente: false, descripcion: 'Reparto capilar en zona metropolitana con evidencia de entrega digital.' },
  { sku: 'FT-ALM',  nombre: 'Almacenaje en bodega', categoria: 'Almacenaje', precio_base: 420_00, costo_base: 230_00, unidad: 'tarima/mes', cantidad: [40, 400], recurrente: true, descripcion: 'Resguardo en bodega con control de inventario y ventanas de recolección programadas.' },
  { sku: 'FT-REF',  nombre: 'Carga refrigerada', categoria: 'Especializado', precio_base: 5_200_00, costo_base: 3_900_00, unidad: 'viaje', cantidad: [6, 60], recurrente: false, descripcion: 'Cadena de frío con registro continuo de temperatura y respaldo de unidad.' },
  { sku: 'FT-EXP',  nombre: 'Paquetería express', categoria: 'Distribución', precio_base: 115_00, costo_base: 68_00, unidad: 'paquete', cantidad: [300, 3800], recurrente: false, descripcion: 'Envíos urgentes de bajo volumen con entrega al día siguiente entre plazas.' },
  { sku: 'FT-XD',   nombre: 'Cross-docking', categoria: 'Almacenaje', precio_base: 680_00, costo_base: 390_00, unidad: 'maniobra', cantidad: [20, 200], recurrente: false, descripcion: 'Transbordo directo sin almacenaje intermedio para reducir días de inventario.' },
  { sku: 'FT-DED',  nombre: 'Servicio dedicado mensual', categoria: 'Transporte terrestre', precio_base: 18_500_00, costo_base: 13_200_00, unidad: 'unidad/mes', cantidad: [2, 10], recurrente: true, descripcion: 'Unidad y operador asignados en exclusiva a la operación del cliente.' },
  { sku: 'FT-PROY', nombre: 'Carga de proyecto y sobredimensionada', categoria: 'Especializado', precio_base: 14_500_00, costo_base: 10_400_00, unidad: 'proyecto', cantidad: [1, 5], recurrente: false, descripcion: 'Maniobras especiales, permisos y escolta para carga fuera de dimensión.' },
  { sku: 'FT-ADU',  nombre: 'Despacho aduanal y tránsito', categoria: 'Comercio exterior', precio_base: 2_750_00, costo_base: 1_820_00, unidad: 'operación', cantidad: [4, 40], recurrente: false, descripcion: 'Coordinación de cruce, despacho y tránsito internacional puerta a puerta.' },
];

const CATEGORIAS_TICKET = ['Retraso en entrega', 'Daño en mercancía', 'Facturación', 'Cotización', 'Recolección no realizada', 'Documentación', 'Cambio de domicilio', 'Estatus de embarque', 'Reclamación', 'Solicitud de maniobra'];

const ASUNTOS_TICKET = {
  'Retraso en entrega': ['Embarque no llegó en la fecha comprometida', 'Unidad detenida sin aviso', 'Entrega fuera de ventana acordada'],
  'Daño en mercancía': ['Tarima con producto dañado al recibir', 'Empaque roto en dos cajas', 'Producto húmedo a la llegada'],
  'Facturación': ['Factura con RFC incorrecto', 'Falta complemento de pago', 'Solicito refacturación del mes'],
  'Cotización': ['Necesito cotización urgente MTY–CDMX', 'Solicito tarifa para volumen adicional', 'Cotización de servicio refrigerado'],
  'Recolección no realizada': ['No pasaron por la recolección programada', 'Unidad no llegó a planta', 'Recolección reprogramada sin avisar'],
  'Documentación': ['Falta carta porte del embarque', 'Requiero evidencia de entrega firmada', 'Solicito copia de guía'],
  'Cambio de domicilio': ['Cambio de dirección de entrega', 'Actualizar domicilio fiscal', 'Nuevo punto de recolección'],
  'Estatus de embarque': ['¿Dónde va mi guía?', 'Sin actualización de rastreo', 'Confirmar hora estimada de llegada'],
  'Reclamación': ['Reclamación formal por pérdida parcial', 'Solicito reembolso por incumplimiento', 'Inconformidad con el servicio del mes'],
  'Solicitud de maniobra': ['Requiero maniobra de descarga con montacargas', 'Necesito personal extra para descarga', 'Solicito rampa en destino'],
};

const CAMPANAS = [
  { nombre: 'Corredor MTY–CDMX · Salidas diarias', tipo: 'email', canal: 'Email', meses: 17 },
  { nombre: 'Expo Logística Monterrey', tipo: 'evento', canal: 'Evento', meses: 15 },
  { nombre: 'Google Ads · Flete consolidado', tipo: 'paid', canal: 'Google Ads', meses: 14 },
  { nombre: 'LinkedIn · Directores de cadena de suministro', tipo: 'social', canal: 'LinkedIn', meses: 12 },
  { nombre: 'Webinar · Reducir costo logístico 2025', tipo: 'webinar', canal: 'Webinar', meses: 11 },
  { nombre: 'Programa de referidos industriales', tipo: 'referido', canal: 'Referidos', meses: 10 },
  { nombre: 'Cadena de frío para farmacéutica', tipo: 'email', canal: 'Email', meses: 8 },
  { nombre: 'Retargeting visitantes de precios', tipo: 'paid', canal: 'Meta Ads', meses: 7 },
  { nombre: 'Guía descargable · Carta Porte 3.0', tipo: 'contenido', canal: 'Contenido', meses: 6 },
  { nombre: 'Expo Manufactura Saltillo', tipo: 'evento', canal: 'Evento', meses: 5 },
  { nombre: 'Telemarketing · Parques industriales Apodaca', tipo: 'telemarketing', canal: 'Telemarketing', meses: 4 },
  { nombre: 'Temporada alta · Buen Fin logístico', tipo: 'email', canal: 'Email', meses: 3 },
  { nombre: 'Última milla para e-commerce', tipo: 'social', canal: 'Instagram', meses: 2 },
  { nombre: 'Reactivación de cuentas inactivas', tipo: 'email', canal: 'Email', meses: 1 },
];

const ARTICULOS_KB = [
  { titulo: '¿Cómo rastreo mi guía?', categoria: 'Rastreo', cuerpo: 'Ingresa el número de guía en la página de rastreo. Las guías que salen de Monterrey inician con AN y las que salen de la Ciudad de México con BN. El estatus se actualiza en cada escaneo de bodega, salida, ruta de entrega y entrega final.' },
  { titulo: 'Tiempos de tránsito MTY ↔ CDMX', categoria: 'Servicio', cuerpo: 'El consolidado LTL tiene un tránsito comprometido de 24 a 36 horas entre plazas. El tráiler completo se maneja en 18 a 24 horas directo. La última milla en zona metropolitana se realiza el mismo día si la carga llega antes de las 09:00.' },
  { titulo: 'Requisitos de Carta Porte 3.0', categoria: 'Documentación', cuerpo: 'Todo embarque requiere complemento Carta Porte con clave de producto, peso en kilogramos, unidad de medida y domicilios completos de origen y destino. Sin estos datos el embarque no puede salir a ruta.' },
  { titulo: 'Política de maniobras de carga y descarga', categoria: 'Operación', cuerpo: 'La tarifa incluye maniobra de piso en andén. Maniobras con montacargas, rampa o personal adicional se cotizan aparte y deben solicitarse con 24 horas de anticipación.' },
  { titulo: 'Cómo levantar una reclamación por daño', categoria: 'Reclamaciones', cuerpo: 'La reclamación debe presentarse dentro de las 48 horas posteriores a la entrega, con fotografías del empaque, evidencia de entrega firmada con observaciones y factura del producto. El dictamen se emite en 5 días hábiles.' },
  { titulo: 'Ventanas de recolección programada', categoria: 'Operación', cuerpo: 'Las recolecciones se programan en ventanas de tres horas. Si la carga no está lista al llegar la unidad, se documenta el intento y se reprograma para el siguiente día hábil.' },
  { titulo: 'Manejo de carga refrigerada', categoria: 'Especializado', cuerpo: 'Las unidades refrigeradas operan entre -18 °C y 8 °C según el producto. Se entrega registro continuo de temperatura y se cuenta con unidad de respaldo en la ruta troncal.' },
  { titulo: 'Condiciones de crédito y facturación', categoria: 'Facturación', cuerpo: 'Las cuentas nuevas operan de contado los primeros tres meses. A partir del cuarto mes se puede solicitar crédito de 15 o 30 días previa validación. La facturación se emite semanalmente.' },
  { titulo: 'Cobertura de seguro de la carga', categoria: 'Servicio', cuerpo: 'La responsabilidad del transportista cubre hasta el equivalente en pesos de la carga declarada según la Ley de Caminos. Para valores mayores se recomienda seguro complementario, que se puede contratar por embarque.' },
  { titulo: 'Cómo solicitar una cotización', categoria: 'Comercial', cuerpo: 'Para cotizar necesitamos origen, destino, número de tarimas o peso, dimensiones, tipo de producto y frecuencia estimada. Con esos datos la tarifa se entrega el mismo día hábil.' },
  { titulo: 'Servicio dedicado: cómo funciona', categoria: 'Especializado', cuerpo: 'Se asigna una unidad y un operador en exclusiva a la operación del cliente, con tarifa mensual fija e itinerario acordado. Incluye reporte mensual de kilómetros y cumplimiento.' },
  { titulo: 'Restricciones de circulación en CDMX', categoria: 'Operación', cuerpo: 'La circulación de unidades de carga en la Ciudad de México está restringida en horarios y corredores específicos. Las entregas en zona centro se programan de 22:00 a 06:00 para cumplir la normativa.' },
];

// ---------------------------------------------------------------------------
//  Generación
// ---------------------------------------------------------------------------

const nombrePersona = () => `${elegir(NOMBRES)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`;
const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const correoDe = (nombre, dominio) => {
  const [pila, ap] = sinAcentos(nombre).toLowerCase().split(' ');
  return `${pila}.${ap}@${dominio}`;
};
const dominioDe = (empresa) =>
  `${sinAcentos(empresa).toLowerCase().replace(/s\.a\.?.*$|s\. de r\.l\..*$/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 18)}.com.mx`;
const telefono = () => `${elegir(['81', '55', '442', '844'])} ${entre(1000, 9999)} ${entre(1000, 9999)}`;
const rfc = () => `${sinAcentos(elegir(APELLIDOS)).slice(0, 3).toUpperCase()}${entre(80, 99)}${String(entre(1, 12)).padStart(2, '0')}${String(entre(10, 28))}${elegir(['A1', 'B2', 'C3', 'D4', 'X9'])}`;

async function sembrar() {
  const t0 = Date.now();
  console.log('[semilla] generando 18 meses de historia comercial…');

  // ---------------------------------------------------------------- equipos
  const equipos = await insertar('equipos', ['nombre', 'zona'], [
    { nombre: 'Equipo Monterrey', zona: 'MTY' },
    { nombre: 'Equipo Valle de México', zona: 'CDMX' },
    { nombre: 'Cuentas Nacionales', zona: 'NACIONAL' },
  ], { retornar: 'id, nombre, zona' });
  const eqMTY = equipos[0].id;
  const eqCDMX = equipos[1].id;
  const eqNAC = equipos[2].id;

  // --------------------------------------------------------------- usuarios
  const hash = hashPassword(config.semilla.passwordDemo);
  const defUsuarios = [
    { email: 'sistemas1@fletestauro.com.mx', nombre: 'Sistemas · Fletes Tauro', rol: 'admin', puesto: 'Dirección de Sistemas', zona: 'AMBAS', equipo_id: eqNAC, meta: 0 },
    { email: 'mariana.trevino@fletestauro.com.mx', nombre: 'Mariana Treviño Garza', rol: 'gerente', puesto: 'Gerente Comercial Monterrey', zona: 'MTY', equipo_id: eqMTY, meta: 520_000_00 },
    { email: 'ricardo.elizondo@fletestauro.com.mx', nombre: 'Ricardo Elizondo Salinas', rol: 'gerente', puesto: 'Gerente Comercial Valle de México', zona: 'CDMX', equipo_id: eqCDMX, meta: 480_000_00 },
    { email: 'fernanda.cantu@fletestauro.com.mx', nombre: 'Fernanda Cantú Villarreal', rol: 'ejecutivo', puesto: 'Ejecutiva de Cuenta Senior', zona: 'MTY', equipo_id: eqMTY, meta: 360_000_00 },
    { email: 'javier.sepulveda@fletestauro.com.mx', nombre: 'Javier Sepúlveda Ibarra', rol: 'ejecutivo', puesto: 'Ejecutivo de Cuenta', zona: 'MTY', equipo_id: eqMTY, meta: 300_000_00 },
    { email: 'paulina.dominguez@fletestauro.com.mx', nombre: 'Paulina Domínguez Reyna', rol: 'ejecutivo', puesto: 'Ejecutiva de Cuenta Senior', zona: 'CDMX', equipo_id: eqCDMX, meta: 340_000_00 },
    { email: 'emilio.zuniga@fletestauro.com.mx', nombre: 'Emilio Zúñiga Montemayor', rol: 'ejecutivo', puesto: 'Ejecutivo de Cuenta', zona: 'CDMX', equipo_id: eqCDMX, meta: 290_000_00 },
    { email: 'regina.ochoa@fletestauro.com.mx', nombre: 'Regina Ochoa Lozano', rol: 'ejecutivo', puesto: 'Ejecutiva de Cuentas Nacionales', zona: 'AMBAS', equipo_id: eqNAC, meta: 420_000_00 },
    { email: 'oscar.alanis@fletestauro.com.mx', nombre: 'Óscar Alanís Guerra', rol: 'ejecutivo', puesto: 'Ejecutivo de Nuevos Negocios', zona: 'MTY', equipo_id: eqMTY, meta: 250_000_00 },
    { email: 'valeria.robles@fletestauro.com.mx', nombre: 'Valeria Robles Mendoza', rol: 'marketing', puesto: 'Coordinadora de Marketing', zona: 'AMBAS', equipo_id: eqNAC, meta: 0 },
    { email: 'hector.padilla@fletestauro.com.mx', nombre: 'Héctor Padilla Escobedo', rol: 'soporte', puesto: 'Atención a Clientes', zona: 'MTY', equipo_id: eqMTY, meta: 0 },
    { email: 'ximena.vega@fletestauro.com.mx', nombre: 'Ximena Vega Chávez', rol: 'soporte', puesto: 'Atención a Clientes', zona: 'CDMX', equipo_id: eqCDMX, meta: 0 },
  ];

  const usuarios = await insertar('usuarios',
    ['email', 'nombre', 'password_hash', 'rol', 'puesto', 'telefono', 'zona', 'equipo_id', 'avatar_tono', 'meta_mensual', 'creado_en', 'ultimo_acceso'],
    defUsuarios.map((u, i) => ({
      email: u.email, nombre: u.nombre, password_hash: hash, rol: u.rol, puesto: u.puesto,
      telefono: telefono(), zona: u.zona, equipo_id: u.equipo_id, avatar_tono: i % 6,
      meta_mensual: u.meta, creado_en: INICIO, ultimo_acceso: sumarDias(AHORA, -entre(0, 2)),
    })),
    { retornar: 'id, nombre, email, rol, zona, equipo_id, meta_mensual' },
  );

  const vendedores = usuarios.filter((u) => ['gerente', 'ejecutivo'].includes(u.rol));
  const soporte = usuarios.filter((u) => u.rol === 'soporte');
  const marketing = usuarios.find((u) => u.rol === 'marketing');
  const admin = usuarios.find((u) => u.rol === 'admin');

  // ------------------------------------------------------------------ metas
  const metas = [];
  for (let m = 0; m < 18; m += 1) {
    const periodo = sumarMeses(inicioMes(AHORA), -17 + m);
    for (const v of vendedores) {
      // La meta crece ~1.5 % mensual: refleja un plan comercial real.
      const factor = 1 + m * 0.015;
      metas.push({ usuario_id: v.id, equipo_id: null, periodo: isoFecha(periodo), tipo: 'ingresos', objetivo: Math.round(v.meta_mensual * factor) });
      metas.push({ usuario_id: v.id, equipo_id: null, periodo: isoFecha(periodo), tipo: 'reuniones', objetivo: 12 });
      metas.push({ usuario_id: v.id, equipo_id: null, periodo: isoFecha(periodo), tipo: 'llamadas', objetivo: 60 });
      metas.push({ usuario_id: v.id, equipo_id: null, periodo: isoFecha(periodo), tipo: 'cotizaciones', objetivo: 10 });
    }
  }
  await insertar('metas', ['usuario_id', 'equipo_id', 'periodo', 'tipo', 'objetivo'], metas);

  // -------------------------------------------------------------- productos
  const productos = await insertar('productos',
    ['sku', 'nombre', 'descripcion', 'categoria', 'unidad', 'precio_base', 'costo_base', 'margen_meta', 'volumen_mensual', 'recurrente'],
    PRODUCTOS.map(({ cantidad, ...p }) => ({
      ...p,
      margen_meta: Math.round(((p.precio_base - p.costo_base) / p.precio_base) * 100),
      // El rango de cantidad es anualizado; el volumen mensual típico es su mediana / 12.
      volumen_mensual: Math.max(1, Math.round((cantidad[0] + cantidad[1]) / 2 / 12)),
    })),
    { retornar: 'id, sku, nombre, precio_base, costo_base, volumen_mensual, recurrente' },
  );
  const porSku = Object.fromEntries(productos.map((p) => [p.sku, p]));
  // El rango de cantidades no se persiste (es criterio de generación), así que se
  // adjunta aquí para poder dimensionar las líneas de cada oportunidad.
  for (const def of PRODUCTOS) porSku[def.sku].cantidad = def.cantidad;

  // --------------------------------------------------------------- campañas
  const campanas = await insertar('campanas',
    ['nombre', 'tipo', 'estado', 'canal', 'presupuesto', 'costo', 'meta_leads', 'inicia_en', 'termina_en', 'utm_source', 'utm_medium', 'utm_campaign', 'responsable_id', 'descripcion', 'creado_en'],
    CAMPANAS.map((c) => {
      const inicia = sumarMeses(inicioMes(AHORA), -c.meses);
      const termina = sumarMeses(inicia, entre(1, 3));
      const presupuesto = entre(25, 320) * 1000_00;
      const activa = termina > AHORA;
      return {
        nombre: c.nombre, tipo: c.tipo, estado: activa ? 'activa' : 'finalizada', canal: c.canal,
        presupuesto, costo: Math.round(presupuesto * decimal(activa ? 0.35 : 0.82, activa ? 0.7 : 1.05)),
        meta_leads: entre(15, 90), inicia_en: isoFecha(inicia), termina_en: isoFecha(termina),
        utm_source: sinAcentos(c.canal).toLowerCase().replace(/\s+/g, '_'), utm_medium: c.tipo,
        utm_campaign: sinAcentos(c.nombre).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40),
        responsable_id: marketing.id, descripcion: `Campaña de ${c.tipo} enfocada en generar demanda para la ruta troncal y servicios complementarios.`,
        creado_en: inicia,
      };
    }),
    { retornar: 'id, nombre, tipo, costo, inicia_en, termina_en' },
  );

  // --------------------------------------------------------------- segmentos
  await insertar('segmentos', ['nombre', 'descripcion', 'entidad', 'definicion', 'dinamico', 'total_cache'], [
    { nombre: 'Leads calientes sin contactar', descripcion: 'Score ≥ 70 y todavía en etapa inicial.', entidad: 'lead', definicion: JSON.stringify({ reglas: [{ campo: 'score', op: '>=', valor: 70 }, { campo: 'etapa', op: 'en', valor: ['lead', 'contacto'] }] }), dinamico: true, total_cache: 0 },
    { nombre: 'Manufactura corporativa', descripcion: 'Industria manufactura, empresa grande o corporativo.', entidad: 'cuenta', definicion: JSON.stringify({ reglas: [{ campo: 'industria', op: '=', valor: 'Manufactura' }, { campo: 'tamano', op: 'en', valor: ['grande', 'corporativo'] }] }), dinamico: true, total_cache: 0 },
    { nombre: 'Clientes en riesgo de fuga', descripcion: 'Riesgo de churn ≥ 55.', entidad: 'cuenta', definicion: JSON.stringify({ reglas: [{ campo: 'riesgo_churn', op: '>=', valor: 55 }, { campo: 'tipo', op: '=', valor: 'cliente' }] }), dinamico: true, total_cache: 0 },
    { nombre: 'Corredor MTY', descripcion: 'Cuentas en Nuevo León y Coahuila.', entidad: 'cuenta', definicion: JSON.stringify({ reglas: [{ campo: 'estado', op: 'en', valor: ['Nuevo León', 'Coahuila'] }] }), dinamico: true, total_cache: 0 },
    { nombre: 'Alimentos y farmacéutica', descripcion: 'Candidatos naturales a cadena de frío.', entidad: 'cuenta', definicion: JSON.stringify({ reglas: [{ campo: 'industria', op: 'en', valor: ['Alimentos y Bebidas', 'Farmacéutica'] }] }), dinamico: true, total_cache: 0 },
    { nombre: 'Cuentas inactivas 90 días', descripcion: 'Sin actividad registrada en tres meses.', entidad: 'cuenta', definicion: JSON.stringify({ reglas: [{ campo: 'tipo', op: '=', valor: 'inactivo' }] }), dinamico: true, total_cache: 0 },
  ]);

  // ------------------------------------------------------------------ envíos
  const envios = [];
  for (const c of campanas.filter((c) => ['email'].includes(c.tipo) || quizas(0.4))) {
    const n = entre(1, 3);
    for (let i = 0; i < n; i += 1) {
      const enviados = entre(400, 5200);
      const entregados = Math.round(enviados * decimal(0.94, 0.99));
      const abiertos = Math.round(entregados * decimal(0.18, 0.52));
      const clics = Math.round(abiertos * decimal(0.08, 0.31));
      envios.push({
        campana_id: c.id, nombre: `${c.nombre} · envío ${i + 1}`,
        asunto: elegir([
          'Salidas diarias MTY–CDMX con tránsito de 24 h',
          'Su carga con trazabilidad en tiempo real',
          '¿Cuánto le cuesta un día de inventario detenido?',
          'Tarifas de consolidado para el próximo trimestre',
          'Cadena de frío certificada en la ruta troncal',
        ]),
        plantilla: elegir(['corredor-troncal', 'caso-exito', 'tarifas-trimestre', 'frio-certificado']),
        estado: 'enviado', enviados, entregados, abiertos, clics,
        rebotes: enviados - entregados, bajas: Math.round(entregados * decimal(0.001, 0.008)),
        respuestas: Math.round(clics * decimal(0.05, 0.22)),
        enviado_en: fechaEntre(new Date(c.inicia_en), new Date(Math.min(new Date(c.termina_en).getTime(), AHORA.getTime()))),
      });
    }
  }
  await insertar('envios_email', ['campana_id', 'nombre', 'asunto', 'plantilla', 'estado', 'enviados', 'entregados', 'abiertos', 'clics', 'rebotes', 'bajas', 'respuestas', 'enviado_en'], envios);

  // ---------------------------------------------------------- landing pages
  await insertar('landing_pages', ['nombre', 'slug', 'campana_id', 'estado', 'visitas', 'conversiones', 'creado_en'],
    [
      { nombre: 'Cotiza tu flete MTY–CDMX', slug: 'cotiza-mty-cdmx', campana_id: campanas[0].id, visitas: 8420, conversiones: 386 },
      { nombre: 'Guía Carta Porte 3.0', slug: 'guia-carta-porte', campana_id: campanas[8].id, visitas: 5130, conversiones: 512 },
      { nombre: 'Webinar costo logístico', slug: 'webinar-costo-logistico', campana_id: campanas[4].id, visitas: 2760, conversiones: 341 },
      { nombre: 'Cadena de frío farmacéutica', slug: 'cadena-frio-farma', campana_id: campanas[6].id, visitas: 1890, conversiones: 97 },
      { nombre: 'Última milla e-commerce', slug: 'ultima-milla-ecommerce', campana_id: campanas[12].id, visitas: 3210, conversiones: 174 },
    ].map((l) => ({ ...l, estado: 'publicada', creado_en: sumarDias(AHORA, -entre(60, 400)) })),
  );

  // ----------------------------------------------------------------- cuentas
  const nombresUsados = new Set();
  const defCuentas = [];
  for (let i = 0; i < 142; i += 1) {
    const giro = elegir(GIROS);
    let nombre;
    let intentos = 0;
    do {
      const patron = rnd();
      if (patron < 0.5) nombre = `${giro.tipo} ${elegir(NUCLEOS)}`;
      else if (patron < 0.75) nombre = `Grupo ${giro.tipo} ${elegir(NUCLEOS)}`;
      else if (patron < 0.9) nombre = `${giro.tipo} ${elegir(APELLIDOS)}`;
      else nombre = `Corporativo ${elegir(NUCLEOS)}`;
      intentos += 1;
    } while (nombresUsados.has(nombre) && intentos < 40);
    if (nombresUsados.has(nombre)) nombre = `${nombre} ${i}`;
    nombresUsados.add(nombre);

    const plaza = elegir(PLAZAS_PONDERADAS);
    // Distribución de tamaño: pocas corporativas, muchas medianas.
    const r = rnd();
    const tamano = r < 0.08 ? 'corporativo' : r < 0.3 ? 'grande' : r < 0.68 ? 'mediana' : r < 0.92 ? 'pequena' : 'micro';
    // 78 % clientes activos, 13 % prospectos, 9 % inactivos.
    const rt = rnd();
    const tipo = rt < 0.78 ? 'cliente' : rt < 0.91 ? 'prospecto' : 'inactivo';
    const propietario = elegir(
      tamano === 'corporativo'
        ? vendedores.filter((v) => v.rol === 'gerente' || v.zona === 'AMBAS')
        : vendedores.filter((v) => v.zona === plaza.zona || v.zona === 'AMBAS'),
    );
    const creado = fechaEntre(sumarMeses(INICIO, -18), sumarDias(AHORA, -20));
    const clienteDesde = tipo !== 'prospecto' ? sumarDias(creado, entre(5, 60)) : null;

    defCuentas.push({
      nombre: `${nombre} ${elegir(SUFIJOS)}`,
      nombre_comercial: nombre,
      rfc: rfc(),
      industria: giro.industria,
      tamano,
      sitio_web: `https://www.${dominioDe(nombre)}`,
      telefono: telefono(),
      email: `contacto@${dominioDe(nombre)}`,
      calle: `${elegir(['Av. Industrial', 'Carretera Nacional', 'Blvd. Díaz Ordaz', 'Av. Constitución', 'Calle Norte', 'Av. de la Juventud', 'Circuito Interior', 'Av. Central'])} ${entre(100, 9800)}`,
      ciudad: plaza.ciudad,
      estado: plaza.estado,
      codigo_postal: String(entre(64000, 67999)),
      tipo,
      propietario_id: propietario.id,
      dias_credito: tipo === 'cliente' ? elegir([0, 0, 15, 15, 30, 30, 45]) : 0,
      origen: elegir(ORIGENES),
      etiquetas: elegirVarios(ETIQUETAS_CUENTA, entre(0, 3)),
      cliente_desde: clienteDesde ? isoFecha(clienteDesde) : null,
      creado_en: creado,
      actualizado_en: creado,
      _zona: plaza.zona,
      _giro: giro,
    });
  }

  const cuentas = await insertar('cuentas',
    ['nombre', 'nombre_comercial', 'rfc', 'industria', 'tamano', 'sitio_web', 'telefono', 'email', 'calle', 'ciudad', 'estado', 'codigo_postal', 'tipo', 'propietario_id', 'dias_credito', 'origen', 'etiquetas', 'cliente_desde', 'creado_en', 'actualizado_en'],
    defCuentas,
    { retornar: 'id, nombre, nombre_comercial, tipo, tamano, industria, estado, propietario_id, creado_en, cliente_desde' },
  );
  // Reunir los metadatos auxiliares con las filas devueltas.
  cuentas.forEach((c, i) => {
    c._zona = defCuentas[i]._zona;
    c._giro = defCuentas[i]._giro;
    c._dominio = dominioDe(defCuentas[i].nombre_comercial);
  });

  // --------------------------------------------------------------- contactos
  const defContactos = [];
  for (const cta of cuentas) {
    const n = cta.tamano === 'corporativo' ? entre(3, 5) : cta.tamano === 'grande' ? entre(2, 4) : entre(1, 3);
    const roles = ['decisor', 'influenciador', 'usuario'];
    for (let i = 0; i < n; i += 1) {
      const nombre = nombrePersona();
      defContactos.push({
        cuenta_id: cta.id,
        nombre,
        puesto: elegir(PUESTOS),
        email: correoDe(nombre, cta._dominio),
        telefono: telefono(),
        whatsapp: quizas(0.6) ? telefono() : null,
        linkedin: quizas(0.35) ? `https://linkedin.com/in/${sinAcentos(nombre).toLowerCase().replace(/\s+/g, '-')}` : null,
        es_principal: i === 0,
        // El primer contacto suele ser el decisor; los bloqueadores son minoría.
        rol_compra: i === 0 ? (quizas(0.62) ? 'decisor' : 'influenciador') : quizas(0.12) ? 'bloqueador' : quizas(0.22) ? 'campeon' : elegir(roles),
        creado_en: sumarDias(cta.creado_en, entre(0, 10)),
      });
    }
  }
  const contactos = await insertar('contactos',
    ['cuenta_id', 'nombre', 'puesto', 'email', 'telefono', 'whatsapp', 'linkedin', 'es_principal', 'rol_compra', 'creado_en'],
    defContactos, { retornar: 'id, cuenta_id, nombre, email, rol_compra, es_principal' });

  const contactosPorCuenta = new Map();
  for (const c of contactos) {
    if (!contactosPorCuenta.has(c.cuenta_id)) contactosPorCuenta.set(c.cuenta_id, []);
    contactosPorCuenta.get(c.cuenta_id).push(c);
  }

  // ------------------------------------------------------------------- leads
  // Los leads se generan primero sin score; luego se crean sus señales y se
  // calcula el score con el MISMO motor que usa la API en producción.
  const defLeads = [];
  for (let i = 0; i < 340; i += 1) {
    const giro = elegir(GIROS);
    const plaza = elegir(PLAZAS_PONDERADAS);
    const nombre = nombrePersona();
    const empresaBase = quizas(0.5) ? `${giro.tipo} ${elegir(NUCLEOS)}` : `Grupo ${giro.tipo} ${elegir(APELLIDOS)}`;
    const r = rnd();
    const tamano = r < 0.06 ? 'corporativo' : r < 0.26 ? 'grande' : r < 0.62 ? 'mediana' : r < 0.9 ? 'pequena' : 'micro';
    // Llegada con sesgo suave hacia el presente (exponente 1.35): conserva 18 meses
    // de historia para las gráficas mensuales, pero deja un volumen creíble de
    // prospectos recientes en la parte alta del embudo.
    const ventanaDias = diasEntre(INICIO, AHORA);
    const antiguedad = Math.pow(rnd(), 1.35) * ventanaDias;
    const creado = sumarDias(AHORA, -antiguedad);
    const mensaje = elegir(MENSAJES_LEAD);
    const clasificado = motor.clasificarLead({ mensaje, tamano_empresa: tamano });

    // Distribución de etapas: la mayoría de los leads no llega lejos, como en la
    // vida real. Además, una fracción de los leads antiguos se quedó en «lead» sin
    // que nadie los trabajara nunca — eso pasa en toda operación comercial, y es
    // justamente lo que la IA debe sacar a la luz.
    let etapa;
    if (antiguedad < 10) etapa = quizas(0.55) ? 'lead' : 'contacto';
    else if (antiguedad < 45) {
      etapa = quizas(0.12) ? 'lead' : elegir(['contacto', 'contacto', 'calificado', 'perdido']);
    } else {
      etapa = quizas(0.05) ? 'lead' : elegir(['contacto', 'calificado', 'calificado', 'perdido', 'perdido', 'perdido']);
    }

    const campana = quizas(0.62) ? elegir(campanas) : null;
    const propietario = elegir(vendedores.filter((v) => v.zona === plaza.zona || v.zona === 'AMBAS'));
    const ultimoContacto = etapa === 'lead' ? null : sumarDias(creado, entre(1, Math.max(2, Math.floor(antiguedad * 0.7))));

    defLeads.push({
      nombre,
      empresa: `${empresaBase} ${elegir(SUFIJOS)}`,
      puesto: elegir(PUESTOS),
      email: correoDe(nombre, dominioDe(empresaBase)),
      telefono: telefono(),
      whatsapp: quizas(0.55) ? telefono() : null,
      origen: campana ? elegir(['campana_email', 'google_ads', 'linkedin', 'feria_industrial', 'sitio_web']) : elegir(ORIGENES),
      campana_id: campana?.id ?? null,
      industria: giro.industria,
      tamano_empresa: tamano,
      ciudad: plaza.ciudad,
      estado: plaza.estado,
      etapa,
      // `etapa_max` es el avance real alcanzado, nunca 'perdido': un lead perdido
      // sí llegó a alguna etapa antes de caerse, y el embudo necesita saber a cuál.
      etapa_max: etapa === 'perdido' ? elegir(['lead', 'contacto', 'contacto', 'calificado']) : etapa,
      intencion: clasificado.intencion,
      urgencia: clasificado.urgencia,
      prioridad: clasificado.prioridad,
      valor_estimado: Math.round(normal(180_000_00, 120_000_00, 25_000_00, 900_000_00)),
      propietario_id: propietario.id,
      etiquetas: quizas(0.4) ? elegirVarios(['ruta_troncal', 'volumen_alto', 'requiere_frio', 'urgente', 'competencia', 'referido'], entre(1, 2)) : [],
      necesidad: clasificado.servicio || elegir(NECESIDADES),
      mensaje,
      motivo_perdida: etapa === 'perdido' ? elegir(['Precio fuera de presupuesto', 'Se quedó con su proveedor actual', 'No hay proyecto real', 'No responde', 'Fuera de nuestra cobertura', 'Tiempos de tránsito no compatibles']) : null,
      ultimo_contacto_en: ultimoContacto,
      creado_en: creado,
      actualizado_en: ultimoContacto || creado,
      _plaza: plaza,
    });
  }

  const leads = await insertar('leads',
    ['nombre', 'empresa', 'puesto', 'email', 'telefono', 'whatsapp', 'origen', 'campana_id', 'industria', 'tamano_empresa', 'ciudad', 'estado', 'etapa', 'etapa_max', 'intencion', 'urgencia', 'prioridad', 'valor_estimado', 'propietario_id', 'etiquetas', 'necesidad', 'mensaje', 'motivo_perdida', 'ultimo_contacto_en', 'creado_en', 'actualizado_en'],
    defLeads,
    { retornar: 'id, nombre, empresa, email, etapa, industria, tamano_empresa, estado, intencion, valor_estimado, propietario_id, ultimo_contacto_en, creado_en' },
  );

  // ------------------------------------------------------------------ señales
  const TIPOS_SENAL = ['correo_abierto', 'correo_clic', 'visita_web', 'visita_precios', 'descarga', 'formulario', 'llamada_atendida', 'reunion_aceptada', 'cotizacion_vista', 'whatsapp_respondido', 'correo_respondido', 'evento_asistido', 'chat_iniciado'];
  const defSenales = [];
  for (const lead of leads) {
    // Cuanto más avanzó el lead, más señales tiene: así el score explica la etapa.
    const base = { lead: entre(0, 4), contacto: entre(2, 9), calificado: entre(6, 18), perdido: entre(1, 6) }[lead.etapa] ?? 2;
    for (let i = 0; i < base; i += 1) {
      const tipo = lead.etapa === 'lead'
        ? elegir(['correo_abierto', 'visita_web', 'correo_abierto', 'formulario', 'visita_precios'])
        : elegir(TIPOS_SENAL);
      defSenales.push({
        lead_id: lead.id, cuenta_id: null, contacto_id: null, tipo, peso: 1,
        detalle: {
          visita_precios: 'Página de tarifas y cobertura',
          descarga: 'Guía de Carta Porte 3.0',
          correo_clic: 'Enlace a cotizador en línea',
          cotizacion_vista: 'Abrió el PDF de la cotización',
          formulario: 'Formulario de contacto del sitio',
          evento_asistido: 'Expo Logística Monterrey',
        }[tipo] || null,
        creado_en: fechaEntre(lead.creado_en, AHORA),
      });
    }
  }
  await insertar('senales', ['lead_id', 'cuenta_id', 'contacto_id', 'tipo', 'peso', 'detalle', 'creado_en'], defSenales);

  // --- Score con el motor real: mismas cifras que verá la API en producción ---
  const senalesPorLead = new Map();
  for (const s of defSenales) {
    if (!senalesPorLead.has(s.lead_id)) senalesPorLead.set(s.lead_id, []);
    senalesPorLead.get(s.lead_id).push(s);
  }
  const actualizaciones = leads.map((lead) => {
    const { score, motivos, temperatura } = motor.calcularLeadScore(lead, senalesPorLead.get(lead.id) || [], AHORA);
    return { id: lead.id, score, motivos: JSON.stringify(motivos), temperatura };
  });
  await pool.query(
    `UPDATE leads SET score = d.score, score_motivos = d.motivos, temperatura = d.temperatura
     FROM (SELECT (v->>'id')::int AS id, (v->>'score')::int AS score,
                  (v->>'motivos')::jsonb AS motivos, v->>'temperatura' AS temperatura
           FROM jsonb_array_elements($1::jsonb) AS v) d
     WHERE leads.id = d.id`,
    [JSON.stringify(actualizaciones)],
  );
  for (const lead of leads) {
    const a = actualizaciones.find((x) => x.id === lead.id);
    lead.score = a.score;
  }

  // ----------------------------------------------------------- oportunidades
  const clientesYProspectos = cuentas.filter((c) => c.tipo !== 'inactivo');
  // Un lead calificado se convierte en **una** oportunidad, no en varias: esa es la
  // relación real y es lo que permite que el embudo tenga conversión ≤ 100 %. Las
  // oportunidades que sobran nacen sin lead (prospección en frío o cliente que
  // llama directo), y el embudo las cuenta como entradas propias.
  const porConvertir = leads.filter((l) => l.etapa === 'calificado');
  const defOportunidades = [];

  for (let m = 0; m < 18; m += 1) {
    const mesInicio = sumarMeses(inicioMes(AHORA), -17 + m);
    const mesFin = sumarMeses(mesInicio, 1);
    // Volumen creciente (18 → 32 al mes) con refuerzo en el trimestre en curso:
    // así el pipeline abierto tiene el grosor de una operación real y no solo las
    // sobras de lo que aún no se ha resuelto.
    const refuerzoReciente = m >= 15 ? 1.5 : 1;
    const cuantas = Math.round((18 + m * 0.8 + entre(-3, 4)) * refuerzoReciente);
    for (let k = 0; k < cuantas; k += 1) {
      const cta = elegir(clientesYProspectos);
      const contactosCta = contactosPorCuenta.get(cta.id) || [];
      const creado = fechaEntre(mesInicio, new Date(Math.min(mesFin.getTime(), AHORA.getTime())));
      const antiguedadDias = diasEntre(creado, AHORA);

      // Los servicios de la oportunidad: 1 principal + complementos.
      const skus = elegirVarios(
        cta._giro.industria === 'Alimentos y Bebidas' || cta._giro.industria === 'Farmacéutica'
          ? ['FT-REF', 'FT-LTL', 'FT-ALM', 'FT-FTL', 'FT-DED']
          : ['FT-LTL', 'FT-FTL', 'FT-UM', 'FT-ALM', 'FT-XD', 'FT-EXP', 'FT-DED', 'FT-PROY', 'FT-ADU'],
        entre(1, 3),
      );

      const factorTamano = { corporativo: 2.2, grande: 1.6, mediana: 1, pequena: 0.55, micro: 0.3 }[cta.tamano];
      let monto = 0;
      const lineas = [];
      for (const sku of skus) {
        const p = porSku[sku];
        const [qMin, qMax] = p.cantidad;
        // Normal truncada dentro del rango propio de la unidad de medida, escalada
        // por el tamaño de la empresa.
        const cantidad = Math.max(1, Math.round(
          normal((qMin + qMax) / 2, (qMax - qMin) / 4, qMin, qMax) * factorTamano,
        ));
        const descuento = quizas(0.35) ? elegir([3, 5, 8, 10, 12]) : 0;
        const precio = Math.round(p.precio_base * decimal(0.92, 1.12));
        const importe = Math.round(cantidad * precio * (1 - descuento / 100));
        monto += importe;
        lineas.push({ producto_id: p.id, sku, cantidad, precio_unitario: precio, descuento_pct: descuento, importe });
      }

      // Resolución según antigüedad. No todo lo viejo está cerrado: un 15 % son
      // operaciones de ciclo largo que siguen vivas, y son precisamente las que
      // alimentan la detección de estancamiento.
      let etapa;
      let estado = 'abierta';
      let cerrado = null;
      let cierreEstimado;
      const cicloDias = entre(22, 95);
      const etapaAbierta = () => {
        const r = rnd();
        return r < 0.45 ? 'calificado' : r < 0.77 ? 'propuesta' : 'negociacion';
      };

      if (antiguedadDias > cicloDias && !quizas(0.15)) {
        // Tasa de éxito ~38 %, un número creíble en venta B2B de fletes.
        if (quizas(0.38)) { etapa = 'ganado'; estado = 'ganada'; } else { etapa = 'perdido'; estado = 'perdida'; }
        cerrado = sumarDias(creado, cicloDias);
        cierreEstimado = cerrado;
      } else if (antiguedadDias > cicloDias) {
        // Ciclo largo: sigue abierta y su fecha comprometida se movió (o ya venció).
        etapa = etapaAbierta();
        cierreEstimado = quizas(0.25) ? sumarDias(AHORA, -entre(1, 25)) : sumarDias(AHORA, entre(3, 55));
      } else {
        etapa = etapaAbierta();
        cierreEstimado = sumarDias(creado, cicloDias);
      }

      const etapaMax = estado === 'abierta'
        ? etapa
        : (etapa === 'ganado' ? 'ganado' : elegir(['propuesta', 'negociacion', 'negociacion']));

      // Se consume el lead de la lista: garantiza 1 lead → 1 oportunidad.
      const lead = quizas(0.6) && porConvertir.length ? porConvertir.pop() : null;
      const propietario = usuarios.find((u) => u.id === cta.propietario_id) || elegir(vendedores);
      const ultimaActividad = estado === 'abierta'
        // Un 22 % de las abiertas se deja morir: eso alimenta la detección de estancamiento.
        ? (quizas(0.22) ? sumarDias(AHORA, -entre(16, 70)) : sumarDias(AHORA, -entre(0, 12)))
        : cerrado;

      defOportunidades.push({
        nombre: `${skus.length > 1 ? 'Solución logística' : porSku[skus[0]].nombre} · ${cta.nombre_comercial}`,
        cuenta_id: cta.id,
        contacto_id: contactosCta.length ? elegir(contactosCta).id : null,
        propietario_id: propietario.id,
        lead_id: lead?.id ?? null,
        campana_id: lead?.campana_id ?? (quizas(0.25) ? elegir(campanas).id : null),
        etapa,
        etapa_max: etapaMax,
        estado,
        monto,
        monto_recurrente: lineas.filter((l) => porSku[l.sku].recurrente).reduce((s, l) => s + l.importe, 0),
        probabilidad: motor.PROBABILIDAD_ETAPA[etapa] ?? 25,
        cierre_estimado: isoFecha(cierreEstimado),
        cerrado_en: cerrado,
        competidor: quizas(0.42) ? elegir(COMPETIDORES) : null,
        origen: lead?.origen || cta.origen || elegir(ORIGENES),
        tipo: cta.tipo === 'prospecto' ? 'nuevo' : elegir(['nuevo', 'renovacion', 'expansion', 'venta_cruzada']),
        motivo_perdida: estado === 'perdida' ? elegir(['Precio', 'Tiempo de tránsito', 'Se quedó con el proveedor actual', 'Proyecto cancelado', 'Falta de capacidad en fecha', 'Condiciones de crédito']) : null,
        siguiente_paso: estado === 'abierta' && quizas(0.65) ? elegir(['Enviar cotización revisada', 'Reunión con el área de compras', 'Visita a planta', 'Confirmar volúmenes mensuales', 'Presentar caso de éxito', 'Negociar condiciones de crédito']) : null,
        etiquetas: quizas(0.3) ? elegirVarios(['ruta_troncal', 'licitacion', 'multi_sitio', 'temporada_alta', 'renovacion'], entre(1, 2)) : [],
        ultima_actividad_en: ultimaActividad,
        creado_en: creado,
        actualizado_en: ultimaActividad || creado,
        _lineas: lineas,
        _cta: cta,
        _contactos: contactosCta,
      });
    }
  }

  const oportunidades = await insertar('oportunidades',
    ['nombre', 'cuenta_id', 'contacto_id', 'propietario_id', 'lead_id', 'campana_id', 'etapa', 'etapa_max', 'estado', 'monto', 'monto_recurrente', 'probabilidad', 'cierre_estimado', 'cerrado_en', 'competidor', 'origen', 'tipo', 'motivo_perdida', 'siguiente_paso', 'etiquetas', 'ultima_actividad_en', 'creado_en', 'actualizado_en'],
    defOportunidades,
    { retornar: 'id, nombre, cuenta_id, contacto_id, propietario_id, lead_id, etapa, estado, monto, probabilidad, cierre_estimado, cerrado_en, competidor, siguiente_paso, ultima_actividad_en, creado_en' },
  );
  oportunidades.forEach((o, i) => {
    o._lineas = defOportunidades[i]._lineas;
    o._cta = defOportunidades[i]._cta;
    o._contactos = defOportunidades[i]._contactos;
  });

  // Cerrar el círculo de la conversión: el lead apunta a la cuenta y la
  // oportunidad que generó. Sin esto la ficha del prospecto no podría mostrar en
  // qué acabó, que es justo lo primero que pregunta un vendedor.
  const convertidos = oportunidades.filter((o) => o.lead_id);
  if (convertidos.length) {
    await pool.query(
      `UPDATE leads l
          SET cuenta_id = d.cuenta_id, oportunidad_id = d.op_id, convertido_en = d.creado
         FROM (SELECT (v->>'lead')::int lead_id, (v->>'cuenta')::int cuenta_id,
                      (v->>'op')::int op_id, (v->>'creado')::timestamptz creado
                 FROM jsonb_array_elements($1::jsonb) v) d
        WHERE l.id = d.lead_id`,
      [JSON.stringify(convertidos.map((o) => ({
        lead: o.lead_id, cuenta: o.cuenta_id, op: o.id, creado: o.creado_en,
      })))],
    );
  }

  // ------------------------------------------------- productos por oportunidad
  await insertar('oportunidad_productos', ['oportunidad_id', 'producto_id', 'cantidad', 'precio_unitario', 'descuento_pct'],
    oportunidades.flatMap((o) => o._lineas.map((l) => ({
      oportunidad_id: o.id, producto_id: l.producto_id, cantidad: l.cantidad,
      precio_unitario: l.precio_unitario, descuento_pct: l.descuento_pct,
    }))));

  // ------------------------------------------------------- historial de etapas
  const SECUENCIA = ['calificado', 'propuesta', 'negociacion'];
  const defHistorial = [];
  for (const o of oportunidades) {
    const destino = o.estado === 'abierta' ? o.etapa : (o.etapa === 'ganado' ? 'ganado' : 'negociacion');
    const camino = ['calificado'];
    for (const e of SECUENCIA.slice(1)) {
      if (motor.indiceEtapa(e) <= motor.indiceEtapa(destino)) camino.push(e);
    }
    if (o.etapa === 'ganado') camino.push('ganado');
    if (o.etapa === 'perdido') camino.push('perdido');

    const fin = o.cerrado_en ? new Date(o.cerrado_en) : AHORA;
    const total = Math.max(1, diasEntre(o.creado_en, fin));
    let cursor = new Date(o.creado_en);
    for (let i = 0; i < camino.length; i += 1) {
      const tramo = total / camino.length;
      const fecha = i === 0 ? cursor : sumarDias(cursor, tramo * decimal(0.7, 1.3));
      defHistorial.push({
        entidad_tipo: 'oportunidad', entidad_id: o.id,
        etapa_anterior: i === 0 ? null : camino[i - 1], etapa_nueva: camino[i],
        dias_en_anterior: i === 0 ? null : Number((diasEntre(cursor, fecha) ?? 0).toFixed(2)),
        usuario_id: o.propietario_id, creado_en: fecha,
      });
      cursor = fecha;
    }
  }
  await insertar('etapa_historial', ['entidad_tipo', 'entidad_id', 'etapa_anterior', 'etapa_nueva', 'dias_en_anterior', 'usuario_id', 'creado_en'], defHistorial);

  // ------------------------------------------------------------- cotizaciones
  const defCotizaciones = [];
  let folioCot = 1;
  for (const o of oportunidades) {
    // Solo las que pasaron de «calificado» tienen documento formal.
    if (motor.indiceEtapa(o.etapa) < motor.indiceEtapa('propuesta') && o.estado === 'abierta') continue;
    if (quizas(0.15)) continue;
    const enviada = sumarDias(o.creado_en, entre(4, 25));
    if (enviada > AHORA) continue;

    let estado;
    if (o.estado === 'ganada') estado = 'aceptada';
    else if (o.estado === 'perdida') estado = quizas(0.6) ? 'rechazada' : 'vencida';
    else estado = elegir(['enviada', 'vista', 'vista', 'enviada']);

    const items = o._lineas.map((l, i) => ({
      producto_id: l.producto_id,
      descripcion: `${porSku[l.sku].nombre} · ${l.cantidad} ${l.cantidad === 1 ? 'unidad' : 'unidades'}`,
      cantidad: l.cantidad, precio_unitario: l.precio_unitario, descuento_pct: l.descuento_pct,
      importe: l.importe, orden: i,
    }));
    const subtotal = items.reduce((s, i) => s + i.importe, 0);
    const descuento = items.reduce((s, i) => s + Math.round(i.cantidad * i.precio_unitario * (i.descuento_pct / 100)), 0);
    const impuestos = Math.round(subtotal * 0.16);

    defCotizaciones.push({
      folio: folio('COT', folioCot++),
      oportunidad_id: o.id, cuenta_id: o.cuenta_id, contacto_id: o.contacto_id, propietario_id: o.propietario_id,
      estado, subtotal, descuento, impuestos, total: subtotal + impuestos,
      condiciones: `Tarifas vigentes 30 días naturales. ${elegir(['Pago de contado', 'Crédito 15 días previa autorización', 'Crédito 30 días para cuentas establecidas'])}. No incluye maniobras especiales ni estadías.`,
      notas: quizas(0.3) ? 'Sujeta a disponibilidad de unidad en la fecha solicitada.' : null,
      valida_hasta: isoFecha(sumarDias(enviada, 30)),
      enviada_en: enviada,
      vista_en: ['vista', 'aceptada', 'rechazada'].includes(estado) ? sumarDias(enviada, entre(0, 6)) : null,
      resuelta_en: ['aceptada', 'rechazada'].includes(estado) ? (o.cerrado_en || sumarDias(enviada, entre(7, 40))) : null,
      creado_en: sumarDias(enviada, -entre(0, 3)),
      _items: items,
    });
  }
  const cotizaciones = await insertar('cotizaciones',
    ['folio', 'oportunidad_id', 'cuenta_id', 'contacto_id', 'propietario_id', 'estado', 'subtotal', 'descuento', 'impuestos', 'total', 'condiciones', 'notas', 'valida_hasta', 'enviada_en', 'vista_en', 'resuelta_en', 'creado_en'],
    defCotizaciones, { retornar: 'id, folio, oportunidad_id, cuenta_id, estado, total, enviada_en, vista_en' });

  await insertar('cotizacion_items', ['cotizacion_id', 'producto_id', 'descripcion', 'cantidad', 'precio_unitario', 'descuento_pct', 'importe', 'orden'],
    cotizaciones.flatMap((c, i) => defCotizaciones[i]._items.map((it) => ({ ...it, cotizacion_id: c.id }))));

  // ----------------------------------------------------------------- facturas
  const defFacturas = [];
  let folioFac = 1;
  const ganadas = oportunidades.filter((o) => o.estado === 'ganada');
  for (const o of ganadas) {
    // Una operación ganada factura entre 1 y 8 veces (servicio recurrente).
    const n = entre(1, 8);
    for (let i = 0; i < n; i += 1) {
      const emitida = sumarDias(o.cerrado_en, i * entre(20, 35) + entre(1, 8));
      if (emitida > AHORA) break;
      const subtotal = Math.round((o.monto / n) * decimal(0.8, 1.2));
      const impuestos = Math.round(subtotal * 0.16);
      const vence = sumarDias(emitida, elegir([15, 30, 30, 45]));
      let estado = 'pagada';
      let pagada = sumarDias(emitida, entre(5, 40));
      if (pagada > AHORA) {
        estado = vence < AHORA ? 'vencida' : 'emitida';
        pagada = null;
      } else if (quizas(0.06)) { estado = 'vencida'; pagada = null; }
      defFacturas.push({
        folio: folio('FAC', folioFac++), cuenta_id: o.cuenta_id, oportunidad_id: o.id,
        estado, subtotal, impuestos, total: subtotal + impuestos,
        emitida_en: isoFecha(emitida), vence_en: isoFecha(vence),
        pagada_en: pagada ? isoFecha(pagada) : null, creado_en: emitida,
      });
    }
  }
  await insertar('facturas', ['folio', 'cuenta_id', 'oportunidad_id', 'estado', 'subtotal', 'impuestos', 'total', 'emitida_en', 'vence_en', 'pagada_en', 'creado_en'], defFacturas);

  // ---------------------------------------------------------------- contratos
  const defContratos = [];
  let folioCon = 1;
  for (const cta of cuentas.filter((c) => c.tipo === 'cliente')) {
    if (!quizas(0.42)) continue;
    const inicia = sumarDias(new Date(cta.cliente_desde || cta.creado_en), entre(10, 90));
    const meses = elegir([6, 12, 12, 18, 24]);
    const termina = sumarMeses(inicia, meses);
    const dRestantes = diasEntre(AHORA, termina);
    const estado = dRestantes < 0 ? 'vencido' : dRestantes <= 60 ? 'por_vencer' : 'vigente';
    defContratos.push({
      folio: folio('CTR', folioCon++), cuenta_id: cta.id, oportunidad_id: null,
      nombre: `Contrato de servicios de transporte · ${meses} meses`,
      estado, valor: Math.round(normal(900_000_00, 600_000_00, 120_000_00, 5_000_000_00)),
      inicia_en: isoFecha(inicia), termina_en: isoFecha(termina),
      renovacion_auto: quizas(0.35),
      condiciones: `Vigencia de ${meses} meses con tarifas fijas y revisión semestral por índice de combustible.`,
      creado_en: inicia,
    });
  }
  await insertar('contratos', ['folio', 'cuenta_id', 'oportunidad_id', 'nombre', 'estado', 'valor', 'inicia_en', 'termina_en', 'renovacion_auto', 'condiciones', 'creado_en'], defContratos);

  // ------------------------------------------------------------------ tickets
  const defTickets = [];
  let folioTk = 1;
  const clientes = cuentas.filter((c) => c.tipo === 'cliente');
  // Una mesa de servicio real tiene dos poblaciones: el histórico ya resuelto y la
  // bandeja viva. Se decide **primero el estado** y después una fecha de creación
  // coherente con él; al revés (derivar el estado de la antigüedad) la bandeja
  // queda vacía o con el 100 % de los SLA incumplidos, y en ambos casos el
  // semáforo deja de significar algo.
  const PLAN_TICKETS = [
    ...Array(240).fill('historico'),
    ...Array(26).fill('vivo'),
    ...Array(20).fill('recien_resuelto'),
  ];

  for (const plan of PLAN_TICKETS) {
    const cta = elegir(clientes);
    const contactosCta = contactosPorCuenta.get(cta.id) || [];
    const categoria = elegir(CATEGORIAS_TICKET);
    const prioridad = elegir(['baja', 'media', 'media', 'media', 'alta', 'alta', 'urgente']);
    const slaHoras = { urgente: 4, alta: 8, media: 24, baja: 48 }[prioridad];

    let estado;
    let creado;
    if (plan === 'historico') {
      estado = elegir(['resuelto', 'resuelto', 'resuelto', 'cerrado', 'cerrado']);
      creado = fechaEntre(sumarDias(AHORA, -240), sumarDias(AHORA, -8));
    } else if (plan === 'recien_resuelto') {
      estado = elegir(['resuelto', 'resuelto', 'cerrado']);
      creado = fechaEntre(sumarDias(AHORA, -7), sumarDias(AHORA, -0.5));
    } else {
      estado = elegir(['nuevo', 'abierto', 'abierto', 'abierto', 'pendiente', 'pendiente']);
      // La antigüedad se mide **en múltiplos del propio SLA**, no en días: un
      // ticket urgente (SLA 4 h) y uno de baja prioridad (48 h) rompen el
      // compromiso en momentos muy distintos. Así un tercio de la bandeja queda
      // incumplida a propósito, que es la proporción que hace útil el semáforo.
      const factorSla = quizas(0.33) ? decimal(1.2, 5) : decimal(0.05, 0.8);
      creado = new Date(AHORA.getTime() - slaHoras * factorSla * 3_600_000);
    }

    const slaVence = new Date(creado.getTime() + slaHoras * 3_600_000);
    const antiguedadHoras = (AHORA - creado) / 3_600_000;

    const resuelto = ['resuelto', 'cerrado'].includes(estado)
      // Resolución mayormente dentro del SLA (~73 %): un cumplimiento creíble.
      ? new Date(Math.min(
          creado.getTime() + slaHoras * 3_600_000 * decimal(0.2, 1.3),
          AHORA.getTime() - 1000,
        ))
      : null;
    const primeraRespuesta = estado === 'nuevo'
      ? null
      : new Date(Math.min(
          creado.getTime() + slaHoras * 3_600_000 * decimal(0.08, 0.9),
          AHORA.getTime() - 1000,
        ));
    const negativo = ['Daño en mercancía', 'Retraso en entrega', 'Reclamación', 'Recolección no realizada'].includes(categoria);

    defTickets.push({
      folio: folio('TK', folioTk++),
      asunto: elegir(ASUNTOS_TICKET[categoria]),
      descripcion: `El cliente reporta: ${elegir(ASUNTOS_TICKET[categoria]).toLowerCase()}. Se solicita revisión y respuesta con evidencia.`,
      cuenta_id: cta.id,
      contacto_id: contactosCta.length ? elegir(contactosCta).id : null,
      canal: elegir(['correo', 'correo', 'whatsapp', 'whatsapp', 'telefono', 'chat', 'portal']),
      categoria, prioridad, estado,
      asignado_id: elegir(soporte).id,
      sla_horas: slaHoras,
      sla_vence_en: slaVence,
      primera_respuesta_en: primeraRespuesta,
      resuelto_en: resuelto,
      cerrado_en: estado === 'cerrado' ? sumarDias(resuelto, entre(1, 4)) : null,
      sentimiento: negativo ? elegir(['negativo', 'negativo', 'frustrado', 'neutral']) : elegir(['neutral', 'neutral', 'positivo']),
      csat: ['resuelto', 'cerrado'].includes(estado) && quizas(0.55) ? (negativo ? entre(2, 4) : entre(4, 5)) : null,
      ia_resuelto: categoria === 'Estatus de embarque' && quizas(0.55),
      guia_relacionada: ['Estatus de embarque', 'Retraso en entrega', 'Daño en mercancía'].includes(categoria)
        ? `${cta._zona === 'MTY' ? 'AN' : 'BN'}${entre(100000, 999999)}` : null,
      etiquetas: quizas(0.3) ? elegirVarios(['reincidente', 'vip', 'escalado', 'compensacion'], 1) : [],
      creado_en: creado,
      actualizado_en: resuelto || primeraRespuesta || creado,
      _cta: cta,
    });
  }
  const tickets = await insertar('tickets',
    ['folio', 'asunto', 'descripcion', 'cuenta_id', 'contacto_id', 'canal', 'categoria', 'prioridad', 'estado', 'asignado_id', 'sla_horas', 'sla_vence_en', 'primera_respuesta_en', 'resuelto_en', 'cerrado_en', 'sentimiento', 'csat', 'ia_resuelto', 'guia_relacionada', 'etiquetas', 'creado_en', 'actualizado_en'],
    defTickets, { retornar: 'id, folio, cuenta_id, estado, categoria, creado_en, asignado_id, sentimiento, ia_resuelto' });

  // --------------------------------------------------------- mensajes ticket
  const defMensajes = [];
  for (const [i, tk] of tickets.entries()) {
    const def = defTickets[i];
    defMensajes.push({
      ticket_id: tk.id, autor_tipo: 'cliente', usuario_id: null,
      cuerpo: def.descripcion, interno: false, creado_en: tk.creado_en,
    });
    if (tk.ia_resuelto) {
      defMensajes.push({
        ticket_id: tk.id, autor_tipo: 'ia', usuario_id: null,
        cuerpo: `Consulté el sistema de rastreo con la guía ${def.guia_relacionada}. El embarque se encuentra en ruta de entrega y la fecha estimada de llegada es ${isoFecha(sumarDias(tk.creado_en, 1))}. Te comparto la trazabilidad completa en el enlace de rastreo. ¿Necesitas algo más sobre este embarque?`,
        interno: false, creado_en: new Date(tk.creado_en.getTime() + entre(20, 180) * 1000),
      });
    }
    if (def.primera_respuesta_en) {
      defMensajes.push({
        ticket_id: tk.id, autor_tipo: 'agente', usuario_id: tk.asignado_id,
        cuerpo: elegir([
          'Gracias por reportarlo. Ya solicité la revisión con la coordinación de tráfico y te confirmo en cuanto tenga respuesta.',
          'Buen día, estoy revisando el caso con bodega. En un lapso de dos horas te comparto el estatus con evidencia.',
          'Recibido. Localicé el embarque y estoy validando la causa del incidente para darte una respuesta formal.',
          'Con gusto lo atiendo. Ya escalé el caso al área correspondiente con prioridad.',
        ]),
        interno: false, creado_en: def.primera_respuesta_en,
      });
    }
    if (def.resuelto_en) {
      defMensajes.push({
        ticket_id: tk.id, autor_tipo: 'agente', usuario_id: tk.asignado_id,
        cuerpo: elegir([
          'Ya quedó resuelto. Te comparto la evidencia de entrega firmada y el ajuste correspondiente. Quedo al pendiente por cualquier duda.',
          'Caso cerrado: se realizó la maniobra y el embarque fue entregado. Se aplicó una nota de crédito por la demora.',
          'Confirmado con operaciones: el tema quedó atendido y se implementó una medida para que no se repita.',
        ]),
        interno: false, creado_en: def.resuelto_en,
      });
      if (quizas(0.25)) {
        defMensajes.push({
          ticket_id: tk.id, autor_tipo: 'agente', usuario_id: tk.asignado_id,
          cuerpo: 'Nota interna: cliente sensible, dar seguimiento proactivo en el siguiente embarque.',
          interno: true, creado_en: def.resuelto_en,
        });
      }
    }
  }
  await insertar('ticket_mensajes', ['ticket_id', 'autor_tipo', 'usuario_id', 'cuerpo', 'interno', 'creado_en'], defMensajes);

  // ----------------------------------------------------------- base de conocimiento
  await insertar('articulos_kb', ['titulo', 'slug', 'categoria', 'cuerpo', 'etiquetas', 'vistas', 'utiles', 'publicado', 'autor_id', 'creado_en', 'actualizado_en'],
    ARTICULOS_KB.map((a) => ({
      titulo: a.titulo,
      slug: sinAcentos(a.titulo).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      categoria: a.categoria, cuerpo: a.cuerpo,
      etiquetas: [a.categoria.toLowerCase()],
      vistas: entre(120, 4200), utiles: entre(8, 260), publicado: true,
      autor_id: elegir(soporte).id,
      creado_en: sumarDias(AHORA, -entre(120, 500)), actualizado_en: sumarDias(AHORA, -entre(5, 100)),
    })));

  // -------------------------------------------------------------- actividades
  const TIPOS_ACT = ['llamada', 'correo', 'reunion', 'whatsapp', 'tarea', 'visita', 'seguimiento', 'demo'];
  const ASUNTOS_ACT = {
    llamada: ['Llamada de seguimiento', 'Llamada de prospección', 'Confirmar recepción de cotización', 'Llamada para cerrar condiciones'],
    correo: ['Envío de cotización', 'Envío de propuesta comercial', 'Seguimiento por correo', 'Compartir caso de éxito'],
    reunion: ['Reunión de descubrimiento', 'Presentación de propuesta', 'Junta de negociación', 'Revisión trimestral de servicio'],
    whatsapp: ['Seguimiento por WhatsApp', 'Confirmación de recolección', 'Aviso de salida de unidad'],
    tarea: ['Preparar cotización', 'Validar tarifas con operaciones', 'Actualizar expediente del cliente', 'Solicitar carta de crédito'],
    visita: ['Visita a planta', 'Recorrido de andenes', 'Visita para levantar requerimiento'],
    seguimiento: ['Seguimiento programado', 'Recordatorio de renovación', 'Confirmar volúmenes del mes'],
    demo: ['Demostración del portal de rastreo', 'Presentación de tablero de indicadores'],
  };

  const defActividades = [];
  const agregarActividad = (base) => {
    const tipo = base.tipo || elegir(TIPOS_ACT);
    defActividades.push({
      tipo, asunto: base.asunto || elegir(ASUNTOS_ACT[tipo]),
      descripcion: base.descripcion ?? null,
      estado: base.estado, prioridad: base.prioridad ?? entre(2, 4),
      usuario_id: base.usuario_id, cuenta_id: base.cuenta_id ?? null,
      contacto_id: base.contacto_id ?? null, lead_id: base.lead_id ?? null,
      oportunidad_id: base.oportunidad_id ?? null, ticket_id: base.ticket_id ?? null,
      inicia_en: base.inicia_en ?? null, vence_en: base.vence_en,
      duracion_min: ['reunion', 'llamada', 'visita', 'demo'].includes(tipo) ? elegir([15, 30, 30, 45, 60, 90]) : null,
      completada_en: base.estado === 'completada' ? base.completada_en ?? base.vence_en : null,
      resultado: base.estado === 'completada'
        ? elegir(['Contacto establecido, interesado', 'Solicitó cotización formal', 'Pidió más tiempo para decidir', 'No contestó, reagendar', 'Avanza a siguiente etapa', 'Confirmó volúmenes', 'Objeción de precio'])
        : null,
      ubicacion: tipo === 'visita' || tipo === 'reunion' ? base.ubicacion ?? null : null,
      origen: base.origen || 'manual',
      creado_en: base.creado_en ?? base.vence_en,
    });
  };

  // Historia de actividad de cada oportunidad.
  for (const o of oportunidades) {
    const fin = o.cerrado_en ? new Date(o.cerrado_en) : AHORA;
    const n = entre(2, 9);
    for (let i = 0; i < n; i += 1) {
      const cuando = fechaEntre(new Date(o.creado_en), fin);
      agregarActividad({
        usuario_id: o.propietario_id, cuenta_id: o.cuenta_id, oportunidad_id: o.id,
        contacto_id: o.contacto_id, estado: 'completada', vence_en: cuando, completada_en: cuando,
        ubicacion: `${o._cta.ciudad}, ${o._cta.estado}`,
      });
    }
    // Pendientes futuros solo en las abiertas: una agenda coherente.
    if (o.estado === 'abierta' && quizas(0.72)) {
      const cuantas = entre(1, 3);
      for (let i = 0; i < cuantas; i += 1) {
        agregarActividad({
          usuario_id: o.propietario_id, cuenta_id: o.cuenta_id, oportunidad_id: o.id,
          contacto_id: o.contacto_id, estado: 'pendiente',
          vence_en: sumarDias(AHORA, entre(-6, 21)) , prioridad: entre(1, 3),
          creado_en: sumarDias(AHORA, -entre(1, 20)),
          ubicacion: `${o._cta.ciudad}, ${o._cta.estado}`,
        });
      }
    }
  }

  // Actividad de leads.
  for (const lead of leads) {
    if (lead.etapa === 'lead') {
      if (quizas(0.5)) {
        agregarActividad({
          tipo: elegir(['llamada', 'correo', 'whatsapp']),
          usuario_id: lead.propietario_id, lead_id: lead.id, estado: 'pendiente',
          vence_en: sumarDias(AHORA, entre(-3, 5)), prioridad: lead.score >= 70 ? 1 : 3,
          creado_en: lead.creado_en, origen: 'ia',
          descripcion: 'Primer contacto sugerido automáticamente al ingresar el prospecto.',
        });
      }
      continue;
    }
    const n = entre(1, 5);
    for (let i = 0; i < n; i += 1) {
      const cuando = fechaEntre(new Date(lead.creado_en), AHORA);
      agregarActividad({
        tipo: elegir(['llamada', 'correo', 'whatsapp', 'reunion']),
        usuario_id: lead.propietario_id, lead_id: lead.id, estado: 'completada',
        vence_en: cuando, completada_en: cuando,
      });
    }
    if (['contacto', 'calificado'].includes(lead.etapa) && quizas(0.6)) {
      agregarActividad({
        tipo: 'seguimiento', usuario_id: lead.propietario_id, lead_id: lead.id, estado: 'pendiente',
        vence_en: sumarDias(AHORA, entre(-4, 14)), creado_en: sumarDias(AHORA, -entre(1, 10)),
      });
    }
  }

  // Actividad ligada a tickets (compromisos de soporte).
  for (const tk of tickets.filter((t) => ['abierto', 'pendiente'].includes(t.estado))) {
    if (!quizas(0.5)) continue;
    agregarActividad({
      tipo: 'tarea', asunto: `Dar seguimiento al ticket ${tk.folio}`,
      usuario_id: tk.asignado_id, cuenta_id: tk.cuenta_id, ticket_id: tk.id,
      estado: 'pendiente', vence_en: sumarDias(AHORA, entre(0, 3)), prioridad: 2,
      creado_en: tk.creado_en,
    });
  }

  await insertar('actividades',
    ['tipo', 'asunto', 'descripcion', 'estado', 'prioridad', 'usuario_id', 'cuenta_id', 'contacto_id', 'lead_id', 'oportunidad_id', 'ticket_id', 'inicia_en', 'vence_en', 'duracion_min', 'completada_en', 'resultado', 'ubicacion', 'origen', 'creado_en'],
    defActividades);

  // --------------------------------------------------------------------- notas
  const defNotas = [];
  for (const o of elegirVarios(oportunidades, 180)) {
    defNotas.push({
      cuerpo: elegir([
        'El cliente maneja 18 tarimas semanales hacia CDMX. Su dolor principal es la falta de visibilidad, no el precio.',
        'Compras autoriza hasta 250 mil al mes sin pasar por dirección. Conviene dimensionar la propuesta por debajo de ese techo.',
        'Tienen contrato vigente con la competencia hasta fin de trimestre. Entrar con una prueba piloto de dos rutas.',
        'Requieren maniobra con montacargas en destino. Validar con operaciones antes de comprometer tarifa.',
        'El decisor real es el director de operaciones, no el gerente de logística. Pedir reunión conjunta.',
        'Muy sensibles al tiempo de tránsito: necesitan entrega antes de las 10:00 para no parar la línea.',
        'Se quejaron del proveedor actual por facturación desordenada. Nuestro portal es un diferenciador claro aquí.',
      ]),
      usuario_id: o.propietario_id, cuenta_id: o.cuenta_id, oportunidad_id: o.id,
      fijada: quizas(0.15), creado_en: fechaEntre(new Date(o.creado_en), AHORA),
    });
  }
  await insertar('notas', ['cuerpo', 'usuario_id', 'cuenta_id', 'oportunidad_id', 'fijada', 'creado_en'], defNotas);

  // ------------------------------------------------------------------ archivos
  const defArchivos = [];
  for (const c of elegirVarios(cotizaciones, 140)) {
    defArchivos.push({
      nombre: `${c.folio}.pdf`, tipo_mime: 'application/pdf', tamano_bytes: entre(90_000, 480_000),
      url: `/archivos/cotizaciones/${c.folio}.pdf`, categoria: 'cotizacion',
      usuario_id: elegir(vendedores).id, cuenta_id: c.cuenta_id, oportunidad_id: c.oportunidad_id,
      creado_en: c.enviada_en,
    });
  }
  for (const cta of elegirVarios(cuentas.filter((c) => c.tipo === 'cliente'), 70)) {
    defArchivos.push({
      nombre: elegir(['Constancia de situación fiscal.pdf', 'Alta de proveedor.xlsx', 'Contrato firmado.pdf', 'Carta de no adeudo.pdf', 'Layout de andenes.pdf']),
      tipo_mime: 'application/pdf', tamano_bytes: entre(50_000, 2_400_000),
      url: `/archivos/cuentas/${cta.id}/documento.pdf`, categoria: elegir(['contrato', 'evidencia', 'otro']),
      usuario_id: elegir(vendedores).id, cuenta_id: cta.id, oportunidad_id: null,
      creado_en: sumarDias(AHORA, -entre(20, 400)),
    });
  }
  await insertar('archivos', ['nombre', 'tipo_mime', 'tamano_bytes', 'url', 'categoria', 'usuario_id', 'cuenta_id', 'oportunidad_id', 'creado_en'], defArchivos);

  // ------------------------------------------------------------ automatizaciones
  const flujos = [
    {
      nombre: 'Lead nuevo · calificar y asignar',
      descripcion: 'Al entrar un prospecto: lo califica con IA, lo asigna al ejecutivo con menor carga en su zona, crea el primer contacto y avisa.',
      evento: 'lead.creado', activa: true,
      nodos: [
        { id: 'n1', tipo: 'disparador', titulo: 'Entra un prospecto', x: 60, y: 180, config: { evento: 'lead.creado' } },
        { id: 'n2', tipo: 'ia_calificar', titulo: 'Calificar con IA', x: 300, y: 180, config: {} },
        { id: 'n3', tipo: 'condicion', titulo: '¿Score ≥ 70?', x: 540, y: 180, config: { campo: 'score', op: '>=', valor: 70 } },
        { id: 'n4', tipo: 'asignar', titulo: 'Asignar ejecutivo', x: 790, y: 90, config: { estrategia: 'carga_zona' } },
        { id: 'n5', tipo: 'crear_actividad', titulo: 'Llamar en 2 h', x: 1030, y: 90, config: { tipo: 'llamada', vence_horas: 2, prioridad: 1 } },
        { id: 'n6', tipo: 'notificar', titulo: 'Avisar al ejecutivo', x: 1270, y: 90, config: { canal: 'app' } },
        { id: 'n7', tipo: 'enviar_correo', titulo: 'Correo de bienvenida', x: 790, y: 285, config: { plantilla: 'bienvenida-prospecto' } },
        { id: 'n8', tipo: 'crear_actividad', titulo: 'Seguimiento en 3 días', x: 1030, y: 285, config: { tipo: 'seguimiento', vence_horas: 72, prioridad: 3 } },
      ],
      aristas: [
        { desde: 'n1', hasta: 'n2' }, { desde: 'n2', hasta: 'n3' },
        { desde: 'n3', hasta: 'n4', etiqueta: 'sí' }, { desde: 'n4', hasta: 'n5' }, { desde: 'n5', hasta: 'n6' },
        { desde: 'n3', hasta: 'n7', etiqueta: 'no' }, { desde: 'n7', hasta: 'n8' },
      ],
    },
    {
      nombre: 'Oportunidad estancada · reactivar',
      descripcion: 'Detecta oportunidades abiertas sin actividad en 14 días, crea tarea de reactivación y notifica al gerente si el monto es alto.',
      evento: 'cron.diario', activa: true,
      nodos: [
        { id: 'n1', tipo: 'disparador', titulo: 'Cada día a las 8:00', x: 60, y: 160, config: { hora: 8 } },
        { id: 'n2', tipo: 'buscar', titulo: 'Oportunidades sin actividad 14 d', x: 300, y: 160, config: { entidad: 'oportunidad', dias_inactiva: 14 } },
        { id: 'n3', tipo: 'ia_analizar', titulo: 'Analizar riesgo con IA', x: 560, y: 160, config: {} },
        { id: 'n4', tipo: 'crear_actividad', titulo: 'Tarea de reactivación', x: 810, y: 160, config: { tipo: 'llamada', vence_horas: 24, prioridad: 1 } },
        { id: 'n5', tipo: 'condicion', titulo: '¿Monto > 500 mil?', x: 1050, y: 160, config: { campo: 'monto', op: '>', valor: 50_000_000 } },
        { id: 'n6', tipo: 'notificar', titulo: 'Avisar al gerente', x: 1290, y: 160, config: { destino: 'gerente' } },
      ],
      aristas: [
        { desde: 'n1', hasta: 'n2' }, { desde: 'n2', hasta: 'n3' }, { desde: 'n3', hasta: 'n4' },
        { desde: 'n4', hasta: 'n5' }, { desde: 'n5', hasta: 'n6', etiqueta: 'sí' },
      ],
    },
    {
      nombre: 'Cotización sin respuesta · seguimiento',
      descripcion: 'Si una cotización enviada no se responde en 3 días, genera seguimiento; si el cliente la abrió, marca prioridad máxima.',
      evento: 'cron.diario', activa: true,
      nodos: [
        { id: 'n1', tipo: 'disparador', titulo: 'Cada día a las 9:00', x: 60, y: 170, config: { hora: 9 } },
        { id: 'n2', tipo: 'buscar', titulo: 'Cotizaciones sin respuesta 3 d', x: 300, y: 170, config: { entidad: 'cotizacion', dias: 3 } },
        { id: 'n3', tipo: 'condicion', titulo: '¿La abrió el cliente?', x: 560, y: 170, config: { campo: 'vista_en', op: 'existe' } },
        { id: 'n4', tipo: 'crear_actividad', titulo: 'Llamar hoy · prioridad 1', x: 810, y: 80, config: { tipo: 'llamada', vence_horas: 8, prioridad: 1 } },
        { id: 'n5', tipo: 'enviar_whatsapp', titulo: 'WhatsApp de confirmación', x: 810, y: 270, config: { plantilla: 'confirmar-recepcion' } },
      ],
      aristas: [
        { desde: 'n1', hasta: 'n2' }, { desde: 'n2', hasta: 'n3' },
        { desde: 'n3', hasta: 'n4', etiqueta: 'sí' }, { desde: 'n3', hasta: 'n5', etiqueta: 'no' },
      ],
    },
    {
      nombre: 'Ticket urgente · escalar con SLA',
      descripcion: 'Un ticket urgente se asigna, se responde con la base de conocimiento y se escala si se acerca el vencimiento del SLA.',
      evento: 'ticket.creado', activa: true,
      nodos: [
        { id: 'n1', tipo: 'disparador', titulo: 'Nuevo ticket', x: 60, y: 170, config: { evento: 'ticket.creado' } },
        { id: 'n2', tipo: 'condicion', titulo: '¿Prioridad urgente?', x: 300, y: 170, config: { campo: 'prioridad', op: '=', valor: 'urgente' } },
        { id: 'n3', tipo: 'ia_responder', titulo: 'Respuesta sugerida IA', x: 560, y: 80, config: { fuente: 'base_conocimiento' } },
        { id: 'n4', tipo: 'notificar', titulo: 'Alertar a soporte', x: 810, y: 80, config: { canal: 'app' } },
        { id: 'n5', tipo: 'esperar', titulo: 'Esperar 2 h', x: 1050, y: 80, config: { horas: 2 } },
        { id: 'n6', tipo: 'notificar', titulo: 'Escalar a gerencia', x: 1290, y: 80, config: { destino: 'gerente' } },
        { id: 'n7', tipo: 'ia_responder', titulo: 'Respuesta automática', x: 560, y: 275, config: { fuente: 'base_conocimiento' } },
      ],
      aristas: [
        { desde: 'n1', hasta: 'n2' }, { desde: 'n2', hasta: 'n3', etiqueta: 'sí' },
        { desde: 'n3', hasta: 'n4' }, { desde: 'n4', hasta: 'n5' }, { desde: 'n5', hasta: 'n6' },
        { desde: 'n2', hasta: 'n7', etiqueta: 'no' },
      ],
    },
    {
      nombre: 'Cliente en riesgo de fuga · retención',
      descripcion: 'Cuando el riesgo de fuga supera 60, agenda reunión de retención y sugiere venta cruzada.',
      evento: 'cron.semanal', activa: true,
      nodos: [
        { id: 'n1', tipo: 'disparador', titulo: 'Cada lunes 8:00', x: 60, y: 160, config: { dia: 1, hora: 8 } },
        { id: 'n2', tipo: 'buscar', titulo: 'Cuentas con riesgo > 60', x: 300, y: 160, config: { entidad: 'cuenta', riesgo_min: 60 } },
        { id: 'n3', tipo: 'ia_analizar', titulo: 'Motivos y estrategia', x: 560, y: 160, config: {} },
        { id: 'n4', tipo: 'crear_actividad', titulo: 'Reunión de retención', x: 810, y: 160, config: { tipo: 'reunion', vence_horas: 72, prioridad: 1 } },
        { id: 'n5', tipo: 'notificar', titulo: 'Avisar al propietario', x: 1050, y: 160, config: { canal: 'app' } },
      ],
      aristas: [
        { desde: 'n1', hasta: 'n2' }, { desde: 'n2', hasta: 'n3' }, { desde: 'n3', hasta: 'n4' }, { desde: 'n4', hasta: 'n5' },
      ],
    },
    {
      nombre: 'Oportunidad ganada · alta de cliente',
      descripcion: 'Al ganar: convierte la cuenta en cliente, crea la tarea de alta operativa y avisa al equipo.',
      evento: 'oportunidad.ganada', activa: false,
      nodos: [
        { id: 'n1', tipo: 'disparador', titulo: 'Oportunidad ganada', x: 60, y: 160, config: { evento: 'oportunidad.ganada' } },
        { id: 'n2', tipo: 'actualizar', titulo: 'Cuenta → cliente', x: 300, y: 160, config: { entidad: 'cuenta', campo: 'tipo', valor: 'cliente' } },
        { id: 'n3', tipo: 'crear_actividad', titulo: 'Alta operativa y tarifario', x: 560, y: 160, config: { tipo: 'tarea', vence_horas: 48, prioridad: 2 } },
        { id: 'n4', tipo: 'notificar', titulo: 'Avisar a operaciones', x: 810, y: 160, config: { canal: 'app' } },
        { id: 'n5', tipo: 'enviar_correo', titulo: 'Bienvenida al cliente', x: 1050, y: 160, config: { plantilla: 'bienvenida-cliente' } },
      ],
      aristas: [
        { desde: 'n1', hasta: 'n2' }, { desde: 'n2', hasta: 'n3' }, { desde: 'n3', hasta: 'n4' }, { desde: 'n4', hasta: 'n5' },
      ],
    },
  ];

  const automatizaciones = await insertar('automatizaciones',
    ['nombre', 'descripcion', 'activa', 'evento', 'condiciones', 'nodos', 'aristas', 'ejecuciones', 'exitos', 'fallos', 'ultimo_run_en', 'creado_por', 'creado_en'],
    flujos.map((f) => {
      const ejec = f.activa ? entre(40, 620) : 0;
      const fallos = f.activa ? entre(0, Math.max(1, Math.round(ejec * 0.03))) : 0;
      return {
        nombre: f.nombre, descripcion: f.descripcion, activa: f.activa, evento: f.evento,
        condiciones: JSON.stringify([]), nodos: JSON.stringify(f.nodos), aristas: JSON.stringify(f.aristas),
        ejecuciones: ejec, exitos: ejec - fallos, fallos,
        ultimo_run_en: f.activa ? sumarDias(AHORA, -decimal(0, 2)) : null,
        creado_por: admin.id, creado_en: sumarDias(AHORA, -entre(30, 300)),
      };
    }), { retornar: 'id, nombre, activa, nodos' });

  const defEjecuciones = [];
  for (const a of automatizaciones.filter((x) => x.activa)) {
    for (let i = 0; i < entre(6, 18); i += 1) {
      const nodos = a.nodos;
      const falla = quizas(0.07);
      defEjecuciones.push({
        automatizacion_id: a.id,
        estado: falla ? 'error' : quizas(0.1) ? 'omitida' : 'ok',
        entidad_tipo: elegir(['lead', 'oportunidad', 'cuenta', 'ticket']),
        entidad_id: entre(1, 300),
        pasos: JSON.stringify(nodos.slice(0, entre(2, nodos.length)).map((n) => ({
          nodo: n.id, titulo: n.titulo, estado: falla && quizas(0.3) ? 'error' : 'ok', ms: entre(4, 260),
        }))),
        duracion_ms: entre(40, 1800),
        error: falla ? elegir(['Sin ejecutivo disponible en la zona', 'La plantilla de correo no existe', 'Tiempo de espera agotado al notificar']) : null,
        creado_en: sumarDias(AHORA, -decimal(0, 30)),
      });
    }
  }
  await insertar('automatizacion_ejecuciones', ['automatizacion_id', 'estado', 'entidad_tipo', 'entidad_id', 'pasos', 'duracion_ms', 'error', 'creado_en'], defEjecuciones);

  // -------------------------------------------------------------- métricas IA
  // Ahora que existe el histórico, se recalculan con el motor los campos derivados
  // de cuentas y oportunidades. Es exactamente el mismo código que corre en la API.
  console.log('[semilla] calculando métricas de IA sobre el histórico…');
  await recalcularIA();

  // ---------------------------------------------------------------- bitácora
  const defBitacora = [];
  const bit = (entidad_tipo, entidad_id, cuenta_id, tipo, titulo, detalle, usuario_id, creado_en, metadata = {}) =>
    defBitacora.push({ entidad_tipo, entidad_id, cuenta_id, tipo, titulo, detalle, usuario_id, metadata: JSON.stringify(metadata), creado_en });

  for (const cta of cuentas) {
    bit('cuenta', cta.id, cta.id, 'creado', 'Cuenta creada', `Alta de ${cta.nombre} en el CRM.`, cta.propietario_id, cta.creado_en);
  }
  for (const lead of leads) {
    bit('lead', lead.id, null, 'creado', 'Prospecto recibido', `Origen: ${lead.origen ?? 'manual'}. Clasificado automáticamente con score ${lead.score}/100.`, lead.propietario_id, lead.creado_en, { score: lead.score, origen: lead.origen });
  }
  for (const h of defHistorial) {
    const o = oportunidades.find((x) => x.id === h.entidad_id);
    if (!o) continue;
    bit('oportunidad', o.id, o.cuenta_id, h.etapa_anterior ? 'etapa' : 'creado',
      h.etapa_anterior ? `Etapa: ${h.etapa_anterior} → ${h.etapa_nueva}` : 'Oportunidad creada',
      h.etapa_anterior ? `Cambio de etapa tras ${Math.round(h.dias_en_anterior ?? 0)} días.` : `Monto estimado ${(o.monto / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.`,
      h.usuario_id, h.creado_en, { etapa: h.etapa_nueva });
  }
  for (const c of cotizaciones) {
    if (c.enviada_en) bit('cotizacion', c.id, c.cuenta_id, 'cotizacion', `Cotización ${c.folio} enviada`, `Total ${(c.total / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.`, null, c.enviada_en, { folio: c.folio, total: c.total });
    if (c.vista_en) bit('cotizacion', c.id, c.cuenta_id, 'cotizacion_vista', `El cliente abrió la cotización ${c.folio}`, 'Señal de compra: el documento fue abierto.', null, c.vista_en, { folio: c.folio });
  }
  for (const tk of tickets) {
    bit('ticket', tk.id, tk.cuenta_id, 'ticket', `Ticket ${tk.folio} · ${tk.categoria}`, null, tk.asignado_id, tk.creado_en, { folio: tk.folio, categoria: tk.categoria });
  }
  await insertar('bitacora', ['entidad_tipo', 'entidad_id', 'cuenta_id', 'tipo', 'titulo', 'detalle', 'usuario_id', 'metadata', 'creado_en'], defBitacora);

  // ----------------------------------------------------------- notificaciones
  const defNotificaciones = [];
  for (const v of vendedores) {
    for (let i = 0; i < entre(2, 6); i += 1) {
      const plantilla = elegir([
        { tipo: 'ia', titulo: 'Oportunidad en riesgo detectada', cuerpo: 'Una de tus oportunidades lleva más de 20 días sin actividad. La IA sugiere reactivarla hoy.' },
        { tipo: 'alerta', titulo: 'Cotización por vencer', cuerpo: 'Una cotización enviada vence en 3 días sin respuesta del cliente.' },
        { tipo: 'exito', titulo: '¡Oportunidad ganada!', cuerpo: 'Se registró el cierre de una operación en tu cartera.' },
        { tipo: 'info', titulo: 'Nuevo prospecto asignado', cuerpo: 'Se te asignó un prospecto con score alto. Contáctalo en las próximas 2 horas.' },
        { tipo: 'ia', titulo: 'Venta cruzada sugerida', cuerpo: 'Una cuenta de tu cartera es candidata a almacenaje según su patrón de embarques.' },
      ]);
      defNotificaciones.push({
        usuario_id: v.id, ...plantilla,
        enlace: elegir(['/oportunidades', '/prospectos', '/clientes', '/cotizaciones']),
        leida: quizas(0.4), creado_en: sumarDias(AHORA, -decimal(0, 9)),
      });
    }
  }
  await insertar('notificaciones', ['usuario_id', 'tipo', 'titulo', 'cuerpo', 'enlace', 'leida', 'creado_en'], defNotificaciones);

  // ------------------------------------------------------------------ resumen
  const { rows } = await pool.query(`
    SELECT 'cuentas' t, count(*)::int n FROM cuentas
    UNION ALL SELECT 'contactos', count(*)::int FROM contactos
    UNION ALL SELECT 'leads', count(*)::int FROM leads
    UNION ALL SELECT 'senales', count(*)::int FROM senales
    UNION ALL SELECT 'oportunidades', count(*)::int FROM oportunidades
    UNION ALL SELECT 'cotizaciones', count(*)::int FROM cotizaciones
    UNION ALL SELECT 'facturas', count(*)::int FROM facturas
    UNION ALL SELECT 'contratos', count(*)::int FROM contratos
    UNION ALL SELECT 'tickets', count(*)::int FROM tickets
    UNION ALL SELECT 'ticket_mensajes', count(*)::int FROM ticket_mensajes
    UNION ALL SELECT 'actividades', count(*)::int FROM actividades
    UNION ALL SELECT 'notas', count(*)::int FROM notas
    UNION ALL SELECT 'archivos', count(*)::int FROM archivos
    UNION ALL SELECT 'campanas', count(*)::int FROM campanas
    UNION ALL SELECT 'envios_email', count(*)::int FROM envios_email
    UNION ALL SELECT 'automatizaciones', count(*)::int FROM automatizaciones
    UNION ALL SELECT 'ia_insights', count(*)::int FROM ia_insights
    UNION ALL SELECT 'bitacora', count(*)::int FROM bitacora
    ORDER BY 1
  `);
  console.log('\n[semilla] listo en %s s', ((Date.now() - t0) / 1000).toFixed(1));
  for (const r of rows) console.log(`  ${r.t.padEnd(20, '·')} ${String(r.n).padStart(6)}`);
  console.log(`\n  Acceso: ${defUsuarios[0].email}  ·  contraseña: ${config.semilla.passwordDemo}`);
}

const ejecutadoDirecto = process.argv[1]?.endsWith('semilla.js');

if (ejecutadoDirecto) {
  (async () => {
    try {
      await migrar({ reiniciar: true, silencioso: true });
      await sembrar();
      await cerrar();
      process.exit(0);
    } catch (error) {
      console.error('[semilla] error:', error);
      await cerrar().catch(() => {});
      process.exit(1);
    }
  })();
}

export { sembrar };
