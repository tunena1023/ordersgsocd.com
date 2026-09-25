/* ============================================================
   recover-client-id.js — recuperación de ClientID por email.
   Manda el correo directo desde el codigo (lib/notify.js,
   25/09/2026) al email principal de la cuenta, y deja una fila en
   IdRecovery como registro. Antes lo mandaba un flow de Power
   Automate que nunca quedo, y el anti-duplicado dejaba recuperar el
   ID una sola vez en la vida por email; ahora se puede pedir de
   nuevo, con un freno de 10 minutos entre correos para que nadie lo
   use para llenarle el buzon a un cliente.
   Content-Type OBLIGATORIO en el POST.
============================================================ */

const graph = require('./lib/graph');
const { CLIENTS_LIST, graphFetch, siteListPath, jsonResponse } = graph;
const { sendClientIdEmail } = require('./lib/notify');

const RESEND_WAIT_MS = 10 * 60 * 1000;

const RECOVERY_LIST = 'IdRecovery';

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

async function fetchByField(listName, fieldName, value) {
  const filter = encodeURIComponent(`fields/${fieldName} eq '${value}'`);
  let url = siteListPath(listName) + `?$expand=fields&$top=200&$filter=${filter}`;
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
    const { email } = JSON.parse(event.body || '{}');
    if (!email) return jsonResponse(400, { found: false, error: 'email is required' });

    const wanted = String(email).trim().toLowerCase();

    /* Clients no tiene índice OData confiable por email — fetchAll necesario.
       IdRecovery sí puede filtrarse por Email en paralelo. */
    const [clientRows, recRows] = await Promise.all([
      fetchAll(CLIENTS_LIST),
      fetchByField(RECOVERY_LIST, 'Email', email.trim())
    ]);

    const item = clientRows.find(it =>
      it.fields && String(it.fields.Contact || '').trim().toLowerCase() === wanted
    );

    if (!item) return jsonResponse(200, { found: false });

    const f = item.fields;

    /* Freno: si ya se mando uno a este email hace menos de 10 min, no
       se manda otro (la respuesta es la misma, found: true). */
    const recent = recRows.some(it =>
      it.fields &&
      String(it.fields.Email    || '').trim().toLowerCase() === wanted &&
      String(it.fields.ClientID || '').trim() === String(f.ClientID || '').trim() &&
      Date.now() - new Date(it.createdDateTime || 0).getTime() < RESEND_WAIT_MS
    );

    if (!recent) {
      await sendClientIdEmail(graph, { to: f.Contact, clientId: f.ClientID, businessName: f.Title || f.BusinessName || '' });
      await graphFetch(siteListPath(RECOVERY_LIST), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            Title:    f.ClientID || '',
            Email:    f.Contact,
            ClientID: f.ClientID
          }
        })
      });
    }

    return jsonResponse(200, { found: true });

  } catch (err) {
    return jsonResponse(500, { found: false, error: err.message });
  }
};