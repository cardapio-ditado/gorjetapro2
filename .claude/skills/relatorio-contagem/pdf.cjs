// HTML -> PDF A4 no mesmo formato do relatório de 23/10. Uso: node pdf.cjs entrada.html saida.pdf
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1400 } });
  await p.goto('file://' + require('path').resolve(process.argv[2]), { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await p.pdf({ path: process.argv[3], format: 'A4', printBackground: true, scale: 0.735, preferCSSPageSize: true });
  await b.close();
})();
