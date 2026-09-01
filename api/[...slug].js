/* api/[...slug].js — un solo endpoint que reparte el trafico a todas
   las funciones de la raiz, leyendo el nombre directo de la URL
   (mas confiable que depender del query param dinamico de Vercel). */
const { toVercel } = require('../lib/vercel-adapter');

const handlers = {
  'confirm-change':       require('../confirm-change').handler,
  'confirm-reactivation': require('../confirm-reactivation').handler,
  'delete-draft':       require('../delete-draft').handler,
  'get-client-addresses': require('../get-client-addresses').handler,
  'get-client-contacts': require('../get-client-contacts').handler,
  'get-order-detail':   require('../get-order-detail').handler,
  'get-order-document': require('../get-order-document').handler,
  'get-orders':         require('../get-orders').handler,
  'get-services':       require('../get-services').handler,
  'recover-client-id':  require('../recover-client-id').handler,
  'register-client':    require('../register-client').handler,
  'request-change':     require('../request-change').handler,
  'save-client-address': require('../save-client-address').handler,
  'save-client-contact': require('../save-client-contact').handler,
  'save-draft':         require('../save-draft').handler,
  'save-order-notifications': require('../save-order-notifications').handler,
  'add-batch-unit': require('../add-batch-unit').handler,
  'site-image':         require('../site-image').handler,
  'submit-contact':     require('../submit-contact').handler,
  'submit-order':       require('../submit-order').handler,
  'undo-request':       require('../undo-request').handler,
  'update-client-profile': require('../update-client-profile').handler,
  'validate-client':    require('../validate-client').handler
};

module.exports = async (req, res) => {
  const pathOnly = (req.url || '').split('?')[0];
  const parts = pathOnly.split('/').filter(Boolean); // ['api', 'validate-client']
  const slug = parts[parts.length - 1];
  const h = handlers[slug];
  if (!h) {
    res.status(404).json({ error: 'Unknown endpoint: ' + slug });
    return;
  }
  return toVercel(h)(req, res);
};
