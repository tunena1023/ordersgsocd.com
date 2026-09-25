/* ============================================================
   add-batch-unit.js — agregar UNA unidad mas a un pedido multi-unidad
   (PO) que ya existe. Copia Division/Servicios/BusinessName/Requester
   del resto del lote automaticamente (no se preguntan de nuevo) --
   solo se piden Building #, Unit#, Bed/Bath y fechas de la unidad
   nueva.

   Contrato: { clientId, batchId, buildingNumber, unitNumber, bedrooms,
               bathrooms, entryDate, dueDate, needsOfficeAccess,
               officeNeedNotes }

   buildingNumber es TEXTO LIBRE y OPCIONAL (igual que en el modo
   Single de crear orden) -- ya no se elige entre direcciones guardadas
   del cliente. La unidad nueva SIEMPRE usa la direccion del cliente
   (Clients list); si buildingNumber viene vacio, se autorellena con
   los digitos iniciales de esa direccion (confirmado con el dueño
   12/09/2026 -- antes esto era un <select> de CLIENT_ADDRESSES_LIST).

   La unidad nueva siempre entra como Status='Received' (pendiente de
   aprobar), aunque las demas del PO ya esten aprobadas -- es una
   adicion nueva, oficina la tiene que revisar aparte. Al compartir
   el mismo BatchId, sale agrupada junto a sus hermanas tanto en
   Active/History como en Approvals del lado admin.
============================================================ */

const {
  ORDERS_LIST, ORDER_SERVICES_LIST, ORDER_HISTORY_LIST, CLIENTS_LIST,
  createListItem, graphFetch, siteListPath, jsonResponse
} = require('./lib/graph');
/* Correos (lib/notify.js, 25/09/2026): mismo par que una orden nueva
   en submit-order.js -- "we received your order" al cliente y aviso a
   la oficina. Nunca truenan. */
const graph = require('./lib/graph');
const { notifyClient, notifyOffice } = require('./lib/notify');

/* BUG REAL encontrado y arreglado (20/09/2026, ver el comentario
   completo en Admingsocd.com/admin-approve-order.js, misma revision):
   Quantity en OrderServices paso de Texto a Numero -- '' ya no es un
   respaldo valido para "sin cantidad" en un campo Numero. */
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

/* Mismo criterio ya corregido en submit-order.js: el sufijo real de
   una orden de lote es el segmento de ANTES del "-PONNNN" final, no
   el ultimo segmento. */
