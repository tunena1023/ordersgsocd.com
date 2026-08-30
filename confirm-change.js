/* ============================================================
   confirm-change.js — el cliente confirma un cambio que la oficina
   ya aplico y le mando a revisar (boton "Request Confirmation" en
   Active, del lado admin). Los servicios/fechas ya quedaron
   guardados en el momento en que la oficina lo mando (ver
   admin-update-order.js, modo requestOnly + sendToClient); aqui
   solo se regresa el Status a como estaba antes de la solicitud y
   se deja constancia en el historial de que el cliente confirmo.

   Contraparte de undo-request.js: esa deshace un cambio restaurando
   los datos previos; esta acepta el cambio ya aplicado sin tocar
   servicios ni fechas, solo el estatus.
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

/* Un OldValue que es un snapshot de servicios ('SERVICES:...') o un JSON
   de fechas ('{...}') no es un estatus real -- hay que seguir buscando
   hacia atras. Mismo criterio que usa undo-request.js. */
function looksLikeStatus(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return false;
  if (s.indexOf('SERVICES:') === 0) return false;
  if (s.charAt(0) === '{') return false;
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
      return jsonResponse(409, { error: 'There is no pending change waiting for your confirmation.' });
    }

    const history = histRows
      .filter(it => it.fields)
      .sort((a, b) => String(a.createdDateTime || '').localeCompare(String(b.createdDateTime || '')));

    /* Confirmar que de verdad es un cambio que la oficina mando a
       confirmar (marcador 'Client Confirmation') y no una solicitud que
       el propio cliente inicio -- esas se manejan con Undo Request, no
       con Confirm. Mismo marcador que usa isWaitingForClientConfirmation
       en tracking.html y el admin.

       BUG FIX: antes se buscaba en TODO el historial si ALGUNA VEZ hubo
       un 'Client Confirmation' -- si la orden tuvo una hace tiempo (ya
       resuelta) y ahora tiene una solicitud nueva y distinta, este
       endpoint la hubiera aceptado igual, aplicando la confirmacion
       equivocada. Ahora se revisa unicamente la solicitud abierta MAS
       RECIENTE (mismo tipo de renglon que abre un Change/Cancellation
       Requested), no cualquier renglon en cualquier punto del pasado. */
    const REQUEST_OPENING_TYPES = ['Change Requested', 'Cancellation Requested', 'Reschedule Requested', 'Change Requested by Client'];
    let isOfficeSent = false;
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i].fields;
      const type = String(h.ChangeType || '');
      if (REQUEST_OPENING_TYPES.indexOf(type) !== -1) {
        isOfficeSent = (type === 'Change Requested' && String(h.FieldChanged || '') === 'Client Confirmation');
        break;
      }
    }
    if (!isOfficeSent) {
      return jsonResponse(409, { error: 'This request was not sent for your confirmation.' });
    }

    /* Los servicios y fechas ya se guardaron cuando la oficina mando el
       cambio -- aqui solo se busca a que estatus regresar (el que tenia
       la orden justo antes de esta solicitud). */
    let prevStatus = null;
    for (let i = history.length - 1; i >= 0; i--) {
      if (looksLikeStatus(history[i].fields.OldValue)) {
        prevStatus = String(history[i].fields.OldValue).trim();
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
        ChangeType:   'Change Approved',
        FieldChanged: 'Status',
        ChangedBy:    actor,
        ChangeDate:   new Date().toISOString(),
        Notes:        '',
        OldValue:     currentStatus,
        NewValue:     newStatus
      })
    ]);

    return jsonResponse(200, { success: true, status: newStatus });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
