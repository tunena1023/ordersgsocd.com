/* PDF para email: una pagina por imagen (JPEG para que pese poco). */
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs'), path = require('path');
(async () => {
  const [dir, out] = process.argv.slice(2);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
  const b = await chromium.launch(); const p = await b.newPage();
  const pdf = await PDFDocument.create();
  for (const f of files) {
    const data = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
    const jpg = await p.evaluate(async src => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/jpeg', 0.82).split(',')[1]; }, data);
    const im = await pdf.embedJpg(Buffer.from(jpg, 'base64'));
    const w = im.width / 2, h = im.height / 2;
    pdf.addPage([w, h]).drawImage(im, { x: 0, y: 0, width: w, height: h });
  }
  pdf.setTitle('GS Solutions – Order Portal Guide');
  fs.writeFileSync(out, await pdf.save());
  await b.close(); console.log(files.length, 'pages');
})();
