/* ============================================================
   get-recurring-gallery.js — todas las fotos de TODAS las visitas
   de un contrato recurrente, juntas en una sola galeria (no una
   por visita -- confirmado con el usuario). Mismo patron real de
   listChildren que ya usa get-client-order-photos.js.
============================================================ */

const {
  RECURRING_SERVICES_LIST, RECURRING_LOG_LIST, CLIENTS_LIST,
  listChildren, graphFetch, siteListPath, jsonResponse
} = require('./lib/graph');

const PHOTOS_FOLDER = process.env.GRAPH_PHOTOS_FOLDER || 'TechPhotos';

async function fetchByField(listName, fieldName, value) {
  const filter = encodeURIComponent(`fields/${fieldName} eq '${value}'`);
  const data = await graphFetch(siteListPath(listName) + `?$expand=fields&$top=200&$filter=${filter}`);
  return data.value || [];
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const recurringServiceId = String(b.recurringServiceId || '').trim();
    if (!recurringServiceId) return jsonResponse(400, { error: 'recurringServiceId is required' });

    const svcData = await graphFetch(siteListPath(RECURRING_SERVICES_LIST) + '/' + recurringServiceId + '?$expand=fields');
    if (!svcData || !svcData.fields) return jsonResponse(404, { error: 'Recurring contract not found.' });
    const svcFields = svcData.fields;

    const clientRows = await fetchByField(CLIENTS_LIST, 'ClientID', svcFields.ClientID || '');
    const clientRow = clientRows.find(it => it.fields);
    const businessName = clientRow && clientRow.fields ? (clientRow.fields.Title || clientRow.fields.BusinessName || '') : '';
    const clientLabel = (String(svcFields.ClientID || '').trim() + ' - ' + String(businessName).trim())
      .replace(/[\\/:*?"<>|]/g, '').trim() || recurringServiceId;

    const logRows = (await fetchByField(RECURRING_LOG_LIST, 'RecurringServiceID', recurringServiceId))
      .filter(l => l.fields && l.fields.Status === 'Completed');

    const photoLists = await Promise.all(logRows.map(async l => {
      const folderPath = PHOTOS_FOLDER + '/' + clientLabel + '/Recurring/' + recurringServiceId + '/' + l.fields.VisitDate + '/Photos';
      try {
        const kids = await listChildren(folderPath);
        return kids.filter(k => k.isFile).map(p => ({ name: p.name, downloadUrl: p.downloadUrl, visitDate: l.fields.VisitDate }));
      } catch (e) {
        return []; // carpeta puede no existir todavia (visita sin foto)
      }
    }));

    const photos = photoLists.flat().sort((a, b) => String(b.visitDate).localeCompare(String(a.visitDate)));
    return jsonResponse(200, { photos });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
