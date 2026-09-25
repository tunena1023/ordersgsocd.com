/* ============================================================
   verify-client.js — paso 2 del login (25/09/2026), solo la primera vez
   en cada dispositivo: confirmar el ZIP (de la cuenta o de un edificio)
   o los ultimos 4 de un telefono registrado (el de la cuenta o un
   contacto tipo Phone). Ver lib/client-auth.js.

   Contrato: { clientId, method: 'zip'|'phone', value, remember }
   Respuestas:
     { valid: true, ...sesion }          + Set-Cookie (cookie firmada)
     { valid: false, triesLeft }         dato equivocado
     { valid: false, locked: true }      5 errores -> 1 hora bloqueada
============================================================ */

const {
  CLIENTS_LIST, CLIENT_ADDRESSES_LIST, CLIENT_CONTACTS_LIST,
  graphFetch, siteListPath, updateListItemByItemId, jsonResponse
} = require('./lib/graph');
const graph = require('./lib/graph');
const auth = require('./lib/client-auth');
const { notifyOffice } = require('./lib/notify');

async function fetchAll(listName) {
  let url = siteListPath(listName) + '?$expand=fields&$top=200';
  const out = [];
  while (url) {
    const data = await graphFetch(url);
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

async function fetchByClient(listName, clientId) {
  const rows = await fetchAll(listName);
  return rows.filter(it => it.fields && auth.sameClient(it.fields.ClientID, clientId))
    .map(it => Object.assign({ id: it.id }, it.fields));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const method = b.method === 'phone' ? 'phone' : 'zip';
    if (!b.clientId || !b.value) return jsonResponse(400, { valid: false, error: 'clientId and value are required' });

    const rows = await fetchAll(CLIENTS_LIST);
    const item = rows.find(it => it.fields && auth.sameClient(it.fields.ClientID, b.clientId));
    if (!item) return jsonResponse(200, { valid: false });
    const f = item.fields;

    if (auth.lockedUntil(f)) return jsonResponse(200, { valid: false, locked: true });

    const ok = method === 'zip'
      ? auth.zipMatches(b.value, f, await fetchByClient(CLIENT_ADDRESSES_LIST, f.ClientID).catch(() => []))
      : auth.phoneMatches(b.value, f, await fetchByClient(CLIENT_CONTACTS_LIST, f.ClientID).catch(() => []));

    if (ok) {
      if (parseInt(f.LoginFailCount, 10) > 0) {
        await updateListItemByItemId(CLIENTS_LIST, item.id, { LoginFailCount: 0 }).catch(() => {});
      }
      const res = jsonResponse(200, auth.sessionPayload(f));
      res.headers = Object.assign({}, res.headers, { 'Set-Cookie': auth.sessionCookie(f.ClientID, b.remember !== false) });
      return res;
    }

    /* Error: contar el intento. Si las columnas LoginFailCount/
       LoginLockedUntil todavia no existen en Clients, el PATCH falla y el
       login sigue funcionando, solo que sin bloqueo (triesLeft null). */
    const next = auth.nextFailState(f);
    let counted = true;
    try { await updateListItemByItemId(CLIENTS_LIST, item.id, next.patch); }
    catch (e) { counted = false; console.error('verify-client: no se pudo contar el intento:', e.message); }

    if (counted && next.locked) {
      await notifyOffice(graph, {
        event: 'client-request', kind: 'login-locked',
        order: { ClientID: f.ClientID, BusinessName: f.Title },
        details: [['Client', (f.Title || '') + ' (' + f.ClientID + ')'], ['What happened', auth.MAX_FAILS + ' wrong ZIP/phone tries on a new device'], ['Locked for', '1 hour']]
      });
      return jsonResponse(200, { valid: false, locked: true });
    }
    return jsonResponse(200, { valid: false, triesLeft: counted ? next.triesLeft : null });

  } catch (err) {
    return jsonResponse(500, { valid: false, error: err.message });
  }
};
