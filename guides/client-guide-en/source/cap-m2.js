/* Movil parte 2: Processing (drafts, ordenes, botones, paneles). */
const { launch, phone, BASE } = require('./lib');
const { wait, watch, at, atLoc, shot, hideToast } = require('./common');
const card = id => `.order-card[data-order="${id}"]`;
(async () => {
  const b = await launch();
  const ctx = await phone(b); const p = await ctx.newPage(); watch(p);
  const go = async () => { await p.goto(BASE + 'customer.html?tab=processing', { waitUntil: 'networkidle' }); await wait(1400); };
  const open = async id => { await p.locator(card(id) + ' .order-card-header').first().click(); await wait(1200); };
  await go();
  await shot(p, 'p01-processing');
  await atLoc(p, p.locator('text=Active orders'), 'p02-active-list', 120);
  // Draft
  await p.locator('.order-card', { hasText: 'TEMP-0003' }).locator('.order-card-header').first().click(); await wait(800);
  await atLoc(p, p.locator('.order-card', { hasText: 'TEMP-0003' }), 'p03-draft', 120);
  // Received -> Edit Order
  await go(); await open('GS-1042-1012');
  await atLoc(p, p.locator(card('GS-1042-1012')), 'p04-received-open', 120);
  await p.locator(card('GS-1042-1012')).locator('p.detail-label', { hasText: 'Services Requested' }).first().click(); await wait(400);
  await atLoc(p, p.locator(card('GS-1042-1012')).locator('p.detail-label', { hasText: 'Services Requested' }), 'p04b-services', 200);
  await atLoc(p, p.locator(card('GS-1042-1012')).locator('text=Edit Order'), 'p05-received-buttons', 420);
  // Assigned
  await go(); await open('GS-1042-1010');
  await atLoc(p, p.locator(card('GS-1042-1010')), 'p06-assigned-open', 120);
  await atLoc(p, p.locator(card('GS-1042-1010')).locator('text=Materials & Access'), 'p07-materials', 130);
  await atLoc(p, p.locator(card('GS-1042-1010')).locator('text=History').first(), 'p08-history', 130);
  await atLoc(p, p.locator(card('GS-1042-1010')).locator('text=Order Tracker'), 'p09-tracker', 130);
  await atLoc(p, p.locator(card('GS-1042-1010')).locator('text=Request Change'), 'p10-buttons', 300);
  // Request change panel
  await p.locator(card('GS-1042-1010')).locator('text=Request Change').first().click(); await wait(700);
  const rc = p.locator('text=Request a change').first();
  await p.locator('textarea:visible').last().fill('Please move the entry date to Thursday — the resident moves out a day later.').catch(e => console.log('rc fill', e.message));
  await atLoc(p, rc, 'p11-request-change', 130);
  await atLoc(p, p.locator('text=Send Request').first(), 'p12-request-change-send', 560);
  // Cancel dialog
  await go(); await open('GS-1042-1010');
  await p.locator(card('GS-1042-1010')).locator('text=Cancel Request').first().click(); await wait(600);
  await shot(p, 'p13-cancel-dialog');
  // Notifications per order
  await go(); await open('GS-1042-1010');
  await p.locator(card('GS-1042-1010')).locator('button:has-text("Notifications")').first().click(); await wait(700);
  await atLoc(p, p.locator('text=Notifications for GS-1042-1010').first(), 'p14-order-notifications', 130);
  // Office proposal -> Confirm
  await go(); await open('GS-1042-1008');
  await atLoc(p, p.locator(card('GS-1042-1008')), 'p15-proposal-open', 120);
  await p.locator(card('GS-1042-1008')).locator('p.detail-label', { hasText: 'Services (Proposed)' }).first().click(); await wait(400);
  await atLoc(p, p.locator(card('GS-1042-1008')).locator('text=proposed change').first(), 'p16-proposal-services', 160);
  await atLoc(p, p.locator(card('GS-1042-1008')).locator('button:has-text("Confirm")').first(), 'p17-proposal-confirm', 420);
  // PO
  await go();
  const po = p.locator('text=PO #').first();
  await po.click().catch(() => {}); await wait(800);
  await atLoc(p, po, 'p18-po', 120);
  await p.locator('text=+ Add a Unit').first().click().catch(e => console.log('addunit', e.message)); await wait(500);
  await atLoc(p, p.locator('text=Add Unit').last(), 'p19-add-unit', 520);
  await b.close(); console.log('done');
})();
