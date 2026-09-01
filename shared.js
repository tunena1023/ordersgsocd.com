/* ============================================================
   shared.js — SOLO FUNCIONES (nada de apariencia)
   - GS.session       : sesión del cliente en sessionStorage
   - GS.api           : wrapper de llamadas a Netlify Functions
   - GS.categoryImage : imagen de categoría (Promise; demo=IndexedDB, prod=proxy)
   - GS.applyLogo     : pone el logo del nav (demo=IndexedDB, prod=proxy,
                        fallback=placeholder "LOGO")
   - Contact          : modal abrir/cerrar/enviar
   - DEMO             : TEST-ONLY — modo Esmeralda. Se apaga con
                        DEMO.enabled = false antes de producción.
   Imágenes en DEMO viven en IndexedDB como Blobs (sin límite de 5MB,
   sin inflado base64, sobreviven la navegación entre páginas).
============================================================ */

/* ===== MODO DEMO (Esmeralda) — TEST-ONLY ===== */
const DEMO = {
  enabled: true,                 // ← apagar (false) antes de producción
  CREDENTIAL: 'esmeralda',       // clave de acceso de prueba
  active: false,
  services: null,                // catálogo parseado del Excel local
  db: null,                      // conexión IndexedDB
  urlCache: {},                  // objectURLs ya creados (por clave)

  SS_KEY: 'gs_demo_state',       // estado demo que sobrevive navegación interna
  ORD_KEY: 'gs_demo_orders',     // órdenes simuladas (localStorage)
  ADDR_KEY: 'gs_demo_addresses', // libreta de direcciones simulada (localStorage)
  CONTACT_KEY: 'gs_demo_contacts' // libreta de contactos simulada (localStorage)
};

/* ===== SESIÓN ===== */
const GS = {
  session: {
    KEY: 'gs_client',
    get() { try { return JSON.parse(sessionStorage.getItem(this.KEY)); } catch (e) { return null; } },
    set(c) { sessionStorage.setItem(this.KEY, JSON.stringify(c)); },
    clear() { sessionStorage.removeItem(this.KEY); }
  },

  /* Guard para páginas internas: sin sesión → login */
  requireSession() {
    if (!GS.session.get()) { location.replace('index.html'); return null; }
    return GS.session.get();
  },

  /* Wrapper de functions. En modo demo resuelve local. */
  async api(path, opts = {}) {
    if (DEMO.active) return DEMO.handle(path, opts || {});
    const res = await fetch('/api' + path, {
      method: opts.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* body no-JSON */ }
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  },

  /* Imagen de categoría → Promise<URL|null> */
  async categoryImage(name) {
    const key = 'img:' + (name || '').trim().toLowerCase();
    if (DEMO.active) {
      const blob = await DEMO.dbGet(key);
      return blob ? DEMO.objectURL(key, blob) : null;
    }
    try {
      const res = await fetch('/api/site-image?cat=' + encodeURIComponent(name));
      if (!res.ok) return null;
      return DEMO.objectURL(key, await res.blob());
    } catch (e) { return null; }
  },

  /* Logo del nav: demo → Logo.png del folder; prod → proxy; fallback → placeholder */
  async applyLogo() {
    const img = document.querySelector('nav .logo-diamond');
    if (!img) return;
    const FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">' +
      '<rect width="120" height="120" fill="#EFEDE7" stroke="#E0D9CC"/>' +
      '<text x="60" y="68" font-family="Georgia, serif" font-size="20" fill="#8C6F2A" text-anchor="middle">LOGO</text></svg>'
    );
    let url = null;
    if (DEMO.active) {
      const blob = await DEMO.dbGet('logo');
      if (blob) url = DEMO.objectURL('logo', blob);
    } else {
      try {
        const res = await fetch('/api/site-image?name=' + encodeURIComponent('Logo.png'));
        if (res.ok) url = DEMO.objectURL('logo', await res.blob());
      } catch (e) { /* sin logo */ }
    }
    img.src = url || FALLBACK;
  }
};

DEMO.objectURL = function (key, blob) {
  if (!DEMO.urlCache[key]) DEMO.urlCache[key] = URL.createObjectURL(blob);
  return DEMO.urlCache[key];
};

