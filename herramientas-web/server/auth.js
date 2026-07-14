const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'cambia-esto-en-railway';
const COOKIE = 'ht_token';
const PROD = process.env.NODE_ENV === 'production';

function firmar(user) {
  return jwt.sign(
    { id: user.id, usuario: user.usuario, nombre: user.nombre, rol: user.rol },
    SECRET,
    { expiresIn: '12h' }
  );
}

function setCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PROD,
    maxAge: 12 * 60 * 60 * 1000
  });
}

function clearCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: PROD });
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión expirada' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

module.exports = { firmar, setCookie, clearCookie, requireAuth, requireAdmin, COOKIE };
