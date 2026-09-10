/* ============================================================
   upload-client-photo.js — el cliente sube una foto opcional, en 2
   momentos posibles: al pedir la orden (mostrando que necesita
   atencion) o ya con la orden activa (algo nuevo que surgio).
   Confirmado con el usuario: siempre opcional, nunca bloquea nada.
   Solo foto (no video), y sin ubicacion -- esto no es para
   rastrear a nadie, es solo para que el cliente muestre algo.

   Misma carpeta que ya usa Tech (TechPhotos/.../Photos/) -- para que
   Admin las vea en la MISMA galeria de siempre, sin tener que tocar
   nada del lado de Admin. Se distinguen por el nombre del archivo
   ("client-" de prefijo) por si algun dia se quiere separar la
   vista, no porque haga falta hoy.
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const orderId = String(b.orderId || '').trim();
    const imageBase64 = b.imageBase64;
    if (!orderId) return jsonResponse(400, { error: 'orderId is required' });
    if (!imageBase64) return jsonResponse(400, { error: 'No image data received' });

    const rows = await fetchByField(ORDERS_LIST, 'OrderID', orderId);
    const orderItem = rows.find(it => it.fields);
    if (!orderItem) return jsonResponse(404, { error: 'Order not found.' });
    const f = orderItem.fields;

    const clientLabel = (String(f.ClientID || '').trim() + ' - ' + String(f.BusinessName || '').trim())
      .replace(/[\\/:*?"<>|]/g, '').trim() || orderId;
    const folderPath = PHOTOS_FOLDER + '/' + clientLabel + '/' + orderId + '/Photos';

    const fileName = 'client-' + fileTimestamp(new Date()) + '.jpg';
    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    await ensureFolder(folderPath);
    const result = await uploadFile(folderPath, fileName, buffer, 'image/jpeg');

    return jsonResponse(200, { success: true, fileName, webUrl: result.webUrl });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