/* ===== IndexedDB (imágenes del demo) ===== */
DEMO.openDB = function () {
  return new Promise((resolve, reject) => {
    if (DEMO.db) return resolve(DEMO.db);
    const req = indexedDB.open('gs_demo', 1);
    req.onupgradeneeded = (e) => { e.target.result.createObjectStore('images'); };
    req.onsuccess = (e) => { DEMO.db = e.target.result; resolve(DEMO.db); };
    req.onerror = () => reject(new Error('IndexedDB not available in this browser.'));
  });
};
DEMO.dbSet = async function (key, blob) {
  const db = await DEMO.openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').put(blob, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
};
DEMO.dbGet = async function (key) {
  const db = await DEMO.openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readonly');
    const req = tx.objectStore('images').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
};
DEMO.dbClear = async function () {
  const db = await DEMO.openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').clear();
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
};

/* ===== MODAL CONTACT ===== */
function openContact() {
  const ov = document.getElementById('contact-overlay');
  if (!ov) return;
  const slot = document.getElementById('contact-logo-slot');
  const navLogo = document.querySelector('nav .logo-diamond');
  if (slot && navLogo) { slot.innerHTML = ''; slot.appendChild(navLogo.cloneNode(true)); }
  const ok = document.getElementById('contact-ok'); if (ok) ok.style.display = 'none';
  const err = document.getElementById('contact-error'); if (err) err.textContent = '';
  ov.classList.add('open');
}
function closeContact() {
  const ov = document.getElementById('contact-overlay');
  if (ov) ov.classList.remove('open');
}
async function sendContact() {
  const err = document.getElementById('contact-error');
  const ok  = document.getElementById('contact-ok');
  if (err) err.textContent = '';
  const name = (document.getElementById('contact-name') || {}).value || '';
  const email = (document.getElementById('contact-email') || {}).value || '';
  const message = (document.getElementById('contact-message') || {}).value || '';
  if (!name.trim() || !email.trim() || !message.trim()) {
    if (err) err.textContent = 'Please fill in all fields.'; return;
  }
  try {
    await GS.api('/submit-contact', { method: 'POST', body: { name, email, message } });
    if (ok) ok.style.display = 'block';
    setTimeout(closeContact, 1800);
  } catch (ex) {
    if (err) err.textContent = 'Error sending: ' + ex.message;
  }
}

/* ============================================================
   DEMO — implementación (TEST-ONLY)
============================================================ */

DEMO.isCredential = function (val) {
  return (val || '').trim().toLowerCase() === DEMO.CREDENTIAL;
};

DEMO.start = function () { DEMO._pickerOverlay(); };

DEMO._pickerOverlay = function () {
  if (document.getElementById('demo-overlay')) return;
  const div = document.createElement('div');
  div.id = 'demo-overlay';
  div.setAttribute('style', 'position:fixed;inset:0;background:rgba(17,17,17,.6);z-index:999;display:flex;align-items:center;justify-content:center;');
  div.innerHTML =
    '<div style="background:#fff;border:1px solid #E0D9CC;max-width:460px;width:92%;padding:40px;text-align:center;font-family:Inter,sans-serif">' +
      '<div style="font-size:11px;letter-spacing:.14em;color:#8C6F2A;text-transform:uppercase;font-weight:700;margin-bottom:8px">Test Mode</div>' +
      '<h2 style="font-family:\'Cormorant Garamond\',serif;font-size:26px;font-weight:600;margin-bottom:8px">Esmeralda — Local Demo</h2>' +
      '<p style="font-size:13px;color:#6B6B6B;line-height:1.7;margin-bottom:24px">Select the local folder that mirrors your SharePoint drive. ' +
      'It must contain your services <b>.xlsx</b> + <b>Assets/CategoryImages/</b> + <b>Logo.png</b> (searched through all subfolders).</p>' +
      '<input type="file" id="demo-folder" webkitdirectory multiple style="display:none">' +
      '<button id="demo-pick" style="background:#C9A84C;color:#111;border:none;padding:14px 28px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;cursor:pointer">Select Folder</button>' +
      '<p id="demo-status" style="font-size:12px;color:#6B6B6B;margin-top:16px"></p>' +
    '</div>';
  document.body.appendChild(div);
  div.querySelector('#demo-pick').addEventListener('click', () => div.querySelector('#demo-folder').click());
  div.querySelector('#demo-folder').addEventListener('change', (e) => DEMO._onFolder(e.target.files, div));
};

