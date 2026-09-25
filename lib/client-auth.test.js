/* node lib/client-auth.test.js */
process.env.CLIENT_SESSION_SECRET = 'x'.repeat(40);
const a = require('./client-auth');

function assert(name, cond) {
  if (cond) console.log('OK   - ' + name);
  else { console.error('FAIL - ' + name); process.exitCode = 1; }
}

// ---- firma ----
{
  const t = a.signToken({ cid: 'GS-1001', r: 1, exp: Math.floor(Date.now() / 1000) + 60 });
  assert('token valido se lee', a.verifyToken(t).cid === 'GS-1001');
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ cid: 'GS-1002', r: 1, exp: 9999999999 })).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  assert('cambiar el Client ID rompe la firma', a.verifyToken(forged + '.' + sig) === null);
  assert('firma cortada no pasa', a.verifyToken(body + '.' + sig.slice(0, -2)) === null);
  const old = a.signToken({ cid: 'GS-1001', exp: Math.floor(Date.now() / 1000) - 5 });
  assert('token vencido no pasa', a.verifyToken(old) === null);
  assert('basura no pasa', a.verifyToken('abc') === null && a.verifyToken('') === null);
}

// ---- cookie ----
{
  const c = a.sessionCookie('GS-1001', true);
  assert('cookie recordada: HttpOnly, Secure, 180 dias', /HttpOnly/.test(c) && /Secure/.test(c) && /Max-Age=15552000/.test(c));
  assert('cookie sin recordar: sin Max-Age', !/Max-Age/.test(a.sessionCookie('GS-1001', false)));
  const value = c.split(';')[0];
  const s = a.readSession({ headers: { Cookie: 'otra=1; ' + value } });
  assert('readSession saca el Client ID de la cookie', s && s.cid === 'GS-1001' && s.remember === true);
  assert('sin cookie = sin sesion', a.readSession({ headers: {} }) === null);
  assert('clearCookie la borra', /Max-Age=0/.test(a.clearCookie()));
}

// ---- ZIP / telefono ----
const client = { Zip: '50309-1234', Phone: '(515) 473-5990' };
const addresses = [{ Zip: '50315' }, { Zip: '50266', Archived: true }];
const contacts = [{ ContactType: 'Phone', Value: '515-555-0101' }, { ContactType: 'Email', Value: 'x@y.com' }, { ContactType: 'Phone', Value: '515-555-7777', Archived: true }];
assert('ZIP de la cuenta (con +4)', a.zipMatches('50309', client, addresses));
assert('ZIP de un edificio', a.zipMatches('50315', client, addresses));
assert('ZIP de edificio archivado no vale', !a.zipMatches('50266', client, addresses));
assert('ZIP equivocado', !a.zipMatches('12345', client, addresses));
assert('ZIP incompleto', !a.zipMatches('503', client, addresses));
assert('ultimos 4 del telefono de la cuenta', a.phoneMatches('5990', client, contacts));
assert('ultimos 4 de un contacto Phone', a.phoneMatches('0101', client, contacts));
assert('contacto Phone archivado no vale', !a.phoneMatches('7777', client, contacts));
assert('telefono equivocado', !a.phoneMatches('1234', client, contacts));
assert('telefono con 3 digitos no vale', !a.phoneMatches('990', client, contacts));
assert('sin telefono registrado no pasa nada', !a.phoneMatches('0000', {}, []));

// ---- bloqueo ----
{
  let st = { LoginFailCount: 3 };
  const r4 = a.nextFailState(st);
  assert('4o error: queda 1 intento', !r4.locked && r4.triesLeft === 1 && r4.patch.LoginFailCount === 4);
  const r5 = a.nextFailState({ LoginFailCount: 4 });
  assert('5o error: bloquea 1 hora', r5.locked && r5.patch.LoginLockedUntil && a.lockedUntil({ LoginLockedUntil: r5.patch.LoginLockedUntil }) > Date.now());
  assert('bloqueo vencido ya no bloquea', a.lockedUntil({ LoginLockedUntil: new Date(Date.now() - 1000).toISOString() }) === 0);
}

// ---- sin secreto: falla cerrado ----
{
  const saved = process.env.CLIENT_SESSION_SECRET;
  process.env.CLIENT_SESSION_SECRET = '';
  let threw = false; try { a.sessionCookie('GS-1001', true); } catch (e) { threw = true; }
  assert('sin CLIENT_SESSION_SECRET no se firma nada', threw);
  assert('sin CLIENT_SESSION_SECRET ninguna cookie es valida', a.verifyToken('a.b') === null);
  process.env.CLIENT_SESSION_SECRET = saved;
}
