/* ============================================================
   lib/qb-notify.js -- avisarle a Admin que un cliente cambio, para que
   lo mande a QuickBooks al instante (26/09/2026, el dueño: "que si se
   hacen cambios desde la app se reflejen en QuickBooks inmediatamente").
   Orders no tiene la conexion de QuickBooks; Admin si
   (Admingsocd.com: qb-sync-client.js + lib/qb-sync.js, con registro y
   Undo). Plan completo: Admingsocd.com/PLAN-RESPALDOS.md, fase 2.

   Requiere QB_SYNC_SECRET en Vercel (la MISMA llave en Admin y Orders).
   Sin la llave no hace nada. Nunca truena y espera como maximo 12 s: el
   cliente ya quedo guardado en GSMS; si esto falla, la revision diaria de
   Admin (cron-qb-sync) lo manda despues.
============================================================ */
const URL_DEFAULT = 'https://admin.gsocd.com/api/qb-sync-client';

async function notifyClientChanged(clientId, opts) {
  opts = opts || {};
  const secret = process.env.QB_SYNC_SECRET || '';
  if (secret.length < 16) return { skipped: 'QB_SYNC_SECRET is not set' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(process.env.ADMIN_QB_SYNC_URL || URL_DEFAULT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-gs-sync-secret': secret },
      body: JSON.stringify({ clientId, reason: opts.reason || 'client-portal', gsmsBefore: opts.gsmsBefore || null }),
      signal: ctrl.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.warn('[qb-notify] ' + clientId + ': ' + res.status + ' ' + (data.error || '')); return { error: data.error || ('HTTP ' + res.status) }; }
    return data;
  } catch (e) {
    console.warn('[qb-notify] ' + clientId + ': ' + e.message);
    return { error: e.message };
  } finally { clearTimeout(timer); }
}

module.exports = { notifyClientChanged };
