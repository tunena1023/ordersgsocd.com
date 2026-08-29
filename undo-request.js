/* ============================================================
   undo-request.js — deshacer una solicitud pendiente del cliente.
   Filtra por OrderID via OData para no descargar listas completas.
============================================================ */

const {
  ORDERS_LIST, ORDER_SERVICES_LIST, ORDER_HISTORY_LIST,
  createListItem, updateListItemByItemId, deleteListItem,
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
    const { orderId } = JSON.parse(event.body || '{}');
    if (!orderId) return jsonResponse(400, { error: 'orderId is required' });

    /* Orden e historial en paralelo */
    const [orderRows, histRows] = await Promise.all([
      fetchByField(ORDERS_LIST,        'OrderID', orderId),
      fetchByField(ORDER_HISTORY_LIST,  'OrderID', orderId)
    ]);

    const orderItem = orderRows.find(it => it.fields);
    if (!orderItem) return jsonResponse(404, { error: 'Order not found.' });

    const f = orderItem.fields;
    const currentStatus = f.Status || '';

    /* 'Updated' es el estatus con el que ahora queda una solicitud de
       cambio. 'Change Requested' se conserva por las ordenes viejas. */
    const OPEN_REQUEST = ['Updated', 'Change Requested', 'Cancellation Requested'];
    if (OPEN_REQUEST.indexOf(currentStatus) === -1) {
      return jsonResponse(409, { error: 'There is no pending request to undo for this order.' });
    }

    /* Buscar hacia atrás la última solicitud con OldValue */
    const history = histRows
      .filter(it => it.fields)
      .sort((a, b) => String(a.createdDateTime || '').localeCompare(String(b.createdDateTime || '')));

    let prevStatus  = null;
    let snapshotRaw = null;
    let datesRaw    = null;

    /* Las fechas propuestas viven en su propio renglon, despues del de la
       solicitud. Se busca primero para poder dejar constancia de que el
       cliente las retiro. */
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i].fields;
      if (String(h.FieldChanged || '') === 'Requested Dates' && h.NewValue) {
        datesRaw = h.NewValue;
        break;
      }
    }

    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i].fields;
      const type = h.ChangeType || '';
      if (OPEN_REQUEST.indexOf(type) !== -1 && h.OldValue
          && String(h.OldValue).indexOf('SERVICES:') !== 0
          && String(h.OldValue).charAt(0) !== '{') {
        prevStatus = h.OldValue;
        if ((h.NewValue || '').indexOf('SERVICES:') === 0) snapshotRaw = h.NewValue;
        break;
      }
    }

    /* El snapshot de servicios puede venir en el renglon de la edicion y no
       en el de la solicitud: buscarlo por separado si hace falta. */
    if (!snapshotRaw) {
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i].fields;
        if (String(h.NewValue || '').indexOf('SERVICES:') === 0) { snapshotRaw = h.NewValue; break; }
      }
    }

    /* Restaurar snapshot de servicios si la solicitud vino de una edición */
    if (snapshotRaw) {
      try {
        const snap = JSON.parse(snapshotRaw.substring('SERVICES:'.length));

        /* Borrar servicios actuales */
        const svcRows = await fetchByField(ORDER_SERVICES_LIST, 'OrderID', orderId);
        await Promise.all(svcRows.map(row => deleteListItem(ORDER_SERVICES_LIST, row.id)));

        /* Recrear servicios del snapshot + actualizar DirtLevel en paralelo */
        const patch = {};
        if (snap.dirtLevel !== undefined) patch.DirtLevel = snap.dirtLevel || '';

        await Promise.all([
          ...(snap.services || []).map(s =>
            createListItem(ORDER_SERVICES_LIST, {
              Title:       s.ServiceName || '',
              OrderID:     orderId,
              Category:    s.Category    || '',
              ServiceName: s.ServiceName || '',
              SubOption:   s.SubOption   || '',
              Division:    s.Division    || f.Division || '',
              NotCompleted:       (s.NotCompleted === true || String(s.NotCompleted) === 'true'),
              NotCompletedReason: (s.NotCompleted === true || String(s.NotCompleted) === 'true')
                                    ? (s.NotCompletedReason || '') : ''
            })
          ),
          ...(Object.keys(patch).length
            ? [updateListItemByItemId(ORDERS_LIST, orderItem.id, patch)]
            : [])
        ]);
      } catch (e) {
        /* Snapshot corrupto: continuar solo con el estatus */
      }
    }

    /* Si el cliente habia propuesto fechas, que quede escrito que las retiro */
    if (datesRaw) {
      await createListItem(ORDER_HISTORY_LIST, {
        Title:        orderId,
        OrderID:      orderId,
        ChangeType:   'Requested Dates Withdrawn',
        FieldChanged: 'Requested Dates',
        ChangedBy:    f.ClientID || '',
        ChangeDate:   new Date().toISOString(),
        Notes:        'The client withdrew the dates requested with this change.',
        OldValue:     String(datesRaw),
        NewValue:     ''
      });
    }

    /* Regresar la orden a su estatus previo + evento en paralelo */
        const newStatus = prevStatus || 'Received';
    await Promise.all([
      updateListItemByItemId(ORDERS_LIST, orderItem.id, { Status: newStatus }),
      createListItem(ORDER_HISTORY_LIST, {
        Title:      orderId,
        OrderID:    orderId,
        ChangeType:   'Request Cancelled by Client',
        FieldChanged: 'Status',
        ChangedBy:  f.ClientID || '',
        ChangeDate: new Date().toISOString(),
        Notes:      'Client undid the ' + (currentStatus === 'Cancellation Requested' ? 'cancellation' : 'change') + ' request.',
        OldValue:   currentStatus,
        NewValue:   newStatus
      })
    ]);

    return jsonResponse(200, { success: true, status: newStatus });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};