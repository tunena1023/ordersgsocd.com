/* ============================================================
   shared.js — SOLO FUNCIONES (nada de apariencia)
   - GS.session       : sesión del cliente en sessionStorage
   - GS.api           : wrapper de llamadas a Netlify Functions
   - GS.categoryImage : imagen de categoría (Promise, via proxy)
   - GS.applyLogo     : pone el logo del nav (via proxy, con
                        placeholder de emergencia si no responde)
   - Contact          : modal abrir/cerrar/enviar
============================================================ */

/* Cache simple de blob -> object URL, para no recrear la misma URL
   cada vez que se pide la misma imagen (logo, categorias, etc). */
const _urlCache = {};
function toObjectURL(key, blob) {
  if (!_urlCache[key]) _urlCache[key] = URL.createObjectURL(blob);
  return _urlCache[key];
}

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

  /* Wrapper de functions. */
  async api(path, opts = {}) {
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
    try {
      const res = await fetch('/api/site-image?cat=' + encodeURIComponent(name));
      if (!res.ok) return null;
      return toObjectURL(key, await res.blob());
    } catch (e) { return null; }
  },

  /* Logo del nav: via proxy; fallback → placeholder si no responde */
  async applyLogo() {
    const img = document.querySelector('nav .logo-diamond');
    if (!img) return;
    const FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">' +
      '<rect width="120" height="120" fill="#EFEDE7" stroke="#E0D9CC"/>' +
      '<text x="60" y="68" font-family="Georgia, serif" font-size="20" fill="#8C6F2A" text-anchor="middle">LOGO</text></svg>'
    );
    let url = null;
    try {
      const res = await fetch('/api/site-image?name=' + encodeURIComponent('Logo.jpg'));
      if (res.ok) url = toObjectURL('logo', await res.blob());
    } catch (e) { /* sin logo */ }
    img.src = url || FALLBACK;
  }
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

/* Logo automático en páginas internas — NUNCA en index (ahí es embebido).
   toLowerCase() porque el archivo puede llamarse Index.html con mayúscula.
   Se espera a DOMContentLoaded (mismo patrón ya confirmado en Tech, que
   funciona bien) -- llamarlo de inmediato, sin esperar nada, es mas fragil
   en paginas mas pesadas como customer.html (junta 4 paginas ahora). */
if (!location.pathname.toLowerCase().endsWith('index.html') && location.pathname !== '/' && !location.pathname.toLowerCase().endsWith('/')) {
  document.addEventListener('DOMContentLoaded', () => GS.applyLogo());
}