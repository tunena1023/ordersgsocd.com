/* ============================================================
   save-client-contact.js — crear, archivar/desarchivar, y elegir
   quien recibe notificaciones entre los contactos de un cliente.

   Contrato: { clientId, action, ...}
     action 'create'        -> { name, type, value }
     action 'archive'       -> { contactId }
     action 'unarchive'     -> { contactId }
     action 'setRecipient'  -> { contactId }  (contactId vacio/omitido
                                = el email principal vuelve a ser el
                                receptor default; desmarca a todos)

   "Borrar" en realidad archiva; no hay delete real. setRecipient
   siempre desmarca primero a cualquier otro contacto del mismo
   cliente antes de marcar al nuevo, para que nunca haya dos a la vez.
============================================================ */

const {
  CLIENT_CONTACTS_LIST,
  createListItem, updateListItemByItemId,
  graphFetch, siteListPath, jsonResponse
} = require('./lib/graph');

function truthy(v) {
  return v === true || v === 'true' || v === 1 || v === '1' || v === 'Yes';
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
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    if (!b.clientId) return jsonResponse(400, { error: 'clientId is required' });

    if (b.action === 'create') {
      if (!b.name || !String(b.name).trim())  return jsonResponse(400, { error: 'Name is required.' });
      if (!b.value || !String(b.value).trim()) return jsonResponse(400, { error: 'Value is required.' });
      const result = await createListItem(CLIENT_CONTACTS_LIST, {
        Title:           b.name,
        ClientID:        b.clientId,
        Name:            b.name  || '',
        ContactType:     b.type  || 'Email',
        Value:           b.value || '',
        Archived:        false,
        NotifyRecipient: false
      });
      return jsonResponse(200, { success: true, contactId: result.id });
    }

    if (b.action === 'archive' || b.action === 'unarchive') {
      if (!b.contactId) return jsonResponse(400, { error: 'contactId is required' });
      await updateListItemByItemId(CLIENT_CONTACTS_LIST, b.contactId, { Archived: b.action === 'archive' });
      return jsonResponse(200, { success: true, contactId: b.contactId });
    }

    if (b.action === 'setRecipient') {
      const rows = await fetchByField(CLIENT_CONTACTS_LIST, 'ClientID', b.clientId);
      for (const it of rows) {
        const isTarget = it.id === String(b.contactId || '');
        const currentlyOn = truthy(it.fields.NotifyRecipient);
        if (isTarget && !currentlyOn) {
          await updateListItemByItemId(CLIENT_CONTACTS_LIST, it.id, { NotifyRecipient: true });
        } else if (!isTarget && currentlyOn) {
          await updateListItemByItemId(CLIENT_CONTACTS_LIST, it.id, { NotifyRecipient: false });
        }
      }
      return jsonResponse(200, { success: true, contactId: b.contactId || null });
    }

    return jsonResponse(400, { error: 'Unknown action.' });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
