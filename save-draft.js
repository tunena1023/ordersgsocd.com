/* ============================================================
   save-draft.js — autosave de drafts en la lista Drafts.
============================================================ */

const {
  DRAFTS_LIST,
  graphFetch, siteListPath,
  createListItem, updateListItemByItemId, deleteListItem,
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

async function fetchAllTempIds() {
  let url = siteListPath(DRAFTS_LIST) + '?$expand=fields($select=OrderID)&$top=500';
  const out = [];
  while (url) {
    const data = await graphFetch(url);
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

function generateTempId(clientId, allRows) {
  const nums = allRows
    .map(it => {
      const id = String(it.fields?.OrderID || '');
      const m = id.match(/TEMP-(\d+)$/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter(n => n !== null);

  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return clientId + '-TEMP-' + String(next).padStart(4, '0');
}

function numberField(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function dateField(v) { return v || null; }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const b = JSON.parse(event.body || '{}');

    if (!b.ClientID || !b.Division || !b.Services || !b.Services.length) {
      return jsonResponse(400, { error: 'ClientID, Division and Services are required' });
    }

    const clientRows = await fetchByField(DRAFTS_LIST, 'ClientID', b.ClientID);

    const existing = clientRows.find(it =>
      it.fields &&
      String(it.fields.Division || '').toLowerCase() === String(b.Division).toLowerCase() &&
      it.fields.Status === 'Draft' &&
      !it.fields.ServiceName
    );

    const headerFields = {
      Title:          b.BusinessName || '',
      ClientID:       b.ClientID,
      Division:       b.Division,
      Requester:      b.Requester || b.BusinessName || '',
      Status:         'Draft',
      DirtLevel:      b.DirtLevel || '',
      BuildingNumber: b.BuildingNumber || '',
      UnitNumber:     b.UnitNumber || '',
      Bedrooms:       numberField(b.Bedrooms),
      Bathrooms:      numberField(b.Bathrooms),
      Notes:          b.Notes || '',
      DraftDate:      new Date().toISOString(),
      UnitsData:      Array.isArray(b.Units) ? JSON.stringify(b.Units) : ''
    };
    if (b.EntryDate !== undefined) headerFields.EntryDate = dateField(b.EntryDate);
    if (b.DueDate   !== undefined) headerFields.DueDate   = dateField(b.DueDate);

    let orderId;

    if (existing) {
      orderId = String(existing.fields.OrderID);
      headerFields.OrderID = orderId;

      const serviceRows = clientRows.filter(it =>
        it.fields &&
        String(it.fields.OrderID || '') === orderId &&
        it.fields.ServiceName
      );

      await Promise.all([
        updateListItemByItemId(DRAFTS_LIST, existing.id, headerFields),
        ...serviceRows.map(row => deleteListItem(DRAFTS_LIST, row.id))
      ]);

    } else {
      const allTempRows = await fetchAllTempIds();
      orderId = generateTempId(b.ClientID, allTempRows);
      headerFields.OrderID = orderId;
      await createListItem(DRAFTS_LIST, headerFields);
    }

    await Promise.all(b.Services.map(svc =>
      createListItem(DRAFTS_LIST, {
        Title:       svc.ServiceName || '',
        OrderID:     orderId,
        ClientID:    b.ClientID,
        Division:    svc.Division || b.Division,
        Category:    svc.Category || '',
        ServiceName: svc.ServiceName || '',
        SubOption:   svc.SubOption || '',
        Status:      'Draft'
      })
    ));

    return jsonResponse(200, { success: true, orderId });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};