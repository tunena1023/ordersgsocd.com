/* ============================================================
   confirm-change.js — el cliente confirma un cambio que la oficina
   le mando a revisar (boton "Request Confirmation" en Active, o
   "Send to Customer" en Review para una sugerencia de supervisor).

   CAMBIO DE DISEÑO (20/09/2026, confirmado con el dueño): antes este
   archivo asumia que los servicios/fechas YA estaban aplicados desde
   que la oficina mando la solicitud, y solo regresaba el Status al
   que tenia antes. ESO YA NO ES CIERTO -- desde que se unifico el
   criterio de "nada del lado real se toca hasta que se aprueba"
   (mismo patron que ya usan Reassign/Reschedule en
   admin-approve-order.js y submit-supervisor-update.js en
   tech.gsocd.com), lo que el cliente ve para confirmar es solo un
   SNAPSHOT en el historial (el renglon 'Client Confirmation') -- los
   servicios reales de la orden siguen siendo los VIEJOS hasta este
   momento. Asi que aqui es donde de verdad hay que aplicarlos.

   Tambien el estatus destino cambio: ya no regresa al que tenia antes
   (eso dejaba la orden en Active sin que nadie la revisara con el
   cambio ya puesto) -- ahora se manda a 'Received', para que salga
   "Mark as Seen" en Active y la oficina la revise una vez mas con los
   datos ya confirmados (y para que tech.gsocd.com tambien vea el
   cambio real, no solo quedara en el historial).

   Contraparte de undo-request.js: esa deshace un cambio restaurando
   los datos previos SIN aplicar nada; esta aplica el cambio propuesto
   de verdad y avanza el estatus.
============================================================ */

const {
  ORDERS_LIST, ORDER_SERVICES_LIST, ORDER_HISTORY_LIST, SERVICES_CATALOG_LIST,
  updateListItemByItemId, createListItem, deleteListItem,
  graphFetch, siteListPath,
  jsonResponse
} = require('./lib/graph');
/* gsocd-shared v1.34.0+ -- ver el comentario completo en
   admin-update-order.js (Admingsocd.com). Aqui se necesita porque
   este es el otro punto real donde un cambio propuesto (de oficina o
   de un supervisor, reenviado al cliente) se aplica por primera vez:
   cuando el cliente le da Confirm. */
const { resolveOrderDivision, divisionChangeHistoryPayload } = require('./lib/division-rules');

/* Mismo parser que ya usa admin-approve-order.js (lastRequestedSnapshot)
   y gsocd-shared/order-history.js (parseServicesPayload) del lado
   navegador -- este archivo corre en el servidor, sin acceso a
   window, asi que se repite aqui igual que ya esta repetido en
   admin-approve-order.js. */
function parseServicesPayload(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  const body = raw.indexOf('SERVICES:') === 0 ? raw.slice('SERVICES:'.length) : raw;
  if (body.charAt(0) !== '[' && body.charAt(0) !== '{') return null;
  try {
    const obj = JSON.parse(body);
    if (Array.isArray(obj)) return { services: obj };
    if (obj && Array.isArray(obj.services)) return obj;
    return null;
  } catch (e) { return null; }
}

