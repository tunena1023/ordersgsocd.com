/* ============================================================
   submit-order.js — enviar orden nueva o convertir draft en orden.

   Flujos:
   A) OrderID contiene "-TEMP-" → viene de Drafts
   B) OrderID real existe en Orders → edición de orden existente
   C) Sin OrderID → orden nueva directa
============================================================ */

const {
  ORDERS_LIST, ORDER_SERVICES_LIST, ORDER_HISTORY_LIST, DRAFTS_LIST, CLIENT_ADDRESSES_LIST,
  createListItem, updateListItemByItemId, deleteListItem,
  graphFetch, siteListPath,
  jsonResponse
} = require('./lib/graph');

async function fetchAll(listName) {
  let url = siteListPath(listName) + '?$expand=fields&$top=200';
  const out = [];
  while (url) {
    const data = await graphFetch(url);
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out;
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

async function fetchAllOrderIds() {
  let url = siteListPath(ORDERS_LIST) + '?$expand=fields($select=OrderID,Title,Status)&$top=500';
  const out = [];
  while (url) {
    const data = await graphFetch(url);
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

async function fetchByOrderId(listName, orderId) {
  const filter = encodeURIComponent(`fields/OrderID eq '${orderId}'`);
  let url = siteListPath(listName) + `?$expand=fields&$top=200&$filter=${filter}`;
  const out = [];
  while (url) {
    const data = await graphFetch(url);
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

function nextGlobalSuffix(allOrderRows) {
  const nums = allOrderRows
    .map(it => {
      const id = String(it.fields?.OrderID || it.fields?.Title || '');
      if (id.includes('-TEMP-')) return null;
      const parts = id.split('-');
      const last = parts[parts.length - 1];
      /* Ordenes de un pedido multi-unidad terminan en "-PONNNN"; el
         sufijo real (el que hay que contar) es el segmento de ANTES
         de ese, no el ultimo. Sin esto, esos sufijos quedan invisibles
         para el contador y se podrian repetir por accidente. */
      const s = /^PO\d+$/.test(last) ? parts[parts.length - 2] : last;
      const n = parseInt(s, 10);
      return isNaN(n) ? null : n;
    })
    .filter(n => n !== null);

  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1001;
  return String(next).padStart(4, '0');
}

/* PO compartido entre las unidades de un pedido multi-unidad. Mismo
   criterio que nextGlobalSuffix: global (no por cliente), buscando el
   maximo "-PONNNN" ya usado en cualquier OrderID. Arranca en 5000 para
   que nunca se confunda a simple vista con un sufijo de orden normal
   (que arranca en 1001). */
function nextGlobalPO(allOrderRows) {
  const nums = allOrderRows
    .map(it => {
      const id = String(it.fields?.OrderID || it.fields?.Title || '');
      const m = id.match(/-PO(\d+)$/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter(n => n !== null);

  const next = nums.length > 0 ? Math.max(...nums) + 1 : 5000;
  return 'PO' + next;
}

function parseServicesString(str, division) {
  const out = [];
  String(str || '').split(' | ').forEach(item => {
    if (item.includes('Dirt Level:')) return;
    const parts = item.split(' \u2013 ');
    if (parts.length === 2) {
      const m = parts[0].match(/^(.*?)>\s*(.+)$/);
      out.push({
        Category:    m ? m[1].replace(/\s*>\s*$/, '').trim() : '',
        ServiceName: (m ? m[2] : parts[0]).trim(),
        SubOption:   parts[1].trim(),
        Division:    division
      });
    }
  });
  return out;
}

/* BUG FIX (2026-08-30): mismo problema que en el repo admin — si alguna
   vez llega un arreglo de objetos { Category, ServiceName, SubOption,
   Division } en vez del string "Categoria > Servicio – Opcion | ...",
   String(arreglo) produce "[object Object],..." y parseServicesString no
   encuentra nada que parsear, guardando la orden sin servicios.
   resolveServices acepta ambos formatos para que ningun llamador pierda
   servicios silenciosamente. */
function resolveServices(raw, division) {
  if (Array.isArray(raw)) {
    return raw.map(s => ({
      Category:    s.Category    || '',
      ServiceName: s.ServiceName || '',
      SubOption:   s.SubOption   || '',
      Division:    s.Division    || division
    })).filter(s => s.Category || s.ServiceName);
  }
  return parseServicesString(raw, division);
}

function dateField(v) { return v ? v : null; }


exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const b = JSON.parse(event.body || '{}');
    if (!b.ClientID || !b.Division) {
      return jsonResponse(400, { error: 'ClientID and Division are required' });
    }

    const requestedId = b.OrderID ? String(b.OrderID) : null;
    const isTempDraft = requestedId && requestedId.includes('-TEMP-');

    const orderFields = {
      Title:          b.BusinessName || '',
      ClientID:       b.ClientID,
      BusinessName:   b.BusinessName || '',
      Requester:      b.Requester || '',
      Division:       b.Division,
      DirtLevel:      b.DirtLevel || '',
      BuildingNumber: b.BuildingNumber || '',
      UnitNumber:     b.UnitNumber || '',
      Bedrooms:       b.Bedrooms || '',
      Bathrooms:      b.Bathrooms || '',
      Address:        b.Address || '',
      Suite:          b.Suite || '',
      City:           b.City || '',
      Zip:            b.Zip || '',
      Email:          b.Contact || '',
      Notes:          b.Notes || '',
      EntryDate:      dateField(b.EntryDate),
      DueDate:        dateField(b.DueDate),
      DraftData:      ''
    };

    /* ===== FLUJO A: Draft temporal → Orden real ===== */
    if (isTempDraft) {
            const [myDraftRows, allOrderRows] = await Promise.all([
        fetchByOrderId(DRAFTS_LIST, requestedId),
        fetchAllOrderIds()
      ]);

      const draftHeader = myDraftRows.find(it => !it.fields.ServiceName);
      if (!draftHeader) return jsonResponse(404, { error: 'Draft not found.' });

      const draftServiceRows = myDraftRows.filter(it => it.fields.ServiceName);

      /* Red de seguridad: si el draft no trae ninguna fila de servicio
         guardada (carrera con el autosave, limpieza de borrador huerfano
         corriendo en paralelo, retraso de replicacion de SharePoint,
         etc.), no dejar la orden sin servicios. El cliente ya mando su
         seleccion actual en este mismo envio (b.Services); usarla como
         respaldo en vez de perderla. Este es el flujo real que usan
         customer.html y services.html al convertir un draft en orden. */
      const svcSource = draftServiceRows.length
        ? draftServiceRows.map(row => ({
            Category:    row.fields.Category    || '',
            ServiceName: row.fields.ServiceName || '',
            SubOption:   row.fields.SubOption   || '',
            Division:    row.fields.Division    || b.Division
          }))
        : resolveServices(b.Services, b.Division);

      const suffix = nextGlobalSuffix(allOrderRows);
      const orderId = String(b.ClientID).trim() + '-' + suffix;
      const newStatus = b.Status || 'Received';

      const result = await createListItem(ORDERS_LIST,
        Object.assign({}, orderFields, { OrderID: orderId, Status: newStatus })
      );

      try {
        await Promise.all([
          ...svcSource.map(s =>
            createListItem(ORDER_SERVICES_LIST, {
              Title:       s.ServiceName || '',
              OrderID:     orderId,
              Category:    s.Category    || '',
              ServiceName: s.ServiceName || '',
              SubOption:   s.SubOption   || '',
              Division:    s.Division    || b.Division
            })
          ),
          createListItem(ORDER_HISTORY_LIST, {
            Title:      orderId,
            OrderID:    orderId,
            ChangeType: 'Created',
            ChangedBy:  b.ClientID,
            ChangeDate: new Date().toISOString(),
            Notes:      'Submitted from draft.',
            OldValue:   'Draft',
            NewValue:   newStatus
          })
        ]);
      } catch (e) { console.error('Post-order write failed:', e.message); }

      /* Borrar el borrador COMPLETO (encabezado + servicios), no solo
         marcarlo como convertido. Si antes el PATCH de Status fallaba
         (por ejemplo por un eTag ya viejo), el encabezado se quedaba con
         Status='Draft' para siempre y get-orders.js lo seguia mostrando
         en "Unfinished Drafts" aunque la orden ya existiera. Borrarlo de
         raiz no deja ningun estado intermedio en el que se pueda quedar. */
      try {
        await Promise.all(
          [draftHeader, ...draftServiceRows].map(row => deleteListItem(DRAFTS_LIST, row.id))
        );
      } catch (e) { console.error('Draft cleanup failed:', e.message); }

      return jsonResponse(200, { success: true, orderId, id: result.id });
    }

    /* ===== FLUJO B: Orden existente → edicion ===== */
    if (requestedId) {
      if (!b.Services) return jsonResponse(400, { error: 'Services are required' });

      const [orderRows, svcRows, histRows] = await Promise.all([
        fetchByOrderId(ORDERS_LIST,         requestedId),
        fetchByOrderId(ORDER_SERVICES_LIST,  requestedId),
        fetchByOrderId(ORDER_HISTORY_LIST,   requestedId)
      ]);

      const orderItem = orderRows.find(it =>
        it.fields &&
        (it.fields.OrderID || it.fields.Title) === requestedId &&
        String(it.fields.ClientID || '').trim().toLowerCase() ===
        String(b.ClientID).trim().toLowerCase()
      );
      if (!orderItem) return jsonResponse(404, { error: 'Order not found.' });

      const stale = svcRows.filter(it =>
        it.fields && it.fields.OrderID === requestedId
      );

      const existing = {
        itemId:    orderItem.id,
        OrderID:   orderItem.fields.OrderID || orderItem.fields.Title || '',
        Status:    orderItem.fields.Status  || 'Pending',
        DirtLevel: orderItem.fields.DirtLevel || '',
        Division:  orderItem.fields.Division || ''
      };

      const newStatus = b.Status || 'Received';

      const snapshot = 'SERVICES:' + JSON.stringify({
        services: stale.map(it => ({
          Category:    it.fields.Category    || '',
          ServiceName: it.fields.ServiceName || '',
          SubOption:   it.fields.SubOption   || '',
          Division:    it.fields.Division    || existing.Division
        })),
        dirtLevel: existing.DirtLevel || ''
      });

      await updateListItemByItemId(ORDERS_LIST, existing.itemId,
        Object.assign({}, orderFields, { Status: newStatus })
      );

      if (stale.length) {
        await Promise.all(stale.map(row => deleteListItem(ORDER_SERVICES_LIST, row.id)));
      }

      for (const s of resolveServices(b.Services, b.Division)) {
        await createListItem(ORDER_SERVICES_LIST, {
          Title:       s.ServiceName || '',
          OrderID:     existing.OrderID,
          Category:    s.Category,
          ServiceName: s.ServiceName,
          SubOption:   s.SubOption,
          Division:    s.Division
        });
      }

      const revCount = histRows.filter(it =>
        it.fields &&
        it.fields.OrderID === existing.OrderID &&
        (it.fields.ChangeType === 'Change Requested' || it.fields.ChangeType === 'Cancellation Requested')
      ).length;

      /* Servicios nuevos que el cliente seleccionó */
      const newServices = resolveServices(b.Services, b.Division).map(s => ({
        Category: s.Category, ServiceName: s.ServiceName, SubOption: s.SubOption, Division: s.Division
      }));

      await createListItem(ORDER_HISTORY_LIST, {
        Title:      existing.OrderID + '-' + (revCount + 1),
        OrderID:    existing.OrderID,
        ChangeType: 'Change Requested',
        ChangedBy:  b.ClientID,
        ChangeDate: new Date().toISOString(),
        Notes:      '',
        OldValue:   JSON.stringify(stale.map(it => ({
          Category:    it.fields.Category    || '',
          ServiceName: it.fields.ServiceName || '',
          SubOption:   it.fields.SubOption   || '',
          Division:    it.fields.Division    || existing.Division
        }))),
        NewValue:   JSON.stringify(newServices)
      });

      return jsonResponse(200, { success: true, orderId: existing.OrderID });
    }

    /* ===== FLUJO D: Pedido multi-unidad → N ordenes reales con un PO compartido ===== */
    if (Array.isArray(b.Units) && b.Units.length >= 2) {
      if (!b.Services) return jsonResponse(400, { error: 'Services are required' });

      const buildingIds = b.Units.map(u => String(u.buildingId || '').trim());
      if (buildingIds.some(id => !id)) {
        return jsonResponse(400, { error: 'Every unit needs a building selected.' });
      }

      const [allOrderRows, buildingRows] = await Promise.all([
        fetchAllOrderIds(),
        fetchByField(CLIENT_ADDRESSES_LIST, 'ClientID', b.ClientID)
      ]);

      /* Cada building tiene que ser de verdad de este cliente -- que
         nadie pueda mandar el id de un building ajeno. */
      const buildingsById = {};
      buildingRows.forEach(it => { if (it.fields) buildingsById[it.id] = it.fields; });
      for (const id of buildingIds) {
        if (!buildingsById[id]) return jsonResponse(403, { error: 'One of the selected buildings does not belong to this account.' });
      }

      const poTag = nextGlobalPO(allOrderRows);
      let nextSuffixNum = parseInt(nextGlobalSuffix(allOrderRows), 10);
      const parsedServices = resolveServices(b.Services, b.Division);

      const createdOrderIds = [];
      for (const unit of b.Units) {
        const bId = String(unit.buildingId).trim();
        const bf = buildingsById[bId];
        const suffix = String(nextSuffixNum++).padStart(4, '0');
        const orderId = String(b.ClientID).trim() + '-' + suffix + '-' + poTag;

        const unitFields = Object.assign({}, orderFields, {
          OrderID:        orderId,
          Status:         b.Status || 'Received',
          BuildingNumber: bf.BuildingNumber || '',
          UnitNumber:     unit.unitNumber || '',
          Bedrooms:       unit.bedrooms    || '',
          Bathrooms:      unit.bathrooms   || '',
          Address:        bf.Address || '',
          Suite:          bf.Suite   || '',
          City:           bf.City    || '',
          Zip:            bf.Zip     || '',
          BatchId:        poTag,
          BuildingId:     bId
        });

        try {
          await createListItem(ORDERS_LIST, unitFields);
        } catch (e) {
          /* DIAGNOSTICO TEMPORAL: Graph solo dice "one of the provided
             arguments is not acceptable" sin decir cual campo -- se
             loguea el payload completo para poder ver en los logs de
             Vercel exactamente que se estaba mandando cuando truena. */
          console.error('Batch order create failed. Fields sent:', JSON.stringify(unitFields));
          throw new Error('Could not create unit ' + orderId + ': ' + e.message);
        }

        try {
          await Promise.all(parsedServices.map(s =>
            createListItem(ORDER_SERVICES_LIST, {
              Title:       s.ServiceName || '',
              OrderID:     orderId,
              Category:    s.Category    || '',
              ServiceName: s.ServiceName || '',
              SubOption:   s.SubOption   || '',
              Division:    s.Division    || b.Division
            })
          ));

          await createListItem(ORDER_HISTORY_LIST, {
            Title:      orderId,
            OrderID:    orderId,
            ChangeType: 'Created',
            ChangedBy:  b.ClientID,
            ChangeDate: new Date().toISOString(),
            Notes:      '',
            OldValue:   '',
            NewValue:   b.Status || 'Received'
          });
        } catch (e) {
          /* Mismo criterio que el Flujo C (orden normal): un problema
             al escribir servicios/historial NO debe tumbar la orden
             completa (la orden ya existe en ORDERS_LIST en este punto).
             Se loguea para diagnostico, no se avienta al cliente. */
          console.error('Batch unit post-order write failed for ' + orderId + ':', e.message);
        }

        createdOrderIds.push(orderId);
      }

      /* Fila resumen del lote, pegada a la ULTIMA unidad creada -- trae
         la lista completa de OrderIDs hermanos en NewValue, para que
         el flow de Power Automate arme el correo agrupado de una sola
         vez en vez de uno por unidad. */
      const lastOrderId = createdOrderIds[createdOrderIds.length - 1];
      try {
        await createListItem(ORDER_HISTORY_LIST, {
          Title:      lastOrderId + '-batch',
          OrderID:    lastOrderId,
          ChangeType: 'Batch Created',
          ChangedBy:  b.ClientID,
          ChangeDate: new Date().toISOString(),
          Notes:      '',
          OldValue:   poTag,
          NewValue:   JSON.stringify(createdOrderIds)
        });
      } catch (e) { console.error('Batch Created history write failed:', e.message); }

      return jsonResponse(200, { success: true, batchId: poTag, orderIds: createdOrderIds });
    }

    /* ===== FLUJO C: Orden nueva directa ===== */
    if (!b.Services) return jsonResponse(400, { error: 'Services are required' });

    const allOrderRows = await fetchAllOrderIds();
    const suffix = nextGlobalSuffix(allOrderRows);
    const orderId = String(b.ClientID).trim() + '-' + suffix;

    const result = await createListItem(ORDERS_LIST,
      Object.assign({}, orderFields, { OrderID: orderId, Status: b.Status || 'Received' })
    );

    try {
    const parsedServices = resolveServices(b.Services, b.Division);
    await Promise.all(parsedServices.map(s =>
      createListItem(ORDER_SERVICES_LIST, {
        Title:       s.ServiceName || '',
        OrderID:     orderId,
        Category:    s.Category,
        ServiceName: s.ServiceName,
        SubOption:   s.SubOption,
        Division:    s.Division
      })
    ));

    await createListItem(ORDER_HISTORY_LIST, {
      Title:      orderId,
      OrderID:    orderId,
      ChangeType: 'Created',
      ChangedBy:  b.ClientID,
      ChangeDate: new Date().toISOString(),
      Notes:      '',
      OldValue:   '',
      NewValue:   b.Status || 'Received'
    });
} catch (e) { console.error('Post-order write failed:', e.message); }

    /* Limpiar el borrador automatico que se pudo haber guardado solo
       mientras el cliente llenaba el formulario, si nunca se convirtio
       formalmente (Flujo A). Sin esto, ese borrador se queda huerfano
       y sigue apareciendo en "View Drafts" aunque la orden ya se mando. */
    try {
      const clientDraftRows = await fetchByField(DRAFTS_LIST, 'ClientID', b.ClientID);
      const staleHeader = clientDraftRows.find(it =>
        it.fields && !it.fields.ServiceName &&
        it.fields.Status === 'Draft' &&
        String(it.fields.Division || '').toLowerCase() === String(b.Division).toLowerCase()
      );
      if (staleHeader) {
        const staleId = String(staleHeader.fields.OrderID || '');
        const staleServiceRows = clientDraftRows.filter(it =>
          it.fields && it.fields.ServiceName && String(it.fields.OrderID || '') === staleId
        );
        await Promise.all([staleHeader, ...staleServiceRows].map(row => deleteListItem(DRAFTS_LIST, row.id)));
      }
    } catch (e) { console.error('Stale draft cleanup failed:', e.message); }

    return jsonResponse(200, { success: true, orderId, id: result.id });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};