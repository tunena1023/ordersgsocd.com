/* ============================================================
   order-docs.js -- documentos de una orden desde el portal del cliente
   (25/09/2026). La logica vive en lib/order-docs.js (misma en los 3
   repos). El candado (lib/client-guard.js) ya revisa que orderId sea de
   este cliente y pone su clientId de la sesion.

   action: 'start-upload' { orderId, fileName, size } -> { uploadUrl }
           'finish-upload' { orderId, itemId, fileName } -> { doc, clientLabel }
           'view'   { orderId, docId } -> { viewUrl, downloadUrl }
           'delete' { orderId, docId }  (solo los que subio el cliente)
============================================================ */
const graph = require('./lib/graph');
const orderDocs = require('./lib/order-docs');
const { jsonResponse } = graph;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  try {
    const b = JSON.parse(event.body || '{}');
    const clientId = String(b.clientId || '').trim();
    const orderId = String(b.orderId || '').trim();
    if (!clientId || !orderId) return jsonResponse(400, { error: 'orderId is required' });

    const order = await orderDocs.findOrder(graph, orderId);
    if (!order || String(order.ClientID || '').trim() !== clientId) return jsonResponse(404, { error: 'Order not found.' });

    if (b.action === 'start-upload') {
      return jsonResponse(200, await orderDocs.startUpload(graph, order, b.fileName, b.size));
    }
    if (b.action === 'finish-upload') {
      const doc = await orderDocs.finishUpload(graph, order, String(b.itemId || ''), b.fileName, 'Client', order.BusinessName || clientId);
      return jsonResponse(200, { doc, clientLabel: [order.UnitNumber ? 'Unit ' + order.UnitNumber : '', order.Address || ''].filter(Boolean).join(' · ') });
    }

    const row = await orderDocs.getRow(graph, String(b.docId || ''));
    const f = (row && row.fields) || {};
    if (!row || orderDocs.orderIdOf(row) !== orderId || String(f.ClientID || '').trim() !== clientId) return jsonResponse(404, { error: 'Document not found.' });

    if (b.action === 'view') return jsonResponse(200, await orderDocs.viewUrls(graph, row));
    if (b.action === 'delete') {
      if (f.UploadedBy !== 'Client') return jsonResponse(403, { error: 'Only GS Solutions can delete this document.' });
      await orderDocs.deleteDoc(graph, row);
      return jsonResponse(200, { success: true });
    }
    return jsonResponse(400, { error: 'Unknown action.' });
  } catch (e) {
    /* El detalle de SharePoint (nombres de columnas) solo lo ve la oficina en
       Admin y en los logs; el cliente ve un mensaje general. */
    if (e.code === 'DOC_LIST') return jsonResponse(500, { error: 'The document could not be saved. Please try again later.' });
    return jsonResponse(e.status || 500, { error: e.message });
  }
};
