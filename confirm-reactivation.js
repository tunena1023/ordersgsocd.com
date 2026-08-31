/* ============================================================
   confirm-reactivation.js — el cliente confirma la reactivacion de una
   orden que fue Cancelled + archivada, y que la oficina mando a
   reactivar (boton "Reactivate" en History, del lado admin).

   Camino doble junto con 'reactivate-confirm' en admin-approve-order.js:
   el que confirme primero (el cliente aqui, o el director alla) gana --
   en cuanto cualquiera de los 2 cambia el Status, el otro deja de
   cumplir la condicion "pendiente" (Status === 'Change Requested'), sin
   necesitar ninguna logica extra de "cancelar la otra opcion".
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
    const { orderId, clientId } = JSON.parse(event.body || '{}');
    if (!orderId) return jsonResponse(400, { error: 'orderId is required' });

    const [orderRows, histRows] = await Promise.all([
      fetchByField(ORDERS_LIST,        'OrderID', orderId),
      fetchByField(ORDER_HISTORY_LIST, 'OrderID', orderId)
    ]);

    const orderItem = orderRows.find(it => it.fields);
    if (!orderItem) return jsonResponse(404, { error: 'Order not found.' });

    const f = orderItem.fields;

    if (clientId && String(f.ClientID || '').trim().toLowerCase() !==
        String(clientId).trim().toLowerCase()) {
      return jsonResponse(403, { error: 'This order does not belong to you.' });
    }

    const currentStatus = f.Status || '';
    if (currentStatus !== 'Change Requested') {
      return jsonResponse(409, { error: 'There is no pending reactivation for this order — it may have already been resolved.' });
    }

    const history = histRows
      .filter(it => it.fields)
      .sort((a, b) => String(a.createdDateTime || '').localeCompare(String(b.createdDateTime || '')));

    /* Confirmar que de verdad es una reactivacion pendiente (marcador
       'Reactivation Pending') y no otro tipo de Change Requested --
       misma tecnica de "solo la solicitud abierta mas reciente" que ya
       usan confirm-change.js/tracking.html/admin.html. Se guarda la
       fila completa (no solo un booleano) porque de ahi se lee
       directo el estatus al que hay que regresar. */
    const REQUEST_OPENING_TYPES = ['Change Requested', 'Cancellation Requested', 'Reschedule Requested', 'Change Requested by Client'];
    let reactivationRow = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i].fields;
      const type = String(h.ChangeType || '');
      if (REQUEST_OPENING_TYPES.indexOf(type) !== -1) {
        if (type === 'Change Requested' && String(h.FieldChanged || '') === 'Reactivation Pending') {
          reactivationRow = h;
        }
        break;
      }
    }
    if (!reactivationRow) {
      return jsonResponse(409, { error: 'This order does not have a pending reactivation request.' });
    }

    /* El estatus al que hay que regresar ya se calculo UNA SOLA VEZ
       cuando la oficina pidio la reactivacion (request-reactivate en
       admin-approve-order.js) y quedo guardado aqui mismo -- se lee
       directo, en vez de volver a adivinarlo buscando hacia atras en
       un historial que para este punto ya puede traer mucho ruido de
       otras solicitudes viejas. Mismo motivo por el que se movio este
       calculo a un solo lugar: SharePoint no valida que el texto que
       se guarda en Status sea un valor real, asi que una adivinanza
       equivocada se guardaba sin ningun error, dejando la orden
       atorada sin que nadie se diera cuenta. */
    let newStatus = 'Assigned';
    try {
      const payload = JSON.parse(reactivationRow.OldValue || '{}');
      if (payload && payload.restoreTo) newStatus = payload.restoreTo;
    } catch (e) { /* deja el fallback 'Assigned' */ }
    const actor = (clientId && String(clientId).trim()) || f.ClientID || '';

    await Promise.all([
      updateListItemByItemId(ORDERS_LIST, orderItem.id, { Status: newStatus }),
      createListItem(ORDER_HISTORY_LIST, {
        Title:        orderId,
        OrderID:      orderId,
        ChangeType:   'Order Reactivated',
        FieldChanged: 'Status',
        ChangedBy:    actor,
        ChangeDate:   new Date().toISOString(),
        Notes:        'Reactivated by the client.',
        OldValue:     currentStatus,
        NewValue:     newStatus
      })
    ]);

    return jsonResponse(200, { success: true, status: newStatus });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
