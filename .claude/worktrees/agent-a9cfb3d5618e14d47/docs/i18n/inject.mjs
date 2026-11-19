// Rebuild the interactive guide in one target language: take the instrumented
// template, replace every data-tx segment with its translation, retranslate the
// handful of strings the inline script writes at runtime, and emit the HTML.
//
// Usage: node docs/i18n/inject.mjs <lang-code> <out-html>
import puppeteer from 'puppeteer';
import fs from 'fs';

const DIR = 'E:/AI_Development/wxperts/wxKanban/docs/i18n/build';
const [LANG, OUT] = process.argv.slice(2);
if (!LANG || !OUT) throw new Error('usage: inject.mjs <lang> <out.html>');

const tsv = fs.readFileSync(`${DIR}/${LANG}.tsv`, 'utf8');
const table = {};
for (const line of tsv.split('\n')) {
  if (!line.trim()) continue;
  const tab = line.indexOf('\t');
  if (tab < 0) throw new Error(`no tab separator: ${line.slice(0, 60)}`);
  table[line.slice(0, tab)] = line.slice(tab + 1);
}
const passthrough = JSON.parse(fs.readFileSync(`${DIR}/passthrough.json`, 'utf8'));
Object.assign(table, passthrough);

const source = JSON.parse(fs.readFileSync(`${DIR}/segments.norm.json`, 'utf8'));

// Fail loudly on a missing segment rather than shipping a half-English page.
const missing = source.filter((s) => table[s.id] === undefined).map((s) => s.id);
if (missing.length) throw new Error(`${LANG}: ${missing.length} untranslated segments: ${missing.join(',')}`);

// Inline markup must survive translation intact — a dropped <code> or <a> would
// silently change meaning or break a link.
const tagsOf = (html) => (html.match(/<[a-z][^>]*>/gi) || []).map((t) => t.replace(/\s+/g, ' ')).sort();
const codeOf = (html) => (html.match(/<code>[\s\S]*?<\/code>/gi) || []).sort();
const hrefOf = (html) => (html.match(/href="[^"]*"/gi) || []).sort();
const problems = [];
for (const s of source) {
  const t = table[s.id];
  const a = tagsOf(s.html);
  const b = tagsOf(t);
  if (a.length !== b.length) problems.push(`${s.id}: tag count ${a.length} -> ${b.length}`);
  const ca = codeOf(s.html);
  const cb = codeOf(t);
  if (JSON.stringify(ca) !== JSON.stringify(cb)) problems.push(`${s.id}: <code> changed: ${ca.join('|')} -> ${cb.join('|')}`);
  const ha = hrefOf(s.html);
  const hb = hrefOf(t);
  if (JSON.stringify(ha) !== JSON.stringify(hb)) problems.push(`${s.id}: href changed: ${ha.join('|')} -> ${hb.join('|')}`);
}
if (problems.length) {
  process.stderr.write(`${LANG}: ${problems.length} markup problems\n${problems.join('\n')}\n`);
  process.exitCode = 2;
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('file:///' + `${DIR}/template.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const applied = await page.evaluate(
  ({ table, lang }) => {
    let n = 0;
    document.querySelectorAll('[data-tx]').forEach((el) => {
      const v = table[el.getAttribute('data-tx')];
      if (v === undefined) return;
      el.innerHTML = v;
      el.removeAttribute('data-tx');
      n++;
    });
    document.querySelectorAll('[data-tx-alt]').forEach((img) => {
      const v = table[img.getAttribute('data-tx-alt')];
      if (v !== undefined) img.alt = v;
      img.removeAttribute('data-tx-alt');
      n++;
    });
    document.documentElement.setAttribute('lang', lang);
    return n;
  },
  { table, lang: table.htmllang || LANG.split('-')[0] },
);

let html = await page.evaluate(() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
await browser.close();

// The inline script writes six strings at runtime; they never appear in the DOM
// at load time, so they are replaced in the serialized source instead.
const RUNTIME = [
  ["'% complete'", (v) => `'% ${v}'`, 'js_percent_complete'],
  ["' tasks confirmed'", (v) => `' ${v}'`, 'js_tasks_confirmed'],
  ['"\\u2705 Progress restored successfully!"', (v) => `"\\u2705 ${v}"`, 'js_restored'],
  ['"\\u274C Invalid JSON file."', (v) => `"\\u274C ${v}"`, 'js_invalid_json'],
  ['"Are you sure you want to reset all of your progress?"', (v) => `"${v}"`, 'js_confirm_reset'],
  ['"Copied!"', (v) => `"${v}"`, 'js_copied'],
];
for (const [needle, wrap, key] of RUNTIME) {
  const v = table[key];
  if (v === undefined) throw new Error(`${LANG}: missing runtime string ${key}`);
  if (!html.includes(needle)) throw new Error(`${LANG}: runtime literal not found: ${needle}`);
  html = html.replace(needle, wrap(v));
}

fs.writeFileSync(OUT, html, 'utf8');
process.stdout.write(`${LANG}: ${applied} segments applied -> ${OUT} (${Math.round(html.length / 1024)}KB)\n`);
