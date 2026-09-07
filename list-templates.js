/* ============================================================
   list-templates.js — plantillas de servicios guardadas por un
   cliente (lista ServiceTemplates). Camino A de las plantillas: son
   nomas un combo de servicios+niveles guardado con nombre, para
   volver a cargarlo despues -- no crean nada de Recurring real.
============================================================ */

const {
  SERVICE_TEMPLATES_LIST,
  graphFetch, siteListPath,
  jsonResponse
} = require('./lib/graph');

async function fetchAll(listName) {
  let url = siteListPath(listName) + '?$expand=fields&$top=200';
  const out = [];
  while (url) {
    const data = await graphFetch(url);
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { clientId } = JSON.parse(event.body || '{}');
    if (!clientId) return jsonResponse(400, { error: 'clientId is required' });

    const wanted = String(clientId).trim().toLowerCase();
    const rows = (await fetchAll(SERVICE_TEMPLATES_LIST))
      .filter(it => it.fields && String(it.fields.ClientID || '').trim().toLowerCase() === wanted);

    const templates = rows
      .filter(it => it.fields)
      .map(it => {
        let services = [];
        try { services = JSON.parse(it.fields.ServicesJSON || '[]'); } catch (e) { services = []; }
        return {
          id:       it.id,
          name:     it.fields.Title || '',
          division: it.fields.Division || '',
          services: services
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return jsonResponse(200, { templates });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
