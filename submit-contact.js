/* ============================================================
   submit-contact.js — formulario de contacto.
   Escribe una fila en la lista ContactMessages (queda como registro)
   y manda el correo a la oficina directo desde el codigo
   (lib/notify.js, 25/09/2026) -- antes esto lo iba a hacer un flow de
   Power Automate que nunca quedo. "Responder" en ese correo le
   contesta directo a quien escribio.

   Lista nueva en SharePoint: ContactMessages
   Columnas: Title (texto), Email (texto), Message (varias líneas)
============================================================ */

const graph = require('./lib/graph');
const { graphFetch, siteListPath, jsonResponse } = graph;
const { notifyOffice } = require('./lib/notify');

const CONTACT_LIST = 'ContactMessages';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const { name, email, message, clientId } = JSON.parse(event.body || '{}');

    if (!name || !email || !message) {
      return jsonResponse(400, { error: 'Missing required fields' });
    }

    /* El registro y el correo son independientes: si uno falla, el
       otro igual se intenta. Solo es error si fallan los dos (el
       mensaje se perderia). */
    let saved = true;
    try {
      await graphFetch(siteListPath(CONTACT_LIST), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            Title: name,
            Email: email,
            Message: message
          }
        })
      });
    } catch (e) {
      saved = false;
      console.error('ContactMessages write failed:', e.message);
    }

    const mail = await notifyOffice(graph, {
      event: 'contact-form', name, email, message, clientId: clientId || ''
    });

    if (!saved && !mail.sent) {
      return jsonResponse(500, { error: 'We could not send your message. Please call us at (515) 473-5990.' });
    }
    return jsonResponse(200, { success: true });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};