#!/usr/bin/env node
/**
 * Getting Started doc sync guard.
 *
 * `gettingStartedInstructions.md` (the editable source) and
 * `public/gettingStartedInstructions.html` (what customers actually load) are
 * maintained by hand. There is no generator, because the HTML carries design the
 * markdown cannot express — masthead chips, step badges, note/rule callouts,
 * section ids — plus six embedded translation dictionaries. So the two drift
 * silently, and have.
 *
 * This deliberately does NOT diff prose. The page is a redesign of the markdown,
 * not a transcription (markdown tables and bullet runs become single paragraphs),
 * so prose comparison is all false positives. It checks the things that are
 * exact, and that actually hurt a user when they go stale:
 *
 *   1. COMMANDS  — every shell command / filename in one must exist in the other.
 *                  This is the one that bites: the guide told people to run
 *                  `node scripts/upgrade-kit.mjs` long after that step was gone.
 *   2. STEPS     — the "Step N — Title" headings must agree, including their
 *                  numbering. Catches the 2/3/5 gap left by deleting steps.
 *   3. I18N      — body keys missing from a dictionary, dictionaries whose key
 *                  sets disagree, orphaned keys, and untranslated strings.
 *   4. NESTED    — an element with data-i18n containing another data-i18n. The
 *                  page's apply() does `innerHTML = value` on every such element,
 *                  so the inner one is DESTROYED on load. This silently wiped the
 *                  step-number badges for every visitor, in every language.
 *
 * Exit 0 = in sync. Exit 1 = drift. Safe for CI or a pre-push hook.
 *
 * Usage: node scripts/check-getting-started-sync.mjs [--verbose]
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MD = resolve('gettingStartedInstructions.md');
const HTML = resolve('public/gettingStartedInstructions.html');
const VERBOSE = process.argv.includes('--verbose');

// [SCOPE 121 / T017] BEGIN — skip cleanly when the guarded pair is absent
// This script ships in the kit (SCOPE-121 Amendment A / FR-011), but the two files it guards are
// wxKanban's own onboarding pair and are not part of the archive. Without this, every consumer's
// `npm run check:getting-started` would throw ENOENT — swapping one crash for another rather than
// fixing anything. wxKanban itself always has both, so the guard never fires here and the CI gate
// is unweakened.
const missingInputs = [MD, HTML].filter((p) => !existsSync(p));
if (missingInputs.length) {
  console.log(
    'check-getting-started: skipped — this guard is specific to the wxKanban repo and its inputs ' +
      `are not present here (${missingInputs.map((p) => resolve(p)).join(', ')}).`,
  );
  process.exit(0);
}
// [SCOPE 121 / T017] END

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const md = readFileSync(MD, 'utf-8');
const html = readFileSync(HTML, 'utf-8');
const problems = [];
const warnings = [];

const decode = (s) =>
  s
    .replace(/&#96;/g, '`')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

/**
 * A "command" is anything that looks like something a user must type or a file
 * they must find: it contains a path separator, an extension, a flag, or is a
 * known CLI verb. Prose in backticks (e.g. `Allow`) is excluded on purpose.
 */
const COMMANDISH =
  /(^|\s)(npm|node|npx|git|claude|curl|irm|code)\s|\.(mjs|js|ts|json|sh|ps1|vsix)\b|\//;

