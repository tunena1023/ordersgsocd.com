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
    /* PARCHE TEMPORAL: RECURRING_SERVICES_LIST y CLIENTS_LIST nunca
       indexaron la columna ClientID en SharePoint (a diferencia de
       ORDERS_LIST/DRAFTS_LIST, que si la tienen indexada -- ver
       get-orders.js), asi que Graph rechaza el filtro sin este header.
       Esto es un parche, no el arreglo real -- Microsoft avisa que en
       listas grandes puede fallar de vez en cuando. El arreglo de
       fondo es indexar ClientID en esas 2 listas desde SharePoint
       (Configuracion de lista > Columnas indizadas), fuera de este
       codigo. Quitar este header en cuanto eso se haga. */
    const data = await graphFetch(url, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

/* Contratos "Who does what" por lugar (Admingsocd.com, 23/09/2026):
   cada renglon trae zone/area/qty (y dias/persona). Para el cliente, el
   lugar va pegado al servicio ("Floor 1 / Hallway — Vacuum carpets") --
   si no, veria "Vacuum carpets" repetido 3 veces sin saber donde, que es
   justo el alcance que el contrato ahora deja claro. El mismo lugar +
   servicio con 2 personas sale UNA vez. Contratos de siempre: igual. */
/* Mismas reglas que placeLabel() en Admingsocd.com/lib/recurring-orders.js
   (23/09/2026, con edificios): edificio si el contrato tiene varios,
   piso si ese edificio tiene varios (o Elevators & stairs / Exterior),
   y el area. Un negocio de un solo nivel se lee "Restroom" a secas. */
function zoneLabel(z) {
  const v = String(z || '');
  return v === 'BLD' ? 'Elevators & stairs' : v === 'EXT' ? 'Exterior' : (/^F\d+$/.test(v) ? 'Floor ' + v.slice(1) : v);
}
function placeContext(arr) {
  const places = arr.filter(s => s && s.zone && s.area);
  const blds = new Set(places.map(s => String(s.bld || 'main')));
  const floorsBy = {};
  places.forEach(s => {
    const bid = String(s.bld || 'main'), fl = /^F\d+$/.test(String(s.zone)) ? +String(s.zone).slice(1) : 1;
    floorsBy[bid] = Math.max(floorsBy[bid] || 1, Number(s.floors) || 1, fl, s.zone === 'BLD' ? 2 : 1);
  });
  return { multi: blds.size > 1, floorsBy };
}
function placeLabel(s, ctx) {
  const bid = String(s.bld || 'main'), out = [];
  if (ctx.multi) out.push(String(s.bldLabel || 'Building').trim());
  if ((ctx.floorsBy[bid] || 1) > 1 || s.zone === 'EXT' || s.zone === 'BLD') out.push(zoneLabel(s.zone));
  const q = Number(s.qty) || 1;
  out.push(String(s.area || '').trim() + (q > 1 ? ' \u00d7' + q : ''));
  return out.join(' / ');
}
/* Contratos "Who does what" por lugar: el lugar va pegado al servicio
   ("Floor 1 / Hallway — Vacuum carpets"), una sola vez aunque lo
   compartan 2 personas. Contratos de siempre: igual que antes. */
function parseServicesJson(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return [];
    const ctx = placeContext(arr);
    const seen = new Set();
    return arr.map(s => ({
      ServiceName: (s.zone && s.area ? placeLabel(s, ctx) + ' \u2014 ' : '') + (s.serviceName || s.sku || ''),
      Level: s.level || ''
    })).filter(x => { const k = x.ServiceName + '|' + x.Level; if (seen.has(k)) return false; seen.add(k); return true; });
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
