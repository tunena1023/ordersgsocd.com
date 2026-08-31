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

/* Mismo criterio que ya usa confirm-change.js/previousStatus() en
   admin-approve-order.js: un OldValue que es un snapshot de servicios,
   un JSON de fechas, o el nombre de un tipo de solicitud, no es un
   estatus real al que volver -- hay que seguir buscando hacia atras. */
const REQUEST_STATUS_LABELS = ['Change Requested', 'Cancellation Requested', 'Reschedule Requested', 'Change Requested by Client', 'Updated'];
function looksLikeStatus(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return false;
  if (s.indexOf('SERVICES:') === 0) return false;
  if (s.charAt(0) === '{') return false;
  if (REQUEST_STATUS_LABELS.indexOf(s) !== -1) return false;
  return true;
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
       usan confirm-change.js/tracking.html/admin.html. */
    const REQUEST_OPENING_TYPES = ['Change Requested', 'Cancellation Requested', 'Reschedule Requested', 'Change Requested by Client'];
    let isReactivation = false;
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i].fields;
      const type = String(h.ChangeType || '');
      if (REQUEST_OPENING_TYPES.indexOf(type) !== -1) {
        isReactivation = (type === 'Change Requested' && String(h.FieldChanged || '') === 'Reactivation Pending');
        break;
      }
    }
    if (!isReactivation) {
      return jsonResponse(409, { error: 'This order does not have a pending reactivation request.' });
    }

    /* Buscar a que estatus regresar (el que tenia la orden antes de
       cancelarse). Se excluye 'Archived' (guarda 'true'/'false' en
       OldValue, nada que ver con el Status) -- mismo bug encontrado y
       arreglado hoy en previousStatus() de admin-approve-order.js;
       aqui se construye ya con el fix de una vez. */
    let prevStatus = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i].fields;
      if (String(h.FieldChanged || '') === 'Archived') continue;
      if (looksLikeStatus(h.OldValue)) {
        prevStatus = String(h.OldValue).trim();
        break;
      }
    }
    const newStatus = prevStatus || 'Assigned';
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