function commandsFromMd(src) {
  const out = new Set();
  for (const m of src.matchAll(/```[a-z]*\n([\s\S]*?)```/g)) {
    for (const line of m[1].split('\n')) {
      const t = line.trim();
      if (t && COMMANDISH.test(t)) out.add(t);
    }
  }
  for (const m of src.matchAll(/`([^`\n]+)`/g)) {
    const t = m[1].trim();
    if (t && COMMANDISH.test(t)) out.add(t);
  }
  return out;
}

function commandsFromHtml(src) {
  const body = src.replace(/<script[\s\S]*?<\/script>/g, '');
  const out = new Set();
  for (const m of body.matchAll(/<code>([\s\S]*?)<\/code>/g)) {
    for (const line of decode(m[1].replace(/<[^>]+>/g, '')).split('\n')) {
      const t = line.trim();
      if (t && COMMANDISH.test(t)) out.add(t);
    }
  }
  return out;
}

// URLs are referenced in both and are worth keeping honest too.
const urlsOf = (s) =>
  new Set(
    [...s.matchAll(/https?:\/\/[^\s"'`)<>\]]+/g)]
      // strip trailing markdown emphasis / punctuation the URL regex sweeps up
      .map((m) => m[0].replace(/[*_~`.,;:!?]+$/, ''))
      .filter((u) => !u.includes('mcp.wxperts.com/health')),
  );

// ── 1. commands ───────────────────────────────────────────────────────────────

const mdCmds = commandsFromMd(md);
const htmlCmds = commandsFromHtml(html);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const htmlCmdNorm = new Set([...htmlCmds].map(norm));
const mdCmdNorm = new Set([...mdCmds].map(norm));

const missingInHtml = [...mdCmdNorm].filter((x) => !htmlCmdNorm.has(x));
const missingInMd = [...htmlCmdNorm].filter((x) => !mdCmdNorm.has(x));

if (missingInHtml.length)
  problems.push(
    `command(s) in the markdown but NOT on the page — page is stale:\n` +
      missingInHtml.map((x) => `      ${x}`).join('\n'),
  );
if (missingInMd.length)
  problems.push(
    `command(s) on the page but NOT in the markdown — page tells users to run something the guide dropped:\n` +
      missingInMd.map((x) => `      ${x}`).join('\n'),
  );

// ── 2. step headings ──────────────────────────────────────────────────────────

const mdSteps = [...md.matchAll(/^###\s+Step\s+(\d+)\s*[—-]\s*(.+)$/gm)].map((m) => ({
  n: Number(m[1]),
  title: m[2].trim(),
}));
const htmlSteps = [
  ...html.matchAll(
    /<h3><span data-i18n="[^"]+">([^<]+)<\/span>\s*<span class="tag"><span data-i18n="ui\.step">step<\/span>\s*(\d+)<\/span><\/h3>/g,
  ),
].map((m) => ({ n: Number(m[2]), title: m[1].trim() }));

if (mdSteps.length !== htmlSteps.length) {
  problems.push(`step count differs — markdown has ${mdSteps.length}, page has ${htmlSteps.length}`);
} else {
  for (let i = 0; i < mdSteps.length; i++) {
    if (mdSteps[i].n !== htmlSteps[i].n || mdSteps[i].title !== htmlSteps[i].title) {
      problems.push(
        `step ${i + 1} differs — markdown "Step ${mdSteps[i].n} — ${mdSteps[i].title}" vs page "step ${htmlSteps[i].n} — ${htmlSteps[i].title}"`,
      );
    }
  }
}
const nums = mdSteps.map((s) => s.n);
const expected = nums.map((_, i) => i + 1);
if (nums.join() !== expected.join()) {
  problems.push(`step numbering is not sequential: ${nums.join(', ')} (expected ${expected.join(', ')})`);
}

// ── 3. i18n integrity ─────────────────────────────────────────────────────────

function allDicts(src) {
  const i = src.indexOf('var I18N =');
  if (i < 0) return null;
  const start = src.indexOf('{', i);
  let depth = 0;
  let end = -1;
  for (let k = start; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) {
      end = k;
      break;
    }
  }
  try {
    return JSON.parse(src.slice(start, end + 1));
  } catch {
    return null;
  }
}

const dicts = allDicts(html);
if (!dicts) {
  problems.push('the embedded I18N dictionaries do not parse — the page is broken');
} else {
  const langs = Object.keys(dicts);
  const bodyKeys = [...new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]))];

  for (const lang of langs) {
    const missing = bodyKeys.filter((k) => !(k in dicts[lang]));
    if (missing.length)
      problems.push(`${lang}: ${missing.length} key(s) used by the page are missing: ${missing.join(', ')}`);
  }
  const base = Object.keys(dicts[langs[0]]);
  for (const lang of langs.slice(1)) {
    const absent = base.filter((k) => !(k in dicts[lang]));
    const extra = Object.keys(dicts[lang]).filter((k) => !base.includes(k));
    if (absent.length || extra.length)
      problems.push(`${lang}: key set differs from ${langs[0]} — ${absent.length} missing, ${extra.length} extra`);
  }
  const orphans = base.filter((k) => !bodyKeys.includes(k));
  if (orphans.length)
    warnings.push(`${orphans.length} dictionary key(s) unused by any element: ${orphans.join(', ')}`);

  const en = dicts['en-US'] ?? dicts[langs[0]];
  for (const lang of langs) {
    if (lang === 'en-US') continue;
    const same = base.filter(
      (k) => dicts[lang][k] === en[k] && String(en[k]).split(/\s+/).length >= 5,
    );
    if (same.length) warnings.push(`${lang}: ${same.length} string(s) identical to English — possibly untranslated`);
  }
}

// ── 3b. body text must equal its en-US dictionary value ──────────────────────
// apply() overwrites each element from the dictionary on load, so a body/dict
// mismatch is invisible with JS on and wrong with JS off — and it hides real
// content loss. A truncated <li> sat here undetected because the dictionary copy
// was intact and the page therefore looked correct.
if (dicts) {
  const en = dicts['en-US'] ?? dicts[Object.keys(dicts)[0]];
  const headOnly = html.slice(0, html.indexOf('var I18N ='));
  const mismatched = [];
  for (const m of headOnly.matchAll(
    /<(h\d|p|div|li|span|a)([^>]*)data-i18n="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g,
  )) {
    const key = m[3];
    if (key in en && m[5].trim() !== String(en[key]).trim()) mismatched.push(key);
  }
  if (mismatched.length)
    problems.push(
      `${mismatched.length} element(s) whose inline text differs from their en-US dictionary value: ${mismatched.join(', ')}\n` +
        `      The page renders the dictionary copy, so this is invisible with JS on — and wrong without it.`,
    );
}

// ── 4. nested data-i18n ───────────────────────────────────────────────────────

const bodyOnly = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const nested = [];
for (const m of bodyOnly.matchAll(/<(h\d|p|div|li|span)([^>]*data-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g)) {
  if (m[4].includes('data-i18n')) nested.push(m[3]);
}
if (nested.length)
  problems.push(
    `${nested.length} element(s) with data-i18n contain another data-i18n: ${nested.join(', ')}\n` +
      `      apply() does innerHTML = value on each, so the inner element is destroyed on load.\n` +
      `      Fix: move the outer element's own text into a child span, sibling to the inner one.`,
  );

// ── 5. urls (warn only) ───────────────────────────────────────────────────────

const mdUrls = urlsOf(md);
const htmlUrls = urlsOf(html.replace(/<script[\s\S]*?<\/script>/g, ''));
const urlOnlyMd = [...mdUrls].filter((u) => !htmlUrls.has(u));
if (urlOnlyMd.length) warnings.push(`URL(s) in the markdown but not on the page: ${urlOnlyMd.join(', ')}`);

// ── report ────────────────────────────────────────────────────────────────────

console.log(c.bold('\nGetting Started — doc sync check'));
console.log(c.dim(`  ${MD}`));
console.log(c.dim(`  ${HTML}`));
console.log(
  c.dim(
    `  ${mdCmdNorm.size} commands · ${mdSteps.length} steps · ${dicts ? Object.keys(dicts).length : 0} languages\n`,
  ),
);

if (VERBOSE) {
  console.log(c.dim('  commands: ' + [...mdCmdNorm].join(' | ')));
  console.log(c.dim('  steps:    ' + mdSteps.map((s) => `${s.n}. ${s.title}`).join(' | ')));
  if (dicts) for (const [l, d] of Object.entries(dicts)) console.log(c.dim(`  ${l}: ${Object.keys(d).length} keys`));
  console.log('');
}

for (const w of warnings) console.log(`${c.yellow('warn')}  ${w}`);
for (const p of problems) console.log(`${c.red('FAIL')}  ${p}`);

if (!problems.length) {
  console.log(c.green('\n  in sync ✓') + (warnings.length ? c.dim(`  (${warnings.length} warning(s))`) : '') + '\n');
  process.exit(0);
}
console.log(c.red(`\n  ${problems.length} problem(s) — the guide and the published page disagree.\n`));
process.exit(1);
