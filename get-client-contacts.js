/* ============================================================
   get-client-contacts.js — contactos adicionales de un cliente
   ("Profile" > Contacts). Compartida entre la primaria y cada
   building (un building puede apuntar a uno de estos contactos).

   Por default regresa solo los activos (Archived=No). includeArchived
   =true los regresa todos (para poder desarchivar uno por error).
============================================================ */

const { CLIENT_CONTACTS_LIST, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');

function truthy(v) {
  return v === true || v === 'true' || v === 1 || v === '1' || v === 'Yes';
}

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

    const wanted = String(b.clientId).trim().toLowerCase();
    const includeArchived = !!b.includeArchived;

    const rows = await fetchAll(CLIENT_CONTACTS_LIST);

    const contacts = rows
      .filter(it => it.fields && String(it.fields.ClientID || '').trim().toLowerCase() === wanted)
      .filter(it => includeArchived || !truthy(it.fields.Archived))
      .map(it => {
        const f = it.fields;
        return {
          id:              it.id,
          name:            f.Name        || '',
          type:            f.ContactType || '',
          value:           f.Value       || '',
          notifyRecipient: truthy(f.NotifyRecipient),
          archived:        truthy(f.Archived)
        };
      })
      .sort((a, b2) => a.name.localeCompare(b2.name));

    return jsonResponse(200, { contacts });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
