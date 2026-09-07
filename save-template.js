/* ============================================================
   save-template.js — guarda el combo de servicios+niveles que el
   cliente tiene armado ahorita como una plantilla nueva, con nombre.
   Siempre crea un renglon nuevo (no sobreescribe una plantilla vieja
   por nombre repetido -- si el cliente quiere reemplazar una, la
   borra primero desde templates.html y guarda otra).
============================================================ */

const {
  SERVICE_TEMPLATES_LIST,
  createListItem,
  jsonResponse
} = require('./lib/graph');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const b = JSON.parse(event.body || '{}');
    const clientId = b.clientId;
    const name = String(b.name || '').trim();
    const division = b.division;
    const services = Array.isArray(b.services) ? b.services : [];

    if (!clientId) return jsonResponse(400, { error: 'clientId is required' });
    if (!name) return jsonResponse(400, { error: 'Please give this template a name.' });
    if (!division) return jsonResponse(400, { error: 'division is required' });
    if (!services.length) return jsonResponse(400, { error: 'Select at least one service before saving a template.' });

    const created = await createListItem(SERVICE_TEMPLATES_LIST, {
      Title:        name,
      ClientID:     clientId,
      TemplateName: name,
      Division:     division,
      ServicesJSON: JSON.stringify(services)
    });

    return jsonResponse(200, { success: true, id: created.id });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
