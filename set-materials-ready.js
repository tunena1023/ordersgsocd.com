/* ============================================================
   set-materials-ready.js — Renovations: el cliente avisa que el
   material ya esta en el sitio y estamos libres de entrar.

   Prender (materialsReady: true): guarda EntryTime si lo dieron,
   y SIEMPRE apaga MaterialsReadySeen (para que le salga la burbuja
   de aviso al staff en Review, aunque ya estuviera prendido antes y
   solo esten cambiando la hora).

   Apagar (materialsReady: false): pide una nota obligatoria
   (offNote) -- si el cliente lo prendio por accidente o cambiaron
   de planes, la oficina necesita saber por que, no solo que se
   apago. Solo se puede apagar si ya estaba prendido.

   Todo queda en OrderHistory, con quien lo hizo y cuando -- igual
   que el resto de las acciones del cliente en este portal.
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
    const materialsReady = body.materialsReady === true;
    const entryTime = String(body.entryTime || '').trim();
    const offNote = String(body.offNote || '').trim();

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
    if (String(f.Division || '').toLowerCase() !== 'renovations' && String(f.Division || '').toLowerCase() !== 'janitorial') {
      return jsonResponse(400, { error: 'This only applies to Renovations or Janitorial orders.' });
    }

    /* Hora obligatoria al prender -- antes era opcional y se podia
       dejar en "Select a time" para siempre. Ahora el frontend ya no
       deja llegar hasta aqui sin hora, pero se valida tambien del
       lado del servidor por si acaso. */
    if (materialsReady && !String(entryTime || '').trim()) {
      return jsonResponse(400, { error: 'Please choose a time before turning this on.' });
    }

    const wasReady = f.MaterialsReady === true || f.MaterialsReady === 'true';
    const now = new Date().toISOString();

    if (materialsReady) {
      const notes = 'Ready for entry at ' + entryTime + '.';
      const orderPatch = { MaterialsReady: true, MaterialsReadySeen: false, EntryTime: entryTime };

      if (!wasReady) {
        /* Primera vez que se prende en este ciclo -- un renglon nuevo. */
        await Promise.all([
          updateListItemByItemId(ORDERS_LIST, orderItem.id, orderPatch),
          createListItem(ORDER_HISTORY_LIST, {
            Title: orderId + '-ready',
            OrderID: orderId,
            ChangeType: 'Materials Ready',
            ChangedBy: clientId,
            ChangeDate: now,
            Notes: notes
          })
        ]);
      } else {
        /* Ya estaba prendido -- esto es nomas la hora llegando por
           separado (el cliente prende el switch primero, y el picker
           de hora manda su propia llamada despues). Es la MISMA
           accion, no una segunda -- se actualiza el renglon de
           historial que ya existe en vez de crear uno duplicado. Si
           por lo que sea no hay un renglon anterior que actualizar
           (no deberia pasar, pero por si acaso), se crea uno. */
        const histRows = await fetchByField(ORDER_HISTORY_LIST, 'OrderID', orderId);
        const latestReady = histRows
          .filter(it => it.fields && it.fields.ChangeType === 'Materials Ready')
          .sort((a, b) => String(b.fields.ChangeDate || '').localeCompare(String(a.fields.ChangeDate || '')))[0];

        const tasks = [updateListItemByItemId(ORDERS_LIST, orderItem.id, orderPatch)];
        if (latestReady) {
          tasks.push(updateListItemByItemId(ORDER_HISTORY_LIST, latestReady.id, { Notes: notes, ChangeDate: now }));
        } else {
          tasks.push(createListItem(ORDER_HISTORY_LIST, {
            Title: orderId + '-ready',
            OrderID: orderId,
            ChangeType: 'Materials Ready',
            ChangedBy: clientId,
            ChangeDate: now,
            Notes: notes
          }));
        }
        await Promise.all(tasks);
      }
      return jsonResponse(200, { success: true, materialsReady: true });
    }

    /* Apagar */
    if (!wasReady) {
      return jsonResponse(409, { error: 'Materials Ready is not currently on for this order.' });
    }
    if (!offNote) {
      return jsonResponse(400, { error: 'Please add a short note explaining why you\'re turning this off.' });
    }

    /* Item 18 -- "unidad no lista": apagar el switch con nota ES el
       reporte del cliente. Se marca el delay reason de una vez (dispara
       el aviso de posible delay fee al cliente, ya construido) --
       la oficina decide despues, al revisarlo desde Admin, si la fecha
       real necesita cambiar (la orden regresa a Scheduling) o solo fue
       cuestion de horas (se queda asignada). Ver admin-update-order.js
       y admin-approve-order.js. */
    await Promise.all([
      updateListItemByItemId(ORDERS_LIST, orderItem.id, {
        MaterialsReady: false,
        DelayReasonType: 'Site not ready',
        DelayReasonNotes: offNote
      }),
      createListItem(ORDER_HISTORY_LIST, {
        Title: orderId + '-notready',
        OrderID: orderId,
        ChangeType: 'Materials Ready Cancelled',
        ChangedBy: clientId,
        ChangeDate: now,
        Notes: offNote
      })
    ]);
    return jsonResponse(200, { success: true, materialsReady: false });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
