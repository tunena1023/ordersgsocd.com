/* ============================================================
   upload-client-recurring-photo.js — el cliente sube una foto
   opcional a su contrato recurrente (no ligada a una visita en
   especifico -- carpeta propia, separada de las fotos que sube el
   staff en cada visita). Mismo patron real que ya usa
   upload-client-photo.js para ordenes normales.
============================================================ */

const {
  RECURRING_SERVICES_LIST, CLIENTS_LIST, ensureFolder, uploadFile, graphFetch, siteListPath, jsonResponse
} = require('./lib/graph');

const PHOTOS_FOLDER = process.env.GRAPH_PHOTOS_FOLDER || 'TechPhotos';

async function fetchByField(listName, fieldName, value) {
  const filter = encodeURIComponent(`fields/${fieldName} eq '${value}'`);
  const data = await graphFetch(siteListPath(listName) + `?$expand=fields&$top=200&$filter=${filter}`);
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
    const recurringServiceId = String(b.recurringServiceId || '').trim();
    const imageBase64 = b.imageBase64;
    if (!recurringServiceId) return jsonResponse(400, { error: 'recurringServiceId is required' });
    if (!imageBase64) return jsonResponse(400, { error: 'No image data received' });

    const svcData = await graphFetch(siteListPath(RECURRING_SERVICES_LIST) + '/' + recurringServiceId + '?$expand=fields');
    if (!svcData || !svcData.fields) return jsonResponse(404, { error: 'Recurring contract not found.' });

    const clientRows = await fetchByField(CLIENTS_LIST, 'ClientID', svcData.fields.ClientID || '');
    const clientRow = clientRows.find(it => it.fields);
    const businessName = clientRow && clientRow.fields ? (clientRow.fields.Title || clientRow.fields.BusinessName || '') : '';
    const clientLabel = (String(svcData.fields.ClientID || '').trim() + ' - ' + String(businessName).trim())
      .replace(/[\\/:*?"<>|]/g, '').trim() || recurringServiceId;
    const folderPath = PHOTOS_FOLDER + '/' + clientLabel + '/Recurring/' + recurringServiceId + '/ClientPhotos';

    const fileName = 'client-' + fileTimestamp(new Date()) + '.jpg';
    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    await ensureFolder(folderPath);
    const result = await uploadFile(folderPath, fileName, buffer, 'image/jpeg');

    return jsonResponse(200, { success: true, fileName, webUrl: result.webUrl });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
