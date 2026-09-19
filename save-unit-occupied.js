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
  updateListItemByItemId, createListItem, deleteListItem,
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

const NOTE_TRUE = 'Client reported someone is currently living in the unit.';
const NOTE_FALSE = 'Client reported the unit is not occupied.';

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

    /* Fusionar/cancelar en vez de duplicar si esto es un vaivén rápido
       del mismo switch -- mismo espiritu que set-materials-ready.js
       (Materials Ready) para "prender + hora llegando por separado",
       adaptado aqui con una ventana de tiempo corta en vez de estado
       (aqui no hay paso intermedio equivalente).

       A peticion del dueno (19/09/2026), tras ver GS-1001-1007-PO5000
       con dos renglones opuestos al mismo minuto -- y un ajuste mas,
       pedido despues de probar: si el vaiven regresa exactamente al
       valor que ya decia el renglon pendiente, no debe quedar NINGUN
       renglon (ni el fusionado) -- un clic por error que se corrige
       al toque no es un reporte real, es ruido. Si el nuevo valor
       coincide con lo que ya decia el renglon pendiente, solo se
       refresca la fecha (mismo reporte, llego de nuevo). Un reporte
       genuinamente separado en el tiempo (fuera de la ventana) sigue
       creando su propio renglon nuevo, como siempre. */
    const MERGE_WINDOW_MS = 2 * 60 * 1000; // 2 minutos
    const now = new Date();
    const notes = occupied ? NOTE_TRUE : NOTE_FALSE;

    const histRows = await fetchByField(ORDER_HISTORY_LIST, 'OrderID', orderId);
    const latestOccupied = histRows
      .filter(it => it.fields && it.fields.ChangeType === 'Occupied Unit Reported')
      .sort((a, b) => String(b.fields.ChangeDate || '').localeCompare(String(a.fields.ChangeDate || '')))[0];

    const isRecentFlip = latestOccupied && latestOccupied.fields.ChangeDate &&
      (now.getTime() - new Date(latestOccupied.fields.ChangeDate).getTime()) < MERGE_WINDOW_MS;

    if (isRecentFlip) {
      const pendingWasTrue = latestOccupied.fields.Notes === NOTE_TRUE;
      if (occupied === pendingWasTrue) {
        /* Mismo valor que ya estaba pendiente -- solo refrescar cuando
           se reportó, no es un cambio nuevo. */
        await updateListItemByItemId(ORDER_HISTORY_LIST, latestOccupied.id, { ChangeDate: now.toISOString() });
      } else {
        /* Cancela exactamente lo que decía el renglón pendiente --
           vaivén que regresó al estado de antes. No queda registro. */
        await deleteListItem(ORDER_HISTORY_LIST, latestOccupied.id);
      }
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
