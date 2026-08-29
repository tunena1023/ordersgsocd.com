/* ============================================================
   validate-client.js — login con ClientID.
   Cambios vs la versión vieja:
   - businessName se lee de Title (así lo escribe register-client;
     fuera el campo/fallback BussinesName)
   - Trae y filtra en JavaScript (patrón probado; $filter sobre
     fields era poco confiable)
   - Pagina resultados (@odata.nextLink) para no perder clientes
     cuando la lista crezca de 200 filas
============================================================ */

const { CLIENTS_LIST, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');

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
    return jsonResponse(200, {
      valid: true,
      clientId: f.ClientID,
      businessName: f.Title,              // el nombre del negocio vive en Title
      contactPerson: f.BusinessName || '',
      address: f.Address || '',
      suite: f.Suite || '',
      city: f.City || '',
      zip: f.Zip || '',
      contact: f.Contact || '',           // email
      phone: f.Phone || ''
    });

  } catch (err) {
    return jsonResponse(500, { valid: false, error: err.message });
  }
};