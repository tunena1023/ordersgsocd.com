/* ============================================================
   list-templates.js — plantillas de servicios guardadas por un
   cliente (lista ServiceTemplates). Camino A de las plantillas: son
   nomas un combo de servicios+niveles guardado con nombre, para
   volver a cargarlo despues -- no crean nada de Recurring real.

   Ademas de las propias del cliente, regresa las marcadas IsPublic
   (de cualquier otro cliente, o de la oficina) -- el cliente NUNCA ve
   de quien es una publica, solo su nombre y servicios. 'mine' le dice
   al frontend si puede editarla/borrarla (solo las propias).
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
    const rows = (await fetchAll(SERVICE_TEMPLATES_LIST)).filter(it => {
      if (!it.fields) return false;
      const owner = String(it.fields.ClientID || '').trim().toLowerCase();
      return owner === wanted || !!it.fields.IsPublic;
    });

    const templates = rows
      .map(it => {
        let services = [];
        try { services = JSON.parse(it.fields.ServicesJSON || '[]'); } catch (e) { services = []; }
        const owner = String(it.fields.ClientID || '').trim().toLowerCase();
        return {
          id:       it.id,
          name:     it.fields.Title || '',
          division: it.fields.Division || '',
          services: services,
          mine:     owner === wanted
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return jsonResponse(200, { templates });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
