let onSesionExpirada = () => {};
export function setOnSesionExpirada(fn) { onSesionExpirada = fn; }

async function pedir(url, opciones = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opciones });
  if (res.status === 401 && !url.endsWith('/login') && !url.endsWith('/me')) {
    onSesionExpirada();
  }
  let data = null;
  const tipo = res.headers.get('content-type') || '';
  if (tipo.includes('application/json')) data = await res.json();
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}

export const api = {
  get: url => pedir(url),
  post: (url, body) => pedir(url, {
    method: 'POST',
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : JSON.stringify(body || {})
  }),
  put: (url, body) => pedir(url, {
    method: 'PUT',
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : JSON.stringify(body || {})
  }),
  del: url => pedir(url, { method: 'DELETE' })
};
