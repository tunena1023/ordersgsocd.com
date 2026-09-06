/* ============================================================
   delete-template.js — borra una plantilla guardada. Verifica que
   de verdad sea del cliente que la pide antes de borrarla.
============================================================ */

const {
  SERVICE_TEMPLATES_LIST,
  graphFetch, siteListPath, deleteListItem,
  jsonResponse
} = require('./lib/graph');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { templateId, clientId } = JSON.parse(event.body || '{}');
    if (!templateId || !clientId) return jsonResponse(400, { error: 'templateId and clientId are required' });

    const item = await graphFetch(siteListPath(SERVICE_TEMPLATES_LIST) + '/' + templateId + '?$expand=fields');
    if (!item.fields || String(item.fields.ClientID || '').trim() !== String(clientId).trim()) {
      return jsonResponse(403, { error: 'This template does not belong to you.' });
    }

    await deleteListItem(SERVICE_TEMPLATES_LIST, templateId);
    return jsonResponse(200, { success: true });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
