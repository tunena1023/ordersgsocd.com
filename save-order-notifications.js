/* ============================================================
   save-order-notifications.js — preferencias de notificacion de UNA
   orden especifica (el nivel mas especifico, gana sobre las del
   cliente en general).

   Contrato: { clientId, orderId, notificationsEnabled?, notifyConfirmations?,
               notifyChanges?, notifyUpdates?, contactId? }

   Los 4 toggles aceptan: 'inherit' (usar el default de la cuenta,
   se guarda como texto vacio), 'on', 'off'. Si no se manda el campo,
   no se toca. contactId acepta: '' (heredar el default de la cuenta)
   o el id de un contacto de ClientContacts.

   No hay bloqueo de "Confirmations" aqui aunque la orden este
   esperando confirmacion del cliente -- el candado real vive en el
   flow de Power Automate (el evento de confirmacion pendiente
   siempre se manda, sin importar este ajuste), no en el guardado.
============================================================ */

const {
  ORDERS_LIST,
  updateListItemByItemId,
  graphFetch, siteListPath, jsonResponse
} = require('./lib/graph');

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

function toggleValue(v) {
  if (v === 'on') return 'Yes';
  if (v === 'off') return 'No';
  if (v === 'inherit') return '';
  return undefined; // valor desconocido, se ignora
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    if (!b.clientId) return jsonResponse(400, { error: 'clientId is required' });
    if (!b.orderId)  return jsonResponse(400, { error: 'orderId is required' });

    const rows = await fetchByField(ORDERS_LIST, 'OrderID', b.orderId);
    const item = rows.find(it => it.fields);
    if (!item) return jsonResponse(404, { error: 'Order not found.' });

    if (String(item.fields.ClientID || '').trim().toLowerCase() !== String(b.clientId).trim().toLowerCase()) {
      return jsonResponse(403, { error: 'This order does not belong to you.' });
    }

    const patch = {};
    const map = [
      ['OrderNotificationsEnabled', b.notificationsEnabled],
      ['OrderNotifyConfirmations',  b.notifyConfirmations],
      ['OrderNotifyChanges',        b.notifyChanges],
      ['OrderNotifyUpdates',        b.notifyUpdates]
    ];
    for (const [col, incoming] of map) {
      if (incoming === undefined) continue;
      const v = toggleValue(incoming);
      if (v !== undefined) patch[col] = v;
    }
    if (b.contactId !== undefined) patch.OrderContactId = b.contactId || '';

    if (Object.keys(patch).length) {
      await updateListItemByItemId(ORDERS_LIST, item.id, patch);
    }

    return jsonResponse(200, { success: true });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
