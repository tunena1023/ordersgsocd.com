/* ============================================================
   delete-draft.js — borrar un draft en la lista Drafts.
   Borra fisicamente TODAS las filas del draft (header + servicios).

   ANTES de borrar deja un renglon en OrderHistory con todo lo que el
   draft contenia. Un borrado silencioso significa que nadie puede saber
   despues que numero de orden se libero, quien lo borro ni que traia:
   por eso queda registro aunque el draft ya no exista.

   Si el registro falla, el draft SI se borra igual (era lo que el cliente
   pidio) y la respuesta lo dice en historyError.
============================================================ */

const {
  DRAFTS_LIST, ORDER_HISTORY_LIST,
  graphFetch, siteListPath, deleteListItem, createListItem,
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

/* Resumen del draft en texto, legible por una persona */
function draftSnapshot(header, serviceRows) {
  const f = header || {};
  const lines = [];
  lines.push('Client: ' + (f.BusinessName || f.Title || '') + ' (' + (f.ClientID || '') + ')');
  if (f.Division) lines.push('Division: ' + f.Division);
  if (f.DirtLevel) lines.push('Overall condition: ' + f.DirtLevel);
  const unit = [f.BuildingNumber, f.UnitNumber].filter(Boolean).join(' / ');
  if (unit) lines.push('Building / Unit: ' + unit);
  const addr = [f.Address, f.Suite, f.City, f.Zip].filter(Boolean).join(', ');
  if (addr) lines.push('Address: ' + addr);
  if (f.EntryDate) lines.push('Entry Date: ' + String(f.EntryDate).slice(0, 10));
  if (f.DueDate) lines.push('Due Date: ' + String(f.DueDate).slice(0, 10));
  if (f.ServiceWindow) lines.push('Service Window: ' + f.ServiceWindow);
  if (f.Notes) lines.push('Notes: ' + f.Notes);

  const svcs = (serviceRows || []).map(r => {
    const s = r.fields || {};
    return [s.Category, s.ServiceName].filter(Boolean).join(': ') +
           (s.SubOption ? ' - ' + s.SubOption : '');
  }).filter(Boolean);

  lines.push('Services: ' + (svcs.length ? svcs.join(' | ') : 'none saved'));
  return lines.join('\n');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { orderId, deletedBy } = JSON.parse(event.body || '{}');
    if (!orderId) return jsonResponse(400, { error: 'orderId is required' });

    const draftRows = await fetchByField(DRAFTS_LIST, 'OrderID', String(orderId));

    const toDelete = draftRows.filter(it =>
      it.fields && it.fields.Status === 'Draft'
    );

    if (!toDelete.length) {
      return jsonResponse(404, { error: 'Draft not found.' });
    }

    /* La fila header es la que no trae ServiceName */
    const headerRow = toDelete.find(it => !it.fields.ServiceName) || toDelete[0];
    const header = headerRow.fields || {};
    const serviceRows = toDelete.filter(it => it.fields && it.fields.ServiceName);

    /* --- Registro ANTES de borrar --- */
    let historyError = null;
    try {
      await createListItem(ORDER_HISTORY_LIST, {
        Title:        String(orderId) + '-del',
        OrderID:      String(orderId),
        ChangeType:   'Draft Deleted',
        FieldChanged: 'Draft',
        ChangedBy:    String(deletedBy || header.ClientID || '').trim() || 'Client',
        ChangeDate:   new Date().toISOString(),
        Notes:        'The client deleted this unfinished draft. Its order number was released. '
                      + toDelete.length + ' row(s) were removed.',
        OldValue:     draftSnapshot(header, serviceRows),
        NewValue:     ''
      });
    } catch (e) {
      historyError = e.message;
    }

    await Promise.all(toDelete.map(row => deleteListItem(DRAFTS_LIST, row.id)));

    return jsonResponse(200, {
      success: true,
      rowsDeleted: toDelete.length,
      logged: !historyError,
      historyError: historyError
    });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
