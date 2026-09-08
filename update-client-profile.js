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

    /* Horarios de oficina de la direccion principal -- mismas columnas
       ya usadas para edificios secundarios (ClientAddresses) y en
       Developer. Default Sin marcar (false) si nunca se configuro,
       NO "Si" como las preferencias de notificacion de arriba. */
    const dayBoolMap = [
      ['MonOpen', b.monOpen, 'Office Hours: Mon'],
      ['TueOpen', b.tueOpen, 'Office Hours: Tue'],
      ['WedOpen', b.wedOpen, 'Office Hours: Wed'],
      ['ThuOpen', b.thuOpen, 'Office Hours: Thu'],
      ['FriOpen', b.friOpen, 'Office Hours: Fri'],
      ['SatOpen', b.satOpen, 'Office Hours: Sat'],
      ['SunOpen', b.sunOpen, 'Office Hours: Sun']
    ];
    for (const [col, incoming, label] of dayBoolMap) {
      if (incoming === undefined) continue;
      const oldValue = truthy(f[col]);
      const next = truthy(incoming);
      patch[col] = next;
      if (oldValue !== next) changes.push({ label, old: oldValue ? 'Yes' : 'No', next: next ? 'Yes' : 'No' });
    }
    if (b.officeHours !== undefined) {
      const oldValue = f.OfficeHours || '';
      const next = b.officeHours || '';
      patch.OfficeHours = next;
      if (!sameValue(oldValue, next)) changes.push({ label: 'Office Hours: Shared', old: oldValue, next });
    }

    /* Las 8 columnas de horarios son NUEVAS en Clients -- si todavia no
       existen, Graph rechaza el PATCH COMPLETO. Reintenta sin esos
       campos para que el resto de la edicion nunca se bloquee. */
    const HOURS_COLUMNS = ['MonOpen','TueOpen','WedOpen','ThuOpen','FriOpen','SatOpen','SunOpen','OfficeHours'];
    if (Object.keys(patch).length) {
      try {
        await updateListItemByItemId(CLIENTS_LIST, item.id, patch);
      } catch (patchErr) {
        const fallbackPatch = Object.assign({}, patch);
        let hadHoursField = false;
        HOURS_COLUMNS.forEach(col => { if (col in fallbackPatch) { delete fallbackPatch[col]; hadHoursField = true; } });
        if (!hadHoursField) throw patchErr;
        if (Object.keys(fallbackPatch).length) await updateListItemByItemId(CLIENTS_LIST, item.id, fallbackPatch);
        changes.splice(0, changes.length, ...changes.filter(c => !String(c.label).startsWith('Office Hours')));
      }
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
      monOpen:     patch.MonOpen     !== undefined ? patch.MonOpen     : truthy(f.MonOpen),
      tueOpen:     patch.TueOpen     !== undefined ? patch.TueOpen     : truthy(f.TueOpen),
      wedOpen:     patch.WedOpen     !== undefined ? patch.WedOpen     : truthy(f.WedOpen),
      thuOpen:     patch.ThuOpen     !== undefined ? patch.ThuOpen     : truthy(f.ThuOpen),
      friOpen:     patch.FriOpen     !== undefined ? patch.FriOpen     : truthy(f.FriOpen),
      satOpen:     patch.SatOpen     !== undefined ? patch.SatOpen     : truthy(f.SatOpen),
      sunOpen:     patch.SunOpen     !== undefined ? patch.SunOpen     : truthy(f.SunOpen),
      officeHours: patch.OfficeHours !== undefined ? patch.OfficeHours : (f.OfficeHours || ''),
      changesLogged: logged,
      historyError:  logError
    });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
