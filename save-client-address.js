/* ============================================================
   save-client-address.js — crear, editar y archivar/desarchivar
   un EDIFICIO guardado de un cliente.

   Contrato:
     { clientId, addressId?, label, buildingNumber,
       address, suite, city, zip, archived?, contactId?, newContact? }

   Unit#/Bedrooms/Bathrooms NO se guardan aqui -- varian por unidad
   dentro del mismo edificio, se capturan al hacer la orden.

   contactId: id de un ClientContacts existente que se asigna a este
   building (vacio = usa el contacto default de la direccion primaria).
   newContact: {name, type, value} -- si viene, se crea ese contacto
   primero (compartido, mismo lugar que los de la primaria) y su id
   gana sobre cualquier contactId que haya llegado por separado.

   - Sin addressId  -> crea una fila nueva.
   - Con addressId  -> edita esa fila (se valida que sea del mismo
     ClientID, para que un cliente no pueda editar la libreta de otro).
   - "Borrar" en realidad archiva (Archived=true); no hay delete real,
     para poder "sacarla de ahi si algo pasa" sin perder el dato.
============================================================ */

const {
  CLIENT_ADDRESSES_LIST, CLIENT_CONTACTS_LIST,
  createListItem, updateListItemByItemId,
  graphFetch, siteListPath, jsonResponse
} = require('./lib/graph');

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

/* Nominatim (OpenStreetMap) -- gratis, sin cuenta, sin tarjeta. Nunca
   debe tronar el guardado del building si falla o no encuentra nada;
   se intenta y ya, las coordenadas se pueden rellenar despues con el
   backfill de Developer si esta vez no jalo. */