DEMO._onFolder = async function (files, overlayEl) {
  const status = overlayEl.querySelector('#demo-status');
  try {
    status.textContent = 'Loading parser…';
    await DEMO._loadXlsxLib();

    status.textContent = 'Reading folder…';
    const all = Array.from(files);
    const xlsxFile = all.find(f => /\.xlsx$/i.test(f.name));
    if (!xlsxFile) throw new Error('No .xlsx found in the selected folder.');

    status.textContent = 'Parsing "' + xlsxFile.name + '"…';
    const wb = XLSX.read(await xlsxFile.arrayBuffer(), { type: 'array' });
    DEMO.services = DEMO._parseServices(wb);

    status.textContent = 'Storing images…';
    await DEMO._storeImages(all);

    // Persistir lo que sobrevive la navegación interna (misma pestaña)
    sessionStorage.setItem(DEMO.SS_KEY, JSON.stringify({ active: true, services: DEMO.services }));

    DEMO._seedOrders();
    DEMO.active = true;

    GS.session.set(DEMO._demoClient());
    overlayEl.remove();
    location.href = 'customer.html';
  } catch (ex) {
    status.textContent = 'Error: ' + ex.message;
  }
};

/* Guarda Blobs en IndexedDB: categorías + logo */
DEMO._storeImages = async function (files) {
  await DEMO.dbClear();

  const candidates = files.filter(f =>
    /Assets[\\/]CategoryImages/i.test(f.webkitRelativePath || '') &&
    /\.(png|jpe?g|gif|webp)$/i.test(f.name) &&
    f.size <= 25 * 1024 * 1024
  );
  for (const f of candidates) {
    // "Kitchen-Image.png" → "kitchen" · "Master Bedroom.png" → "master bedroom"
    const base = f.name.replace(/\.[^.]+$/, '').split('-')[0].trim().toLowerCase();
    if (base) await DEMO.dbSet('img:' + base, f);
  }

  const logo = files.find(f => /^logo\.(png|jpe?g|gif|webp|svg)$/i.test(f.name));
  if (logo) await DEMO.dbSet('logo', logo);
};

DEMO._loadXlsxLib = function () {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the Excel parser (internet needed once).'));
    document.head.appendChild(s);
  });
};

/* Réplica de get-services.js: hoja "Services", columnas
   Division | Location | Service | SubOption | Description */
DEMO._parseServices = function (wb) {
  const sheet = wb.Sheets['Services'];
  if (!sheet) throw new Error('Sheet "Services" not found in the workbook.');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const divisionMap = { 'janitorial': 'Janitorial', 'renovations': 'renovations', 'exteriors': 'exteriors' };
  const out = {
    Janitorial:  { type: 'categorized_rooms',  dirtLevels: true,  categories: {} },
    renovations: { type: 'categorized_trades', dirtLevels: false, categories: {} },
    exteriors:   { type: 'categorized_trades', dirtLevels: false, categories: {} }
  };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 4) continue;
    const division = divisionMap[(r[0] || '').toString().trim().toLowerCase()];
    const location = (r[1] || '').toString().trim();
    const name = (r[2] || '').toString().trim();
    const sub = (r[3] || '').toString().trim();
    const desc = (r[4] || '').toString().trim();
    if (!division || !location || !name || !sub) continue;
    if (!out[division].categories[location]) out[division].categories[location] = [];
    let entry = out[division].categories[location].find(s => s.name === name);
    if (!entry) { entry = { name: name, desc: desc, subs: [] }; out[division].categories[location].push(entry); }
    if (!entry.desc && desc) entry.desc = desc;
    if (!entry.subs.includes(sub)) entry.subs.push(sub);
  }
  return out;
};

DEMO._demoClient = function () {
  return {
    valid: true,
    clientId: 'GS-9999',
    businessName: 'Esmeralda (Local Demo)',
    contactPerson: 'Esmeralda Amezcua',
    address: '123 Demo St',
    suite: '',
    city: 'Des Moines',
    zip: '50314',
    contact: 'esmeralda@demo.local',
    phone: '(515) 555-0100',
    notificationsEnabled: true,
    notifyConfirmations: true,
    notifyChanges: true,
    notifyUpdates: true
  };
};

