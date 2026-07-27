'use strict';
// Cliente de la API del CRM. Maneja el token de sesion y errores comunes.

const API = {
  alExpirar: null, // lo define app.js para regresar al login

  get token() { return localStorage.getItem('tauro_token') || ''; },
  set token(v) {
    if (v) localStorage.setItem('tauro_token', v);
    else localStorage.removeItem('tauro_token');
  },

  async pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
    const opciones = {
      method: metodo,
      headers: { Accept: 'application/json' },
    };
    if (API.token) opciones.headers.Authorization = `Bearer ${API.token}`;
    if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    let respuesta;
    try {
      respuesta = await fetch(`/api${ruta}`, opciones);
    } catch (err) {
      throw new Error('Sin conexion con el servidor. Revisa tu internet.');
    }
    if (respuesta.status === 401) {
      API.token = '';
      if (typeof API.alExpirar === 'function') API.alExpirar();
      throw new Error('Tu sesion expiro. Inicia sesion de nuevo.');
    }
    let datos = null;
    try { datos = await respuesta.json(); } catch (err) { datos = null; }
    if (!respuesta.ok) {
      throw new Error((datos && datos.error) || `Error del servidor (${respuesta.status}).`);
    }
    return datos;
  },

  get(ruta) { return API.pedir(ruta); },
  post(ruta, cuerpo = {}) { return API.pedir(ruta, { metodo: 'POST', cuerpo }); },
  put(ruta, cuerpo = {}) { return API.pedir(ruta, { metodo: 'PUT', cuerpo }); },
  del(ruta) { return API.pedir(ruta, { metodo: 'DELETE' }); },

  // Descarga un PDF autenticado y lo abre/guarda en el navegador
  async descargarPdf(ruta, nombreArchivo) {
    const respuesta = await fetch(`/api${ruta}`, {
      headers: { Authorization: `Bearer ${API.token}` },
    });
    if (!respuesta.ok) throw new Error('No se pudo generar el PDF.');
    const blob = await respuesta.blob();
    const url = URL.createObjectURL(blob);
    const liga = document.createElement('a');
    liga.href = url;
    liga.download = nombreArchivo;
    document.body.appendChild(liga);
    liga.click();
    liga.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  },
};
