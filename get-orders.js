/* ============================================================
   get-orders.js — órdenes y drafts de UN cliente para el portal.
   Filtra por ClientID via OData para no descargar listas completas.
============================================================ */

const { ORDERS_LIST, DRAFTS_LIST, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');

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
    const { clientId } = JSON.parse(event.body || '{}');
    if (!clientId) return jsonResponse(400, { error: 'clientId is required' });

    const wanted = String(clientId).trim();

    /* Leer órdenes y drafts del cliente en paralelo */
    const [orderRows, draftRows] = await Promise.all([
      fetchByField(ORDERS_LIST, 'ClientID', wanted),
      fetchByField(DRAFTS_LIST, 'ClientID', wanted)
    ]);

    const mappedOrders = orderRows
      .filter(it => it.fields && String(it.fields.Status || '') !== 'Cancelled')
      .map(it => {
        const f = it.fields;
        return {
          id:              it.id,
          createdDateTime: it.createdDateTime || f.Created || '',
          /* Mismo criterio que ya se agrego para mappedDrafts abajo --
             lo necesita el encabezado del PO agrupado en el portal,
             para saber si alguna unidad se modifico de verdad despues
             de crearse. */
          lastModifiedDateTime: it.lastModifiedDateTime || '',
          OrderID:         f.OrderID || f.Title || '',
          ClientID:        f.ClientID || '',
          BusinessName:    f.BusinessName || f.Title || '',
          Division:        f.Division || '',
          Status:          f.Status || 'Pending',
          DirtLevel:       f.DirtLevel || '',
          Services:        f.Services || '',
          DraftData:       f.DraftData || '',
          BuildingNumber:  f.BuildingNumber || '',
          UnitNumber:      f.UnitNumber || '',
          Bedrooms:        f.Bedrooms || '',
          Bathrooms:       f.Bathrooms || '',
          CompletedDate:   f.CompletedDate || '',
          EntryDate:       f.EntryDate || '',
          DueDate:         f.DueDate || '',
          Address:         f.Address || '',
          Suite:           f.Suite || '',
          City:            f.City || '',
          Zip:             f.Zip || '',
          Contact:         f.Contact || '',
          Notes:           f.Notes || '',
          UnitOccupied:    f.UnitOccupied === true || f.UnitOccupied === 'true',
          NeedsOfficeAccess: f.NeedsOfficeAccess === true || f.NeedsOfficeAccess === 'true',
          OfficeNeedNotes: f.OfficeNeedNotes || '',
          /* La ventana de servicio y el motivo de retraso se muestran en el
             portal: el cliente tiene que poder ver a que hora van y por que
             se movio la visita sin tener que llamar. */
          ServiceWindow:    f.ServiceWindow || '',
          DelayReasonType:  f.DelayReasonType || '',
          DelayReasonNotes: f.DelayReasonNotes || '',
          /* Inspeccion (25/09/2026): el cliente ve cuando va el
             supervisor y cuando ya se hizo. */
          InspectionDate:   f.InspectionDate || '',
          InspectionWindow: f.InspectionWindow || '',
          InspectionDoneAt: f.InspectionDoneAt || '',
          BatchId:    f.BatchId    || '',
          BuildingId: f.BuildingId || ''
        };
      });

    /* BUG REAL / mejora pedida por el dueño (18/09/2026): la tarjeta
       de un draft solo mostraba Division + fecha guardada -- para ver
       de que se trataba (unidad, fechas, servicios) habia que abrirlo
       si o si. Los servicios SI se guardan (una fila por servicio,
       igual que una orden real) pero este endpoint las descartaba --
       ahora se agrupan por OrderID y se mandan completas (nombre,
       categoria, nivel), no solo el numero, para poder mostrar el
       mismo formato de "Services Requested" que usa una orden real. */
    const draftServicesByOrder = {};
    draftRows.forEach(it => {
      if (it.fields && it.fields.ServiceName && it.fields.OrderID) {
        const oid = it.fields.OrderID;
        if (!draftServicesByOrder[oid]) draftServicesByOrder[oid] = [];
        draftServicesByOrder[oid].push({
          ServiceName: it.fields.ServiceName || '',
          Category:    it.fields.Category || '',
          SubOption:   it.fields.SubOption || '',
          Level:       it.fields.Level || '',
          Quantity:    it.fields.Quantity || ''
        });
      }
    });

    /* Solo filas header de drafts (sin ServiceName) con Status=Draft */
    const mappedDrafts = draftRows
      .filter(it => it.fields && !it.fields.ServiceName && it.fields.Status === 'Draft')
      .map(it => {
        const f = it.fields;
        return {
          id:              it.id,
          createdDateTime: it.createdDateTime || f.DraftDate || f.Created || '',
          /* lastModifiedDateTime ya viene gratis en cada renglon de
             SharePoint via Graph -- no hace falta guardar nada nuevo,
             el autoguardado cada 3 segundos ya lo va actualizando solo
             cada vez que hace un updateListItemByItemId(). */
          lastModifiedDateTime: it.lastModifiedDateTime || '',
          OrderID:         f.OrderID || f.Title || '',
          ClientID:        f.ClientID || '',
          BusinessName:    f.BusinessName || f.Title || '',
          Division:        f.Division || '',
          Status:          'Incomplete',
          DirtLevel:       f.DirtLevel || '',
          Services:        '',
          DraftServices:   draftServicesByOrder[f.OrderID || f.Title || ''] || [],
          DraftData:       '',
          BuildingNumber:  f.BuildingNumber || '',
          UnitNumber:      f.UnitNumber || '',
          Bedrooms:        f.Bedrooms || '',
          Bathrooms:       f.Bathrooms || '',
          CompletedDate:   f.CompletedDate || '',
          EntryDate:       f.EntryDate || '',
          DueDate:         f.DueDate || '',
          Address:         f.Address || '',
          Suite:           f.Suite || '',
          City:            f.City || '',
          Zip:             f.Zip || '',
          Contact:         f.Contact || '',
          Notes:           f.Notes || '',
          ServiceWindow:    f.ServiceWindow || '',
          DelayReasonType:  '',
          DelayReasonNotes: '',
          UnitsData: f.UnitsData || ''
        };
      });

    const orders = [...mappedOrders, ...mappedDrafts];
    orders.sort((a, b) => String(b.createdDateTime).localeCompare(String(a.createdDateTime)));

    return jsonResponse(200, { orders });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};