function nextGlobalSuffix(allOrderRows) {
  const nums = allOrderRows
    .map(it => {
      const id = String(it.fields?.OrderID || it.fields?.Title || '');
      if (id.includes('-TEMP-')) return null;
      const parts = id.split('-');
      const last = parts[parts.length - 1];
      const s = /^PO\d+$/.test(last) ? parts[parts.length - 2] : last;
      const n = parseInt(s, 10);
      return isNaN(n) ? null : n;
    })
    .filter(n => n !== null);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1001;
  return String(next).padStart(4, '0');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    if (!b.clientId)   return jsonResponse(400, { error: 'clientId is required' });
    if (!b.batchId)    return jsonResponse(400, { error: 'batchId is required' });
    if (!b.unitNumber) return jsonResponse(400, { error: 'Please enter the Unit Number.' });
    if (!b.bedrooms)   return jsonResponse(400, { error: 'Please enter Bedrooms.' });
    if (!b.bathrooms)  return jsonResponse(400, { error: 'Please enter Bathrooms.' });
    /* buildingNumber es OPCIONAL a proposito -- ver el fallback abajo.
       A peticion del dueño (18/09/2026): entryDate/dueDate TAMBIEN son
       opcionales -- BUG REAL encontrado ese mismo dia: este archivo es
       el que de VERDAD llama el frontend de Orders (/add-batch-unit),
       distinto de submit-order.js (que tambien maneja un caso
       AddUnitToBatch, pero ese nunca lo llama Orders -- ahi es Admin
       el que pega). Arregle primero submit-order.js pensando que era
       el mismo camino -- no lo era, por eso Orders se seguia quedando
       con la validacion vieja aunque Admin ya funcionara bien. Mismo
       fallback aqui: si vienen vacias, se copian las de template
       (la primera unidad hermana del lote). */

    const [clientOrders, clientRows] = await Promise.all([
      fetchByField(ORDERS_LIST, 'ClientID', b.clientId),
      fetchByField(CLIENTS_LIST, 'ClientID', b.clientId)
    ]);

    /* El PO tiene que ser de verdad de este cliente -- se busca entre
       SUS propias ordenes, nunca en toda la lista. */
    const siblings = clientOrders.filter(it => it.fields && it.fields.BatchId === b.batchId);
    if (!siblings.length) return jsonResponse(404, { error: 'That order was not found.' });

    /* La unidad nueva SIEMPRE usa la direccion del cliente (igual que
       el modo Single de crear orden) -- ya no se elige entre varias
       direcciones guardadas. Building # es texto libre y opcional: si
       se deja vacio, se autorellena con los digitos iniciales de la
       direccion del cliente (confirmado con el dueño 12/09/2026). */
    const clientItem = clientRows.find(it => it.fields);
    const cf = clientItem ? clientItem.fields : {};
    let buildingNumber = String(b.buildingNumber || '').trim();
    if (!buildingNumber) {
      const m = String(cf.Address || '').match(/^\s*(\d+)/);
      buildingNumber = m ? m[1] : '';
    }
    const bf = { BuildingNumber: buildingNumber, Address: cf.Address || '', Suite: cf.Suite || '', City: cf.City || '', Zip: cf.Zip || '' };

    const template = siblings[0].fields;
    const effectiveEntryDate = b.entryDate || template.EntryDate || '';
    const effectiveDueDate = b.dueDate || template.DueDate || '';
    if (!effectiveEntryDate) return jsonResponse(400, { error: 'Please enter the entry date (the order this belongs to has none to copy either).' });
    if (!effectiveDueDate)   return jsonResponse(400, { error: 'Please enter the due date (the order this belongs to has none to copy either).' });
    const suffix = nextGlobalSuffix(clientOrders);
    const orderId = String(b.clientId).trim() + '-' + suffix + '-' + b.batchId;
    /* needsOfficeAccess/officeNeedNotes son de ESTA unidad nueva
       especificamente (el toggle del formulario de Add Unit), no se
       heredan del resto del PO -- mismo criterio que se aplico en
       Admin (submit-order.js). */
    const needsOfficeAccess = b.needsOfficeAccess === true || b.needsOfficeAccess === 'true';
    const officeNeedNotes = b.officeNeedNotes || '';

    await createListItem(ORDERS_LIST, {
      Title:          template.BusinessName || '',
      OrderID:        orderId,
      ClientID:       b.clientId,
      BusinessName:   template.BusinessName || '',
      Requester:      template.Requester || '',
      Division:       template.Division || '',
      DirtLevel:      template.DirtLevel || '',
      Status:         'Received',
      BuildingNumber: bf.BuildingNumber || '',
      UnitNumber:     b.unitNumber,
      Bedrooms:       b.bedrooms,
      Bathrooms:      b.bathrooms,
      Address:        bf.Address || '',
      Suite:          bf.Suite   || '',
      City:           bf.City    || '',
      Zip:            bf.Zip     || '',
      Email:          template.Email || '',
      Notes:          template.Notes || '',
      NeedsOfficeAccess: needsOfficeAccess,
      OfficeNeedNotes:   officeNeedNotes,
      EntryDate:      effectiveEntryDate,
      DueDate:        effectiveDueDate,
      DraftData:      '',
      BatchId:        b.batchId
    });

    /* Copiar los mismos servicios que ya tiene el resto del lote --
       sin preguntar de nuevo, tal como se confirmo. */
    try {
      const svcRows = await fetchByField(ORDER_SERVICES_LIST, 'OrderID', template.OrderID);
      await Promise.all(svcRows.map(row => {
        const f = row.fields;
        return createListItem(ORDER_SERVICES_LIST, {
          Title:       f.ServiceName || '',
          OrderID:     orderId,
          Category:    f.Category    || '',
          ServiceName: f.ServiceName || '',
          SubOption:   f.SubOption   || '',
          Division:    f.Division    || template.Division,
          Level:       f.Level       || '',
          Quantity:    numOrNull(f.Quantity)
        });
      }));

      await createListItem(ORDER_HISTORY_LIST, {
        Title:      orderId,
        OrderID:    orderId,
        ChangeType: 'Created',
        ChangedBy:  b.clientId,
        ChangeDate: new Date().toISOString(),
        Notes:      'Added to existing order ' + template.OrderID + '.',
        OldValue:   '',
        NewValue:   'Received'
      });
    } catch (e) {
      /* Mismo criterio que el resto del proyecto: un problema al
         copiar servicios/historial no debe tumbar la unidad ya
         creada. Se loguea para diagnostico. */
      console.error('add-batch-unit post-create write failed:', e.message);
    }

    await Promise.all([
      notifyClient(graph, { event: 'received', orderId }),
      notifyOffice(graph, { event: 'client-request', kind: 'new', orderId, details: [['Added to PO', String(b.batchId)]] })
    ]);
    return jsonResponse(200, { success: true, orderId });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
