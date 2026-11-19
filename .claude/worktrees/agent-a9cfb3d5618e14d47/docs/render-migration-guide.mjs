import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const DOCS = 'E:/AI_Development/wxperts/wxKanban/docs';
const SRC = path.join(DOCS, 'Guide_Interactif_Migration_WinDev_IA_Methode_Fabrice_Garcia_EN.html');
const OUT = path.join(DOCS, 'Guide_Migration_WinDev_wxKanban_EN.pdf');

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.goto('file:///' + SRC.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 120000,
  });

  // The page hides interactive chrome under @media print; force the collapsible
  // sections open so nothing a reader needs is folded away in the printed copy.
  await page.evaluate(() => {
    document.querySelectorAll('.section-content').forEach((el) => {
      el.style.display = 'block';
    });
  });

  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', right: '12mm', bottom: '16mm', left: '12mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#94a3b8;padding:0 12mm;' +
      'display:flex;justify-content:space-between;font-family:Segoe UI,Arial,sans-serif;">' +
      '<span>WinDev/WebDev to wxKanban Migration Guide — v2.0</span>' +
      '<span class="pageNumber"></span> / <span class="totalPages"></span>' +
      '</div>',
  });
} finally {
  await browser.close();
}

const stat = fs.statSync(OUT);
console.log('PDF written:', OUT, Math.round(stat.size / 1024) + 'KB');