/* Órdenes de ejemplo la primera vez: 2 activas, 1 completada, 1 draft */
DEMO._seedOrders = function () {
  if (localStorage.getItem(DEMO.ORD_KEY)) return;
  const orders = [
    DEMO._order('GS-9999-1001', 'Pending',    'Janitorial', 2 * 86400000, false),
    DEMO._order('GS-9999-1002', 'Working',    'Janitorial', 5 * 86400000, false),
    DEMO._order('GS-9999-1003', 'Completed',  'renovations', 12 * 86400000, true),
    DEMO._order('GS-9999-1004', 'Incomplete', 'exteriors',   1 * 86400000, false)
  ];
  localStorage.setItem(DEMO.ORD_KEY, JSON.stringify(orders));
};

DEMO._order = function (id, status, division, age, done) {
  const c = DEMO._demoClient();
  return {
    OrderID: id, ClientID: c.clientId, BusinessName: c.businessName,
    Division: division, Status: status,
    EntryDate: new Date(Date.now() - age).toISOString(),
    DueDate: new Date(Date.now() + 86400000).toISOString(),
    BuildingNumber: '1215', UnitNumber: '205', Bedrooms: '2', Bathrooms: '1',
    Notes: status === 'Incomplete' ? 'Draft started from local demo' : 'Seeded demo order',
    createdDateTime: new Date(Date.now() - age).toISOString(),
    services: done || status === 'Incomplete' ? [
      { Category: 'Whole Unit', ServiceName: 'Painting', SubOption: 'One Coat', Division: division }
    ] : [
      { Category: 'Kitchen', ServiceName: 'Countertops', SubOption: 'Wipe Down', Division: 'Janitorial' },
      { Category: 'Kitchen', ServiceName: 'Sink', SubOption: 'Deep Clean', Division: 'Janitorial' },
      { Category: 'Bathroom', ServiceName: 'Toilet', SubOption: 'Disinfect', Division: 'Janitorial' }
    ],
    history: [{ ChangeType: status === 'Incomplete' ? 'Draft Created' : 'Created', ChangedBy: c.clientId, ChangeDate: new Date(Date.now() - age).toISOString(), Notes: '' }]
  };
};

DEMO._orders = function () {
  try { return JSON.parse(localStorage.getItem(DEMO.ORD_KEY)) || []; } catch (e) { return []; }
};
DEMO._saveOrders = function (o) { localStorage.setItem(DEMO.ORD_KEY, JSON.stringify(o)); };

DEMO._addresses = function () {
  try { return JSON.parse(localStorage.getItem(DEMO.ADDR_KEY)) || []; } catch (e) { return []; }
};
DEMO._saveAddresses = function (a) { localStorage.setItem(DEMO.ADDR_KEY, JSON.stringify(a)); };
DEMO._nextAddrId = function (list) {
  const nums = list.map(a => parseInt(String(a.id || '').replace('demo-addr-', ''), 10)).filter(n => !isNaN(n));
  return 'demo-addr-' + (nums.length ? Math.max(...nums) + 1 : 1);
};

DEMO._contacts = function () {
  try { return JSON.parse(localStorage.getItem(DEMO.CONTACT_KEY)) || []; } catch (e) { return []; }
};
DEMO._saveContacts = function (a) { localStorage.setItem(DEMO.CONTACT_KEY, JSON.stringify(a)); };
DEMO._nextContactId = function (list) {
  const nums = list.map(a => parseInt(String(a.id || '').replace('demo-contact-', ''), 10)).filter(n => !isNaN(n));
  return 'demo-contact-' + (nums.length ? Math.max(...nums) + 1 : 1);
};

/* Correlativo: rellena huecos desde el mínimo; si no hay, MAX+1 */
DEMO._orderSuffixPart = function (orderId) {
  const parts = String(orderId || '').split('-');
  const last = parts[parts.length - 1];
  /* Ordenes de un pedido multi-unidad terminan en "-PONNNN"; el
     sufijo real es el segmento de antes de ese, no el ultimo. */
  return /^PO[0-9]+$/.test(last) ? parts[parts.length - 2] : last;
};

DEMO._nextSuffix = function (orders) {
  const parse = (s) => /^[0-9]+$/.test(s) ? parseInt(s, 10) : parseInt(s, 36);
  const nums = orders
    .filter(o => (o.Status || '') !== 'Cancelled')
    .map(o => { const s = DEMO._orderSuffixPart(o.OrderID); const n = parse(s); return isNaN(n) ? null : n; })
    .filter(n => n !== null).sort((a, b) => a - b);
  let next;
  if (!nums.length) next = 0;
  else {
    next = nums[0] + 1;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] !== nums[0] + i) { next = nums[0] + i; break; }
      next = nums[i] + 1;
    }
  }
  // Longitud objetivo: la del sufijo más largo vivo (default 4); aplica también a alfa
  let lastLen = 4;
  orders.forEach(o => {
    const s = DEMO._orderSuffixPart(o.OrderID);
    if (/^[0-9]+$/.test(s)) lastLen = Math.max(lastLen, s.length);
  });
  const anyAlpha = orders.some(o => /[a-zA-Z]/.test(DEMO._orderSuffixPart(o.OrderID)));
  return anyAlpha ? next.toString(36).toUpperCase().padStart(lastLen, '0') : String(next).padStart(lastLen, '0');
};

