/* Movil parte 3: Templates, History, Gallery, Recurring, Profile, Contact. */
const { launch, phone, BASE } = require('./lib');
const { wait, watch, at, atLoc, shot, hideToast } = require('./common');
(async () => {
  const b = await launch();
  const ctx = await phone(b); const p = await ctx.newPage(); watch(p);
  const tab = async t => { await p.goto(BASE + 'customer.html?tab=' + t, { waitUntil: 'networkidle' }); await wait(1400); };
  const panel = t => '#panel-' + t;
  // Templates
  await tab('templates');
  await atLoc(p, p.locator('#panel-templates h2').first(), 't01-templates', 130);
  await atLoc(p, p.locator('#panel-templates button:has-text("Use")').first(), 't02-template-use', 420);
  await p.locator('#panel-templates button:has-text("Use")').first().click(); await wait(1500);
  await hideToast(p);
  await atLoc(p, p.locator('#gs-sp-rooms-customer-order, #services-container').first(), 't03-template-loaded', 330);
  await tab('templates');
  await p.locator('text=+ New template').first().click(); await wait(1000);
  await p.locator('#panel-templates input:visible').first().fill('Move-out clean');
  await atLoc(p, p.locator('text=← Back to templates').first(), 't04-template-new', 130);
  // History
  await tab('history');
  await atLoc(p, p.locator('#panel-history h2').first(), 'h01-history', 130);
  await p.locator('.order-card[data-order="GS-1042-0998"] .order-card-header').first().click(); await wait(1200);
  await atLoc(p, p.locator('.order-card[data-order="GS-1042-0998"]'), 'h02-history-open', 120);
  await atLoc(p, p.locator('.order-card[data-order="GS-1042-0998"]').locator('text=Print PDF').first(), 'h03-history-print', 420);
  // Gallery
  await tab('gallery');
  await atLoc(p, p.locator('#panel-gallery h2').first(), 'g01-gallery', 130);
  await p.locator('#panel-gallery .gs-gal-grp-header').first().click(); await wait(900);
  await atLoc(p, p.locator('#panel-gallery .gs-gal-grp').first(), 'g02-gallery-open', 120);
  await p.locator('#panel-gallery .gs-gal-grp img:visible').first().click(); await wait(800);
  await shot(p, 'g03-lightbox');
  await tab('gallery');
  await p.locator('#panel-gallery button:has-text("Docs")').first().click(); await wait(500);
  await p.locator('#panel-gallery >> text=Unit 205').first().click().catch(e => console.log('docgrp', e.message)); await wait(600);
  await atLoc(p, p.locator('#panel-gallery h2').first(), 'g04-docs', 130);
  await p.locator('#panel-gallery .gs-doc-name:visible').first().click().catch(e => console.log('view', e.message)); await wait(1500);
  await shot(p, 'g05-doc-view');
  // Recurring
  await tab('recurring');
  await atLoc(p, p.locator('#panel-recurring h1, #panel-recurring h2').first(), 'r01-recurring', 130);
  await p.locator('#panel-recurring .order-card-header, #panel-recurring [onclick]').first().click(); await wait(1000);
  await atLoc(p, p.locator('#panel-recurring >> text=Contract Details').first(), 'r02-recurring-open', 150);
  await p.locator('#panel-recurring button:has-text("Request a Change")').first().click().catch(e => console.log('rcchg', e.message)); await wait(1200);
  await atLoc(p, p.locator('#panel-recurring >> text=Currently on this contract').first(), 'r03-recurring-change', 200);
  // Profile
  await tab('profile');
  await atLoc(p, p.locator('#panel-profile h2').first(), 'u01-profile', 130);
  await atLoc(p, p.locator('#panel-profile >> text=Contacts on file').first(), 'u02-profile-contacts', 260);
  await p.locator('#panel-profile button:has-text("Edit")').first().click().catch(e => console.log('edit', e.message)); await wait(900);
  for (const [t, f] of [['Edit primary address', 'u03-profile-edit'], ['Office hours at this address', 'u04-office-hours'], ['Holidays', 'u05-holidays'], ['Contacts', 'u05b-contacts']]) {
    const h = p.locator('#panel-profile').getByText(t, { exact: true }).first();
    await h.click().catch(e => console.log('hdr', t, e.message)); await wait(600);
    await atLoc(p, h, f, 130);
    await h.click().catch(() => {}); await wait(300);
  }
  await tab('profile');
  await p.locator('#panel-profile button:has-text("Notifications")').first().click().catch(e => console.log('notif', e.message)); await wait(900);
  await atLoc(p, p.locator('#panel-profile >> text=Notifications enabled').first(), 'u06-notifications', 200);
  await tab('profile');
  await p.locator('#panel-profile >> text=+ Add Building').first().click().catch(e => console.log('addb', e.message)); await wait(900);
  const ab = p.locator('#panel-profile').getByText('Add building', { exact: true }).last();
  await ab.click().catch(e => console.log('ab', e.message)); await wait(600);
  await atLoc(p, ab, 'u07-add-building', 180);
  // Contact
  await tab('processing');
  await p.locator('nav >> text=Contact').first().click().catch(e => console.log('contact', e.message)); await wait(700);
  await shot(p, 'x01-contact');
  await b.close(); console.log('done');
})();
