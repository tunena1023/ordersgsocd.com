/* ============================================================
   validate-client.js — paso 1 del login: el Client ID.
   - businessName se lee de Title (así lo escribe register-client)
   - Trae y filtra en JavaScript (patrón probado; $filter sobre
     fields era poco confiable)
   - Pagina resultados (@odata.nextLink)

   Desde el 25/09/2026 (lib/client-auth.js): el Client ID solo ya NO
   deja entrar. Si este dispositivo ya esta recordado para ese cliente
   (cookie firmada), entra directo y la cookie se renueva. Si no,
   responde { verify: true } y el navegador pide el ZIP o los ultimos 4
   del telefono (verify-client.js). Nunca regresa datos de la cuenta
   sin sesion valida.
============================================================ */

const { CLIENTS_LIST, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');
const { readSession, sessionCookie, sameClient, lockedUntil, sessionPayload } = require('./lib/client-auth');

/* Descarga TODOS los items de una lista siguiendo la paginación de Graph */
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { clientId } = JSON.parse(event.body || '{}');
    if (!clientId) return jsonResponse(400, { valid: false, error: 'clientId is required' });

    const rows = await fetchAll(CLIENTS_LIST);
    const wanted = String(clientId).trim().toLowerCase();

    const item = (rows || []).find(it =>
      it.fields && String(it.fields.ClientID || '').trim().toLowerCase() === wanted
    );

    if (!item) return jsonResponse(200, { valid: false });

    const f = item.fields;

    /* Dispositivo ya recordado para ESTE cliente: entra directo. */
    const session = readSession(event);
    if (session && sameClient(session.cid, f.ClientID)) {
      const res = jsonResponse(200, sessionPayload(f));
      res.headers = Object.assign({}, res.headers, { 'Set-Cookie': sessionCookie(f.ClientID, session.remember) });
      return res;
    }

    if (lockedUntil(f)) return jsonResponse(200, { valid: false, locked: true });

    return jsonResponse(200, { valid: true, verify: true, clientId: f.ClientID });

  } catch (err) {
    return jsonResponse(500, { valid: false, error: err.message });
  }
};