/* PO compartido entre las unidades de un pedido multi-unidad demo. */
DEMO._nextPO = function (orders) {
  const nums = orders
    .map(o => { const m = (o.OrderID || '').match(/-PO([0-9]+)$/); return m ? parseInt(m[1], 10) : null; })
    .filter(n => n !== null);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 5000;
  return 'PO' + next;
};

DEMO._newOrderId = function (clientId) {
  const orders = DEMO._orders();
  return clientId + '-' + DEMO._nextSuffix(orders);
};

/* Parse del string Services (formato legacy "Cat > Svc – Sub | ...") */
DEMO._parseServicesString = function (str, division) {
  const out = [];
  (str || '').split(' | ').forEach(item => {
    if (item.includes('Dirt Level:')) return;
    const parts = item.split(' – ');
    if (parts.length === 2) {
      const m = parts[0].match(/^(.*?)>\s*(.+)$/);
      out.push({
        Category: m ? m[1].replace(/\s*>\s*$/, '').trim() : '',
        ServiceName: (m ? m[2] : parts[0]).trim(),
        SubOption: parts[1].trim(),
        Division: division
      });
    }
  });
  return out;
};

/* ============================================================
   REVISIONES — identificador por solicitud del cliente
   Un solo contador por orden, compartido entre cambios y
   cancelaciones, cronológico y nunca reutilizado.
     Change Requested       → GS-6060-1001-1, -2, …
     Cancellation Requested → GS-6060-1001-1C, -2C, …
   (Created / Draft Created / Request Cancelled by Client
    NO llevan número.)
============================================================ */
DEMO._nextRevision = function (history) {
  return (history || []).filter(h =>
    h.ChangeType === 'Change Requested' || h.ChangeType === 'Cancellation Requested'
  ).length + 1;
};

/* Snapshot de servicios ANTES de una edición. Viaja dentro del
   NewValue del evento para que undo-request pueda restaurarlos. */
DEMO._servicesSnapshot = function (order) {
  return 'SERVICES:' + JSON.stringify({
    services: order.services || [],
    dirtLevel: order.DirtLevel || '',
    servicesStr: order.Services || ''
  });
};

DEMO._historyEntry = function (type, notes, oldV, newV, title) {
  return {
    Title: title || '',           // ← identificador de revisión (ej. GS-6060-1001-1C)
    ChangeType: type,
    ChangedBy: (GS.session.get() || {}).clientId || 'DEMO',
    ChangeDate: new Date().toISOString(),
    Notes: notes || '',
    OldValue: oldV || '',
    NewValue: newV || ''
  };
};

