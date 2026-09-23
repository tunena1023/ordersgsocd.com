/* ============================================================
   lib/package-contents.js -- paquetes como plantilla (23/09/2026).
   Copia de la de Admingsocd.com, SIN defaults: aqui solo se lee lo que
   Admin deja escrito en Settings (catalog_package_contents y
   catalog_service_areas; Admin los escribe la primera vez que se abre).
   Si no existen todavia, no hay paquetes ni areas -- nada truena.

   Foto por orden (pedido del dueño: "cada orden guarda sus datos"):
   OrderHistory, ChangeType 'Package Snapshot', FieldChanged
   'Office Change (Internal)', NewValue {skuPaquete: [{sku, serviceName,
   level}]} -- lo que incluia el paquete EL DIA que se creo la orden.
============================================================ */
const { graphFetch, siteListPath, ORDER_HISTORY_LIST, SERVICES_CATALOG_LIST } = require('./graph');
const graph = require('./graph');
const SETTINGS = 'Settings';

async function fetchAllRows(listName, filter) {
  let url = siteListPath(listName) + '?$expand=fields&$top=200' + (filter ? '&$filter=' + encodeURIComponent(filter) : '');
  const out = [];
  while (url) {
    const data = await graphFetch(url);
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

async function readJsonSettings(keys) {
  const rows = await fetchAllRows(SETTINGS);
  const out = {};
  keys.forEach(k => {
    const row = rows.find(it => it.fields && it.fields.Key === k);
    let v = {};
    if (row && row.fields.Value) { try { v = JSON.parse(row.fields.Value) || {}; } catch (e) { v = {}; } }
    out[k] = v;
  });
  return out;
}

/* Lo que ya tiene congelado una orden: {skuPaquete: [items]} */
async function snapshotsForOrder(orderId) {
  const rows = await fetchAllRows(ORDER_HISTORY_LIST, "fields/OrderID eq '" + String(orderId).replace(/'/g, "''") + "'");
  const snap = {};
  rows.filter(h => h.fields && h.fields.ChangeType === 'Package Snapshot').forEach(h => {
    try { Object.assign(snap, JSON.parse(h.fields.NewValue || '{}')); } catch (e) { /* sigue */ }
  });
  return snap;
}

async function recordPackageSnapshots(orderId, services, actor, skipSkus) {
  try {
    if (typeof graph.createListItem !== 'function') return null;
    const skus = [...new Set((services || []).map(s => String((s && (s.SubOption || s.sku)) || '').trim()).filter(Boolean))];
    if (!skus.length) return null;
    const map = (await readJsonSettings(['catalog_package_contents'])).catalog_package_contents;
    const skip = new Set((skipSkus || []).map(String));
    const pkgs = skus.filter(k => Array.isArray(map[k]) && map[k].length && !skip.has(k));
    if (!pkgs.length) return null;
    const catalog = await fetchAllRows(SERVICES_CATALOG_LIST);
    const nameOf = {};
    catalog.forEach(it => { if (it.fields && it.fields.SKU) nameOf[String(it.fields.SKU).trim()] = it.fields.ServiceName || ''; });
    const snap = {};
    pkgs.forEach(k => { snap[k] = map[k].map(x => ({ sku: String(x.sku), serviceName: nameOf[String(x.sku)] || String(x.sku), level: x.level || '' })); });
    await graph.createListItem(ORDER_HISTORY_LIST, {
      Title: orderId, OrderID: orderId, ChangeType: 'Package Snapshot', FieldChanged: 'Office Change (Internal)',
      ChangedBy: actor || 'System', ChangeDate: new Date().toISOString(),
      Notes: 'What each package included on this date.', OldValue: '', NewValue: JSON.stringify(snap)
    });
    return snap;
  } catch (e) {
    console.error('Package snapshot for ' + orderId + ':', e.message);
    return null;
  }
}

module.exports = { readJsonSettings, snapshotsForOrder, recordPackageSnapshots };
