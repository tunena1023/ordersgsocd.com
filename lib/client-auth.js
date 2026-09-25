/* ============================================================
   lib/client-auth.js -- sesion del cliente en el SERVIDOR (25/09/2026).

   Antes: el portal le creia al navegador el clientId que mandara en
   cada peticion. Los Client ID son consecutivos (GS-1001, GS-1002...),
   asi que cualquiera podia ver o cambiar la cuenta de otro cliente.

   Ahora (decidido con el dueño, mini aprobado:
   https://claude.ai/artifact/XYFnaMfkfSFtrVYiznaEec):
   - El cliente sigue entrando con su Client ID.
   - SOLO la primera vez en cada dispositivo confirma su ZIP (el de la
     cuenta o el de cualquiera de sus edificios) o los ultimos 4 de un
     telefono registrado (el de la cuenta o un contacto tipo Phone).
   - Al confirmarlo, el servidor manda una cookie FIRMADA (HttpOnly, el
     navegador no la puede leer ni falsificar) con su Client ID. Con
     "Remember this device" dura 180 dias y se renueva cada vez que entra;
     sin marcarla, dura lo que dure el navegador abierto (max 12 h).
   - El router (api/[...slug].js) saca el Client ID de esa cookie en
     cada peticion y NUNCA del body.
   - 5 intentos fallidos de ZIP/celular bloquean esa cuenta 1 hora y
     avisan a la oficina. Guarda el conteo en Clients.LoginFailCount y
     Clients.LoginLockedUntil (columnas nuevas; si no existen todavia, el
     login funciona igual pero sin bloqueo).

   Variable de entorno obligatoria: CLIENT_SESSION_SECRET (texto largo al
   azar, distinto en Production y Preview). Sin ella nadie puede entrar
   (se falla cerrado a proposito, nunca se firma con una clave vacia).
============================================================ */
const crypto = require('crypto');

const COOKIE = 'gs_client_auth';
const REMEMBER_SECONDS = 180 * 24 * 3600;
const SESSION_SECONDS = 12 * 3600;
const MAX_FAILS = 5;
const LOCK_MS = 60 * 60 * 1000;

function secret() {
  const s = String(process.env.CLIENT_SESSION_SECRET || '');
  if (s.length < 32) throw new Error('Sign-in is not configured (CLIENT_SESSION_SECRET).');
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function hmac(data) {
  return b64url(crypto.createHmac('sha256', secret()).update(data).digest());
}

function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  return body + '.' + hmac(body);
}

function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  let expected;
  try { expected = hmac(parts[0]); } catch (e) { return null; }
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return null; }
  if (!payload || !payload.cid || !payload.exp || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function headerOf(event, name) {
  const h = (event && event.headers) || {};
  const key = Object.keys(h).find(k => k.toLowerCase() === name);
  return key ? h[key] : '';
}

/* { cid, remember } o null */
function readSession(event) {
  const token = parseCookies(headerOf(event, 'cookie'))[COOKIE];
  const p = token ? verifyToken(token) : null;
  return p ? { cid: String(p.cid), remember: !!p.r } : null;
}

function sessionCookie(clientId, remember) {
  const ttl = remember ? REMEMBER_SECONDS : SESSION_SECONDS;
  const token = signToken({ cid: clientId, r: remember ? 1 : 0, exp: Math.floor(Date.now() / 1000) + ttl });
  return COOKIE + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Secure; SameSite=Lax' +
    (remember ? '; Max-Age=' + REMEMBER_SECONDS : '');
}

function clearCookie() {
  return COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

function sameClient(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/* ===== Confirmar ZIP o ultimos 4 del telefono (puras, con pruebas) ===== */
function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

function zipMatches(value, client, addresses) {
  const want = digits(value).slice(0, 5);
  if (want.length !== 5) return false;
  const zips = [client && client.Zip].concat((addresses || []).filter(a => a && a.Archived !== true && a.Archived !== 'true').map(a => a.Zip));
  return zips.some(z => digits(z).slice(0, 5) === want);
}

function phoneMatches(value, client, contacts) {
  const want = digits(value);
  if (want.length !== 4) return false;
  const phones = [client && client.Phone].concat((contacts || [])
    .filter(c => c && c.Archived !== true && c.Archived !== 'true' && String(c.ContactType || '') === 'Phone')
    .map(c => c.Value));
  return phones.some(p => { const d = digits(p); return d.length >= 4 && d.slice(-4) === want; });
}

/* ===== Bloqueo por intentos fallidos (en la fila de Clients) ===== */
function lockedUntil(client) {
  const t = client && client.LoginLockedUntil ? new Date(client.LoginLockedUntil).getTime() : 0;
  return t > Date.now() ? t : 0;
}

function nextFailState(client) {
  const fails = (parseInt(client && client.LoginFailCount, 10) || 0) + 1;
  if (fails >= MAX_FAILS) {
    return { patch: { LoginFailCount: 0, LoginLockedUntil: new Date(Date.now() + LOCK_MS).toISOString() }, locked: true, triesLeft: 0 };
  }
  return { patch: { LoginFailCount: fails }, locked: false, triesLeft: MAX_FAILS - fails };
}

/* Lo que se le regresa al navegador al entrar -- mismo formato que ya
   guardaba GS.session (sessionStorage) para no tocar customer.html. */
function sessionPayload(f) {
  return {
    valid: true,
    clientId: f.ClientID,
    businessName: f.Title,
    contactPerson: f.ClientName || '',
    address: f.Address || '',
    suite: f.Suite || '',
    city: f.City || '',
    zip: f.Zip || '',
    contact: f.Contact || '',
    phone: f.Phone || '',
    showEstimatedTime: f.ShowEstimatedTime === true || f.ShowEstimatedTime === 'true'
  };
}

module.exports = {
  COOKIE, MAX_FAILS,
  signToken, verifyToken, parseCookies, readSession, sessionCookie, clearCookie, sameClient,
  zipMatches, phoneMatches, lockedUntil, nextFailState, sessionPayload
};
