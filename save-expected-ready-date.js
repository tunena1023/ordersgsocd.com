/* ============================================================
   save-expected-ready-date.js — Renovations: el cliente da una
   fecha aproximada de cuando espera tener el material listo.

   Es solo informativo, para que la oficina planee con anticipacion --
   nunca dispara ningun aviso ni cambia el status de la orden. No es
   obligatorio: puede quedar vacio en cualquier momento.
============================================================ */

const {
  ORDERS_LIST, ORDER_HISTORY_LIST,
  createListItem, updateListItemByItemId,
  graphFetch, siteListPath,
  jsonResponse
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const orderId = body.orderId;
    const clientId = body.clientId;
    const expectedReadyDate = String(body.expectedReadyDate || '').trim();

    if (!orderId || !clientId) return jsonResponse(400, { error: 'orderId and clientId are required' });

    const orderRows = await fetchByField(ORDERS_LIST, 'OrderID', orderId);
    const orderItem = orderRows.find(it => it.fields);
    if (!orderItem) return jsonResponse(404, { error: 'Order not found.' });

    const f = orderItem.fields;
    if (String(f.ClientID || '').trim() !== String(clientId).trim()) {
      return jsonResponse(403, { error: 'This order does not belong to you.' });
    }
    if (f.Status === 'Cancelled' || f.Status === 'Completed') {
      return jsonResponse(409, { error: 'This order is ' + String(f.Status).toLowerCase() + '. Please call our office.' });
    }

    await Promise.all([
      updateListItemByItemId(ORDERS_LIST, orderItem.id, { ExpectedReadyDate: expectedReadyDate }),
      createListItem(ORDER_HISTORY_LIST, {
        Title: orderId + '-readydate',
        OrderID: orderId,
        ChangeType: 'Expected Ready Date',
        ChangedBy: clientId,
        ChangeDate: new Date().toISOString(),
        Notes: expectedReadyDate ? ('Expected ready date set to ' + expectedReadyDate + '.') : 'Expected ready date cleared.'
      })
    ]);

    return jsonResponse(200, { success: true });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
