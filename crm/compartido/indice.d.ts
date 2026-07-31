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

export interface RenglonCubicaje {
  descripcion?: string;
  cantidad: number;
  peso_real: number;
  largo: number;
  ancho: number;
  alto: number;
  estibable: boolean;
  volumen_pieza: number;
  peso_volumetrico_pieza: number;
  peso_volumetrico: number;
  peso_cobrable: number;
  cobra_por: 'real' | 'volumetrico';
}

export interface TotalesCubicaje {
  renglones: RenglonCubicaje[];
  piezas: number;
  peso_real_total: number;
  peso_volumetrico_total: number;
  peso_cobrable_total: number;
  tipo_mercancia: string;
  tarifa_centavos_kg: number;
  tarifa_titulo: string;
  importe: number;
  factor_volumetrico: number;
}

export interface TarifaMercancia { clave: string; titulo: string; centavosPorKg: number }

export declare const FACTOR_VOLUMETRICO: number;
export declare const ALTURA_NO_ESTIBABLE: number;
export declare const TARIFAS: Record<string, TarifaMercancia>;
export declare const TIPOS_MERCANCIA: TarifaMercancia[];
export declare function tarifaDe(tipo: string): TarifaMercancia;
export declare function alturaEfectiva(r: { estibable?: boolean; alto?: unknown }): number;
export declare function calcularRenglon(renglon: Record<string, unknown>, factor?: number): RenglonCubicaje;
export declare function calcularCotizacion(renglones?: Array<Record<string, unknown>>, tipoMercancia?: string, factor?: number): TotalesCubicaje;
export declare function renglonVacio(): Record<string, unknown>;
