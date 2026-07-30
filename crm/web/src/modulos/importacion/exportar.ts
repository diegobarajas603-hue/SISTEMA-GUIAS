import type { CampoImportacion } from '@aura/compartido';
import type { ResultadoFila } from './tipos';

/**
 * SheetJS pesa ~350 kB y aquí solo hace falta si el usuario pulsa «descargar».
 * Con importación dinámica no entra en el paquete de la página: quien solo
 * importa clientes nunca lo descarga. (El worker trae su propia copia porque
 * corre en otro hilo y no puede compartir módulos con éste.)
 */
const cargarXLSX = () => import('xlsx');

/**
 * Plantilla de ejemplo. Se genera aquí y no se sirve como archivo estático para
 * que siempre refleje el catálogo de campos vigente: si mañana se añade un campo,
 * la plantilla lo trae sin que nadie tenga que acordarse de regenerarla.
 */
export async function descargarPlantilla(campos: CampoImportacion[]) {
  const XLSX = await cargarXLSX();
  const encabezados = campos.map((c) => c.etiqueta + (c.requerido ? ' *' : ''));
  const ejemplo: Record<string, string> = {
    'Nombre del cliente *': 'Aceros del Norte S.A. de C.V.',
    'Razón social': 'ACEROS DEL NORTE SA DE CV',
    RFC: 'ANO980417H21',
    Industria: 'Metalmecánica',
    'Tamaño de empresa': 'grande',
    'Tipo de cuenta': 'cliente',
    Teléfono: '81 8123 4567',
    Correo: 'compras@acerosdelnorte.mx',
    'Sitio web': 'acerosdelnorte.mx',
    Calle: 'Av. Constitución',
    Número: '1500',
    Colonia: 'Centro',
    Ciudad: 'Monterrey',
    Estado: 'Nuevo León',
    'Código postal': '64000',
    País: 'México',
    'Ejecutivo asignado': 'Mariana Treviño',
    Origen: 'Referido',
    'Días de crédito': '30',
    'Cliente desde': '17/04/2019',
    Etiquetas: 'estratégico, volumen',
    Observaciones: 'Opera tres plantas; el corporativo decide en Monterrey.',
    'Nombre del contacto': 'Laura Sáenz',
    'Puesto del contacto': 'Gerente de Compras',
    'Correo del contacto': 'laura.saenz@acerosdelnorte.mx',
    'Teléfono del contacto': '81 1234 5678',
    'WhatsApp del contacto': '81 1234 5678',
    'Rol de compra': 'decisor',
  };

  const hoja = XLSX.utils.aoa_to_sheet([
    encabezados,
    encabezados.map((h) => ejemplo[h] ?? ''),
  ]);
  hoja['!cols'] = encabezados.map((h) => ({ wch: Math.max(16, h.length + 4) }));

  const ayuda = XLSX.utils.aoa_to_sheet([
    ['Campo', '¿Obligatorio?', 'Cómo llenarlo', 'También se reconoce como'],
    ...campos.map((c) => [
      c.etiqueta,
      c.requerido ? 'Sí' : 'No',
      c.ayuda ?? '',
      c.sinonimos.slice(0, 6).join(', '),
    ]),
  ]);
  ayuda['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 60 }, { wch: 50 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Clientes');
  XLSX.utils.book_append_sheet(libro, ayuda, 'Cómo llenarlo');
  XLSX.writeFile(libro, 'plantilla-clientes-aura.xlsx', { compression: true });
}

/** Reporte de lo que salió mal o se corrigió, para arreglarlo en el origen. */
export async function descargarReporteErrores(resultados: ResultadoFila[], archivo: string) {
  const XLSX = await cargarXLSX();
  const errores = resultados.filter((r) => r.resultado === 'error');
  const avisos = resultados.filter((r) => (r.avisos?.length ?? 0) > 0);

  const libro = XLSX.utils.book_new();

  const hojaErrores = XLSX.utils.aoa_to_sheet([
    ['Fila del Excel', 'Cliente', 'Motivo del rechazo'],
    ...errores.map((r) => [r.fila ?? '', r.nombre ?? '', r.error ?? '']),
  ]);
  hojaErrores['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(libro, hojaErrores, 'No importados');

  const filasAviso = avisos.flatMap((r) => (r.avisos ?? []).map((a) => [r.fila ?? '', r.nombre ?? '', a]));
  const hojaAvisos = XLSX.utils.aoa_to_sheet([
    ['Fila del Excel', 'Cliente', 'Dato corregido al importar'],
    ...filasAviso,
  ]);
  hojaAvisos['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(libro, hojaAvisos, 'Corregidos');

  const marca = new Date().toISOString().slice(0, 10);
  const base = archivo.replace(/\.[^.]+$/, '');
  XLSX.writeFile(libro, `reporte-importacion-${base}-${marca}.xlsx`, { compression: true });
}
