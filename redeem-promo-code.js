/* ============================================================
   redeem-promo-code.js — el cliente canjea un codigo de promo desde
   "Your Account" (New Order). No hay precio visible en este
   formulario, asi que esto NO aplica un descuento en dolares --
   desbloquea una orden de regalo. Por ahora este endpoint solo
   valida el codigo y deja el registro del canje (RedeemedPromoCodes);
   que esa orden de regalo aparezca para reclamar (como un Template,
   con servicios/habitaciones/banos ya puestos por la oficina) queda
   pendiente de definir -- se arma en un paso aparte.
============================================================ */

const {
  PROMO_CODES_LIST, REDEEMED_PROMO_CODES_LIST, queryList, createListItem, updateListItemByItemId, jsonResponse
} = require('./lib/graph');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const b = JSON.parse(event.body || '{}');
    const clientId = String(b.clientId || '').trim();
    const codeRaw = String(b.code || '').trim();
    if (!clientId) return jsonResponse(400, { error: 'clientId is required' });
    if (!codeRaw) return jsonResponse(400, { error: 'Please enter a code.' });
    const codeUpper = codeRaw.toUpperCase();

    /* Comparacion en JS, no via filtro OData -- SharePoint/Graph no
       soporta bien comparaciones de texto sin distinguir mayusculas/
       minusculas, y la lista de codigos activos deberia ser chica. */
    /* IMPORTANTE: SharePoint deja renombrar el campo por defecto
       "Title" para que se VEA como "Code" en la interfaz -- pero por
       dentro (via la API de Graph) siempre sigue llamandose "Title"
       para siempre, sin importar el nombre visible. Confirmado en
       vivo el 13/09: el renglon de prueba trae Title="TEST10", nunca
       un campo separado llamado Code. */
    const allCodes = await queryList(PROMO_CODES_LIST, '$expand=fields');
    const match = allCodes.find(it => it.fields && String(it.fields.Title || '').trim().toUpperCase() === codeUpper);
    if (!match) {
      /* DIAGNOSTICO TEMPORAL -- quitar en cuanto se resuelva el bug
         real de por que no encuentra un codigo que si existe. Regresa
         que trajo la consulta de verdad, para ver si es un problema
         de nombre de lista, de nombre de columna, o de que el
         renglon no esta llegando por alguna otra razon. */
      return jsonResponse(404, {
        error: 'That code is not valid.',
        debug: { totalCodesFound: allCodes.length, rawItems: allCodes.map(it => it.fields) }
      });
    }

    const f = match.fields;
    const isActive = !(f.Active === false || f.Active === 'false' || f.Active === 0 || f.Active === '0');
    if (!isActive) return jsonResponse(400, { error: 'That code is no longer active.' });

    const maxRedemptions = f.MaxRedemptions != null && f.MaxRedemptions !== '' ? parseInt(f.MaxRedemptions, 10) : null;
    const timesRedeemed = parseInt(f.TimesRedeemed, 10) || 0;
    if (maxRedemptions != null && timesRedeemed >= maxRedemptions) {
      return jsonResponse(400, { error: 'That code has already reached its redemption limit.' });
    }

    /* Un mismo cliente no puede repetir el mismo codigo -- se busca
       en el registro de canjes, no en el catalogo de codigos. */
    const filter = encodeURIComponent(`fields/ClientID eq '${clientId}' and fields/Code eq '${codeUpper}'`);
    let alreadyRedeemed = [];
    try {
      alreadyRedeemed = await queryList(REDEEMED_PROMO_CODES_LIST, `$expand=fields&$filter=${filter}`);
    } catch (e) {
      /* Si ClientID/Code no estan indexados todavia en SharePoint,
         el filtro puede fallar -- se cae a traer todo y filtrar en
         JS, igual que el patron ya usado en get-my-recurring.js. */
      const all = await queryList(REDEEMED_PROMO_CODES_LIST, '$expand=fields');
      alreadyRedeemed = all.filter(it => it.fields &&
        String(it.fields.ClientID || '').trim() === clientId &&
        String(it.fields.Code || '').trim().toUpperCase() === codeUpper);
    }
    if (alreadyRedeemed.length) return jsonResponse(400, { error: "You've already redeemed this code." });

    await createListItem(REDEEMED_PROMO_CODES_LIST, {
      ClientID: clientId,
      Code: codeUpper,
      RedeemedDate: new Date().toISOString()
    });
    await updateListItemByItemId(PROMO_CODES_LIST, match.id, { TimesRedeemed: timesRedeemed + 1 });

    return jsonResponse(200, { message: 'Code applied! Our office will reach out about your free order.' });
  } catch (e) {
    return jsonResponse(500, { error: e.message });
  }
};
