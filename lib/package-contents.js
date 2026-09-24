/* ============================================================
   lib/package-contents.js -- paquetes (columnas reales, 23/09/2026).
   Copia de la de Admingsocd.com: lo que incluye cada paquete vive en
   ServicesCatalog.PackageItems; la copia congelada por orden en
   Orders.PackageContents (lo que incluia el paquete EL DIA que se creo
   la orden).
============================================================ */
const { SERVICES_CATALOG_LIST, ORDERS_LIST, graphFetch, siteListPath, updateListItemByItemId } = require('./graph');
const { packageItemsOf } = require('./catalog-fields');
const { clientPackagesFor } = require('./client-packages');

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
async function orderRow(orderId) {
  const rows = await fetchAllRows(ORDERS_LIST, "fields/OrderID eq '" + String(orderId).replace(/'/g, "''") + "'");
  return rows[0] || null;
}
async function snapshotsForOrder(orderId) {
  const o = await orderRow(orderId);
  if (!o || !o.fields || !o.fields.PackageContents) return {};
  try { return JSON.parse(o.fields.PackageContents) || {}; } catch (e) { return {}; }
}
async function recordPackageSnapshots(orderId, services, actor, skipSkus) {
  try {
    const skus = [...new Set((services || []).map(s => String((s && (s.SubOption || s.sku)) || '').trim()).filter(Boolean))];
    if (!skus.length) return null;
    const catalog = await fetchAllRows(SERVICES_CATALOG_LIST);
    const bySku = {};
    catalog.forEach(it => { if (it.fields && it.fields.SKU) bySku[String(it.fields.SKU).trim()] = it.fields; });
    const o = await orderRow(orderId);
    if (!o) return null;
    let existing = {};
    try { existing = JSON.parse(o.fields.PackageContents || '{}') || {}; } catch (e) { existing = {}; }
    let custom = {};
    try { custom = await clientPackagesFor(o.fields && o.fields.ClientID); } catch (e) { console.error('ClientPackages for ' + orderId + ':', e.message); }
    const skip = new Set((skipSkus || []).map(String).concat(Object.keys(existing)));
    const snap = {};
    skus.forEach(k => {
      if (skip.has(k) || !bySku[k]) return;
      /* Version del cliente (ClientPackages) si tiene una; si no, la general. */
      const items = custom[k] || packageItemsOf(bySku[k]);
      if (!items.length) return;
      snap[k] = items.map(x => ({ sku: x.sku, serviceName: (bySku[x.sku] && bySku[x.sku].ServiceName) || x.sku, level: x.level || '' }));
    });
    if (!Object.keys(snap).length) return null;
    await updateListItemByItemId(ORDERS_LIST, o.id, { PackageContents: JSON.stringify(Object.assign({}, existing, snap)) });
    return snap;
  } catch (e) {
    console.error('Package snapshot for ' + orderId + ':', e.message);
    return null;
  }
}
module.exports = { snapshotsForOrder, recordPackageSnapshots };
