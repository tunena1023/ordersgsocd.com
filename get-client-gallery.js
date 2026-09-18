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

const { ORDERS_LIST, ORDER_SERVICES_LIST, listChildren, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');

const PHOTOS_FOLDER = process.env.GRAPH_PHOTOS_FOLDER || 'TechPhotos';
/* forzar build limpio -- 2026-09-13 */

/* Fotos de un servicio especifico (camara junto a cada servicio, en
   Admin y Tech) traen el nombre del servicio y el momento en que se
   tomaron codificados en el archivo mismo --
   "svc-<ServiceNameSafe>-<timestamp>.jpg". Sin ninguna columna nueva
   en SharePoint. La nota (si hay) siempre se lee de
   NotCompletedReason en OrderServices en ese momento, nunca se
   duplica aqui. Calcado de Admingsocd.com/get-admin-gallery.js y
   tech.gsocd.com/get-my-gallery.js para que se vea IGUAL en los 3
   lados. */
const SVC_PHOTO_PREFIX = /^svc-(.+?)-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})(?:-[a-z0-9]+)?\.[a-z0-9]+$/i;
function safeName(s) { return String(s || '').replace(/[^a-z0-9]/gi, '_'); }

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatSvcPhotoDate(y, mo, d, h, mi) {
  const hNum = parseInt(h, 10);
  const ampm = hNum >= 12 ? 'PM' : 'AM';
  const h12 = hNum % 12 === 0 ? 12 : hNum % 12;
  return MONTH_NAMES[parseInt(mo, 10) - 1] + ' ' + parseInt(d, 10) + ', ' + y + ' · ' + h12 + ':' + mi + ' ' + ampm;
}

async function buildServiceCaptions(orderId, photoNames) {
  const svcNamesInPhotos = photoNames
    .map(n => (n.match(SVC_PHOTO_PREFIX) || [])[1])
    .filter(Boolean);
  if (!svcNamesInPhotos.length) return {};

  const rows = await fetchByField(ORDER_SERVICES_LIST, 'OrderID', orderId);
  const bySafeName = {};
  rows.forEach(it => {
    const f = it.fields || {};
    const name = f.ServiceName || '';
    if (!name) return;
    bySafeName[safeName(name)] = { name, reason: f.NotCompletedReason || '' };
  });

  const captions = {};
  photoNames.forEach(fileName => {
    const m = fileName.match(SVC_PHOTO_PREFIX);
    if (!m) return;
    const svc = bySafeName[m[1]];
    if (!svc) return;
    const dateStr = formatSvcPhotoDate(m[2], m[3], m[4], m[5], m[6]);
    captions[fileName] = svc.name + (svc.reason ? ' — ' + svc.reason : '') + ' · ' + dateStr;
  });
  return captions;
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
      const captions = await buildServiceCaptions(orderId, photos.map(p => p.name));
      return {
        orderId,
        division: f.Division || '',
        status: f.Status || '',
        date: f.EntryDate || f.DispatchDate || f.createdDateTime || '',
        photos: photos.map(p => ({ name: p.name, downloadUrl: p.downloadUrl, caption: captions[p.name] || undefined }))
      };
    }));

    const nonEmpty = groups.filter(Boolean).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return jsonResponse(200, { groups: nonEmpty });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
