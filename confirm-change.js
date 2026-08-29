/* ============================================================
   confirm-change.js — el cliente confirma un cambio que la oficina
   propuso directo (boton "Request Confirmation" en Active).

   Los datos YA se aplicaron desde que la oficina guardo el cambio
   (admin-update-order.js en modo requestOnly escribe los campos/
   servicios de una vez, igual que una solicitud del cliente). Aqui
   solo se confirma: el Status pasa de 'Change Requested' a 'Updated'
   y queda registrado que el cliente lo acepto.

   Filtra por OrderID via OData para no descargar listas completas.
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
    const { orderId, clientId } = JSON.parse(event.body || '{}');
    if (!orderId) return jsonResponse(400, { error: 'orderId is required' });

    const [orderRows, histRows] = await Promise.all([
      fetchByField(ORDERS_LIST, 'OrderID', orderId),
      fetchByField(ORDER_HISTORY_LIST, 'OrderID', orderId)
    ]);

    const orderItem = orderRows.find(it => it.fields);
    if (!orderItem) return jsonResponse(404, { error: 'Order not found.' });

    const f = orderItem.fields;

    if (clientId &&
        String(f.ClientID || '').trim().toLowerCase() !== String(clientId).trim().toLowerCase()) {
      return jsonResponse(403, { error: 'This order does not belong to you.' });
    }

    if (String(f.Status || '') !== 'Change Requested') {
      return jsonResponse(409, { error: 'There is nothing waiting for confirmation on this order.' });
    }

    /* Verificar que de verdad sea una solicitud pendiente de CONFIRMACION
       del cliente, no una que este esperando al director. Si alguien
       intenta confirmar la equivocada, mejor error claro que dejar que
       pase algo que no debia. */
    const history = histRows
      .filter(it => it.fields)
      .sort((a, b) => String(a.createdDateTime || '').localeCompare(String(b.createdDateTime || '')));

    let isWaitingForClient = false;
    let previousStatus = 'Assigned';
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (String(h.ChangeType || '') === 'Change Requested' &&
          String(h.FieldChanged || '') === 'Client Confirmation') {
        isWaitingForClient = true;
        break;
      }
    }
    if (!isWaitingForClient) {
      return jsonResponse(409, {
        error: 'This change is waiting for our office to review it, not for your confirmation.'
      });
    }

    /* El estatus anterior a la solicitud, para dejarlo en el historial
       igual que hace admin-approve-order.js. Nunca "Change Requested"
       ni un snapshot de servicios. */
    for (let i = history.length - 1; i >= 0; i--) {
      const v = String(history[i].OldValue || '').trim();
      if (v && v.charAt(0) !== '[' && v.charAt(0) !== '{' &&
          v.indexOf('SERVICES:') !== 0 && v !== 'Change Requested' &&
          v !== 'Cancellation Requested') {
        previousStatus = v;
        break;
      }
    }

    const newStatus = 'Updated';
    await updateListItemByItemId(ORDERS_LIST, orderItem.id, { Status: newStatus });

    await createListItem(ORDER_HISTORY_LIST, {
      Title:        orderId,
      OrderID:      orderId,
      ChangeType:   'Change Approved',
      FieldChanged: 'Status',
      ChangedBy:    f.ClientID || '',
      ChangeDate:   new Date().toISOString(),
      Notes:        'Confirmed by the client.',
      OldValue:     'Change Requested',
      NewValue:     newStatus
    });

    return jsonResponse(200, { success: true, status: newStatus });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
