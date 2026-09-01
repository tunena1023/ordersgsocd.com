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
          EntryDate:       f.EntryDate || '',
          DueDate:         f.DueDate || '',
          Address:         f.Address || '',
          Suite:           f.Suite || '',
          City:            f.City || '',
          Zip:             f.Zip || '',
          Contact:         f.Contact || '',
          Notes:           f.Notes || '',
          /* La ventana de servicio y el motivo de retraso se muestran en el
             portal: el cliente tiene que poder ver a que hora van y por que
             se movio la visita sin tener que llamar. */
          ServiceWindow:    f.ServiceWindow || '',
          DelayReasonType:  f.DelayReasonType || '',
          DelayReasonNotes: f.DelayReasonNotes || '',
          BatchId:    f.BatchId    || '',
          BuildingId: f.BuildingId || ''
        };
      });

    /* Solo filas header de drafts (sin ServiceName) con Status=Draft */
    const mappedDrafts = draftRows
      .filter(it => it.fields && !it.fields.ServiceName && it.fields.Status === 'Draft')
      .map(it => {
        const f = it.fields;
        return {
          id:              it.id,
          createdDateTime: it.createdDateTime || f.DraftDate || f.Created || '',
          OrderID:         f.OrderID || f.Title || '',
          ClientID:        f.ClientID || '',
          BusinessName:    f.BusinessName || f.Title || '',
          Division:        f.Division || '',
          Status:          'Incomplete',
          DirtLevel:       f.DirtLevel || '',
          Services:        '',
          DraftData:       '',
          BuildingNumber:  f.BuildingNumber || '',
          UnitNumber:      f.UnitNumber || '',
          Bedrooms:        f.Bedrooms || '',
          Bathrooms:       f.Bathrooms || '',
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