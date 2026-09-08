/* ============================================================
   save-template.js — guarda el combo de servicios+niveles que el
   cliente tiene armado ahorita como una plantilla, con nombre.

   Si viene templateId, ACTUALIZA esa plantilla existente en vez de
   crear una nueva (editar un template ya guardado). Sin templateId,
   siempre crea un renglon nuevo -- mismo comportamiento de antes.
============================================================ */

const {
  SERVICE_TEMPLATES_LIST,
  createListItem, updateListItemByItemId,
  jsonResponse
} = require('./lib/graph');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const b = JSON.parse(event.body || '{}');
    const clientId = b.clientId;
    const templateId = String(b.templateId || '').trim();
    const name = String(b.name || '').trim();
    const division = b.division;
    const services = Array.isArray(b.services) ? b.services : [];

    if (!clientId) return jsonResponse(400, { error: 'clientId is required' });
    if (!name) return jsonResponse(400, { error: 'Please give this template a name.' });
    if (!division) return jsonResponse(400, { error: 'division is required' });
    if (!services.length) return jsonResponse(400, { error: 'Select at least one service before saving a template.' });

    const fields = {
      Title:        name,
      ClientID:     clientId,
      Division:     division,
      ServicesJSON: JSON.stringify(services)
    };

    if (templateId) {
      await updateListItemByItemId(SERVICE_TEMPLATES_LIST, templateId, fields);
      return jsonResponse(200, { success: true, id: templateId });
    }

    const created = await createListItem(SERVICE_TEMPLATES_LIST, fields);
    return jsonResponse(200, { success: true, id: created.id });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
