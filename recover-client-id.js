/* ============================================================
   recover-client-id.js — recuperación de ClientID por email.
   Escribe una fila en IdRecovery; un flow de Power Automate
   manda el correo. Content-Type OBLIGATORIO en el POST.
============================================================ */

const { CLIENTS_LIST, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');

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

    /* Anti-duplicado: si ya existe la fila, el flow no se vuelve a disparar */
    const already = recRows.some(it =>
      it.fields &&
      String(it.fields.Email    || '').trim().toLowerCase() === wanted &&
      String(it.fields.ClientID || '').trim() === String(f.ClientID || '').trim()
    );

    if (!already) {
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