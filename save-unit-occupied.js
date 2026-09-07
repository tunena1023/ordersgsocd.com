/* ============================================================
   save-unit-occupied.js — Renovations/Janitorial: el cliente avisa
   si actualmente vive alguien en la unidad, para que el equipo sepa
   que esperar al llegar.

   Es solo informativo para el staff -- nunca dispara ningun aviso
   automatico ni cambia el status de la orden. Aprobado con mini: se
   ve en Admin/Cliente/Tech como el mismo badge azul, de SOLO LECTURA
   del lado de Admin (lo pone el cliente, la oficina no lo edita).
============================================================ */

const {
  ORDERS_LIST, ORDER_HISTORY_LIST,
  updateListItemByItemId, createListItem,
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
    const occupied = body.occupied === true;

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
    const division = String(f.Division || '').toLowerCase();
    if (division !== 'renovations' && division !== 'janitorial') {
      return jsonResponse(400, { error: 'This only applies to Renovations or Janitorial orders.' });
    }

    await Promise.all([
      updateListItemByItemId(ORDERS_LIST, orderItem.id, { UnitOccupied: occupied }),
      createListItem(ORDER_HISTORY_LIST, {
        Title: orderId + '-occupied',
        OrderID: orderId,
        ChangeType: 'Occupied Unit Reported',
        ChangedBy: clientId,
        ChangeDate: new Date().toISOString(),
        Notes: occupied ? 'Client reported someone is currently living in the unit.' : 'Client reported the unit is not occupied.'
      })
    ]);

    return jsonResponse(200, { success: true });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