/* Router del simulador: mismos paths que las functions reales */
DEMO.handle = async function (path, opts) {
  const body = opts.body || {};
  await new Promise(r => setTimeout(r, 150));
  const orders = DEMO._orders();

  switch (path) {
    case '/validate-client':
      return DEMO._demoClient();

    case '/register-client': {
      const c = DEMO._demoClient();
      c.businessName = body.businessName || c.businessName;
      c.contact = body.contact || c.contact;
      return c;
    }
    case '/recover-client-id':
      return { found: String(body.email || '').trim().toLowerCase() === DEMO._demoClient().contact };

    case '/get-services':
      return DEMO.services || { Janitorial: { type: 'categorized_rooms', dirtLevels: true, categories: {} }, renovations: { type: 'categorized_trades', categories: {} }, exteriors: { type: 'categorized_trades', categories: {} } };

    /* REVISADO: SIEMPRE actualiza la fila existente si el OrderID ya
       existe (draft enviado u orden editada). Nunca duplica.
       - Draft → Status Pending, conserva su historial y su fecha de
         creación, y registra "Created" (OldValue=Incomplete) para que
         el flow dispare el email de confirmación.
       - Edición (Save Changes) → Status Change Requested, registra
         evento con snapshot de los servicios ANTES (SERVICES:{json})
         para que undo-request restaure todo.
       En producción, submit-order.js replicará exactamente esta
       lógica (1 fila Orders + N OrderServices refrescados + evento
       OrderHistory con Title de revisión). */
    case '/submit-order': {
      /* ===== Multi-unidad: Units es un arreglo de 2+ unidades ===== */
      if (Array.isArray(body.Units) && body.Units.length >= 2) {
        const clientId = body.ClientID || 'GS-9999';
        const savedBuildings = DEMO._addresses();
        for (const u of body.Units) {
          if (!savedBuildings.find(b => b.id === u.buildingId)) {
            throw new Error('One of the selected buildings does not belong to this account.');
          }
        }

        const poTag = DEMO._nextPO(orders);
        const services = DEMO._parseServicesString(body.Services, body.Division);
        const createdOrderIds = [];

        body.Units.forEach(u => {
          const bf = savedBuildings.find(b => b.id === u.buildingId) || {};
          const suffix = DEMO._nextSuffix(orders);
          const id = clientId + '-' + suffix + '-' + poTag;
          orders.push(Object.assign({}, body, {
            OrderID: id,
            Status: body.Status || 'Pending',
            createdDateTime: new Date().toISOString(),
            BuildingNumber: bf.buildingNumber || '',
            UnitNumber: u.unitNumber || '',
            Bedrooms: u.bedrooms || '',
            Bathrooms: u.bathrooms || '',
            Address: bf.address || '',
            Suite: bf.suite || '',
            City: bf.city || '',
            Zip: bf.zip || '',
            BatchId: poTag,
            BuildingId: u.buildingId,
            services: services,
            history: [DEMO._historyEntry('Created', '', '', '')]
          }));
          createdOrderIds.push(id);
        });

        /* Batch Created pegado a la ultima unidad, mismo criterio que
           el backend real. */
        const lastOrder = orders.find(o => o.OrderID === createdOrderIds[createdOrderIds.length - 1]);
        if (lastOrder) {
          lastOrder.history.push(DEMO._historyEntry('Batch Created', '', poTag, JSON.stringify(createdOrderIds)));
        }

        DEMO._saveOrders(orders);
        return { success: true, batchId: poTag, orderIds: createdOrderIds };
      }

      const id = body.OrderID || DEMO._newOrderId(body.ClientID || 'GS-9999');
      const idx = orders.findIndex(o => o.OrderID === id);

      if (idx >= 0) {
        /* --- La orden YA existe: actualizar EN SU LUGAR --- */
        const prev = orders[idx];
        const wasDraft = (prev.Status || '') === 'Incomplete';

        const updated = Object.assign({}, prev, body, {
          OrderID: id,
          Status: body.Status || 'Pending',
          createdDateTime: prev.createdDateTime,   // se preserva la original
          services: DEMO._parseServicesString(body.Services, body.Division),
          DraftData: ''                            // ya no es draft: limpiar
        });

        const hist = (prev.history || []).slice();
        if (wasDraft) {
          /* Draft convertido en orden: evento Created (dispara email
             vía flow #3). Conserva todo el historial previo. */
          hist.push(DEMO._historyEntry('Created', 'Submitted from draft.', 'Incomplete', 'Pending'));
        } else {
          /* Edición: evento numerado + snapshot de servicios previos */
          const n = DEMO._nextRevision(hist);
          hist.push(DEMO._historyEntry(
            'Change Requested',
            '',
            prev.Status || 'Pending',
            DEMO._servicesSnapshot(prev),
            id + '-' + n
          ));
        }
        updated.history = hist;
        orders[idx] = updated;

      } else {
        /* --- Orden nueva: push normal --- */
        orders.push(Object.assign({}, body, {
          OrderID: id,
          Status: body.Status || 'Pending',
          createdDateTime: new Date().toISOString(),
          services: DEMO._parseServicesString(body.Services, body.Division),
          history: [DEMO._historyEntry('Created', '', '', '')]
        }));
      }
      DEMO._saveOrders(orders);
      return { success: true, orderId: id };
    }

    case '/save-draft': {
      let d = orders.find(o => o.Status === 'Incomplete' && o.Division === body.Division);
      if (!d) {
        d = { OrderID: DEMO._newOrderId(body.ClientID || 'GS-9999'), createdDateTime: new Date().toISOString(), history: [] };
        orders.push(d);
      }
      Object.assign(d, body, { Status: 'Incomplete' });
      DEMO._saveOrders(orders);
      return { success: true, orderId: d.OrderID };
    }

    case '/delete-draft': {
      const d = orders.find(o => o.OrderID === body.orderId && o.Status === 'Incomplete');
      if (!d) throw new Error('Draft not found.');
      d.Status = 'Cancelled';
      DEMO._saveOrders(orders);
      return { success: true };
    }

    case '/get-orders':
      return { orders: orders.filter(o => o.Status !== 'Cancelled') };

    case '/get-order-detail': {
      const o = orders.find(x => x.OrderID === body.orderId);
      if (!o) throw new Error('Order not found.');
      return { order: o, services: o.services || [], history: o.history || [] };
    }

    case '/save-order-notifications': {
      const o = orders.find(x => x.OrderID === body.orderId);
      if (!o) throw new Error('Order not found.');
      const toggleVal = v => v === 'on' ? 'Yes' : v === 'off' ? 'No' : '';
      if (body.notificationsEnabled !== undefined) o.OrderNotificationsEnabled = toggleVal(body.notificationsEnabled);
      if (body.notifyConfirmations  !== undefined) o.OrderNotifyConfirmations  = toggleVal(body.notifyConfirmations);
      if (body.notifyChanges        !== undefined) o.OrderNotifyChanges        = toggleVal(body.notifyChanges);
      if (body.notifyUpdates        !== undefined) o.OrderNotifyUpdates        = toggleVal(body.notifyUpdates);
      if (body.contactId            !== undefined) o.OrderContactId           = body.contactId || '';
      DEMO._saveOrders(orders);
      return { success: true };
    }

    /* REVISADO: las solicitudes hechas desde tracking ahora llevan
       el identificador de revisión en Title:
         change  → GS-6060-1001-N
         cancel  → GS-6060-1001-NC                                */
    case '/request-change': {
      const o = orders.find(x => x.OrderID === body.orderId);
      if (!o) throw new Error('Order not found.');
      const oldStatus = o.Status;
      const isCancel = body.type === 'cancel';
      o.Status = isCancel ? 'Cancellation Requested' : 'Change Requested';
      o.history = o.history || [];
      const n = DEMO._nextRevision(o.history);
      o.history.push(DEMO._historyEntry(
        o.Status,
        body.description || '',
        oldStatus,
        o.Status,
        o.OrderID + '-' + n + (isCancel ? 'C' : '')
      ));
      DEMO._saveOrders(orders);
      return { success: true };
    }

    /* Deshacer solicitud pendiente — regresa la orden a su estatus
       previo y registra el evento. Solo aplica si el admin NO ha
       movido el estatus (la orden sigue con la bandera). Si el
       evento de la solicitud trae snapshot SERVICES:, restaura
       también los servicios anteriores. */
    case '/undo-request': {
      const o = orders.find(x => x.OrderID === body.orderId);
      if (!o) throw new Error('Order not found.');

      const status = o.Status || '';
      if (status !== 'Change Requested' && status !== 'Cancellation Requested') {
        throw new Error('There is no pending request to undo for this order.');
      }

      // Buscar la entrada de la solicitud en el historial (la última con ese ChangeType)
      const hist = o.history || [];
      let prevStatus = null;
      for (let i = hist.length - 1; i >= 0; i--) {
        const h = hist[i];
        if ((h.ChangeType === 'Change Requested' || h.ChangeType === 'Cancellation Requested') && h.OldValue) {
          prevStatus = h.OldValue;
          // Restaurar snapshot de servicios si el NewValue lo trae (ediciones)
          if (h.NewValue && h.NewValue.indexOf('SERVICES:') === 0) {
            try {
              const restored = JSON.parse(h.NewValue.substring('SERVICES:'.length));
              o.services = restored.services || o.services;
              if (restored.dirtLevel !== undefined) o.DirtLevel = restored.dirtLevel;
              if (restored.servicesStr !== undefined) o.Services = restored.servicesStr;
            } catch (e) { /* snapshot corrupto: no restaurar servicios */ }
          }
          break;
        }
      }

      o.Status = prevStatus || 'Pending';
      o.history = o.history || [];
      o.history.push(DEMO._historyEntry('Request Cancelled by Client', 'Client undid the ' + (status === 'Cancellation Requested' ? 'cancellation' : 'change') + ' request.', status, o.Status));

      DEMO._saveOrders(orders);
      return { success: true, status: o.Status };
    }

    case '/submit-contact':
      return { success: true };

    case '/update-client-profile': {
      const c = DEMO._demoClient();
      const map = ['businessName', 'contactPerson', 'contact', 'phone', 'address', 'suite', 'city', 'zip',
        'notificationsEnabled', 'notifyConfirmations', 'notifyChanges', 'notifyUpdates'];
      map.forEach(k => { if (body[k] !== undefined) c[k] = body[k]; });
      c.success = true;
      return c;
    }

    case '/get-client-addresses': {
      const all = DEMO._addresses();
      const list = all.filter(a => body.includeArchived || !a.archived);
      return { addresses: list.slice().sort((a, b2) => (a.label || '').localeCompare(b2.label || '')) };
    }

    case '/save-client-address': {
      const all = DEMO._addresses();

      let newContactId = null;
      if (body.newContact && body.newContact.name && body.newContact.value) {
        const contacts = DEMO._contacts();
        const nc = {
          id: DEMO._nextContactId(contacts),
          name: body.newContact.name, type: body.newContact.type || 'Email',
          value: body.newContact.value, notifyRecipient: false, archived: false
        };
        contacts.push(nc);
        DEMO._saveContacts(contacts);
        newContactId = nc.id;
      }

      if (body.addressId) {
        const a = all.find(x => x.id === body.addressId);
        if (!a) throw new Error('Address not found.');
        const map = ['label', 'buildingNumber', 'address', 'suite', 'city', 'zip'];
        map.forEach(k => { if (body[k] !== undefined) a[k] = body[k]; });
        if (newContactId !== null) a.contactId = newContactId;
        else if (body.contactId !== undefined) a.contactId = body.contactId;
        if (body.archived !== undefined) a.archived = !!body.archived;
        DEMO._saveAddresses(all);
        return { success: true, addressId: a.id, contactId: newContactId };
      }

      const a = {
        id: DEMO._nextAddrId(all),
        label: body.label || '', buildingNumber: body.buildingNumber || '',
        address: body.address || '',
        suite: body.suite || '', city: body.city || '', zip: body.zip || '',
        contactId: '', archived: !!body.archived
      };
      all.push(a);
      DEMO._saveAddresses(all);
      return { success: true, addressId: a.id };
    }

    case '/get-client-contacts': {
      const all = DEMO._contacts();
      const list = all.filter(c => body.includeArchived || !c.archived);
      return { contacts: list.slice().sort((a, b2) => (a.name || '').localeCompare(b2.name || '')) };
    }

    case '/save-client-contact': {
      const all = DEMO._contacts();

      if (body.action === 'create') {
        if (!body.name || !body.value) throw new Error('Name and value are required.');
        const c = {
          id: DEMO._nextContactId(all),
          name: body.name, type: body.type || 'Email', value: body.value,
          notifyRecipient: false, archived: false
        };
        all.push(c);
        DEMO._saveContacts(all);
        return { success: true, contactId: c.id };
      }

      if (body.action === 'archive' || body.action === 'unarchive') {
        const c = all.find(x => x.id === body.contactId);
        if (!c) throw new Error('Contact not found.');
        c.archived = body.action === 'archive';
        DEMO._saveContacts(all);
        return { success: true, contactId: c.id };
      }

      if (body.action === 'setRecipient') {
        all.forEach(c => { c.notifyRecipient = (c.id === body.contactId); });
        DEMO._saveContacts(all);
        return { success: true, contactId: body.contactId || null };
      }

      throw new Error('Unknown action.');
    }

    default:
      throw new Error('Demo: unknown endpoint ' + path);
  }
};

/* Reactivar demo al navegar entre páginas internas (misma pestaña).
   Las imágenes NO van aquí: se leen de IndexedDB bajo demanda. */
(function () {
  try {
        const st = JSON.parse(sessionStorage.getItem(DEMO.SS_KEY));
    if (DEMO.enabled && st && st.active) {
      DEMO.active = true;
      DEMO.services = st.services;
    }
  } catch (e) { /* sin demo */ }
})();

/* Logo automático en páginas internas — NUNCA en index (ahí es embebido).
   toLowerCase() porque el archivo puede llamarse Index.html con mayúscula. */
if (!location.pathname.toLowerCase().endsWith('index.html') && location.pathname !== '/' && !location.pathname.toLowerCase().endsWith('/')) GS.applyLogo();