#!/usr/bin/env node
/**
 * build-catalog-pdf.mjs  (skill: marketing-feature-set)
 * --------------------------------------------------------------------------
 * Renders the marketing feature-set catalog Markdown to a print-ready PDF.
 *
 *   node .claude/skills/marketing-feature-set/scripts/build-catalog-pdf.mjs
 *   node .../build-catalog-pdf.mjs path/to/CATALOG.md path/to/CATALOG.pdf
 *
 * Defaults: reads  marketing/feature-set.md   writes marketing/feature-set.pdf
 *
 * Portable + offline: resolves marked + puppeteer from the project's node_modules
 * (cwd first, then the skill dir). If a dep is missing it prints the install line.
 * --------------------------------------------------------------------------
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const MD_PATH = resolve(process.cwd(), process.argv[2] || 'marketing/feature-set.md');
const PDF_PATH = resolve(process.cwd(), process.argv[3] || MD_PATH.replace(/\.md$/i, '.pdf'));

const reqCwd = createRequire(pathToFileURL(resolve(process.cwd(), 'package.json')));
const reqHere = createRequire(import.meta.url);
function resolveSpec(spec) {
  try { return reqCwd.resolve(spec); } catch { /* fall through */ }
  return reqHere.resolve(spec);
}
async function load(spec) {
  try {
    return await import(pathToFileURL(resolveSpec(spec)).href);
  } catch (err) {
    console.error(
      `✗ Missing dependency "${spec}". Install it in this project:\n    npm install ${spec}\n` +
      `  This skill needs: marked, puppeteer.`,
    );
    throw err;
  }
}

// Brand: navy + warm amber accent, matching the live landing page + banner-brand.ts.
function pageHtml(bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><style>
  :root{--navy:#0f1722;--accent:#c8761b;--accent-dk:#a45f12;--ink:#14171c}
  *{box-sizing:border-box}
  body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b313b;line-height:1.55;margin:0;padding:34px 42px;font-size:13px}
  h1,h2,h3{color:var(--ink);line-height:1.22}
  h1{font-size:27px;color:var(--navy);border-bottom:3px solid var(--accent);padding-bottom:9px}
  h2{font-size:19px;margin-top:26px;color:var(--accent-dk);border-bottom:1px solid #e3e6eb;padding-bottom:4px}
  h3{font-size:15px;margin-top:18px;color:var(--navy)}
  a{color:var(--accent-dk)}
  code{background:#f6f7f9;padding:1px 5px;border-radius:4px;font-size:12px}
  ul{margin:6px 0 14px;padding-left:20px}li{margin:2px 0}
  table{border-collapse:collapse;width:100%;margin:12px 0;font-size:12px}
  th,td{border:1px solid #e3e6eb;padding:6px 9px;text-align:left;vertical-align:top}
  th{background:var(--navy);color:#fff}tr:nth-child(even) td{background:#f6f7f9}
  blockquote{border-left:4px solid var(--accent);margin:10px 0;padding:4px 14px;background:#fdf7f0;color:#5b6472}
  em{color:var(--ink)}strong{color:var(--ink)}
  hr{border:none;border-top:1px solid #e3e6eb;margin:22px 0}@page{margin:15mm}
  </style></head><body>${bodyHtml}</body></html>`;
}

async function main() {
  const md = await readFile(MD_PATH, 'utf8').catch(() => {
    throw new Error(`Catalog markdown not found: ${MD_PATH}. Generate it first (see SKILL.md step 4).`);
  });
  const { marked } = await load('marked');
  const puppeteer = (await load('puppeteer')).default;

  marked.setOptions({ gfm: true });
  const bodyHtml = marked.parse(md);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(pageHtml(bodyHtml), { waitUntil: 'networkidle0' });
    await page.pdf({ path: PDF_PATH, format: 'A4', printBackground: true, preferCSSPageSize: true });
    console.log(`✓ Wrote ${PDF_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('✗ Failed to build catalog PDF:', err.message || err);
  process.exit(1);
});
