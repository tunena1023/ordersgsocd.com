const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const f of fs.readdirSync('shots').filter(x => x.endsWith('.png'))) {
    const data = 'data:image/png;base64,' + fs.readFileSync('shots/' + f).toString('base64');
    const out = await p.evaluate(async src => { const img = new Image(); img.src = src; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0); return c.toDataURL('image/jpeg', 0.84); }, data);
    fs.writeFileSync('shotsj/' + f.replace('.png', '.jpg'), Buffer.from(out.split(',')[1], 'base64'));
  }
  await b.close();
})();
