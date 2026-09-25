/* ============================================================
   lib/client-guard.js -- candado central del portal de clientes
   (25/09/2026). Lo usa api/[...slug].js ANTES de llamar a cualquier
   funcion:

   1) Sin sesion firmada (lib/client-auth.js) -> 401, salvo las pocas
      funciones publicas (login, registro, recuperar ID, contacto,
      imagenes, catalogo).
   2) El Client ID sale SIEMPRE de la sesion: se escribe encima de
      clientId / ClientID en el body y en el query, venga lo que venga
      del navegador.
   3) Si la peticion trae el id de algo (orden, borrador, contrato
      recurrente, contacto, dia festivo), se revisa que sea de ese
      cliente -> 403 si no. Antes 14 funciones no lo revisaban (auditoria
      del 25/09/2026): con el orderId de otra orden se podia cancelarla,
      subirle fotos, ver sus fotos o su PDF, etc.
   4) Campos que solo usa la oficina (OfficeCreated, ChangedBy,
      changedBy) se quitan: en este portal nunca son legitimos.
============================================================ */

const auth = require('./client-auth');

/* Funciones que no necesitan sesion. get-services es el catalogo
   (publico); si hay sesion, igual se le pone el clientId de la sesion
   para sus datos por cliente. */
const PUBLIC = new Set([
  'validate-client', 'verify-client', 'logout', 'register-client', 'recover-client-id',
  'submit-contact', 'site-image', 'get-services'
]);

const OFFICE_ONLY_FIELDS = ['OfficeCreated', 'ChangedBy', 'changedBy'];

function fieldsOf(item) { return (item && item.fields) || {}; }

/* Busca a quien pertenece cada id. Regresa el ClientID dueño, '' si no
   se encontro (se deja pasar: la funcion misma contesta 404), o null si
   no aplica. */
async function ownerOfOrder(g, orderId) {
  const q = encodeURIComponent(`fields/OrderID eq '${String(orderId).replace(/'/g, "''")}'`);
  const opts = { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } };
  const orders = await g.graphFetch(g.siteListPath(g.ORDERS_LIST) + `?$expand=fields&$top=5&$filter=${q}`, opts);
  const o = (orders.value || []).find(it => it.fields);
  if (o) return fieldsOf(o).ClientID || '';
  const drafts = await g.graphFetch(g.siteListPath(g.DRAFTS_LIST) + `?$expand=fields&$top=5&$filter=${q}`, opts);
  const d = (drafts.value || []).find(it => it.fields);
  return d ? (fieldsOf(d).ClientID || '') : '';
}

async function ownerOfItem(g, listName, id) {
  try {
    const it = await g.graphFetch(g.siteListPath(listName) + '/' + encodeURIComponent(String(id)) + '?$expand=fields');
    return fieldsOf(it).ClientID || '';
  } catch (e) {
    return ''; // no existe: que la funcion conteste
  }
}

/* Revisa todos los ids que traiga la peticion. Regresa un mensaje de
   error (403) o null. */
async function checkOwnership(g, slug, data, cid) {
  const checks = [];
  const orderId = data.orderId || data.OrderID;
  /* save-draft manda OrderID pero la funcion lo ignora (busca el borrador
     por ClientID + Division); submit-order con un OrderID de borrador o
     de orden real SI lo usa -- se revisa en los dos por igual. */
  if (orderId) checks.push(['order', () => ownerOfOrder(g, orderId)]);
  if (data.recurringServiceId) checks.push(['recurring', () => ownerOfItem(g, g.RECURRING_SERVICES_LIST, data.recurringServiceId)]);
  if (data.contactId) checks.push(['contact', () => ownerOfItem(g, g.CLIENT_CONTACTS_LIST, data.contactId)]);
  if (data.choiceId) checks.push(['holiday', () => ownerOfItem(g, g.CLIENT_HOLIDAYS_LIST, data.choiceId)]);
  if (data.newContact && data.newContact.contactId) checks.push(['contact', () => ownerOfItem(g, g.CLIENT_CONTACTS_LIST, data.newContact.contactId)]);
  for (const [what, fn] of checks) {
    const owner = await fn();
    if (owner && !auth.sameClient(owner, cid)) return 'This ' + what + ' does not belong to your account.';
  }
  return null;
}

/* Punto de entrada. req/res de Vercel. Regresa true si ya contesto
   (401/403) y el router no debe seguir. */
async function guard(g, slug, req, res) {
  const session = auth.readSession({ headers: req.headers || {} });

  if (PUBLIC.has(slug)) {
    if (slug === 'get-services' && req.query) {
      if (session) req.query.clientId = session.cid; else delete req.query.clientId;
    }
    return false;
  }

  if (!session) {
    res.status(401).json({ error: 'Please sign in again.', signin: true });
    return true;
  }
  const cid = session.cid;

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  OFFICE_ONLY_FIELDS.forEach(k => { delete body[k]; });
  body.clientId = cid;
  body.ClientID = cid;
  req.body = body;
  if (req.query) req.query.clientId = cid;

  const data = Object.assign({}, req.query || {}, body);
  let problem = null;
  try {
    problem = await checkOwnership(g, slug, data, cid);
  } catch (e) {
    res.status(500).json({ error: 'Could not verify access: ' + e.message });
    return true;
  }
  if (problem) {
    res.status(403).json({ error: problem });
    return true;
  }
  return false;
}

module.exports = { guard, PUBLIC, checkOwnership };
