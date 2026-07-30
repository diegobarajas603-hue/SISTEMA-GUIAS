import { Router } from 'express';
import * as auth from '../servicios/auth.js';
import { asincrono } from '../lib/errores.js';
import { correo, texto, entero } from '../lib/validar.js';
import { exigirSesion, exigirRol, ponerCookie, borrarCookie, leerToken, limitar } from '../middleware/sesion.js';

const r = Router();

r.post('/login', limitar({ maximo: 12, ventanaMs: 300_000, clave: 'login' }), asincrono(async (req, res) => {
  const email = correo(req.body?.email, 'email', { requerido: true });
  const password = texto(req.body?.password, 'password', { requerido: true, max: 200 });
  const { token, expira, usuario } = await auth.login(email, password, req.ip);
  ponerCookie(res, token, expira);
  res.json({ usuario, expira });
}));

r.post('/logout', asincrono(async (req, res) => {
  await auth.logout(leerToken(req));
  borrarCookie(res);
  res.json({ ok: true });
}));

r.get('/yo', exigirSesion, (req, res) => res.json({ usuario: req.usuario }));

r.put('/password', exigirSesion, asincrono(async (req, res) => {
  await auth.cambiarPassword(
    req.usuario.id,
    texto(req.body?.actual, 'actual', { requerido: true, max: 200 }),
    texto(req.body?.nueva, 'nueva', { requerido: true, max: 200 }),
  );
  borrarCookie(res);
  res.json({ ok: true, mensaje: 'Contraseña actualizada. Vuelve a iniciar sesión.' });
}));

r.put('/preferencias', exigirSesion, asincrono(async (req, res) => {
  const preferencias = await auth.guardarPreferencias(req.usuario.id, req.body ?? {});
  res.json({ preferencias });
}));

r.get('/usuarios', exigirSesion, asincrono(async (_req, res) => res.json(await auth.listar())));

r.get('/equipos', exigirSesion, asincrono(async (_req, res) => res.json(await auth.equipos())));

r.get('/usuarios/:id', exigirSesion, exigirRol('gerente'), asincrono(async (req, res) => {
  res.json(await auth.porId(Number(req.params.id)));
}));

// --------------------------------------------------- administración del equipo
// Dar de alta gente y cambiarle el rol es administrar el sistema, no usarlo.

r.post('/usuarios', exigirSesion, exigirRol('gerente'), asincrono(async (req, res) => {
  res.status(201).json(await auth.crearUsuario(req.body ?? {}));
}));

r.put('/usuarios/:id', exigirSesion, exigirRol('gerente'), asincrono(async (req, res) => {
  res.json(await auth.actualizarUsuario(
    entero(req.params.id, 'id', { requerido: true }), req.body ?? {}, req.usuario,
  ));
}));

r.put('/usuarios/:id/password', exigirSesion, exigirRol('gerente'), asincrono(async (req, res) => {
  await auth.restablecerPassword(
    entero(req.params.id, 'id', { requerido: true }), req.body?.password,
  );
  res.json({ ok: true, mensaje: 'Contraseña restablecida. La persona deberá entrar de nuevo.' });
}));

r.post('/equipos', exigirSesion, exigirRol('gerente'), asincrono(async (req, res) => {
  res.status(201).json(await auth.crearEquipo(req.body ?? {}));
}));

r.put('/equipos/:id', exigirSesion, exigirRol('gerente'), asincrono(async (req, res) => {
  res.json(await auth.actualizarEquipo(entero(req.params.id, 'id', { requerido: true }), req.body ?? {}));
}));

r.delete('/equipos/:id', exigirSesion, exigirRol('gerente'), asincrono(async (req, res) => {
  await auth.eliminarEquipo(entero(req.params.id, 'id', { requerido: true }));
  res.json({ ok: true });
}));

export default r;
