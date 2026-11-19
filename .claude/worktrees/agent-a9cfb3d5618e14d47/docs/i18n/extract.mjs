import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const DOCS = 'E:/AI_Development/wxperts/wxKanban/docs';
const SRC = path.posix.join(DOCS, 'Guide_Interactif_Migration_WinDev_IA_Methode_Fabrice_Garcia_EN.html');
const OUTDIR = process.argv[2];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('file:///' + SRC, { waitUntil: 'domcontentloaded', timeout: 120000 });

const segments = await page.evaluate(() => {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'INPUT', 'IMG', 'BR', 'HR']);
  const out = [];
  let n = 0;

  // A node is a "leaf block" when it holds text but every child is inline, so the
  // whole sentence stays in one segment and a translator can reorder freely.
  function isLeafBlock(el) {
    if (SKIP.has(el.tagName)) return false;
    if (el.classList.contains('prompt-text')) return false;
    if (!el.textContent.trim()) return false;
    for (const child of el.children) {
      if (child.classList && child.classList.contains('prompt-text')) return false;
      if (SKIP.has(child.tagName)) continue;
      const d = getComputedStyle(child).display;
      if (d !== 'inline' && d !== 'inline-block' && d !== 'contents') return false;
      if (child.querySelector('p,li,div,table,section,h1,h2,h3,h4,ul,ol')) return false;
    }
    return true;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  const seen = new Set();
  let el;
  while ((el = walker.nextNode())) {
    if (seen.has(el)) continue;
    if (!isLeafBlock(el)) continue;
    const id = 't' + ++n;
    el.setAttribute('data-tx', id);
    out.push({ id, tag: el.tagName.toLowerCase(), cls: el.className || '', html: el.innerHTML.trim() });
    el.querySelectorAll('*').forEach((d) => seen.add(d));
  }

  document.querySelectorAll('img[alt]').forEach((img, i) => {
    if (!img.alt.trim()) return;
    const id = 'a' + (i + 1);
    img.setAttribute('data-tx-alt', id);
    out.push({ id, tag: 'img@alt', cls: '', html: img.alt });
  });

  const t = document.querySelector('title');
  if (t) {
    t.setAttribute('data-tx', 'title');
    out.push({ id: 'title', tag: 'title', cls: '', html: t.innerHTML.trim() });
  }

  return out;
});

const template = await page.evaluate(() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.posix.join(OUTDIR, 'template.html'), template, 'utf8');
fs.writeFileSync(path.posix.join(OUTDIR, 'segments.json'), JSON.stringify(segments, null, 1), 'utf8');

const words = segments.reduce(
  (a, s) => a + s.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length,
  0,
);
console.log(
  'segments:', segments.length,
  'words:', words,
  'chars:', segments.reduce((a, s) => a + s.html.length, 0),
);
await browser.close();
