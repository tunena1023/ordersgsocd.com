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

    await updateListItemByItemId(ORDERS_LIST, orderItem.id, { UnitOccupied: occupied });

    /* Fusionar en vez de duplicar si esto es un vaivén rápido del
       mismo switch (el cliente lo prende y se arrepiente al toque,
       o al revés) -- mismo patrón ya usado en set-materials-ready.js
       (Materials Ready) para "prender + hora llegando por separado".
       Ahí se basa en estado (ya estaba prendido); aquí no hay un
       estado intermedio equivalente, así que se usa una ventana de
       tiempo corta: si el último "Occupied Unit Reported" de esta
       orden se guardó hace menos de MERGE_WINDOW_MS, se actualiza
       ESE renglón (nueva nota + hora) en vez de crear uno nuevo. Dos
       reportes genuinamente separados en el tiempo (días u horas
       aparte) siguen guardándose como dos eventos reales -- esto
       solo colapsa el "clic, me arrepentí, clic otra vez" que se ve
       como dos líneas contradictorias con el mismo minuto. A pedido
       del dueño (19/09/2026), tras ver GS-1001-1007-PO5000 con dos
       renglones opuestos al mismo minuto. */
    const MERGE_WINDOW_MS = 2 * 60 * 1000; // 2 minutos
    const now = new Date();
    const notes = occupied ? 'Client reported someone is currently living in the unit.' : 'Client reported the unit is not occupied.';

    const histRows = await fetchByField(ORDER_HISTORY_LIST, 'OrderID', orderId);
    const latestOccupied = histRows
      .filter(it => it.fields && it.fields.ChangeType === 'Occupied Unit Reported')
      .sort((a, b) => String(b.fields.ChangeDate || '').localeCompare(String(a.fields.ChangeDate || '')))[0];

    const isRecentFlip = latestOccupied && latestOccupied.fields.ChangeDate &&
      (now.getTime() - new Date(latestOccupied.fields.ChangeDate).getTime()) < MERGE_WINDOW_MS;

    if (isRecentFlip) {
      await updateListItemByItemId(ORDER_HISTORY_LIST, latestOccupied.id, { Notes: notes, ChangeDate: now.toISOString() });
    } else {
      await createListItem(ORDER_HISTORY_LIST, {
        Title: orderId + '-occupied',
        OrderID: orderId,
        ChangeType: 'Occupied Unit Reported',
        ChangedBy: clientId,
        ChangeDate: now.toISOString(),
        Notes: notes
      });
    }

    return jsonResponse(200, { success: true });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
