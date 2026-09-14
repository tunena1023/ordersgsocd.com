/* ============================================================
   request-recurring-change.js — "Request a Change" del cliente en
   el tab Recurring. Mismo mecanismo que ya usa la sugerencia de un
   supervisor (submit-recurring-update.js, tech.gsocd.com): crea un
   renglon en RecurringLog con Status "Pending Review", nunca se
   aplica solo. Cae en el mismo tab Review de Admin, badge
   "Recurring Change", junto a las de campo -- distinguido por
   Source: "Client".

   El cliente ahora SI puede proponer servicios agregados/quitados
   (mismo selector real + diff que ya usa Supervisor), ademas del
   mensaje libre de antes -- ambos son opcionales por separado, pero
   se necesita al menos uno de los dos. ServicesJSON usa exactamente
   el mismo formato que submit-recurring-update.js
   ({services, removedNotes}) para que renderRecurringChangeReview()
   en Admin lo muestre igual sin ningun cambio de ese lado.
============================================================ */

const {
  RECURRING_SERVICES_LIST, RECURRING_LOG_LIST, CLIENTS_LIST,
  createListItem, graphFetch, siteListPath, jsonResponse
} = require('./lib/graph');

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
    const clientId = String(b.clientId || '').trim();
    const message = String(b.message || '').trim();
    const services = Array.isArray(b.services) ? b.services : [];
    const removedNotes = Array.isArray(b.removedNotes) ? b.removedNotes : [];
    if (!recurringServiceId) return jsonResponse(400, { error: 'recurringServiceId is required' });
    if (!clientId) return jsonResponse(400, { error: 'clientId is required' });
    if (!message && !services.length && !removedNotes.length) {
      return jsonResponse(400, { error: 'Please add or remove a service, or write what you need.' });
    }
    /* Cada quitado necesita su nota -- mismo requisito obligatorio
       que ya exige el patron de Supervisor. */
    if (removedNotes.some(r => !r.note || !String(r.note).trim())) {
      return jsonResponse(400, { error: 'Every removed service needs a note explaining why.' });
    }

    /* Confirmar que el contrato de verdad es de este cliente -- no
       confiar nomas en lo que mande el frontend. */
    const svcData = await graphFetch(siteListPath(RECURRING_SERVICES_LIST) + '/' + recurringServiceId + '?$expand=fields');
    if (!svcData || !svcData.fields || String(svcData.fields.ClientID || '').trim() !== clientId) {
      return jsonResponse(404, { error: 'Recurring contract not found.' });
    }

    const clientRows = await fetchByField(CLIENTS_LIST, 'ClientID', clientId);
    const clientRow = clientRows.find(it => it.fields);
    const businessName = clientRow && clientRow.fields ? (clientRow.fields.Title || clientRow.fields.BusinessName || clientId) : clientId;

    const todayISO = new Date().toISOString().slice(0, 10);
    await createListItem(RECURRING_LOG_LIST, {
      Title: recurringServiceId + '-' + todayISO + '-client-request',
      RecurringServiceID: recurringServiceId,
      VisitDate: todayISO,
      Status: 'Pending Review',
      Source: 'Client',
      LoggedBy: businessName,
      PeopleJSON: '[]',
      ServicesJSON: JSON.stringify({ services, removedNotes }),
      Notes: message
    });

    return jsonResponse(200, { success: true });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};

