/* ============================================================
   get-my-recurring.js — contrato(s) recurrente(s) de UN cliente +
   su historial de visitas, para el tab "Recurring" del portal.

   Mismo patron de confianza que ya usa get-orders.js (clientId
   mandado desde el frontend, sin verificar token aparte aqui --
   asi ya funciona el resto del portal).

   El historial se arma en el mismo formato que ya consume
   GSOrderHistory (gsocd-shared) del lado del cliente (mode:
   'client'): visitas rutinarias como ChangeType "Completed" (se
   repite cada vez, igual que el evento de creacion de una orden
   normal), y si una visita se desvio, un par "Change Requested" /
   "Change Reassigned" nace ahi mismo en la cadena -- mismo patron
   que ya usa una orden normal cuando se aprueba una sugerencia de
   supervisor.
============================================================ */

const {
  RECURRING_SERVICES_LIST, RECURRING_LOG_LIST, CLIENTS_LIST, listChildren, graphFetch, siteListPath, jsonResponse
} = require('./lib/graph');

const PHOTOS_FOLDER = process.env.GRAPH_PHOTOS_FOLDER || 'TechPhotos';

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

function parseServicesJson(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.map(s => ({ ServiceName: s.serviceName || s.sku || '', Level: s.level || '' })) : [];
  } catch (e) { return []; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const { clientId } = JSON.parse(event.body || '{}');
    if (!clientId) return jsonResponse(400, { error: 'clientId is required' });
    const wanted = String(clientId).trim();

    const contractRows = (await fetchByField(RECURRING_SERVICES_LIST, 'ClientID', wanted))
      .filter(it => it.fields && it.fields.Active !== false && it.fields.Active !== 'false');

    const clientRows = await fetchByField(CLIENTS_LIST, 'ClientID', wanted);
    const clientRow = clientRows.find(it => it.fields);
    const businessName = clientRow && clientRow.fields ? (clientRow.fields.Title || clientRow.fields.BusinessName || '') : '';
    const clientLabel = (wanted + ' - ' + businessName).replace(/[\\/:*?"<>|]/g, '').trim() || wanted;

    const contracts = await Promise.all(contractRows.map(async it => {
      const f = it.fields;
      const logRows = await fetchByField(RECURRING_LOG_LIST, 'RecurringServiceID', it.id);

      const clientPhotosFolder = PHOTOS_FOLDER + '/' + clientLabel + '/Recurring/' + it.id + '/ClientPhotos';
      let clientPhotos = [];
      try {
        const kids = await listChildren(clientPhotosFolder);
        clientPhotos = kids.filter(k => k.isFile).map(p => ({ name: p.name, downloadUrl: p.downloadUrl }));
      } catch (e) { clientPhotos = []; } // carpeta puede no existir todavia

      /* Solo Completed cuenta como historial real para el cliente --
         Pending Review y Field Confirmed todavia no son nada firme
         del lado de afuera. */
      const completed = logRows
        .filter(l => l.fields && l.fields.Status === 'Completed')
        .sort((a, b) => String(a.fields.VisitDate).localeCompare(String(b.fields.VisitDate)));

      const history = [];
      completed.forEach(l => {
        const lf = l.fields;
        let svcPayload = {};
        try { svcPayload = JSON.parse(lf.ServicesJSON || '{}'); } catch (e) { /* deja vacio */ }
        const removedNotes = svcPayload.removedNotes || [];
        const added = svcPayload.services || [];
        const deviated = !!(removedNotes.length || added.length);

        if (deviated) {
          const notesParts = [];
          removedNotes.forEach(r => notesParts.push('Removed ' + (r.serviceName || '') + ': ' + (r.note || '')));
          added.forEach(a => notesParts.push('Added ' + (a.serviceName || '')));
          history.push({
            ChangeType: 'Change Requested', ChangeDate: lf.VisitDate + 'T12:00:00Z',
            ChangedBy: lf.LoggedBy || '', FieldChanged: 'Recurring Update',
            Notes: notesParts.join(' | ')
          });
          history.push({
            ChangeType: 'Change Reassigned', ChangeDate: lf.VisitDate + 'T12:00:01Z',
            ChangedBy: lf.ReviewedBy || 'Office'
          });
        }
        history.push({
          ChangeType: 'Completed', ChangeDate: lf.VisitDate + 'T12:00:02Z',
          ChangedBy: lf.LoggedBy || '', Notes: lf.Notes || 'Visit completed.'
        });
      });

      return {
        id: it.id,
        buildingNumber: f.BuildingNumber || '',
        division: f.Division || '',
        daysOfWeek: f.DaysOfWeek || '',
        time: f.Time || '',
        activeSince: (it.createdDateTime || '').slice(0, 10),
        Services: parseServicesJson(f.ServicesJSON),
        clientPhotos,
        history
      };
    }));

    return jsonResponse(200, { contracts });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
