/* ============================================================
   submit-order.js — enviar orden nueva o convertir draft en orden.

   Flujos:
   A) OrderID contiene "-TEMP-" → viene de Drafts
   B) OrderID real existe en Orders → edición de orden existente
   C) Sin OrderID → orden nueva directa
============================================================ */

const {
  ORDERS_LIST, ORDER_SERVICES_LIST, ORDER_HISTORY_LIST, DRAFTS_LIST, CLIENT_ADDRESSES_LIST, SERVICE_ASSIGNMENTS_LIST,
  createListItem, updateListItemByItemId, deleteListItem,
  graphFetch, siteListPath, geocodeAddress,
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

/* honorNonIndexed (opcional): ServiceAssignments (lista nueva de
   "Assign by service") no tiene su columna OrderID indexada todavia
   en SharePoint -- mismo arreglo puente ya usado en Admingsocd.com
   (get-order-detail.js, etc.), el header que el propio error de
   Graph sugiere. Las demas listas (ya indexadas de antes) no lo
   necesitan y no se les pasa. */
async function fetchByOrderId(listName, orderId, honorNonIndexed) {
  const filter = encodeURIComponent(`fields/OrderID eq '${orderId}'`);
  let url = siteListPath(listName) + `?$expand=fields&$top=200&$filter=${filter}`;
  const out = [];
  const opts = honorNonIndexed ? { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } } : {};
  while (url) {
    const data = await graphFetch(url, opts);
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
   criterio que nextGlobalSuffix: global (no por cliente), arranca en
   5000 para nunca confundirse a simple vista con un sufijo normal. */
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

/* BUG FIX (2026-08-30): admin.html manda Services como arreglo de objetos
   { Category, ServiceName, SubOption, Division }, no como el string
   "Categoria > Servicio – Opcion | ..." que parseServicesString espera.
   Antes, un arreglo se convertia con String() a "[object Object],..." y
   parseServicesString no encontraba nada que parsear, guardando la orden
   sin ningun servicio. resolveServices acepta ambos formatos para que
   ningun llamador (actual o futuro) pierda servicios silenciosamente. */
/* BUG REAL encontrado y arreglado (20/09/2026, ver el comentario
   completo en Admingsocd.com/admin-approve-order.js, misma revision):
   Quantity en OrderServices paso de Texto a Numero -- '' ya no es un
   respaldo valido para "sin cantidad" en un campo Numero. */
function numOrNull(v) {
  const n = parseInt(v, 10);
  return (n && n > 0) ? n : null;
}

function resolveServices(raw, division) {
  if (Array.isArray(raw)) {
    return raw.map(s => ({
      Category:    s.Category    || '',
      ServiceName: s.ServiceName || '',
      SubOption:   s.SubOption   || '',
      Division:    s.Division    || division,
      Level:       s.Level       || '',
      Quantity:    s.Quantity    || ''
    })).filter(s => s.Category || s.ServiceName);
  }
  return parseServicesString(raw, division);
}

function dateField(v) { return v ? v : null; }

/* Coordenadas para Routing: si la orden trae buildingId (viene de un
   Building ya guardado, que ya se geocodifico solo al crearse -- ver
   admin-update-client.js), se copian esas mismas coordenadas, sin
   volver a preguntarle nada a Nominatim. Si no hay buildingId (orden
   normal, sin building ligado), se geocodifica la direccion de texto
   directo. Nunca truena la creacion de la orden si esto falla -- se
   intenta y ya, Routing simplemente no podra ubicar esa orden en el
   mapa hasta que se resuelva despues. */
async function resolveOrderCoordinates(buildingId, address, city, zip) {
  try {
    if (buildingId) {
      const bld = await graphFetch(siteListPath(CLIENT_ADDRESSES_LIST) + '/items/' + buildingId + '?$expand=fields');
      const f = bld && bld.fields;
      if (f && f.Latitude != null && f.Longitude != null) {
        return { lat: Number(f.Latitude), lon: Number(f.Longitude) };
      }
    }
    return await geocodeAddress(address, city, zip);
  } catch (e) {
    return null;
  }
}


exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const b = JSON.parse(event.body || '{}');
    if (!b.ClientID) {
      return jsonResponse(400, { error: 'ClientID is required' });
    }

    /* ===== FLUJO E: agregar UNA unidad a un PO ya existente =====
       Se checa ANTES que todo lo demas (igual que aprendimos con el
       bug del draft desviando el lote nuevo) para que nunca se
       confunda con una orden normal. Copia Division/Servicios/
       BusinessName/Requester del resto del lote -- solo pide
       Unit#, Bed/Bath y fechas de la unidad nueva. Building # es
       texto libre y opcional (igual que en add-batch-unit.js): esta
       rama vivia desincronizada de esa conversion -- el frontend de
       Admin (submitAddBatchUnitAdmin) ya mandaba buildingNumber desde
       antes de hoy, pero esta rama seguia pidiendo buildingId de un
       building real guardado, bloqueando SIEMPRE con "Please choose
       a building." Corregido 13/09/2026. */
    if (b.AddUnitToBatch) {
      const add = b.AddUnitToBatch;
      if (!add.batchId)    return jsonResponse(400, { error: 'batchId is required' });
      if (!add.unitNumber) return jsonResponse(400, { error: 'Please enter the Unit Number.' });
      if (!add.bedrooms)   return jsonResponse(400, { error: 'Please enter Bedrooms.' });
      if (!add.bathrooms)  return jsonResponse(400, { error: 'Please enter Bathrooms.' });
      /* A peticion del dueño (18/09/2026, mismo criterio que Admin --
         ver admingsocd-com/submit-order.js): entryDate/dueDate son
         opcionales -- si vienen vacias, la unidad nueva hereda las
         mismas fechas que ya tiene el resto del lote. */

      const allOrders = await fetchAll(ORDERS_LIST);

      const clientOrders = allOrders.filter(it =>
        it.fields && String(it.fields.ClientID || '').trim().toLowerCase() === String(b.ClientID).trim().toLowerCase()
      );
      const siblings = clientOrders.filter(it => it.fields.BatchId === add.batchId);
      if (!siblings.length) return jsonResponse(404, { error: 'That order was not found.' });

      const template = siblings[0].fields;
      const effectiveEntryDate = add.entryDate || template.EntryDate || '';
      const effectiveDueDate = add.dueDate || template.DueDate || '';
      if (!effectiveEntryDate) return jsonResponse(400, { error: 'Please enter the entry date (the order this belongs to has none to copy either).' });
      if (!effectiveDueDate)   return jsonResponse(400, { error: 'Please enter the due date (the order this belongs to has none to copy either).' });
      /* Igual que add-batch-unit.js: siempre la direccion del resto
         del lote (todas las unidades de un mismo PO comparten
         direccion); si no viene buildingNumber, se autorellena con
         los digitos iniciales de esa direccion. */
      let buildingNumber = String(add.buildingNumber || '').trim();
      if (!buildingNumber) {
        const m = String(template.Address || '').match(/^\s*(\d+)/);
        buildingNumber = m ? m[1] : '';
      }
      const bf = { BuildingNumber: buildingNumber, Address: template.Address || '', Suite: template.Suite || '', City: template.City || '', Zip: template.Zip || '' };

      const actor = (b.changedBy && String(b.changedBy).trim()) || 'Admin';
      const suffix = nextGlobalSuffix(allOrders);
      const orderId = String(b.ClientID).trim() + '-' + suffix + '-' + add.batchId;

      await createListItem(ORDERS_LIST, {
        Title:          template.BusinessName || '',
        OrderID:        orderId,
        ClientID:       b.ClientID,
        BusinessName:   template.BusinessName || '',
        Requester:      template.Requester || '',
        Division:       template.Division || '',
        DirtLevel:      template.DirtLevel || '',
        Status:         'Received',
        BuildingNumber: bf.BuildingNumber || '',
        UnitNumber:     add.unitNumber,
        Bedrooms:       add.bedrooms,
        Bathrooms:      add.bathrooms,
        Address:        bf.Address || '',
        Suite:          bf.Suite   || '',
        City:           bf.City    || '',
        Zip:            bf.Zip     || '',
        Email:          template.Email || '',
        Notes:          template.Notes || '',
        EntryDate:      effectiveEntryDate,
        DueDate:        effectiveDueDate,
        DraftData:      '',
        BatchId:        add.batchId,
        NeedsOfficeAccess: add.needsOfficeAccess === true || add.needsOfficeAccess === 'true',
        OfficeNeedNotes:   add.officeNeedNotes || '',
        /* Misma direccion que el resto del lote -- ya se geocodifico
           antes (esta orden ya existia), se copian sus coordenadas
           en vez de volver a preguntarle a Nominatim. */
        ...(template.Latitude != null && template.Longitude != null ? { Latitude: template.Latitude, Longitude: template.Longitude } : {})
      });

      try {
        const svcRows = await fetchByOrderId(ORDER_SERVICES_LIST, template.OrderID);
        await Promise.all(svcRows.map(row => {
          const f = row.fields;
          return createListItem(ORDER_SERVICES_LIST, {
            Title:       f.ServiceName || '',
            OrderID:     orderId,
            Category:    f.Category    || '',
            ServiceName: f.ServiceName || '',
            SubOption:   f.SubOption   || '',
            Division:    f.Division    || template.Division,
            Quantity:    f.Quantity    || ''
          });
        }));

        const unitServices = svcRows.map(row => ({
          Category: row.fields.Category || '', ServiceName: row.fields.ServiceName || '',
          SubOption: row.fields.SubOption || '', Division: row.fields.Division || template.Division
        }));
        await createListItem(ORDER_HISTORY_LIST, {
          Title:      orderId,
          OrderID:    orderId,
          ChangeType: 'Created',
          ChangedBy:  actor,
          ChangeDate: new Date().toISOString(),
          Notes:      'Added to existing order ' + template.OrderID + ' by ' + actor + '.',
          OldValue:   '',
          NewValue:   'SERVICES:' + JSON.stringify({ services: unitServices, dirtLevel: '', entryDate: effectiveEntryDate, dueDate: effectiveDueDate })
        });
      } catch (e) {
        console.error('AddUnitToBatch post-create write failed:', e.message);
      }

      return jsonResponse(200, { success: true, orderId });
    }

    if (!b.Division) {
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
      NeedsOfficeAccess: b.NeedsOfficeAccess === true || b.NeedsOfficeAccess === 'true',
      OfficeNeedNotes:   b.OfficeNeedNotes || '',
      DraftData:      ''
    };

    /* Coordenadas para Routing -- ordenes normales no traen building
       ligado, se geocodifica la direccion de texto directo. Se hace
       una sola vez aqui, compartido entre Flujo A y Flujo C. */
    const orderGeo = await resolveOrderCoordinates(null, b.Address, b.City, b.Zip);
    if (orderGeo) { orderFields.Latitude = orderGeo.lat; orderFields.Longitude = orderGeo.lon; }

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
         guardada (por ejemplo, una carrera con el autosave, una limpieza
         de borrador huerfano que corrio en paralelo, o un retraso de
         replicacion de SharePoint), no dejar la orden sin servicios.
         El cliente ya mando su seleccion actual en este mismo envio
         (b.Services); usarla como respaldo en vez de perderla. */
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

      /* BUG REAL encontrado (18/09/2026, reportado por el dueno): el
         header del draft nunca se borraba, solo se "marcaba" con
         Status:'Order' -- se quedaba huerfano en Drafts para SIEMPRE,
         una fila muerta por cada orden creada desde un borrador. Nada
         en el sistema busca filas de Drafts con Status:'Order' (ni
         get-orders.js ni delete-draft.js -- ambos solo filtran por
         Status==='Draft'), asi que ese "marcado" no cumplia ningun
         proposito real. Ahora se borra de una vez junto con las filas
         de servicio, en el mismo Promise.all -- mismo criterio que ya
         usa el flujo de Multiple Units (ver submitOrder() en
         customer.html) para limpiar un borrador que no se uso. */
      try {
        await Promise.all([
          ...svcSource.map(s =>
            createListItem(ORDER_SERVICES_LIST, {
              Title:       s.ServiceName || '',
              OrderID:     orderId,
              Category:    s.Category    || '',
              ServiceName: s.ServiceName || '',
              SubOption:   s.SubOption   || '',
              Division:    s.Division    || b.Division,
              Quantity:    numOrNull(s.Quantity)
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
            NewValue:   'SERVICES:' + JSON.stringify({ services: svcSource, dirtLevel: b.DirtLevel || '', entryDate: orderFields.EntryDate || '', dueDate: orderFields.DueDate || '' })
          })
        ]);
      } catch (e) { console.error('Post-order write failed:', e.message); }

      try {
        await Promise.all(
          myDraftRows.map(row => deleteListItem(DRAFTS_LIST, row.id))
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
        Division:  orderItem.fields.Division || '',
        /* "Assign by service" -- decide si el edit de aqui abajo
           compara servicio por servicio (ver mas abajo) o en bloque
           (comportamiento de siempre, sin tocar). */
        AssignByService: orderItem.fields.AssignByService === true || orderItem.fields.AssignByService === 'true'
      };

      /* BUG REAL encontrado y arreglado (20/09/2026, reportado por el
         dueño con una orden real): "Edit Order" SOLO se puede usar
         cuando la orden sigue en 'Received' -- loadForEdit() en
         customer.html ya lo garantiza (si no, ni deja cargarla para
         editar). Pero el codigo de aqui abajo mandaba la orden a
         'Change Requested' de todos modos, sin importar eso -- una
         orden que JAMAS se habia tocado (sin supervisor, sin fecha,
         sin nada asignado) terminaba en el tab Review de Admin, que
         solo ofrece Reassign/Reschedule -- ninguno de los dos tiene
         sentido para algo que nunca se asigno. Si de plano se le daba
         clic a la unica opcion disponible, quedaba un evento
         "Assigned" en el historial sin ningun dato real de asignacion
         detras.

         Si la orden sigue en 'Received', no hay nada que proteger --
         el cambio se aplica DIRECTO (mismo criterio que antes del
         "CAMBIO DE DISENO" de mas abajo, pero sin el problema que ese
         cambio arreglaba: ahi si aplicaba a CUALQUIER estatus, incluso
         ordenes ya asignadas). Sigue quedando un registro real en el
         historial de que el cliente hizo el cambio -- solo que ya no
         manda la orden a Review. */
      if (existing.Status === 'Received') {
        await updateListItemByItemId(ORDERS_LIST, existing.itemId, orderFields);

        const parsedServices = resolveServices(b.Services, b.Division);
        if (stale.length) {
          await Promise.all(stale.map(it => deleteListItem(ORDER_SERVICES_LIST, it.id)));
        }
        await Promise.all(parsedServices.map(s =>
          createListItem(ORDER_SERVICES_LIST, {
            Title:       s.ServiceName || '',
            OrderID:     existing.OrderID,
            Category:    s.Category,
            ServiceName: s.ServiceName,
            SubOption:   s.SubOption,
            Division:    s.Division,
            Level:       s.Level || '',
            Quantity:    numOrNull(s.Quantity)
          })
        ));

        const staleSnapshot = stale.map(it => ({
          Category:    it.fields.Category    || '',
          ServiceName: it.fields.ServiceName || '',
          SubOption:   it.fields.SubOption   || '',
          Division:    it.fields.Division    || existing.Division,
          Level:       it.fields.Level       || '',
          Quantity:    it.fields.Quantity    || ''
        }));
        await createListItem(ORDER_HISTORY_LIST, {
          Title:      existing.OrderID + '-edit-' + Date.now(),
          OrderID:    existing.OrderID,
          ChangeType: 'Services Updated',
          ChangedBy:  b.ClientID,
          ChangeDate: new Date().toISOString(),
          Notes:      '',
          OldValue:   JSON.stringify({ services: staleSnapshot }),
          NewValue:   JSON.stringify({ services: parsedServices })
        });

        return jsonResponse(200, { success: true, orderId: existing.OrderID });
      }

      /* "Assign by service" (21/09/2026, confirmado con el dueño):
         para estas ordenes, el edit NUNCA compara la lista de
         servicios en bloque (eso mandaria TODO a Review de un jalon,
         sin decir cual servicio especifico cambio, y sin poder
         Approve un agregado trivial mientras algo mas se reasigna).
         Se compara servicio por servicio (par Category+ServiceName,
         mismo criterio que el resto del sistema) contra lo que ya
         habia -- cada servicio que de verdad cambio se vuelve su
         PROPIA solicitud pendiente en Review, resuelta una por una
         (confirmado con el dueño: nunca agrupadas). */
      if (existing.AssignByService) {
        const keyOf = s => (s.Category || '') + '|' + (s.ServiceName || '');
        const oldSvcs = stale.map(it => ({
          Category: it.fields.Category || '', ServiceName: it.fields.ServiceName || '',
          SubOption: it.fields.SubOption || '', Division: it.fields.Division || existing.Division,
          Level: it.fields.Level || '', Quantity: it.fields.Quantity || '',
          NotCompleted: it.fields.NotCompleted === true || it.fields.NotCompleted === 'true'
        }));
        const newSvcs = resolveServices(b.Services, b.Division);
        const oldMap = {}; oldSvcs.forEach(s => { oldMap[keyOf(s)] = s; });
        const newMap = {}; newSvcs.forEach(s => { newMap[keyOf(s)] = s; });

        /* Un servicio YA Completed nunca se puede pedir quitar --
           confirmado desde el mini ("solo se pueden borrar los que
           no estan completados"). Si el cliente lo quito de su
           seleccion de todos modos, se ignora en silencio -- se
           queda como esta, no se genera ninguna solicitud por el.
           completedKeys/scheduledKeys tambien deciden si un cambio de
           Level/Quantity/SubOption necesita pasar por Review o no --
           ver comentario junto a 'Modify' abajo. */
        const assignmentRows = await fetchByOrderId(SERVICE_ASSIGNMENTS_LIST, requestedId, true);
        const completedKeys = new Set(assignmentRows
          .filter(it => it.fields && it.fields.WorkStatus === 'Completed')
          .map(it => (it.fields.Category || '') + '|' + (it.fields.ServiceName || '')));
        const scheduledKeys = new Set(assignmentRows
          .filter(it => it.fields && it.fields.AssignedTo && it.fields.ScheduledDate)
          .map(it => (it.fields.Category || '') + '|' + (it.fields.ServiceName || '')));

        /* Servicios que cambiaron de Level/Quantity/SubOption pero
           TODAVIA no tienen gente+fecha -- nada que proteger, se
           aplican DIRECTO (igual que un servicio nuevo agregado antes
           de tocar Scheduling), no generan una solicitud pendiente.
           Confirmado con el dueño: el picker de reasignar en Review
           solo aplica cuando el servicio YA esta programado. */
        const directLevelChanges = [];
        const changes = [];
        newSvcs.forEach(s => {
          const k = keyOf(s);
          if (!oldMap[k]) {
            changes.push({ subType: 'Add', category: s.Category, serviceName: s.ServiceName, newValue: s });
          } else {
            const o = oldMap[k];
            const differs = (o.Level || '') !== (s.Level || '') || (o.Quantity || '') !== (s.Quantity || '') || (o.SubOption || '') !== (s.SubOption || '');
            if (differs && scheduledKeys.has(k)) {
              changes.push({ subType: 'Modify', category: s.Category, serviceName: s.ServiceName, newValue: { old: o, new: s } });
            } else if (differs) {
              directLevelChanges.push(s);
            }
          }
        });
        oldSvcs.forEach(o => {
          const k = keyOf(o);
          if (newMap[k] || o.NotCompleted) return; // sigue seleccionado, o ya estaba quitado de antes -- nada que pedir
          if (completedKeys.has(k)) return; // no se puede pedir quitar algo completado
          changes.push({ subType: 'Remove', category: o.Category, serviceName: o.ServiceName, newValue: o });
        });

        /* Cambios de Level/Quantity/SubOption sobre un servicio
           TODAVIA no programado -- se aplican directo, actualizando
           SOLO ese renglon real de OrderServices (no se toca ningun
           otro -- a diferencia del edit de toda-la-orden, que borra y
           vuelve a crear todos, aqui NO aplica: eso pisaria el estado
           NotCompleted/etc. de servicios que no tienen nada que ver
           con este cambio). */
        if (directLevelChanges.length) {
          await Promise.all(directLevelChanges.map(s => {
            const row = stale.find(it => (it.fields.Category || '') === (s.Category || '') && (it.fields.ServiceName || '') === (s.ServiceName || ''));
            if (!row) return Promise.resolve();
            return updateListItemByItemId(ORDER_SERVICES_LIST, row.id, {
              SubOption: s.SubOption, Level: s.Level || '', Quantity: numOrNull(s.Quantity)
            });
          }));
          await createListItem(ORDER_HISTORY_LIST, {
            Title:      existing.OrderID + '-svc-direct-' + Date.now(),
            OrderID:    existing.OrderID,
            ChangeType: 'Services Updated',
            ChangedBy:  b.ClientID,
            ChangeDate: new Date().toISOString(),
            Notes:      '',
            NewValue:   JSON.stringify({ services: directLevelChanges })
          });
        }

        if (!changes.length) {
          return jsonResponse(200, { success: true, orderId: existing.OrderID, noChanges: !directLevelChanges.length });
        }

        await updateListItemByItemId(ORDERS_LIST, existing.itemId, { Status: 'Change Requested' });
        await Promise.all(changes.map((c, i) => createListItem(ORDER_HISTORY_LIST, {
          Title:      existing.OrderID + '-svc-change-' + Date.now() + '-' + i,
          OrderID:    existing.OrderID,
          ChangeType: 'Service Change Requested',
          FieldChanged: c.subType, // 'Add' | 'Modify' | 'Remove'
          ChangedBy:  b.ClientID,
          ChangeDate: new Date().toISOString(),
          Notes:      '',
          NewValue:   JSON.stringify({ category: c.category, serviceName: c.serviceName, detail: c.newValue })
        })));

        return jsonResponse(200, { success: true, orderId: existing.OrderID });
      }

      const newStatus = b.Status || 'Pending';

      const snapshot = 'SERVICES:' + JSON.stringify({
        services: stale.map(it => ({
          Category:    it.fields.Category    || '',
          ServiceName: it.fields.ServiceName || '',
          SubOption:   it.fields.SubOption   || '',
          Division:    it.fields.Division    || existing.Division
        })),
        dirtLevel: existing.DirtLevel || ''
      });

      /* TechMarkedComplete se apaga -- ya no es cierto que "esto es lo
         que el tecnico dijo que termino" una vez que algo cambia.
         Respaldo si la columna todavia no existe en SharePoint. */
      /* CAMBIO DE DISENO (confirmado con el usuario): un cambio pedido
         por el cliente ya NO se aplica a la orden real hasta que se
         apruebe -- antes se sobreescribian todos los campos (via
         orderFields completo) y los servicios de una vez. Ahora solo
         se cambia el Status -- lo propuesto vive unicamente en el
         snapshot del renglon de historial de abajo, hasta que
         Reassign/Reschedule lo aplique de verdad. */
      const requestPatch = { Status: newStatus, TechMarkedComplete: false };
      try {
        await updateListItemByItemId(ORDERS_LIST, existing.itemId, requestPatch);
      } catch (patchErr) {
        await updateListItemByItemId(ORDERS_LIST, existing.itemId, { Status: newStatus });
      }

      const revCount = histRows.filter(it =>
        it.fields &&
        it.fields.OrderID === existing.OrderID &&
        (it.fields.ChangeType === 'Change Requested' || it.fields.ChangeType === 'Cancellation Requested')
      ).length;

      /* Servicios nuevos que el cliente seleccionó.
         BUG REAL arreglado (20/09/2026, reportado por el dueño): este
         .map() le quitaba Level y Quantity al servicio, aunque
         resolveServices() (linea de arriba) ya los traia bien
         calculados -- un servicio de cantidad (Renovations) que el
         cliente agregaba/editaba desde "Edit Order" se guardaba en el
         snapshot de la solicitud SIN su cantidad, perdida para
         siempre en cuanto se aplicara de verdad (admin-approve-
         order.js, Reassign/Reschedule). */
      const newServices = resolveServices(b.Services, b.Division).map(s => ({
        Category: s.Category, ServiceName: s.ServiceName, SubOption: s.SubOption, Division: s.Division,
        Level: s.Level || '', Quantity: s.Quantity || ''
      }));

      await createListItem(ORDER_HISTORY_LIST, {
        Title:      existing.OrderID + '-' + (revCount + 1),
        OrderID:    existing.OrderID,
        ChangeType: 'Change Requested',
        ChangedBy:  b.ClientID,
        ChangeDate: new Date().toISOString(),
        Notes:      '',
        OldValue:   JSON.stringify({
          services: stale.map(it => ({
            Category:    it.fields.Category    || '',
            ServiceName: it.fields.ServiceName || '',
            SubOption:   it.fields.SubOption   || '',
            Division:    it.fields.Division    || existing.Division
          })),
          status: existing.Status
        }),
        NewValue:   JSON.stringify(newServices)
      });

      return jsonResponse(200, { success: true, orderId: existing.OrderID });
    }

    /* ===== FLUJO D: Pedido multi-unidad → N ordenes reales con un PO compartido =====
       Calcado del Flujo D del repo orders, adaptado al estilo de este
       archivo (fetchAll + filtro en JS, no fetchByField) y con
       atribucion de quien lo creo (changedBy) en vez de asumir que
       fue el propio cliente. */
    if (Array.isArray(b.Units) && b.Units.length >= 2) {
      if (!b.Services) return jsonResponse(400, { error: 'Services are required' });

      const allOrderRows = await fetchAll(ORDERS_LIST);

      const actor = (b.changedBy && String(b.changedBy).trim()) || 'Admin';
      const poTag = nextGlobalPO(allOrderRows);
      let nextSuffixNum = parseInt(nextGlobalSuffix(allOrderRows), 10);
      const parsedServices = resolveServices(b.Services, b.Division);

      const createdOrderIds = [];
      for (const unit of b.Units) {
        /* Building # es texto libre y opcional, igual que en Single y
           en Add Unit (confirmado con el dueño 12/09/2026) -- ya no
           es un building guardado de CLIENT_ADDRESSES_LIST. Todas las
           unidades del batch usan SIEMPRE la direccion del cliente
           (ya geocodificada arriba, en orderFields); si el campo viene
           vacio, se autorellena con los digitos iniciales de esa
           direccion. */
        let buildingNumber = String(unit.buildingNumber || '').trim();
        if (!buildingNumber) {
          const m = String(orderFields.Address || '').match(/^\s*(\d+)/);
          buildingNumber = m ? m[1] : '';
        }
        const bf = { BuildingNumber: buildingNumber, Address: orderFields.Address, Suite: orderFields.Suite, City: orderFields.City, Zip: orderFields.Zip, Latitude: orderFields.Latitude, Longitude: orderFields.Longitude };
        const suffix = String(nextSuffixNum++).padStart(4, '0');
        const orderId = String(b.ClientID).trim() + '-' + suffix + '-' + poTag;

        /* "Customize" por unidad (Multiple Units) -- si el frontend
           mando fechas/office access propios para ESTA unidad (el
           toggle estaba prendido), se usan esos en vez de heredar los
           del Paso 3 (que ya vienen en orderFields). Mismo formato de
           fecha+hora que ya arma el frontend para el batch completo
           (EntryDate = fecha+hora ISO, DueDate = fecha a las 23:59:59
           ISO) para que quede identico sea cual sea el origen. */
        const unitOverrides = {};
        if (unit.entryDate) {
          unitOverrides.EntryDate = new Date(unit.entryDate + 'T' + (unit.entryTime || '08:00')).toISOString();
        }
        if (unit.dueDate) {
          unitOverrides.DueDate = new Date(unit.dueDate + 'T23:59:59').toISOString();
        }
        if (unit.needsOfficeAccess !== undefined) {
          unitOverrides.NeedsOfficeAccess = !!unit.needsOfficeAccess;
          unitOverrides.OfficeNeedNotes = unit.officeNeedNotes || '';
        }

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
          /* Cada unidad tiene su PROPIA direccion (siempre la del
             cliente, ya geocodificada arriba en orderFields) -- se
             repite aqui explicitamente por claridad, aunque ya venga
             heredada del spread de orderFields. */
          Latitude:  bf.Latitude  != null ? bf.Latitude  : null,
          Longitude: bf.Longitude != null ? bf.Longitude : null
        }, unitOverrides);

        try {
          await createListItem(ORDERS_LIST, unitFields);
        } catch (e) {
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
              Division:    s.Division    || b.Division,
              Level:       s.Level       || '',
              Quantity:    numOrNull(s.Quantity)
            })
          ));

          await createListItem(ORDER_HISTORY_LIST, {
            Title:      orderId,
            OrderID:    orderId,
            ChangeType: 'Created',
            ChangedBy:  actor,
            ChangeDate: new Date().toISOString(),
            Notes:      '',
            OldValue:   '',
            NewValue:   'SERVICES:' + JSON.stringify({ services: parsedServices, dirtLevel: unit.dirtLevel || b.DirtLevel || '', entryDate: unitFields.EntryDate || '', dueDate: unitFields.DueDate || '' })
          });
        } catch (e) {
          /* Mismo criterio que el Flujo C: un problema al escribir
             servicios/historial no debe tumbar la orden completa. */
          console.error('Batch unit post-order write failed for ' + orderId + ':', e.message);
        }

        createdOrderIds.push(orderId);
      }

      /* Fila resumen del lote, pegada a la ULTIMA unidad creada. */
      const lastOrderId = createdOrderIds[createdOrderIds.length - 1];
      try {
        await createListItem(ORDER_HISTORY_LIST, {
          Title:      lastOrderId + '-batch',
          OrderID:    lastOrderId,
          ChangeType: 'Batch Created',
          ChangedBy:  actor,
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

    /* BUG FIX: historyWarning se declaraba con let ADENTRO del try de
       aqui abajo, pero el return final que la usa esta AFUERA de ese
       bloque -- una vez que el try cierra, esa variable deja de
       existir (alcance de bloque real con let). Referenciarla en el
       return tronaba SIEMPRE con "historyWarning is not defined",
       sin importar si el historial se escribio bien o no. Afectaba
       tanto al Create Order de Admin como a cualquier orden nueva
       normal del cliente (customer.html nunca manda OrderID en una
       orden nueva, asi que siempre cae aqui, en Flujo C). La orden
       SI se alcanzaba a crear bien antes de este error -- el bug
       era solo en la respuesta final, no en el guardado real. */
    let historyWarning = null;
    try {
    const parsedServices = resolveServices(b.Services, b.Division);
    await Promise.all(parsedServices.map(s =>
      createListItem(ORDER_SERVICES_LIST, {
        Title:       s.ServiceName || '',
        OrderID:     orderId,
        Category:    s.Category,
        ServiceName: s.ServiceName,
        SubOption:   s.SubOption,
        Division:    s.Division,
        Level:       s.Level || '',
        Quantity:    numOrNull(s.Quantity)
      })
    ));

    const createdHistoryFields = {
      Title:      orderId,
      OrderID:    orderId,
      ChangeType: 'Created',
      /* Si la orden se creo desde admin (Create Order), el "quien lo hizo"
         debe ser la persona de oficina que la creo, no el numero de
         cliente -- para eso admin.html manda b.ChangedBy con el nombre
         del staff logueado. Si la mando el cliente (flujo normal desde
         customer.html), b.ChangedBy nunca llega y se sigue usando su
         ClientID como siempre. */
      ChangedBy:  (b.OfficeCreated && b.ChangedBy) ? b.ChangedBy : b.ClientID,
      ChangeDate: new Date().toISOString(),
      Notes:      '',
      FieldChanged: b.OfficeCreated ? 'Office Order' : '',
      OldValue:   '',
      /* BUG REAL arreglado: antes solo se guardaba la palabra del
         estatus ('Received') -- el pedido original (que servicios se
         pidieron, para que fecha) nunca quedaba registrado en ningun
         lado. Con el tiempo, no habia forma de ver "que se pidio
         exactamente" sin adivinar comparando ediciones posteriores. */
      NewValue:   'SERVICES:' + JSON.stringify({
        services: parsedServices, dirtLevel: b.DirtLevel || '',
        entryDate: orderFields.EntryDate || '', dueDate: orderFields.DueDate || ''
      })
    };

    /* Antes, si esta escritura fallaba por lo que fuera, el error se
       tragaba en silencio (solo console.error, nadie lo veia) y la
       orden se creaba de todos modos SIN ningun renglon de historial
       -- "No history." para siempre en Approvals, sin aviso. Ahora se
       reintenta una vez con una pausa corta, y si de plano vuelve a
       fallar, se manda un aviso real en la respuesta (historyWarning)
       para que admin.html se lo pueda mostrar al usuario en vez de
       que desaparezca sin que nadie se entere. */
    try {
      await createListItem(ORDER_HISTORY_LIST, createdHistoryFields);
    } catch (e1) {
      await new Promise(r => setTimeout(r, 800));
      try {
        await createListItem(ORDER_HISTORY_LIST, createdHistoryFields);
      } catch (e2) {
        console.error('Post-order history write failed twice:', e2.message);
        historyWarning = 'The order was created, but its first history entry could not be saved: ' + e2.message;
      }
    }
} catch (e) { console.error('Post-order write failed:', e.message); }
    return jsonResponse(200, { success: true, orderId, id: result.id, historyWarning });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};