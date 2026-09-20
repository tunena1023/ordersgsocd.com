/* ============================================================
   get-order-document.js — genera y entrega SIEMPRE la version mas
   reciente del PDF de una orden.

   A peticion del dueño (19/09/2026: "si el PDF que existe es
   igualito, se toma el existente -- pero si hay una sola linea de
   informacion que el PDF que existe NO tenga, se hace uno nuevo").
   Se intento primero comparar por fecha (lastModifiedDateTime de la
   orden contra la fecha de creacion del PDF guardado), pero eso solo
   detecta si la ORDEN cambio -- no detecta cuando el FORMATO del
   documento cambia (ej. un dia como hoy, con un monton de cambios al
   PDF mientras ninguna orden en si se toco): el PDF viejo se seguia
   sirviendo, incompleto, sin que nada lo detectara.

   Por eso este endpoint ya NO intenta detectar "cambio o no cambio"
   -- siempre pide los datos frescos y genera un documento nuevo (lo
   guarda con la revision que le toque, igual que siempre) en cada
   peticion. Mismo mecanismo que Admingsocd.com/get-order-document.js
   -- antes este endpoint SIEMPRE servia lo ya guardado, asi que el
   cliente podia ver un documento distinto (o desactualizado) contra
   el que ve el staff en Admin para esa misma orden.

   Con ?kind=completion genera ese documento en su lugar (mismo
   mecanismo, distinto patron de archivo).

   GET /api/get-order-document?orderId=GS-6062-1010
   GET /api/get-order-document?orderId=GS-6062-1010&kind=completion
============================================================ */
const {
  ORDERS_LIST, ORDER_SERVICES_LIST, ORDER_HISTORY_LIST,
  graphFetch, siteListPath, jsonResponse
} = require('./lib/graph');
const {
  generateAndSaveOrderPdf, generateAndSaveCompletionPdf,
  fetchOrderPhotoBuffers
} = require('./lib/orderpdf');

const ALLOWED_KINDS = ['completion'];

async function findOrder(orderId) {
  const filter = encodeURIComponent(`fields/OrderID eq '${orderId}'`);
  const url = siteListPath(ORDERS_LIST) + `?$expand=fields&$top=5&$filter=${filter}`;
  const data = await graphFetch(url);
  const item = (data.value || []).find(it => it.fields);
  return item ? item.fields : null;
}

async function fetchByField(listName, fieldName, value) {
  const filter = encodeURIComponent(`fields/${fieldName} eq '${value}'`);
  let url = siteListPath(listName) + `?$expand=fields&$top=500&$filter=${filter}`;
  const out = [];
  while (url) {
    const data = await graphFetch(url);
    out.push(...(data.value || []).filter(it => it.fields).map(it => it.fields));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }
  const p = event.queryStringParameters || {};
  const orderId = String(p.orderId || '').trim();
  const kindParam = String(p.kind || '').trim();
  const kind = ALLOWED_KINDS.includes(kindParam) ? kindParam : undefined;
  if (!orderId) return jsonResponse(400, { error: 'orderId is required' });

  try {
    const order = await findOrder(orderId);
    if (!order) return jsonResponse(404, { error: 'Order not found.' });

    const merged = Object.assign({}, order, { OrderID: orderId });

    let result;
    if (kind === 'completion') {
      const [freshSvc, freshHist, photos] = await Promise.all([
        fetchByField(ORDER_SERVICES_LIST, 'OrderID', orderId),
        fetchByField(ORDER_HISTORY_LIST, 'OrderID', orderId),
        fetchOrderPhotoBuffers(merged)
      ]);
      result = await generateAndSaveCompletionPdf({
        order: merged,
        services: freshSvc,
        history: freshHist.sort((a, b) => new Date(a.ChangeDate || 0) - new Date(b.ChangeDate || 0)),
        photos: photos,
        completedBy: order.Technician || order.Supervisor || '',
        completedAt: order.CompletedDate || new Date().toISOString()
      });
    } else {
      const [freshSvc, freshHist] = await Promise.all([
        fetchByField(ORDER_SERVICES_LIST, 'OrderID', orderId),
        fetchByField(ORDER_HISTORY_LIST, 'OrderID', orderId)
      ]);
      result = await generateAndSaveOrderPdf({
        order: merged,
        services: freshSvc,
        history: freshHist.sort((a, b) =>
          new Date(a.ChangeDate || 0) - new Date(b.ChangeDate || 0))
      });
    }

    if (!result.ok) {
      return jsonResponse(500, { error: 'Could not generate the document: ' + result.error });
    }
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="' + result.fileName + '"',
        'Cache-Control': 'no-store'
      },
      body: result.buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
