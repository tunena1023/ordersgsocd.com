/* ============================================================
   submit-contact.js — formulario de contacto.
   NO manda email (regla del proyecto): escribe una fila en la
   lista ContactMessages y un flow de Power Automate envía el
   correo a la oficina.

   Lista nueva en SharePoint: ContactMessages
   Columnas: Title (texto), Email (texto), Message (varias líneas)
============================================================ */

const { graphFetch, siteListPath, jsonResponse } = require('./lib/graph');

const CONTACT_LIST = 'ContactMessages';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { name, email, message } = JSON.parse(event.body || '{}');

    if (!name || !email || !message) {
      return jsonResponse(400, { error: 'Missing required fields' });
    }

    await graphFetch(siteListPath(CONTACT_LIST), {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Title: name,
          Email: email,
          Message: message
        }
      })
    });

    return jsonResponse(200, { success: true });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};