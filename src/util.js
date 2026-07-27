'use strict';
// Utilerias compartidas: contrasenas, tokens, fechas locales de Mexico,
// dinero e importe con letra para las cotizaciones.

const crypto = require('crypto');

const ZONA = 'America/Monterrey';

// ---------- Contrasenas (scrypt) ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, guardado) {
  const [salt, hash] = String(guardado || '').split(':');
  if (!salt || !hash) return false;
  const calculado = crypto.scryptSync(String(password), salt, 64);
  const esperado = Buffer.from(hash, 'hex');
  if (calculado.length !== esperado.length) return false;
  return crypto.timingSafeEqual(calculado, esperado);
}

function tokenAleatorio(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

// ---------- Fechas ----------

function ahora() {
  return new Date().toISOString();
}

// 'YYYY-MM-DD' en horario de Mexico (America/Monterrey)
function fechaLocal(fecha = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(fecha);
}

// 'YYYY-MM' en horario de Mexico
function mesLocal(fecha = new Date()) {
  return fechaLocal(fecha).slice(0, 7);
}

// Suma dias a una fecha 'YYYY-MM-DD' y regresa 'YYYY-MM-DD'
function sumarDias(ymd, dias) {
  const [a, m, d] = String(ymd).split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d + Number(dias || 0)));
  return fecha.toISOString().slice(0, 10);
}

// 'YYYY-MM-DD' -> 'DD/MM/AAAA'
function fechaCorta(ymd) {
  if (!ymd) return '';
  const [a, m, d] = String(ymd).slice(0, 10).split('-');
  if (!a || !m || !d) return String(ymd);
  return `${d}/${m}/${a}`;
}

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// 'YYYY-MM-DD' -> '27 de julio de 2026'
function fechaLarga(ymd) {
  const [a, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return String(ymd || '');
  return `${d} de ${MESES_ES[m - 1]} de ${a}`;
}

// ---------- Dinero ----------

function num(valor, defecto = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : defecto;
}

function redondear2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Formato $1,234.56 solo con caracteres ASCII (seguro para el PDF)
function dinero(n, moneda = 'MXN') {
  const v = num(n);
  const texto = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : ''}$${texto}${moneda === 'USD' ? ' USD' : ''}`;
}

// ---------- Importe con letra (formato mexicano) ----------

const LETRA_U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const LETRA_ESP = {
  10: 'DIEZ', 11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
  16: 'DIECISEIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE', 20: 'VEINTE',
  21: 'VEINTIUN', 22: 'VEINTIDOS', 23: 'VEINTITRES', 24: 'VEINTICUATRO', 25: 'VEINTICINCO',
  26: 'VEINTISEIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO', 29: 'VEINTINUEVE',
};
const LETRA_D = { 30: 'TREINTA', 40: 'CUARENTA', 50: 'CINCUENTA', 60: 'SESENTA', 70: 'SETENTA', 80: 'OCHENTA', 90: 'NOVENTA' };
const LETRA_C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function letrasDecenas(n) {
  if (n < 10) return LETRA_U[n];
  if (n <= 29) return LETRA_ESP[n];
  const d = Math.floor(n / 10) * 10;
  const u = n % 10;
  return LETRA_D[d] + (u ? ' Y ' + LETRA_U[u] : '');
}

function letrasCentenas(n) {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  return [(c ? LETRA_C[c] : ''), (r ? letrasDecenas(r) : '')].filter(Boolean).join(' ');
}

function letrasMiles(n) {
  const m = Math.floor(n / 1000);
  const r = n % 1000;
  let texto = '';
  if (m === 1) texto = 'MIL';
  else if (m > 1) texto = letrasCentenas(m) + ' MIL';
  return [texto, (r ? letrasCentenas(r) : '')].filter(Boolean).join(' ');
}

function letrasMillones(n) {
  const M = Math.floor(n / 1e6);
  const r = n % 1e6;
  let texto = '';
  if (M === 1) texto = 'UN MILLON';
  else if (M > 1) texto = letrasMiles(M) + ' MILLONES';
  return [texto, (r ? letrasMiles(r) : '')].filter(Boolean).join(' ');
}

// 12345.6 -> '(DOCE MIL TRESCIENTOS CUARENTA Y CINCO PESOS 60/100 M.N.)'
function importeConLetra(monto, moneda = 'MXN') {
  let entero = Math.floor(Math.abs(num(monto)));
  let cents = Math.round((Math.abs(num(monto)) - entero) * 100);
  if (cents === 100) { entero += 1; cents = 0; }
  let letras = entero === 0 ? 'CERO' : letrasMillones(entero);
  if (entero >= 1e6 && entero % 1e6 === 0) letras += ' DE';
  const nombre = moneda === 'USD' ? (entero === 1 ? 'DOLAR' : 'DOLARES') : (entero === 1 ? 'PESO' : 'PESOS');
  const sufijo = moneda === 'USD' ? 'USD' : 'M.N.';
  return `(${letras} ${nombre} ${String(cents).padStart(2, '0')}/100 ${sufijo})`;
}

// ---------- Varios ----------

function limpiarTexto(v, max = 5000) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function soloDigitos(v) {
  return String(v || '').replace(/\D+/g, '');
}

module.exports = {
  ZONA,
  hashPassword, verifyPassword, tokenAleatorio,
  ahora, fechaLocal, mesLocal, sumarDias, fechaCorta, fechaLarga,
  num, redondear2, dinero, importeConLetra,
  limpiarTexto, soloDigitos,
};
