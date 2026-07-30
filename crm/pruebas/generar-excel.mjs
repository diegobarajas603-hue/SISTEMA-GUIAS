/**
 * Genera archivos de prueba para el importador de clientes.
 *
 *   node pruebas/generar-excel.mjs [carpeta]
 *
 * Los encabezados imitan los de un ERP real (mayúsculas, abreviaturas, puntos) y
 * los datos incluyen a propósito lo que rompe a los importadores ingenuos:
 * códigos postales sin ceros, teléfonos con lada y extensión, RFC en minúsculas,
 * estados abreviados, fechas dd/mm/aaaa, correos inválidos, filas sin nombre y
 * el mismo cliente repetido con distintos contactos.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import XLSX from 'xlsx';

const destino = process.argv[2] || join(process.cwd(), 'pruebas', 'archivos');
mkdirSync(destino, { recursive: true });

// PRNG con semilla: los archivos son idénticos entre corridas.
let semilla = 20260730;
const azar = () => {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
};
const elegir = (a) => a[Math.floor(azar() * a.length)];
const entre = (a, b) => Math.floor(azar() * (b - a + 1)) + a;

const GIROS = ['Manufactura', 'Automotriz', 'Alimentos', 'Construcción', 'Farmacéutica',
  'Retail', 'Metalmecánica', 'Electrónica', 'Química', 'Agroindustria'];
const RAICES = ['Aceros', 'Plásticos', 'Textiles', 'Vidrios', 'Empaques', 'Cementos',
  'Alimentos', 'Químicos', 'Papeles', 'Cables', 'Herrajes', 'Maderas'];
const APELLIDOS = ['del Norte', 'Regiomontanos', 'del Bajío', 'Industriales', 'Peninsulares',
  'del Pacífico', 'Modernos', 'Unidos', 'Integrales', 'Selectos'];
const CIUDADES = [
  ['Monterrey', 'N.L.', '64000'], ['Apodaca', 'NL', '66600'], ['Guadalajara', 'Jal.', '44100'],
  ['Ciudad de México', 'CDMX', '01000'], ['Querétaro', 'Qro', '76000'], ['Puebla', 'Pue.', '72000'],
  ['Toluca', 'Edomex', '50000'], ['Saltillo', 'Coah', '25000'], ['León', 'Gto.', '37000'],
  ['Tijuana', 'B.C.', '22000'], ['Mérida', 'Yuc', '97000'], ['Veracruz', 'Ver.', '91700'],
];
const NOMBRES = ['Laura', 'Carlos', 'Ana', 'Miguel', 'Patricia', 'Jorge', 'Sofía', 'Ricardo',
  'Gabriela', 'Fernando', 'Mónica', 'Alejandro', 'Daniela', 'Roberto'];
const APELLIDOS_P = ['Sáenz', 'Treviño', 'Garza', 'Villarreal', 'Cantú', 'Elizondo', 'Ramos',
  'Ibarra', 'Lozano', 'Méndez', 'Guerra', 'Zúñiga'];
const PUESTOS = ['Gerente de Compras', 'Director de Operaciones', 'Jefe de Logística',
  'Coordinador de Almacén', 'Gerente General', 'Comprador', 'Analista de Abastecimiento'];

// Nombres tal como aparecerían escritos a mano en el Excel del cliente.
const EJECUTIVOS = ['Mariana Treviño', 'Ricardo Elizondo', 'mariana.trevino@fletestauro.com.mx',
  'Emilio Zúñiga', 'Sofía Cantú', 'Vendedor Que Ya No Trabaja Aquí'];

const ENCABEZADOS = [
  'CLIENTE', 'RAZON SOCIAL', 'R.F.C.', 'GIRO', 'DIRECCION', 'No.', 'COLONIA',
  'CIUDAD', 'EDO', 'C.P.', 'TEL', 'EMAIL', 'CONTACTO PRINCIPAL', 'PUESTO',
  'ASESOR', 'DIAS CREDITO', 'FECHA ALTA', 'OBSERVACIONES',
];

const rfcDe = (i) => {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l = [0, 1, 2].map(() => letras[Math.floor(azar() * 26)]).join('');
  return `${l}${String(entre(70, 99))}${String(entre(1, 12)).padStart(2, '0')}${String(entre(1, 28)).padStart(2, '0')}${String(i % 100).padStart(2, '0')}${letras[Math.floor(azar() * 26)]}`;
};

const telefonoDe = () => elegir([
  `+52 ${entre(55, 99)} ${entre(1000, 9999)} ${entre(1000, 9999)}`,
  `(${entre(55, 99)}) ${entre(1000, 9999)}-${entre(1000, 9999)}`,
  `${entre(55, 99)}${entre(10000000, 99999999)}`,
  `01 ${entre(55, 99)} ${entre(10000000, 99999999)}`,
  `${entre(55, 99)}${entre(10000000, 99999999)} ext ${entre(100, 999)}`,
]);

function generar(cantidad, { conProblemas = true } = {}) {
  const filas = [ENCABEZADOS];
  const empresas = [];

  for (let i = 0; i < cantidad; i += 1) {
    const nombre = `${elegir(RAICES)} ${elegir(APELLIDOS)} ${elegir(['S.A. de C.V.', 'S. de R.L.', 'SAPI de CV'])}`;
    const [ciudad, edo, cp] = elegir(CIUDADES);
    const rfc = rfcDe(i);
    const contacto = `${elegir(NOMBRES)} ${elegir(APELLIDOS_P)}`;
    const dominio = `${RAICES[i % RAICES.length].toLowerCase()}${i}.mx`;

    empresas.push({ nombre, rfc, ciudad, edo, cp });

    filas.push([
      nombre,
      nombre.toUpperCase().replace(/\./g, ''),
      // Uno de cada siete llega en minúsculas y con guiones, como en la vida real.
      i % 7 === 0 ? rfc.toLowerCase().replace(/^(.{4})/, '$1-') : rfc,
      elegir(GIROS),
      `Av. ${elegir(['Constitución', 'Industrias', 'Revolución', 'Morones Prieto', 'López Mateos'])}`,
      String(entre(100, 9999)),
      elegir(['Centro', 'Parque Industrial', 'Cumbres', 'Del Valle', 'Mitras', 'San Jerónimo']),
      ciudad,
      edo,
      // Excel come los ceros a la izquierda: se manda como número a propósito.
      cp.startsWith('0') ? Number(cp) : cp,
      telefonoDe(),
      conProblemas && i % 23 === 0 ? `contacto(arroba)${dominio}` : `compras@${dominio}`,
      contacto,
      elegir(PUESTOS),
      elegir(EJECUTIVOS),
      elegir([15, 30, 45, 60, '30 días']),
      `${entre(1, 28)}/${entre(1, 12)}/${entre(2015, 2025)}`,
      azar() > 0.6 ? `Opera ${entre(2, 5)} plantas. Factura a ${entre(15, 28)} días.` : '',
    ]);

    // Un cliente de cada nueve trae un segundo contacto en otra fila: es el caso
    // que obliga a agrupar en lugar de crear duplicados.
    if (conProblemas && i % 9 === 0 && i > 0) {
      filas.push([
        nombre, nombre.toUpperCase().replace(/\./g, ''), rfc, elegir(GIROS),
        '', '', '', ciudad, edo, cp, telefonoDe(), `logistica@${dominio}`,
        `${elegir(NOMBRES)} ${elegir(APELLIDOS_P)}`, elegir(PUESTOS),
        elegir(EJECUTIVOS), '', '', '',
      ]);
    }
  }

  if (conProblemas) {
    // Fila sin nombre: debe rechazarse sin detener el resto.
    filas.push(['', 'SIN NOMBRE SA', 'XXX010101AAA', 'Otro', 'Calle 1', '1', 'Centro',
      'Monterrey', 'NL', '64000', '8181234567', 'a@b.mx', 'Nadie', 'Jefe', '', '', '', '']);
    // Estado inexistente y teléfono corto: deben dar aviso, no error.
    filas.push(['Cliente Con Datos Raros SA', 'CLIENTE CON DATOS RAROS SA', 'RAR010101AB1',
      'Otro', 'Calle 2', '2', 'Centro', 'Springfield', 'Narnia', '999999', '123',
      'raro@x.mx', 'Homero Simpson', 'Inspector', 'Nadie Conocido', 'muchos', '99/99/9999',
      'Fila diseñada para disparar avisos.']);
  }

  return { filas, empresas };
}

function escribir(nombre, filas) {
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja['!cols'] = ENCABEZADOS.map(() => ({ wch: 22 }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'CARTERA');
  const ruta = join(destino, nombre);
  XLSX.writeFile(libro, ruta, { compression: true });
  return ruta;
}

const tamanos = [
  ['clientes-100.xlsx', 100],
  ['clientes-1000.xlsx', 1000],
  ['clientes-5000.xlsx', 5000],
  ['clientes-50000.xlsx', 50000],
];

console.log('Generando archivos de prueba…\n');
for (const [nombre, n] of tamanos) {
  const { filas } = generar(n);
  const ruta = escribir(nombre, filas);
  console.log(`  ${nombre.padEnd(24)} ${String(filas.length - 1).padStart(6)} filas`);
  void ruta;
}

// CSV, para comprobar el otro formato de entrada.
const { filas: filasCsv } = generar(100);
const csv = filasCsv
  .map((f) => f.map((c) => {
    const s = String(c ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','))
  .join('\n');
writeFileSync(join(destino, 'clientes-100.csv'), `﻿${csv}`, 'utf8');
console.log(`  ${'clientes-100.csv'.padEnd(24)} ${String(filasCsv.length - 1).padStart(6)} filas`);

console.log(`\nListos en ${destino}\n`);
