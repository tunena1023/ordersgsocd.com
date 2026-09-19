/* ============================================================
   upload-client-service-photo.js — el cliente sube una foto ligada a
   UN servicio especifico de una orden (camarita por renglon en
   "Services Requested", tarjeta de la orden en Processing).

   Mismo mecanismo EXACTO que Admingsocd.com/upload-service-photo.js
   (mismo prefijo de archivo "svc-", mismo formato de timestamp) --
   sin eso, get-admin-gallery.js de Admin no reconoceria estas fotos
   como ligadas a un servicio. No hay ninguna columna nueva en
   SharePoint: el nombre del archivo mismo dice a que servicio
   pertenece. Ver ese archivo para el detalle completo del formato
   ("svc-<ServiceNameSafe>-<timestamp>-<random>.jpg") y por que trae
   el sufijo aleatorio (2 fotos en el mismo segundo se pisaban antes).

   Sin auth completa a proposito, igual que upload-client-photo.js --
   solo necesita saber orderId/serviceName/foto, no quien es el actor.

   Misma carpeta que ya usa Tech/Admin (TechPhotos/.../Photos/), para
   que aparezca en la MISMA galeria de siempre sin tocar nada mas del
   lado de Admin.
============================================================ */

const {
  ORDERS_LIST, ensureFolder, uploadFile, graphFetch, siteListPath, jsonResponse
} = require('./lib/graph');

const PHOTOS_FOLDER = process.env.GRAPH_PHOTOS_FOLDER || 'TechPhotos';

async function fetchByField(listName, fieldName, value) {
  const filter = encodeURIComponent(`fields/${fieldName} eq '${value}'`);
  const url = siteListPath(listName) + `?$expand=fields&$top=50&$filter=${filter}`;
  const data = await graphFetch(url);
  return data.value || [];
}

function fileTimestamp(d) {
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

/* Mismo motivo que en upload-service-photo.js: 2+ fotos en el mismo
   segundo pisarian el mismo nombre de archivo sin el sufijo. */
function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function safeName(s) { return String(s || '').trim().replace(/[^a-z0-9]/gi, '_'); }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const orderId = String(b.orderId || '').trim();
    const serviceName = String(b.serviceName || '').trim();
    const imageBase64 = b.imageBase64;
    if (!orderId) return jsonResponse(400, { error: 'orderId is required' });
    if (!serviceName) return jsonResponse(400, { error: 'serviceName is required' });
    if (!imageBase64) return jsonResponse(400, { error: 'No image data received' });

    const rows = await fetchByField(ORDERS_LIST, 'OrderID', orderId);
    const orderItem = rows.find(it => it.fields);
    if (!orderItem) return jsonResponse(404, { error: 'Order not found.' });
    const f = orderItem.fields;

    const clientLabel = (String(f.ClientID || '').trim() + ' - ' + String(f.BusinessName || '').trim())
      .replace(/[\\/:*?"<>|]/g, '').trim() || orderId;
    const folderPath = PHOTOS_FOLDER + '/' + clientLabel + '/' + orderId + '/Photos';

    const fileName = 'svc-' + safeName(serviceName) + '-' + fileTimestamp(new Date()) + '-' + randomSuffix() + '.jpg';
    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    await ensureFolder(folderPath);
    const result = await uploadFile(folderPath, fileName, buffer, 'image/jpeg');

    return jsonResponse(200, { success: true, fileName, webUrl: result.webUrl });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
