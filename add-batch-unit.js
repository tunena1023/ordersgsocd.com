/* ============================================================
   add-batch-unit.js — agregar UNA unidad mas a un pedido multi-unidad
   (PO) que ya existe. Copia Division/Servicios/BusinessName/Requester
   del resto del lote automaticamente (no se preguntan de nuevo) --
   solo se piden Building, Unit#, Bed/Bath y fechas de la unidad nueva.

   Contrato: { clientId, batchId, buildingId, unitNumber, bedrooms,
               bathrooms, entryDate, dueDate }

   La unidad nueva siempre entra como Status='Received' (pendiente de
   aprobar), aunque las demas del PO ya esten aprobadas -- es una
   adicion nueva, oficina la tiene que revisar aparte. Al compartir
   el mismo BatchId, sale agrupada junto a sus hermanas tanto en
   Active/History como en Approvals del lado admin.
============================================================ */

const {
  ORDERS_LIST, ORDER_SERVICES_LIST, ORDER_HISTORY_LIST, CLIENT_ADDRESSES_LIST,
  createListItem, graphFetch, siteListPath, jsonResponse
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
    if (!b.buildingId) return jsonResponse(400, { error: 'Please choose a building.' });
    if (!b.unitNumber) return jsonResponse(400, { error: 'Please enter the Unit Number.' });
    if (!b.bedrooms)   return jsonResponse(400, { error: 'Please enter Bedrooms.' });
    if (!b.bathrooms)  return jsonResponse(400, { error: 'Please enter Bathrooms.' });
    if (!b.entryDate)  return jsonResponse(400, { error: 'Please enter the entry date.' });
    if (!b.dueDate)    return jsonResponse(400, { error: 'Please enter the due date.' });

    const [clientOrders, buildingRows] = await Promise.all([
      fetchByField(ORDERS_LIST, 'ClientID', b.clientId),
      fetchByField(CLIENT_ADDRESSES_LIST, 'ClientID', b.clientId)
    ]);

    /* El PO tiene que ser de verdad de este cliente -- se busca entre
       SUS propias ordenes, nunca en toda la lista. */
    const siblings = clientOrders.filter(it => it.fields && it.fields.BatchId === b.batchId);
    if (!siblings.length) return jsonResponse(404, { error: 'That order was not found.' });

    const building = buildingRows.find(it => it.id === String(b.buildingId));
    if (!building) return jsonResponse(403, { error: 'That building does not belong to this account.' });
    const bf = building.fields;

    const template = siblings[0].fields;
    const suffix = nextGlobalSuffix(clientOrders);
    const orderId = String(b.clientId).trim() + '-' + suffix + '-' + b.batchId;

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
      EntryDate:      b.entryDate,
      DueDate:        b.dueDate,
      DraftData:      '',
      BatchId:        b.batchId,
      BuildingId:     String(b.buildingId)
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
          Division:    f.Division    || template.Division
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

    return jsonResponse(200, { success: true, orderId });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
