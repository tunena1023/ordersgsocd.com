const wait = ms => new Promise(r => setTimeout(r, ms));
function watch(p) {
  p.on('pageerror', e => console.log('PAGEERR', p.url().slice(0, 60), e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|404|401/.test(m.text())) console.log('CONSOLE', m.text()); });
  p.on('dialog', async d => { console.log('DIALOG', d.type(), d.message().slice(0, 80)); await d.accept(); });
}
/* Deja el elemento cerca de arriba y toma la pantalla del telefono tal cual. */
async function at(p, sel, file, offset = 70) {
  await p.evaluate(([s, off]) => { const el = document.querySelector(s); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off); }, [sel, offset]);
  await wait(350);
  await p.screenshot({ path: 'shots/' + file + '.png' });
}
async function shot(p, file) { await wait(250); await p.screenshot({ path: 'shots/' + file + '.png' }); }
async function hideToast(p) { await p.evaluate(() => document.querySelectorAll('#toast,.toast').forEach(t => { t.style.transition = 'none'; t.style.opacity = '0'; })); }
module.exports = { wait, watch, at, shot, hideToast };
/* Igual que at() pero con un locator de Playwright. */
async function atLoc(p, loc, file, offset = 120) {
  await loc.first().evaluate((el, off) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off), offset);
  await wait(350);
  await p.screenshot({ path: 'shots/' + file + '.png' });
}
module.exports.atLoc = atLoc;
