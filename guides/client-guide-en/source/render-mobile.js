/* Arma las imagenes 9:16 (1080x1920) y el PDF para email. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const frames = require('./frames-mobile');
const img = f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'shotsj', f + '.jpg')).toString('base64');
const logo = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'assets/Logo.jpg')).toString('base64');
const total = frames.length;
const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff}
.f{width:1080px;height:1920px;position:relative;overflow:hidden;background:#F7F4EC;font-family:Inter,sans-serif;color:#141414;page-break-after:always}
.f::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 100%,rgba(201,168,76,.22),transparent 60%)}
.top{position:absolute;left:70px;right:70px;top:56px;display:flex;align-items:center;justify-content:space-between}
.top img{height:78px;border-radius:6px}
.top .sec{font-size:24px;letter-spacing:.14em;text-transform:uppercase;color:#8C6F2A;font-weight:700}
.top .n{font-size:24px;color:#8a8a8a;font-weight:600}
h1{position:absolute;left:70px;right:70px;top:170px;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:72px;line-height:1.02}
.bar{position:absolute;left:70px;top:0;width:90px;height:5px;background:#C9A84C}
p.t{position:absolute;left:70px;right:70px;font-size:33px;line-height:1.4;color:#3a3a3a}
p.t b{color:#141414;font-weight:700}
.phone{position:absolute;left:50%;transform:translateX(-50%);bottom:70px;width:640px;border-radius:64px;background:#111;padding:16px;box-shadow:0 30px 60px rgba(0,0,0,.28),0 0 0 2px #2b2b2b inset}
.phone img{display:block;width:100%;border-radius:50px}
.cover,.closing{background:#111;color:#fff}
.cover::before,.closing::before{background:radial-gradient(ellipse at 50% 0%,rgba(201,168,76,.35),transparent 60%)}
.cover .logo,.closing .logo{position:absolute;left:50%;transform:translateX(-50%);top:110px;height:170px;border-radius:10px}
.cover h1,.closing h1{text-align:center;top:330px;font-size:92px;color:#fff}
.cover p.t,.closing p.t{text-align:center;color:#d9d2bf;top:560px}
.cover p.t b,.closing p.t b{color:#E2C97E}
.cover .phone{width:560px;bottom:60px}
.closing h1{top:720px}
.closing p.t{top:960px;font-size:38px}
.closing .logo{top:430px}
`;
function frameHtml(x, i) {
  const num = (i + 1) + ' / ' + total;
  if (x.cover) return `<div class="f cover" id="f${i}"><img class="logo" src="${logo}"><h1>${x.title}</h1><p class="t">${x.text}</p><div class="phone"><img src="${img(x.img)}"></div></div>`;
  if (x.closing) return `<div class="f closing" id="f${i}"><img class="logo" src="${logo}"><h1>${x.title}</h1><p class="t">${x.text}</p></div>`;
  return `<div class="f" id="f${i}"><div class="top"><img src="${logo}"><span class="sec">${x.sec}</span><span class="n">${num}</span></div>
    <h1>${x.title}</h1><p class="t" data-t>${x.text}</p><div class="phone"><img src="${img(x.img)}"></div></div>`;
}
(async () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><style>${css}</style></head><body>${frames.map(frameHtml).join('')}</body></html>`;
  fs.writeFileSync(path.join(__dirname, 'mobile-frames.html'), html);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 } });
  await ctx.route(/^https:\/\//, async r => { try { const res = await fetch(r.request().url()); await r.fulfill({ status: res.status, contentType: res.headers.get('content-type') || '', body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { await r.abort(); } });
  const p = await ctx.newPage();
  await p.goto('file://' + path.join(__dirname, 'mobile-frames.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  /* El texto va justo debajo del titulo, aunque el titulo ocupe 1 o 2 renglones;
     y el telefono se achica si el texto es largo, para que nunca se encimen. */
  await p.evaluate(() => document.querySelectorAll('.f').forEach(f => {
    const h = f.querySelector('h1'), t = f.querySelector('p.t[data-t]'), ph = f.querySelector('.phone');
    if (!t) return;
    const top = h.offsetTop + h.offsetHeight + 28; t.style.top = top + 'px';
    const textBottom = top + t.offsetHeight + 50;
    const room = 1920 - 70 - textBottom;             // alto disponible para el telefono
    const w = Math.min(640, Math.floor((room - 32) * 1170 / 2532) + 32);
    ph.style.width = w + 'px';
    const bar = document.createElement('div'); bar.className = 'bar'; bar.style.top = (h.offsetTop - 22) + 'px'; f.appendChild(bar);
  }));
  const OUT = path.join(__dirname, '..', 'images-mobile'); fs.mkdirSync(OUT, { recursive: true });
  const n = await p.locator('.f').count();
  for (let i = 0; i < n; i++) {
    await p.locator('#f' + i).screenshot({ path: path.join(OUT, 'Mobile-' + String(i + 1).padStart(2, '0') + '.png') });
  }
  await b.close();
  console.log('frames', n);
})();