async function geocodeAddress(address, city, zip) {
  const rawAddr = String(address || '').trim();
  const cty = String(city || '').trim();
  const z = String(zip || '').trim();
  if (!rawAddr && !cty && !z) return null;

  /* Nunca nos importa la suite/local para geocodificar -- solo
     necesitamos el punto del EDIFICIO (lat/lon), y Nominatim casi
     nunca tiene registrada la suite individual, solo el edificio
     completo. Se quita de una vez, sin intentar mandarla primero. */
  const addr = rawAddr.replace(/,?\s*(suite|ste|apt|apartment|unit|#)\s*[a-z0-9-]+\s*$/i, '').trim();

  async function tryQuery(url) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'GS-Solutions-Scheduling/1.0 (internal tool)' } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return null;
      const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
      if (isNaN(lat) || isNaN(lon)) return null;
      return { lat, lon };
    } catch (e) { return null; }
  }

  /* Busqueda estructurada primero -- mucho mas confiable que texto
     libre, sobre todo con Suite/local (la coma confunde a Nominatim
     sobre donde termina la calle y empieza la ciudad). Texto libre
     como respaldo si la estructurada no encuentra nada. */
  const structParams = new URLSearchParams({ format: 'json', limit: '1', country: 'USA' });
  if (addr) structParams.set('street', addr);
  if (cty) structParams.set('city', cty);
  if (z) structParams.set('postalcode', z);
  const structResult = await tryQuery('https://nominatim.openstreetmap.org/search?' + structParams.toString());
  if (structResult) return structResult;

  const q = [addr, cty, z, 'USA'].filter(Boolean).join(', ');
  if (!q.trim()) return null;
  return await tryQuery('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    if (!b.clientId) return jsonResponse(400, { error: 'clientId is required' });

    const wanted = String(b.clientId).trim().toLowerCase();

    /* ===== Editar (o archivar/desarchivar) una direccion existente =====
       Patch PARCIAL de verdad: solo se tocan los campos que de verdad
       llegaron en la peticion. Esto es lo que permite mandar nomas
       { addressId, archived:true } para archivar sin borrar el resto
       de los datos de la direccion. */
    if (b.addressId) {
      const rows = await fetchAll(CLIENT_ADDRESSES_LIST);
      const item = rows.find(it => it.id === String(b.addressId));
      if (!item) return jsonResponse(404, { error: 'Address not found.' });
      if (String(item.fields.ClientID || '').trim().toLowerCase() !== wanted) {
        return jsonResponse(403, { error: 'This address does not belong to that client.' });
      }

      /* Si viene un contacto nuevo (name+value llenos), se crea primero
         en ClientContacts (compartida con la primaria) y su id gana
         sobre cualquier contactId que haya llegado por separado. */
      let newContactId = null;
      if (b.newContact && b.newContact.name && String(b.newContact.name).trim()
          && b.newContact.value && String(b.newContact.value).trim()) {
        const created = await createListItem(CLIENT_CONTACTS_LIST, {
          Title:           b.newContact.name,
          ClientID:        b.clientId,
          Name:            b.newContact.name  || '',
          ContactType:     b.newContact.type  || 'Email',
          Value:           b.newContact.value || '',
          Archived:        false,
          NotifyRecipient: false
        });
        newContactId = created.id;
      }

      const map = [
        ['Label',          b.label,          'Title'],
        ['BuildingNumber', b.buildingNumber],
        ['Address',        b.address],
        ['Suite',          b.suite],
        ['City',           b.city],
        ['Zip',            b.zip],
        ['ContactId',      newContactId !== null ? newContactId : b.contactId],
        ['OfficeHours',    b.officeHours]
      ];
      const patch = {};
      for (const [col, incoming, alsoTitle] of map) {
        if (incoming === undefined) continue;
        patch[col] = incoming || '';
        if (alsoTitle) patch.Title = incoming || '';
      }
      /* Booleanos (horarios de oficina abierta por dia) aparte del map
         generico de arriba -- ese usa "incoming || ''" para texto,
         lo cual convertiria false (dia cerrado) en '' por accidente. */
      const DAY_FIELDS = ['monOpen', 'tueOpen', 'wedOpen', 'thuOpen', 'friOpen', 'satOpen', 'sunOpen'];
      const DAY_COLUMNS = { monOpen: 'MonOpen', tueOpen: 'TueOpen', wedOpen: 'WedOpen', thuOpen: 'ThuOpen', friOpen: 'FriOpen', satOpen: 'SatOpen', sunOpen: 'SunOpen' };
      DAY_FIELDS.forEach(f => { if (b[f] !== undefined) patch[DAY_COLUMNS[f]] = !!b[f]; });
      if (b.archived !== undefined) patch.Archived = !!b.archived;

      /* Si la direccion en si cambio (Address/City/Zip), las
         coordenadas viejas ya no sirven -- se vuelven a resolver con
         los valores finales (los que cambiaron + los que se quedan
         igual, tomados del renglon actual). */
      if (patch.Address !== undefined || patch.City !== undefined || patch.Zip !== undefined) {
        const finalAddress = patch.Address !== undefined ? patch.Address : (item.fields.Address || '');
        const finalCity    = patch.City    !== undefined ? patch.City    : (item.fields.City    || '');
        const finalZip     = patch.Zip     !== undefined ? patch.Zip     : (item.fields.Zip      || '');
        const geo = await geocodeAddress(finalAddress, finalCity, finalZip);
        if (geo) { patch.Latitude = geo.lat; patch.Longitude = geo.lon; }
      }

      await updateListItemByItemId(CLIENT_ADDRESSES_LIST, item.id, patch);
      return jsonResponse(200, { success: true, addressId: item.id, contactId: newContactId });
    }

    /* ===== Direccion nueva: aqui si se llenan todos los campos =====
       Mismo mecanismo de newContact que ya existe arriba al EDITAR una
       direccion -- antes solo funcionaba ahi, nunca al CREAR una
       nueva, por eso un edificio recien creado nunca podia tener
       telefono. */
    let newContactIdOnCreate = null;
    if (b.newContact && b.newContact.name && String(b.newContact.name).trim()
        && b.newContact.value && String(b.newContact.value).trim()) {
      const created = await createListItem(CLIENT_CONTACTS_LIST, {
        Title:           b.newContact.name,
        ClientID:        b.clientId,
        Name:            b.newContact.name  || '',
        ContactType:     b.newContact.type  || 'Email',
        Value:           b.newContact.value || '',
        Archived:        false,
        NotifyRecipient: false
      });
      newContactIdOnCreate = created.id;
    }

    const geo = await geocodeAddress(b.address, b.city, b.zip);
    const fields = {
      Title:          b.label || '',
      ClientID:       b.clientId,
      Label:          b.label          || '',
      BuildingNumber: b.buildingNumber || '',
      Address:        b.address        || '',
      Suite:          b.suite          || '',
      City:           b.city           || '',
      Zip:            b.zip            || '',
      ContactId:      newContactIdOnCreate || '',
      MonOpen:        !!b.monOpen,
      TueOpen:        !!b.tueOpen,
      WedOpen:        !!b.wedOpen,
      ThuOpen:        !!b.thuOpen,
      FriOpen:        !!b.friOpen,
      SatOpen:        !!b.satOpen,
      SunOpen:        !!b.sunOpen,
      OfficeHours:    b.officeHours    || '',
      Archived:       b.archived !== undefined ? !!b.archived : false
    };
    if (geo) { fields.Latitude = geo.lat; fields.Longitude = geo.lon; }
    const result = await createListItem(CLIENT_ADDRESSES_LIST, fields);
    return jsonResponse(200, { success: true, addressId: result.id, contactId: newContactIdOnCreate });

  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
