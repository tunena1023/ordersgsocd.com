/* ============================================================
   get-client-order-photos.js — fotos de una orden, leidas directo de
   la carpeta (mismo patron que get-order-photos.js de Admin). El
   cliente las usa para ver que ya subio, sin distinguir cuales son
   de el o de un tecnico -- todas viven en la misma carpeta.
============================================================ */

const { ORDERS_LIST, listChildren, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');

const PHOTOS_FOLDER = process.env.GRAPH_PHOTOS_FOLDER || 'TechPhotos';

async function fetchByField(listName, fieldName, value) {
  const filter = encodeURIComponent(`fields/${fieldName} eq '${value}'`);
  const data = await graphFetch(siteListPath(listName) + `?$expand=fields&$top=50&$filter=${filter}`);
  return data.value || [];
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const orderId = String(b.orderId || '').trim();
    if (!orderId) return jsonResponse(400, { error: 'orderId is required' });

    const rows = await fetchByField(ORDERS_LIST, 'OrderID', orderId);
    const item = rows.find(it => it.fields);
    if (!item) return jsonResponse(404, { error: 'Order not found.' });
    const f = item.fields;

    const clientLabel = (String(f.ClientID || '').trim() + ' - ' + String(f.BusinessName || '').trim())
      .replace(/[\\/:*?"<>|]/g, '').trim() || orderId;
    const folderPath = PHOTOS_FOLDER + '/' + clientLabel + '/' + orderId + '/Photos';

    let kids = [];
    try { kids = await listChildren(folderPath); } catch (e) { kids = []; } // carpeta puede no existir todavia
    const photos = kids.filter(k => k.isFile).sort((a, b) => a.name.localeCompare(b.name))
      .map(p => ({ name: p.name, downloadUrl: p.downloadUrl }));

    return jsonResponse(200, { photos });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
