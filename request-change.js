/* ============================================================
   request-change.js — el cliente pide un cambio o una cancelacion.

   Un cambio deja la orden en 'Updated': asi la oficina ve que hay algo
   que decidir y el cliente ve que su peticion se registro. Nada de lo
   que pide se aplica todavia. Las fechas y la ventana que propone se
   guardan en el HISTORIAL, no en la orden, porque hasta que la oficina
   apruebe no son reales; al aprobar, admin-approve-order las copia a la
   orden y ahi si quedan confirmadas.

   Todo queda registrado: la solicitud, su descripcion y, si propuso
   fechas, un renglon aparte con lo que tenia y lo que pidio.

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

/* Los cuatro bloques de servicio. Tienen que decir EXACTAMENTE lo mismo
   que la columna Orders.ServiceWindow de SharePoint. */
const SERVICE_WINDOWS = [
  '5:00 AM - 8:00 AM',
  '8:00 AM - 11:00 AM',
  '11:00 AM - 2:00 PM',
  '2:00 PM - 5:00 PM'
];

function dayOf(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const orderId = body.orderId;
    const type = body.type;
    const description = body.description;
    if (!orderId || !type) return jsonResponse(400, { error: 'orderId and type are required' });

    const isCancel = type === 'cancel';

    /* Fechas propuestas: solo aplican a una solicitud de cambio */
    const askEntry  = isCancel ? '' : dayOf(body.entryDate);
    const askDue    = isCancel ? '' : dayOf(body.dueDate);
    const askWindow = isCancel ? '' : String(body.serviceWindow || '').trim();

    if (askEntry && askDue && askEntry > askDue) {
      return jsonResponse(400, { error: 'The due date cannot be earlier than the entry date.' });
    }
    if (askWindow && SERVICE_WINDOWS.indexOf(askWindow) === -1) {
      return jsonResponse(400, { error: 'That service window is not one of the available blocks.' });
    }

    /* Orden e historial en paralelo */
    const [orderRows, histRows] = await Promise.all([
      fetchByField(ORDERS_LIST,       'OrderID', orderId),
      fetchByField(ORDER_HISTORY_LIST, 'OrderID', orderId)
    ]);

    const orderItem = orderRows.find(it => it.fields);
    if (!orderItem) return jsonResponse(404, { error: 'Order not found.' });

    const f = orderItem.fields;
    const oldStatus = f.Status || '';

    /* Una orden cerrada ya no se cambia desde el portal */
    if (oldStatus === 'Cancelled' || oldStatus === 'Completed') {
      return jsonResponse(409, {
        error: 'This order is ' + oldStatus.toLowerCase() + '. Please call our office.'
      });
    }
       if (oldStatus === 'Change Requested'
        || oldStatus === 'Cancellation Requested') {
      return jsonResponse(409, {
        error: 'There is already a request waiting for our office on this order.'
      });
    }

    /* 'Updated' para un cambio; la cancelacion conserva su propio estatus */
        const newStatus = isCancel ? 'Cancellation Requested' : 'Change Requested';

    /* Numero de revision: cuenta las solicitudes anteriores del cliente */
    const REQUEST_TYPES = ['Change Requested', 'Cancellation Requested', 'Updated'];
    const revision = histRows.filter(it =>
      REQUEST_TYPES.indexOf(it.fields?.ChangeType || '') !== -1
    ).length + 1;

    const revTitle = orderId + '-' + revision + (isCancel ? 'C' : '');
    const now = new Date().toISOString();
    const who = f.ClientID || '';

    /* Actualizar estatus + registrar la solicitud */
    await Promise.all([
      updateListItemByItemId(ORDERS_LIST, orderItem.id, { Status: newStatus }),
      createListItem(ORDER_HISTORY_LIST, {
        Title:        revTitle,
        OrderID:      orderId,
        ChangeType:   newStatus,
        FieldChanged: 'Status',
        ChangedBy:    who,
        ChangeDate:   now,
        Notes:        description || '',
        OldValue:     oldStatus,
        NewValue:     newStatus
      })
    ]);

    /* Renglon aparte con las fechas propuestas. Va despues del renglon de
       la solicitud para que sea el ultimo que encuentre quien lo busque. */
    let requestedDates = null;
    if (askEntry || askDue || askWindow) {
      requestedDates = {
        entryDate:     askEntry  || dayOf(f.EntryDate),
        dueDate:       askDue    || dayOf(f.DueDate),
        serviceWindow: askWindow || (f.ServiceWindow || '')
      };
      await createListItem(ORDER_HISTORY_LIST, {
        Title:        revTitle + 'D',
        OrderID:      orderId,
        ChangeType:   'Reschedule Requested',
        FieldChanged: 'Requested Dates',
        ChangedBy:    who,
        ChangeDate:   now,
        Notes:        'Requested by the client. Nothing is confirmed until our office approves it.',
        OldValue:     JSON.stringify({
          entryDate:     dayOf(f.EntryDate),
          dueDate:       dayOf(f.DueDate),
          serviceWindow: f.ServiceWindow || ''
        }),
        NewValue:     JSON.stringify(requestedDates)
      });
    }

    return jsonResponse(200, {
      success: true,
      status: newStatus,
      revision: revTitle,
      requestedDates: requestedDates
    });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
