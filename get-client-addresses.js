/* ============================================================
   get-client-addresses.js — libreta de direcciones guardadas
   de un cliente ("My Addresses").

   Por default regresa solo las direcciones activas (Archived=No).
   includeArchived=true las regresa todas (lo usa admin.html para
   poder desarchivar una por error, "sacarla de ahi si algo pasa").
============================================================ */

const { CLIENT_ADDRESSES_LIST, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');

function truthy(v) {
  return v === true || v === 'true' || v === 1 || v === '1' || v === 'Yes';
}

async function fetchAll(listName) {
  let url = siteListPath(listName) + '?$expand=fields&$top=200';
  const out = [];
  while (url) {
    const data = await graphFetch(url);
    out.push(...(data.value || []));
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    if (!b.clientId) return jsonResponse(400, { error: 'clientId is required' });

    const wanted = String(b.clientId).trim().toLowerCase();
    const includeArchived = !!b.includeArchived;

    const rows = await fetchAll(CLIENT_ADDRESSES_LIST);

    const addresses = rows
      .filter(it => it.fields && String(it.fields.ClientID || '').trim().toLowerCase() === wanted)
      .filter(it => includeArchived || !truthy(it.fields.Archived))
      .map(it => {
        const f = it.fields;
        return {
          id:             it.id,
          label:          f.Label          || '',
          buildingNumber: f.BuildingNumber || '',
          unitNumber:     f.UnitNumber     || '',
          address:        f.Address        || '',
          suite:          f.Suite          || '',
          city:           f.City           || '',
          zip:            f.Zip            || '',
          bedrooms:       f.Bedrooms       || '',
          bathrooms:      f.Bathrooms      || '',
          archived:       truthy(f.Archived)
        };
      })
      .sort((a, b2) => a.label.localeCompare(b2.label));

    return jsonResponse(200, { addresses });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
