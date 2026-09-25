/* logout.js — "Sign out" (25/09/2026): borra la cookie de sesion para
   que este dispositivo deje de estar recordado. Ver lib/client-auth.js. */
const { jsonResponse } = require('./lib/graph');
const { clearCookie } = require('./lib/client-auth');

exports.handler = async () => {
  const res = jsonResponse(200, { success: true });
  res.headers = Object.assign({}, res.headers, { 'Set-Cookie': clearCookie() });
  return res;
};
