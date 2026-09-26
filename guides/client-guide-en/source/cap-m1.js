/* Movil parte 1: entrar y crear una orden. */
const { launch, phone, BASE } = require('./lib');
const { wait, watch, at, shot, hideToast } = require('./common');
(async () => {
  const b = await launch();
  // --- Entrar ---
  let ctx = await phone(b, { signedIn: false }); let p = await ctx.newPage(); watch(p);
  await p.evaluate(() => 0);
  await p.goto(BASE + '__verify?on=1'); 
  await p.goto(BASE + 'index.html', { waitUntil: 'networkidle' }); await wait(600);
  await p.evaluate(() => window.scrollTo(0, 0)); await shot(p, 'm01-home');
  await p.fill('#client-input', 'GS-1042');
  await at(p, '#id-step', 'm02-client-number', 120);
  await p.click('#id-step >> text=Access Portal'); await wait(700);
  await p.fill('#verify-input', '50309');
  await at(p, '#verify-step', 'm03-verify', 120);
  await p.click('text=First Time? Register').catch(async () => { await p.goto(BASE + 'index.html'); await wait(500); await p.click('text=First Time? Register'); });
  await wait(400);
  await at(p, '#register-gate', 'm04-register', 90);
  await p.goto(BASE + 'index.html', { waitUntil: 'networkidle' }); await wait(400);
  await p.click('text=Forgot your client number?'); await wait(300);
  await p.fill('#recover-email', 'dana@maplecourt.com');
  await at(p, '#recover-gate', 'm05-recover', 120);
  await ctx.close();

  // --- Nueva orden ---
  ctx = await phone(b); p = await ctx.newPage(); watch(p);
  await p.goto(BASE + 'customer.html', { waitUntil: 'networkidle' }); await wait(1200);
  await shot(p, 'm06-portal');
  await p.fill('#building-number', '1215'); await p.fill('#unit-number', '205'); await p.fill('#bedrooms', '2'); await p.fill('#bathrooms', '1');
  await p.locator('body').click({ position: { x: 5, y: 600 } }).catch(() => {});
  await at(p, '#order-form-steps', 'm07-step1', 60);
  // Multi
  await p.click('#unit-mode-toggle'); await wait(400);
  await at(p, '#unit-mode-toggle', 'm08-multi', 260);
  await p.click('#unit-mode-toggle'); await wait(400);
  // Step 2
  await p.locator('[id^="gs-sp-restoggle"]').first().evaluate(el => el.click()); await wait(400);
  await at(p, '#div-card', 'm09-division', 110);
  await p.locator('#gs-sp-rooms-customer-order .gs-sp-cat-header', { hasText: 'Kitchen & Bathrooms' }).click(); await wait(300);
  await p.locator('#gs-sp-rooms-customer-order .gs-sp-row', { hasText: 'Kitchen Deep Clean' }).locator('.gs-sp-lvl-btn[data-level="Level 2"]').click(); await wait(200);
  await p.locator('#gs-sp-rooms-customer-order .gs-sp-row', { hasText: 'Bathroom Deep Clean' }).locator('.gs-sp-lvl-btn[data-level="Level 2"]').click(); await wait(200);
  await p.locator('#gs-sp-rooms-customer-order .gs-sp-cat-header', { hasText: 'Windows' }).click(); await wait(300);
  await p.locator('#gs-sp-rooms-customer-order .gs-sp-row', { hasText: 'Window Cleaning' }).locator('.gs-sp-lvl-btn[data-level="Level 1"]').click(); await wait(300);
  await at(p, '#gs-sp-rooms-customer-order', 'm10-services', 140);
  await at(p, '#gs-sp-pkgs-customer-order', 'm11-packages', 140);
  // Step 3
  await p.fill('#create-office-text', 'Keys are at the front desk. Please check in with Marcus.');
  await p.dispatchEvent('#create-office-text', 'input');
  await p.evaluate(() => { const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }; set('entry-date', '2026-09-30'); set('delivery-date', '2026-10-02'); GSDateTimePicker.syncDate('entry-date'); GSDateTimePicker.syncDate('delivery-date'); });
  await wait(400);
  await at(p, '#create-office-text', 'm12-step3', 230);
  // Date picker abierto
  await p.locator('#create-due-mount button, #create-due-mount [role="button"], #create-due-mount .gs-dtp-trigger').first().click().catch(e => console.log('nopicker', e.message));
  await wait(500);
  await shot(p, 'm13-datepicker');
  await p.keyboard.press('Escape'); await p.mouse.click(5, 5); await wait(300);
  await at(p, '#client-photos-block', 'm14-photos', 330);
  // Resumen (sidebar)
  await at(p, '.order-sidebar, #order-summary, .sidebar', 'm15-summary', 90);
  // Enviar
  await p.locator('text=Submit Order →').first().click(); await wait(1500);
  await hideToast(p);
  await at(p, '#order-confirmation', 'm16-received', 90);
  await at(p, '#confirm-services', 'm17-received-details', 200);
  await ctx.close();
  await b.close(); console.log('done');
})();