function truthy(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

/* Catalogo completo de servicios, solo SKU+Division -- mismo helper
   repetido que ya existe en admin-update-order.js/admin-approve-order.js
   (Admingsocd.com), mismo criterio de "cada archivo tiene su propia
   copia de sus helpers de fetch" que ya usa todo este proyecto. */
async function fetchServicesCatalogForDivisionCheck() {
  let url = siteListPath(SERVICES_CATALOG_LIST) + '?$expand=fields($select=SKU,Division)&$top=500';
  const out = [];
  while (url) {
    const data = await graphFetch(url);
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out.filter(it => it.fields).map(it => ({ sku: it.fields.SKU || '', division: it.fields.Division || '' }));
}

/* BUG REAL encontrado y arreglado (20/09/2026, ver el comentario
   completo en Admingsocd.com/admin-approve-order.js, misma revision):
   Quantity en OrderServices paso de Texto a Numero. Este archivo
   nunca mandaba Quantity al confirmar un cambio -- se perdia por
   completo, no solo se guardaba vacio. numOrNull() ademas limpia
   cualquier valor invalido a null, valido para el campo Numero. */
function numOrNull(v) {
  const n = parseInt(v, 10);
  return (n && n > 0) ? n : null;
}

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

    /* El renglon 'Client Confirmation' mas reciente trae la propuesta
       real (servicios/nivel/notas) en su NewValue -- aqui es donde se
       aplica de verdad, igual que ya hace Reassign/Reschedule del
       lado admin. */
    let confirmationRow = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i].fields;
      if (String(h.ChangeType || '') === 'Change Requested' && String(h.FieldChanged || '') === 'Client Confirmation') {
        confirmationRow = h;
        break;
      }
    }
    const proposed = confirmationRow ? parseServicesPayload(confirmationRow.NewValue) : null;
    const actor = (clientId && String(clientId).trim()) || f.ClientID || '';
    /* Ya no regresa al estatus previo -- se manda a 'Received' para
       que salga "Mark as Seen" en Active y la oficina revise el
       cambio ya confirmado una vez mas. */
    const newStatus = 'Received';

    const writes = [
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
    ];

    if (proposed && Array.isArray(proposed.services) && proposed.services.length) {
      const division = f.Division || '';

      /* Mixed automatico (gsocd-shared v1.34.0+, ver el comentario
         completo en admin-update-order.js): aqui es donde el cambio
         propuesto se aplica por primera vez, asi que aqui es donde
         hay que revisar si trae un servicio de otra division. */
      const divisionCatalog = await fetchServicesCatalogForDivisionCheck();
      const divisionResult = resolveOrderDivision(division, proposed.services, divisionCatalog);
      if (divisionResult) {
        writes.push(updateListItemByItemId(ORDERS_LIST, orderItem.id, { Division: divisionResult.newDivision }));
        /* BUG REAL arreglado (20/09/2026, ver el comentario completo
           en admin-update-order.js de Admingsocd.com, misma
           revision): Notes vacio, el/los servicios que causaron el
           cambio van en NewValue como payload estructurado --
           order-history.js v1.35.0+ lo dibuja en el mismo detalle. */
        writes.push(createListItem(ORDER_HISTORY_LIST, {
          Title:        orderId,
          OrderID:      orderId,
          ChangeType:   'Division Changed',
          FieldChanged: 'Division',
          ChangedBy:    actor,
          ChangeDate:   new Date().toISOString(),
          Notes:        '',
          OldValue:     divisionResult.previousDivision,
          NewValue:     JSON.stringify(divisionChangeHistoryPayload(divisionResult))
        }));
      }

      const svcRows = await fetchByField(ORDER_SERVICES_LIST, 'OrderID', orderId);
      if (svcRows.length) {
        writes.push(Promise.all(svcRows.map(r => deleteListItem(ORDER_SERVICES_LIST, r.id))).then(() =>
          Promise.all(proposed.services.map(s =>
            createListItem(ORDER_SERVICES_LIST, {
              Title:              s.ServiceName || '',
              OrderID:            orderId,
              Category:           s.Category    || '',
              ServiceName:        s.ServiceName || '',
              SubOption:          s.SubOption   || '',
              Division:           s.Division    || division,
              Level:              s.Level       || '',
              Quantity:           numOrNull(s.Quantity),
              NotCompleted:       truthy(s.NotCompleted),
              NotCompletedReason: truthy(s.NotCompleted) ? (s.NotCompletedReason || '') : ''
            })
          ))
        ));
      } else {
        writes.push(Promise.all(proposed.services.map(s =>
          createListItem(ORDER_SERVICES_LIST, {
            Title:              s.ServiceName || '',
            OrderID:            orderId,
            Category:           s.Category    || '',
            ServiceName:        s.ServiceName || '',
            SubOption:          s.SubOption   || '',
            Division:           s.Division    || division,
            Level:              s.Level       || '',
            Quantity:           numOrNull(s.Quantity),
            NotCompleted:       truthy(s.NotCompleted),
            NotCompletedReason: truthy(s.NotCompleted) ? (s.NotCompletedReason || '') : ''
          })
        )));
      }
    }
    if (proposed && proposed.dirtLevel) {
      writes.push(updateListItemByItemId(ORDERS_LIST, orderItem.id, { DirtLevel: proposed.dirtLevel }));
    }

    await Promise.all(writes);

    return jsonResponse(200, { success: true, status: newStatus });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
