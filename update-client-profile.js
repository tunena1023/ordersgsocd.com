/* ============================================================
   update-client-profile.js — el cliente edita su propia info de
   negocio desde el tab Profile (self-service).

   Mismo mapeo de columnas que admin-update-client.js, para que no
   quede inconsistencia entre lo que edita el admin y lo que edita
   el cliente. Registra cada cambio en ClientHistory (ChangedBy =
   el propio ClientID, para diferenciarlo de cambios hechos por
   'Admin').
============================================================ */

const {
  CLIENTS_LIST, CLIENT_HISTORY_LIST,
  createListItem, updateListItemByItemId,
  graphFetch, siteListPath, jsonResponse
} = require('./lib/graph');

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

function sameValue(a, b) {
  return String(a == null ? '' : a) === String(b == null ? '' : b);
}

/* Mismo criterio que admin-update-client.js para columnas Si/No */
function truthy(v) {
  return v === true || v === 'true' || v === 1 || v === '1' || v === 'Yes';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    if (!b.clientId) return jsonResponse(400, { error: 'clientId is required' });

    const rows = await fetchAll(CLIENTS_LIST);
    const item = rows.find(it =>
      it.fields && String(it.fields.ClientID || '').trim().toLowerCase() === String(b.clientId).trim().toLowerCase()
    );
    if (!item) return jsonResponse(404, { error: 'Client not found.' });

    const f = item.fields;

    const map = [
      ['Title',        b.businessName,  'Business Name'],
      ['ClientName',   b.contactPerson, 'Contact Person'],
      ['Contact',      b.contact,       'Contact Email'],
      ['Phone',        b.phone,         'Phone'],
      ['Address',      b.address,       'Address'],
      ['Suite',        b.suite,         'Suite'],
      ['City',         b.city,          'City'],
      ['Zip',          b.zip,           'Zip']
    ];

    const patch = {};
    const changes = [];
    for (const [col, incoming, label] of map) {
      if (incoming === undefined) continue;
      const oldValue = f[col] == null ? '' : String(f[col]);
      const next = incoming == null ? '' : String(incoming);
      patch[col] = next;
      if (!sameValue(oldValue, next)) changes.push({ label, old: oldValue, next });
    }

    /* Preferencias de notificacion: ahora el cliente tambien las puede
       tocar desde su propio Profile (antes solo el admin). Mismo
       default seguro (Si) si la columna no tiene valor todavia. */
    const boolMap = [
      ['NotificationsEnabled', b.notificationsEnabled, 'Notifications: Master'],
      ['NotifyConfirmations',  b.notifyConfirmations,  'Notifications: Confirmations'],
      ['NotifyChanges',        b.notifyChanges,        'Notifications: Changes'],
      ['NotifyUpdates',        b.notifyUpdates,        'Notifications: Updates']
    ];
    for (const [col, incoming, label] of boolMap) {
      if (incoming === undefined) continue;
      const oldValue = f[col] == null ? true : truthy(f[col]);
      const next = truthy(incoming);
      patch[col] = next;
      if (oldValue !== next) changes.push({ label, old: oldValue ? 'Yes' : 'No', next: next ? 'Yes' : 'No' });
    }

    if (Object.keys(patch).length) {
      await updateListItemByItemId(CLIENTS_LIST, item.id, patch);
    }

    let logged = 0, logError = null;
    for (const ch of changes) {
      try {
        await createListItem(CLIENT_HISTORY_LIST, {
          Title:        b.clientId + ' - ' + ch.label,
          ClientID:     b.clientId,
          ChangeType:   'Client Data Updated',
          ChangedBy:    b.clientId,   // self-service: el actor es el propio cliente, no 'Admin'
          ChangeDate:   new Date().toISOString(),
          FieldChanged: ch.label,
          OldValue:     ch.old,
          NewValue:     ch.next,
          Notes:        'Updated by client from Profile.'
        });
        logged++;
      } catch (e) { logError = e.message; }
    }

    return jsonResponse(200, {
      success: true,
      businessName:  patch.Title        !== undefined ? patch.Title        : f.Title,
      contactPerson: patch.ClientName   !== undefined ? patch.ClientName   : f.ClientName,
      contact:       patch.Contact      !== undefined ? patch.Contact      : f.Contact,
      phone:         patch.Phone        !== undefined ? patch.Phone        : f.Phone,
      address:       patch.Address      !== undefined ? patch.Address      : f.Address,
      suite:         patch.Suite        !== undefined ? patch.Suite        : f.Suite,
      city:          patch.City         !== undefined ? patch.City         : f.City,
      zip:           patch.Zip          !== undefined ? patch.Zip          : f.Zip,
      notificationsEnabled: patch.NotificationsEnabled !== undefined ? patch.NotificationsEnabled : (f.NotificationsEnabled == null ? true : truthy(f.NotificationsEnabled)),
      notifyConfirmations:  patch.NotifyConfirmations  !== undefined ? patch.NotifyConfirmations  : (f.NotifyConfirmations  == null ? true : truthy(f.NotifyConfirmations)),
      notifyChanges:        patch.NotifyChanges        !== undefined ? patch.NotifyChanges        : (f.NotifyChanges        == null ? true : truthy(f.NotifyChanges)),
      notifyUpdates:        patch.NotifyUpdates        !== undefined ? patch.NotifyUpdates        : (f.NotifyUpdates        == null ? true : truthy(f.NotifyUpdates)),
      changesLogged: logged,
      historyError:  logError
    });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
