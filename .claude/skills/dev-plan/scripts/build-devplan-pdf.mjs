#!/usr/bin/env node
/**
 * build-devplan-pdf.mjs  (wxKanban kit skill: dev-plan)
 * --------------------------------------------------------------------------
 * Renders a development-plan Markdown file — Mermaid diagram included — to PDF.
 *
 *   node .claude/skills/dev-plan/scripts/build-devplan-pdf.mjs
 *   node .../build-devplan-pdf.mjs path/to/PLAN.md path/to/PLAN.pdf
 *
 * Defaults: reads  specs/DEVELOPMENT-PLAN.md  (relative to cwd / project root)
 *           writes specs/DEVELOPMENT-PLAN.pdf
 *
 * Portable: resolves marked / puppeteer / mermaid from the CONSUMER project's
 * node_modules (cwd first, then the skill location). Renders offline — mermaid
 * is injected from node_modules, no network. If a dependency is missing it
 * prints exactly how to install it and exits non-zero.
 * --------------------------------------------------------------------------
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const argIn = process.argv[2];
const argOut = process.argv[3];
const MD_PATH = resolve(process.cwd(), argIn || 'specs/DEVELOPMENT-PLAN.md');
const PDF_PATH = resolve(process.cwd(), argOut || MD_PATH.replace(/\.md$/i, '.pdf'));

// Resolve packages from the consumer project (cwd) first, then this skill dir.
const reqCwd = createRequire(pathToFileURL(resolve(process.cwd(), 'package.json')));
const reqHere = createRequire(import.meta.url);
function resolveSpec(spec) {
  try { return reqCwd.resolve(spec); } catch { /* fall through */ }
  return reqHere.resolve(spec); // throws if truly absent
}
async function load(spec, pkgHint) {
  try {
    return await import(pathToFileURL(resolveSpec(spec)).href);
  } catch (err) {
    console.error(
      `✗ Missing dependency "${pkgHint || spec}". Install it in this project:\n` +
      `    npm install ${pkgHint || spec}\n` +
      `  The dev-plan skill needs: marked, puppeteer, mermaid.`
    );
    throw err;
  }
}

function buildRenderer(marked) {
  const renderer = new marked.Renderer();
  const baseCode = renderer.code.bind(renderer);
  // marked v18 passes a token { text, lang }; older passes (text, lang).
  renderer.code = function code(codeObj, infoString) {
    const text = typeof codeObj === 'string' ? codeObj : codeObj.text;
    const lang = typeof codeObj === 'string' ? infoString : codeObj.lang;
    if ((lang || '').trim() === 'mermaid') {
      const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<pre class="mermaid">${esc}</pre>`;
    }
    return baseCode(codeObj);
  };
  return renderer;
}

// Brand defaults align with the kit's stack.md (primary #3498db, secondary #f1c40f).
function pageHtml(bodyHtml, mermaidSource) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><style>
  @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
  :root{--p:#3498db;--s:#f1c40f}*{box-sizing:border-box}
  body{font-family:'Open Sans',-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2933;line-height:1.55;margin:0;padding:32px 40px;font-size:13px}
  h1,h2,h3{color:var(--p);line-height:1.25}
  h1{font-size:26px;border-bottom:3px solid var(--s);padding-bottom:8px}
  h2{font-size:19px;margin-top:26px;border-bottom:1px solid #e4e7eb;padding-bottom:4px}
  h3{font-size:15px;margin-top:18px;color:#334e68}
  a{color:var(--p)}code{background:#f0f4f8;padding:1px 5px;border-radius:4px;font-size:12px}
  pre code{background:none;padding:0}pre:not(.mermaid){background:#f0f4f8;padding:12px;border-radius:8px;overflow-x:auto}
  table{border-collapse:collapse;width:100%;margin:12px 0;font-size:12px}
  th,td{border:1px solid #d9e2ec;padding:6px 9px;text-align:left;vertical-align:top}
  th{background:var(--p);color:#fff}tr:nth-child(even) td{background:#f7f9fb}
  blockquote{border-left:4px solid var(--s);margin:10px 0;padding:4px 14px;background:#fffdf2}
  pre.mermaid{text-align:center;background:none;padding:8px 0}pre.mermaid svg{max-width:100%;height:auto}
  hr{border:none;border-top:1px solid #e4e7eb;margin:22px 0}@page{margin:14mm}
  </style></head><body>
  ${bodyHtml}
  <script>${mermaidSource}</script>
  <script>window.mermaid.initialize({startOnLoad:false,theme:'base',securityLevel:'loose',flowchart:{useMaxWidth:true}});</script>
  </body></html>`;
}

async function main() {
  const md = await readFile(MD_PATH, 'utf8').catch(() => {
    throw new Error(`Plan markdown not found: ${MD_PATH}. Generate it first (see SKILL.md).`);
  });

  const { marked } = await load('marked');
  const puppeteer = (await load('puppeteer')).default;
  const mermaidDist = resolveSpec('mermaid/dist/mermaid.min.js');
  const mermaidSource = await readFile(mermaidDist, 'utf8');

  marked.setOptions({ renderer: buildRenderer(marked), gfm: true });
  const bodyHtml = marked.parse(md);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(pageHtml(bodyHtml, mermaidSource), { waitUntil: 'networkidle0' });
    await page.evaluate(async () => { await window.mermaid.run({ querySelector: 'pre.mermaid' }); });
    await page.pdf({ path: PDF_PATH, format: 'A4', printBackground: true, preferCSSPageSize: true });
    console.log(`✓ Wrote ${PDF_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('✗ Failed to build dev-plan PDF:', err.message || err);
  process.exit(1);
});
