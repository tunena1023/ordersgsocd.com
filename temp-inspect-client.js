/* ============================================================
   temp-inspect-client.js — DIAGNOSTICO TEMPORAL, BORRAR DESPUES
   DE USARLO.

   Regresa el objeto "fields" crudo de Graph para un cliente, tal
   cual lo entrega SharePoint -- sin ningun mapeo, sin adivinar
   nada. Sirve para confirmar de una vez por todas el nombre
   INTERNO real de cada columna (que puede no coincidir con el
   titulo visible que se ve en la interfaz de SharePoint).
============================================================ */

const { CLIENTS_LIST, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');

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
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    if (!b.clientId) return jsonResponse(400, { error: 'clientId is required' });

    const rows = await fetchAll(CLIENTS_LIST);
    const wanted = String(b.clientId).trim().toLowerCase();
    const item = rows.find(it =>
      it.fields && String(it.fields.ClientID || '').trim().toLowerCase() === wanted
    );
    if (!item) return jsonResponse(404, { error: 'Client not found.' });

    return jsonResponse(200, {
      note: 'Estos son los nombres INTERNOS reales de columna (las keys de este objeto), con su valor crudo tal cual.',
      itemId: item.id,
      rawFields: item.fields
    });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
