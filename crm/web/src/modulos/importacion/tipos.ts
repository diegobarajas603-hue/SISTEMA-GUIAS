import type { CampoImportacion } from '@aura/compartido';

export type Celda = string | number | boolean | Date | null;

export interface ColumnaMapeada {
  indice: number;
  encabezado: string;
  campo: string | null;
  confianza: 'alta' | 'media' | null;
  muestra: string[];
}

export interface ArchivoAnalizado {
  hojas: string[];
  hoja: string;
  encabezados: string[];
  columnas: ColumnaMapeada[];
  muestra: Celda[][];
  totalFilas: number;
}

/** Un cliente ya agrupado, listo para mandar al servidor. */
export interface ClientePreparado {
  llave: string;
  fila: number;
  campos: Record<string, Celda>;
  contactos: Array<Record<string, Celda>>;
  filas: number[];
  decision?: EstrategiaDuplicado;
}

export interface ProblemaFila {
  llave: string;
  fila: number;
  nombre: string | null;
  nivel: 'error' | 'aviso';
  mensaje: string;
  campo?: string;
}

export interface ResumenAgrupado {
  totalFilas: number;
  totalClientes: number;
  totalContactos: number;
  filasFusionadas: number;
  conError: number;
  conAviso: number;
  problemas: ProblemaFila[];
  porCampo: Record<string, number>;
}

export type EstrategiaDuplicado = 'omitir' | 'actualizar' | 'crear_nuevo';

export interface DuplicadoDetectado {
  llave: string;
  nombre: string;
  cuenta_id: number;
  cuenta_nombre: string;
  cuenta_rfc: string | null;
  motivo: 'rfc' | 'nombre';
}

export interface ResultadoFila {
  llave: string;
  fila: number | null;
  nombre: string | null;
  resultado: 'creado' | 'actualizado' | 'omitido' | 'error';
  cuenta_id?: number;
  error?: string;
  avisos?: string[];
}

export interface ConteoImportacion {
  creados: number;
  actualizados: number;
  omitidos: number;
  fallidos: number;
  contactos: number;
}

export interface CatalogoImportacion {
  campos: CampoImportacion[];
  estados: string[];
  usuarios: Array<{ id: number; nombre: string; email: string; rol: string; zona: string | null; avatar_tono: number }>;
}

export interface Importacion {
  id: number;
  archivo: string;
  tamano_bytes: number;
  estado: 'en_proceso' | 'completada' | 'cancelada' | 'fallida';
  estrategia: string;
  total_filas: number;
  total_clientes: number;
  creados: number;
  actualizados: number;
  omitidos: number;
  fallidos: number;
  contactos: number;
  duracion_ms: number;
  creado_en: string;
  terminado_en: string | null;
  usuario_nombre?: string | null;
  usuario_tono?: number;
  errores_guardados?: number;
  errores?: Array<{ llave: string; fila: number | null; nombre: string | null; error: string }>;
  mapeo?: Record<string, string>;
}

// --------------------------------------------------------------- mensajería

export type PeticionWorker =
  | { tipo: 'analizar'; archivo: File; hoja?: string }
  | { tipo: 'agrupar'; mapeo: Record<number, string | null> }
  | { tipo: 'llaves' }
  | { tipo: 'lote'; desde: number; cantidad: number }
  | { tipo: 'decisiones'; decisiones: Record<string, EstrategiaDuplicado> };

export type RespuestaWorker =
  | { tipo: 'progreso'; fase: 'leyendo' | 'agrupando'; porcentaje: number }
  | { tipo: 'analizado'; datos: ArchivoAnalizado }
  | { tipo: 'agrupado'; resumen: ResumenAgrupado }
  | { tipo: 'llaves'; clientes: Array<{ llave: string; fila: number; campos: Record<string, Celda> }> }
  | { tipo: 'lote'; clientes: ClientePreparado[] }
  | { tipo: 'listo' }
  | { tipo: 'error'; mensaje: string };
