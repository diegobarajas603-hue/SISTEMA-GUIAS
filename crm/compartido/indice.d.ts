export interface Normalizado<T = string | null> {
  valor: T;
  aviso: string | null;
}

export type TipoCampo =
  | 'texto' | 'texto_largo' | 'rfc' | 'email' | 'telefono' | 'codigo_postal'
  | 'estado' | 'tamano' | 'tipo_cuenta' | 'rol_compra' | 'entero' | 'fecha'
  | 'etiquetas' | 'sitio_web' | 'usuario';

export type DestinoCampo = 'cuenta' | 'contacto';

export interface CampoImportacion {
  clave: string;
  etiqueta: string;
  grupo: string;
  tipo: TipoCampo;
  destino: DestinoCampo;
  requerido?: boolean;
  ayuda?: string;
  sinonimos: string[];
}

export interface ColumnaDetectada {
  indice: number;
  encabezado: string;
  campo: string | null;
  confianza: 'alta' | 'media' | null;
}

export declare const CAMPOS: CampoImportacion[];
export declare const POR_CLAVE: Record<string, CampoImportacion>;
export declare const CLAVES: string[];
export declare const CAMPOS_CUENTA: CampoImportacion[];
export declare const CAMPOS_CONTACTO: CampoImportacion[];
export declare const GRUPOS: string[];
export declare const ESTADOS_MX: string[];

export declare function detectarCampo(encabezado: string): { campo: string | null; confianza: 'alta' | 'media' | null };
export declare function detectarMapeo(encabezados: string[]): ColumnaDetectada[];

export declare function limpiar(bruto: unknown): string | null;
export declare function plegar(s: unknown): string;
export declare function clave(s: unknown): string;

export declare function rfc(bruto: unknown): Normalizado;
export declare function esRfcGenerico(v: unknown): boolean;
export declare function email(bruto: unknown): Normalizado;
export declare function telefono(bruto: unknown): Normalizado;
export declare function codigoPostal(bruto: unknown): Normalizado;
export declare function estado(bruto: unknown): Normalizado;
export declare function tamano(bruto: unknown): Normalizado;
export declare function tipoCuenta(bruto: unknown): Normalizado;
export declare function rolCompra(bruto: unknown): Normalizado;
export declare function entero(bruto: unknown, opciones?: { min?: number; max?: number }): Normalizado<number | null>;
export declare function fecha(bruto: unknown): Normalizado;
export declare function etiquetas(bruto: unknown): Normalizado<string[]>;
export declare function sitioWeb(bruto: unknown): Normalizado;
export declare function textoLargo(bruto: unknown, max?: number): Normalizado;
export declare function texto(bruto: unknown, max?: number): Normalizado;

export declare const NORMALIZADORES: Record<string, (v: unknown) => Normalizado<never>>;
export declare function normalizar(tipo: string, valor: unknown): Normalizado<never>;
