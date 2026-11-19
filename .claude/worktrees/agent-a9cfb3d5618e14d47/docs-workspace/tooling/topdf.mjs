// Render the builder's _pdf_build.html to a paginated PDF using Puppeteer's
// bundled Chrome (WeasyPrint/wkhtmltopdf/PATH-chrome all unavailable here).
import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WS = process.env.WXK_WS ? path.resolve(process.env.WXK_WS) : path.resolve(__dirname, "..");
const suffix = process.env.WXK_PDF_SUFFIX || ""; // e.g. "-fr-FR"
const src = path.join(WS, "_pdf_build.html");
const out = path.join(WS, `wxKanban-User-Guide${suffix}.pdf`);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle2", timeout: 120000 });
await page.evaluate(() => document.fonts && document.fonts.ready);

const footer = `<div style="font-size:8px;width:100%;padding:0 12mm;color:#888;
  display:flex;justify-content:space-between;">
  <span>wxKanban — User Guide</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
const header = `<div></div>`;

await page.pdf({
  path: out,
  format: "Letter",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: header,
  footerTemplate: footer,
  margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
});
await browser.close();
console.log("PDF ->", out);
