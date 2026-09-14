/* ============================================================
   get-client-gallery.js — fotos de TODAS las ordenes de UN cliente,
   agrupadas por orden. Mismo criterio que get-admin-gallery.js
   (Admingsocd.com): no hay ninguna lista de SharePoint que registre
   las fotos por separado -- todo se deduce leyendo la carpeta directo:
     TechPhotos/<ClientID> - <BusinessName>/<OrderID>/Photos/*.jpg

   A diferencia de get-admin-gallery.js (que trae TODAS las ordenes de
   la compania), este SIEMPRE filtra por clientId -- el cliente nunca
   debe poder ver fotos de otra cuenta. Mismo patron de filtrado ya
   usado en get-orders.js (fetchByField sobre ClientID via OData).
============================================================ */

const { ORDERS_LIST, listChildren, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');

const PHOTOS_FOLDER = process.env.GRAPH_PHOTOS_FOLDER || 'TechPhotos';
/* forzar build limpio -- 2026-09-13 */

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

function clientFolderName(f) {
  return (String(f.ClientID || '').trim() + ' - ' + String(f.BusinessName || '').trim())
    .replace(/[\\/:*?"<>|]/g, '').trim();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const clientId = String(b.clientId || '').trim();
    if (!clientId) return jsonResponse(400, { error: 'clientId is required' });

    const orderRows = await fetchByField(ORDERS_LIST, 'ClientID', clientId);
    const orders = orderRows.filter(it => it.fields);

    const groups = await Promise.all(orders.map(async (it) => {
      const f = it.fields;
      const orderId = f.OrderID || f.Title || '';
      const folderPath = PHOTOS_FOLDER + '/' + clientFolderName(f) + '/' + orderId + '/Photos';
      const kids = await listChildren(folderPath);
      const photos = kids.filter(k => k.isFile).sort((a, b) => a.name.localeCompare(b.name));
      if (!photos.length) return null;
      return {
        orderId,
        division: f.Division || '',
        status: f.Status || '',
        date: f.EntryDate || f.DispatchDate || f.createdDateTime || '',
        photos: photos.map(p => ({ name: p.name, downloadUrl: p.downloadUrl }))
      };
    }));

    const nonEmpty = groups.filter(Boolean).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return jsonResponse(200, { groups: nonEmpty });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
