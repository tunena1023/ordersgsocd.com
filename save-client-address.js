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
        ['ContactId',      newContactId !== null ? newContactId : b.contactId]
      ];
      const patch = {};
      for (const [col, incoming, alsoTitle] of map) {
        if (incoming === undefined) continue;
        patch[col] = incoming || '';
        if (alsoTitle) patch.Title = incoming || '';
      }
      if (b.archived !== undefined) patch.Archived = !!b.archived;

      await updateListItemByItemId(CLIENT_ADDRESSES_LIST, item.id, patch);
      return jsonResponse(200, { success: true, addressId: item.id, contactId: newContactId });
    }

    /* ===== Direccion nueva: aqui si se llenan todos los campos ===== */
    const fields = {
      Title:          b.label || '',
      ClientID:       b.clientId,
      Label:          b.label          || '',
      BuildingNumber: b.buildingNumber || '',
      Address:        b.address        || '',
      Suite:          b.suite          || '',
      City:           b.city           || '',
      Zip:            b.zip            || '',
      ContactId:      '',
      Archived:       b.archived !== undefined ? !!b.archived : false
    };
    const result = await createListItem(CLIENT_ADDRESSES_LIST, fields);
    return jsonResponse(200, { success: true, addressId: result.id });

  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
