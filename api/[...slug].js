/* api/[...slug].js — un solo endpoint que reparte el trafico a todas
   las funciones de la raiz. Se usa porque el plan gratis de Vercel
   solo permite 12 funciones por proyecto y aqui hay mas de 12. */
const { toVercel } = require('../lib/vercel-adapter');

const handlers = {
  'delete-draft':       require('../delete-draft').handler,
  'get-order-detail':   require('../get-order-detail').handler,
  'get-order-document': require('../get-order-document').handler,
  'get-orders':         require('../get-orders').handler,
  'get-services':       require('../get-services').handler,
  'recover-client-id':  require('../recover-client-id').handler,
  'register-client':    require('../register-client').handler,
  'request-change':     require('../request-change').handler,
  'save-draft':         require('../save-draft').handler,
  'site-image':         require('../site-image').handler,
  'submit-contact':     require('../submit-contact').handler,
  'submit-order':       require('../submit-order').handler,
  'undo-request':       require('../undo-request').handler,
  'validate-client':    require('../validate-client').handler
};

module.exports = async (req, res) => {
  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  const h = handlers[slug];
  if (!h) {
    res.status(404).json({ error: 'Unknown endpoint: ' + slug });
    return;
  }
  return toVercel(h)(req, res);
};
