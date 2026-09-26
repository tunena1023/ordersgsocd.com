const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const CACHE = path.join(__dirname, 'cdn-cache'); fs.mkdirSync(CACHE, { recursive: true });
async function cdn(route) {
  const url = route.request().url();
  const key = path.join(CACHE, crypto.createHash('md5').update(url).digest('hex'));
  try {
    if (!fs.existsSync(key)) {
      const r = await fetch(url); const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(key, buf); fs.writeFileSync(key + '.meta', JSON.stringify({ status: r.status, type: r.headers.get('content-type') || '' }));
    }
    const meta = JSON.parse(fs.readFileSync(key + '.meta', 'utf8'));
    await route.fulfill({ status: meta.status, contentType: meta.type, body: fs.readFileSync(key), headers: { 'access-control-allow-origin': '*' } });
  } catch (e) { await route.abort(); }
}
const SESSION = { valid: true, clientId: 'GS-1042', businessName: 'Maple Court Apartments', contactPerson: 'Dana Reyes', address: '1215 Grand Ave', suite: '', city: 'Des Moines', zip: '50309', contact: 'dana@maplecourt.com', phone: '(515) 555-0101', showEstimatedTime: false };
async function launch() {
  return chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + path.join(__dirname, 'photos/cam.mjpeg')] });
}
async function phone(browser, { signedIn = true, desktop = false } = {}) {
  const ctx = await browser.newContext(desktop
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, timezoneId: 'America/Chicago', locale: 'en-US' }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, timezoneId: 'America/Chicago', locale: 'en-US', isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        permissions: ['camera'] });
  await ctx.route(/^https:\/\//, cdn);
  if (signedIn) await ctx.addInitScript(s => { sessionStorage.setItem('gs_client', JSON.stringify(s)); }, SESSION);
  return ctx;
}
module.exports = { launch, phone, BASE: 'http://localhost:8788/' };
