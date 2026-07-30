/**
 * Cliente HTTP mínimo hacia la API. Sin Axios: `fetch` con cookies de sesión
 * (`credentials: 'include'`) cubre todo lo que este producto necesita.
 */

export class ErrorAPI extends Error {
  codigo: string;
  estado: number;
  detalles?: unknown;

  constructor(estado: number, codigo: string, mensaje: string, detalles?: unknown) {
    super(mensaje);
    this.name = 'ErrorAPI';
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

const BASE = '/api/v1';

async function peticion<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    credentials: 'include',
    headers: cuerpo !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });

  const tipo = r.headers.get('content-type') ?? '';
  const datos = tipo.includes('json') ? await r.json().catch(() => null) : await r.text();

  if (!r.ok) {
    const err = (datos as { error?: { codigo: string; mensaje: string; detalles?: unknown } })?.error;
    throw new ErrorAPI(r.status, err?.codigo ?? 'error', err?.mensaje ?? 'Ocurrió un error inesperado.', err?.detalles);
  }
  return datos as T;
}

export const api = {
  get: <T>(ruta: string) => peticion<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo?: unknown) => peticion<T>('POST', ruta, cuerpo ?? {}),
  put: <T>(ruta: string, cuerpo?: unknown) => peticion<T>('PUT', ruta, cuerpo ?? {}),
  delete: <T>(ruta: string) => peticion<T>('DELETE', ruta),
};

/** Construye un query string omitiendo valores vacíos, para no ensuciar la URL. */
export function conQuery(base: string, params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor)) {
      if (valor.length) q.set(clave, valor.join(','));
    } else {
      q.set(clave, String(valor));
    }
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
