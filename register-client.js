/* ============================================================
   register-client.js — registro de cliente nuevo.
   - Negocio en Title · persona de contacto en ClientName
   - ClientID secuencial GS-1001, GS-1002...
   - Validación de email duplicado antes de crear
   - Content-Type OBLIGATORIO en el POST (sin él Graph
     responde "Invalid request")

   HALLAZGO DE SEGURIDAD CORREGIDO: antes, si el email ya pertenecia a
   OTRO cliente, este endpoint regresaba valid:true junto con los
   datos de esa cuenta -- y el frontend nunca revisaba valid, asi que
   cualquiera que supiera el email de otro cliente entraba directo a
   su cuenta con solo "registrarse", sin contrasena, sin nada. Ahora
   regresa valid:false + duplicateEmail:true, sin ningun dato de la
   cuenta ajena -- el frontend debe ofrecer recuperar el Client ID por
   correo (mecanismo ya existente, recover-client-id.js), nunca
   iniciar sesion directo.
============================================================ */

const { CLIENTS_LIST, graphFetch, siteListPath, jsonResponse } = require('./lib/graph');
/* Sesion firmada (lib/client-auth.js, 25/09/2026): quien se acaba de
   registrar entra directo y este dispositivo queda recordado. */
const { sessionCookie } = require('./lib/client-auth');

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

async function generateNewClientId() {
  const rows = await fetchAll(CLIENTS_LIST);
  const nums = (rows || [])
    .map(it => parseInt(String((it.fields.ClientID || '')).replace('GS-', ''), 10))
    .filter(n => !isNaN(n));
  return 'GS-' + (nums.length ? Math.max(...nums) + 1 : 1001);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const {
      businessName, contactPerson, address,
      suite, city, zip, contact, phone
    } = JSON.parse(event.body || '{}');

    if (!businessName || !contactPerson || !address || !city || !zip || !contact || !phone) {
      return jsonResponse(400, { error: 'Missing required fields' });
    }

    /* Evitar duplicados por email -- NUNCA regresar los datos de la
       cuenta existente, ni dejar pasar como si fuera valida. */
    const rows = await fetchAll(CLIENTS_LIST);
    const wantedEmail = String(contact).trim().toLowerCase();
    const dup = (rows || []).find(it =>
      it.fields && String(it.fields.Contact || '').trim().toLowerCase() === wantedEmail
    );
    if (dup) {
      return jsonResponse(200, {
        valid: false,
        duplicateEmail: true,
        error: 'An account with this email address already exists.'
      });
    }

    /* Crear el cliente. SelfRegistered (Si/No, 25/09/2026): asi Admin
       lo ensena en QuickBooks > New clients para darlo de alta alla. Si
       la columna todavia no existe en SharePoint, se crea sin ella
       (registrarse nunca debe fallar por eso). */
    const clientId = await generateNewClientId();
    const fields = {
      ClientID: clientId,
      Title: businessName,
      ClientName: contactPerson,
      Address: address,
      Suite: suite || '',
      City: city,
      Zip: zip,
      Contact: contact,
      Phone: phone
    };
    const create = f => graphFetch(siteListPath(CLIENTS_LIST), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: f })
    });
    try {
      await create(Object.assign({ SelfRegistered: true }, fields));
    } catch (e) {
      if (!/SelfRegistered|not recognized|does not exist/i.test(e.message)) throw e;
      console.warn('register-client: SelfRegistered column missing -- created without it');
      await create(fields);
    }

    /* Cliente nuevo -> QuickBooks al instante, via Admin (lib/qb-notify.js). */
    await require('./lib/qb-notify').notifyClientChanged(clientId, { reason: 'new-client' });

    const setCookie = sessionCookie(clientId, true);
    const ok = jsonResponse(200, {
      valid: true,
      clientId,
      businessName,
      contactPerson,
      address,
      suite: suite || '',
      city,
      zip,
      contact,
      phone,
      showEstimatedTime: false // recien registrado -- siempre empieza apagado, se activa desde Developer
    });
    ok.headers = Object.assign({}, ok.headers, { 'Set-Cookie': setCookie });
    return ok;

  } catch (err) {
    return jsonResponse(500, { valid: false, error: err.message });
  }
};