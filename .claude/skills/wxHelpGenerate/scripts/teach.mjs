#!/usr/bin/env node
// Teaching Skills writer for wxHelpGenerate --teach (SCOPE-138).
//
// The walk (SKILL.md) records screens, elements and — for --teach — processes in
// docs-workspace/inventory.json. This script turns each recorded process into one
// AI-agnostic markdown lesson, plus start-here.md and a zip bundle. It never walks
// the app itself and never touches the help site or PDF, so a run without --teach
// is unchanged.
//
//   node teach.mjs env   [--workspace docs-workspace] --uat <url>[,<url>] --production <url>[,<url>]
//   node teach.mjs build [--workspace docs-workspace] [--out docs/teaching-skills] [--app-version x.y.z]
//                        [--source walk|definitions] [--level amateur|junior|senior] [--stale]
//   node teach.mjs check [--workspace docs-workspace]          coverage only, writes nothing
//
// Every lesson passes the pre-write data check before anything is written (FR-007); there is
// no flag that skips it. Lessons go under docs/, never _wxAI/ (the kit mirrors the filesystem).
//
// This file is identical in .claude/skills/wxHelpGenerate/scripts/ and
// _wxAI/skills/wxHelpGenerate/scripts/; it finds the project root itself.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// [SCOPE 138 / T005] BEGIN — UAT / Production address lists (FR-004)
/** Query parameters and path pieces that mean an address carries a secret. */
const SECRET_PARAM = /^(token|access_token|id_token|refresh_token|api[_-]?key|key|secret|password|passwd|pwd|session|sessionid|sid|auth|authorization|code|sig|signature|jwt|credential|credentials)$/i;
const SECRET_PIECE = [/^eyJ[\w-]{8,}\.[\w-]{8,}\./, /^[0-9a-f]{32,}$/i, /^[A-Za-z0-9+/_-]{40,}={0,2}$/];

/**
 * An address the lesson may carry: http(s), no user or password, no secret in the query or
 * path. Returns { ok, address } with the address reduced to origin + path, or { ok: false, reason }.
 * The reason never repeats the secret.
 */
export function checkAddress(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return { ok: false, reason: 'not a valid address' };
  }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: 'only http and https addresses are allowed' };
  if (u.username || u.password) return { ok: false, reason: 'the address carries a user name or password' };
  for (const k of u.searchParams.keys()) {
    if (SECRET_PARAM.test(k)) return { ok: false, reason: `the address carries a "${k}" parameter` };
  }
  for (const piece of u.pathname.split('/')) {
    if (SECRET_PIECE.some((re) => re.test(piece))) return { ok: false, reason: 'the address path carries what looks like a token' };
  }
  if (u.hash.length > 1 && SECRET_PIECE.some((re) => re.test(u.hash.slice(1)))) {
    return { ok: false, reason: 'the address fragment carries what looks like a token' };
  }
  const path = u.pathname.replace(/\/+$/, '');
  return { ok: true, address: `${u.origin}${path}` };
}

/** Which list an address belongs to. Anything on neither list counts as Production (FR-004, SC-6). */
export function classifyAddress(raw, environments) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return 'production';
  }
  const at = `${u.origin}${u.pathname}`;
  const on = (list) => (list ?? []).some((a) => at === a || at.startsWith(a.endsWith('/') ? a : `${a}/`) || `${u.origin}` === a);
  if (on(environments?.production)) return 'production';
  if (on(environments?.uat)) return 'uat';
  return 'production';
}

/** Validate and store the lists in config.json's `environments` block. Throws naming the bad entry. */
export function setEnvironments(workspace, { uat = [], production = [] }) {
  const clean = (list, label) => list.filter(Boolean).map((a) => {
    const r = checkAddress(a);
    if (!r.ok) throw new Error(`${label} address refused: ${r.reason}`);
    return r.address;
  });
  const environments = { uat: clean(uat, 'UAT'), production: clean(production, 'Production') };
  if (!environments.production.length) throw new Error('at least one Production address is required');
  const overlap = environments.uat.filter((a) => environments.production.includes(a));
  if (overlap.length) throw new Error('an address cannot be on both lists');
  const file = join(workspace, 'config.json');
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  config.environments = environments;
  mkdirSync(workspace, { recursive: true });
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return environments;
}
// [SCOPE 138 / T005] END

// [SCOPE 138 / T004] BEGIN — Committing Steps (FR-003)
export const COMMIT_KINDS = ['save', 'submit', 'send', 'delete'];
const COMMIT_VERB = {
  save: 'save', update: 'save', apply: 'save', publish: 'save', post: 'save', approve: 'save', archive: 'save', confirm: 'save',
  submit: 'submit', pay: 'submit', checkout: 'submit', 'check out': 'submit', place: 'submit', book: 'submit',
  send: 'send', email: 'send', invite: 'send', share: 'send', notify: 'send',
  delete: 'delete', remove: 'delete', 'clear all': 'delete', purge: 'delete', cancel: null,
};

/**
 * Is clicking this element a Committing Step, and of which kind? The walk's own record
 * (`commits`, from what the click actually did) wins; otherwise a button is judged by its
 * label's leading verb. A button that only opens a form is not committing.
 */
export function commitKind(element) {
  if (!element) return null;
  if (element.commits === false || element.commits === null) return null;
  if (typeof element.commits === 'string') return COMMIT_KINDS.includes(element.commits) ? element.commits : 'save';
  if (!/button|submit|link|menuitem/i.test(element.type ?? 'button')) return null;
  const label = String(element.label ?? '').trim().toLowerCase();
  for (const [verb, kind] of Object.entries(COMMIT_VERB)) {
    if (label === verb || label.startsWith(`${verb} `)) return kind;
  }
  return null;
}
// [SCOPE 138 / T004] END

// [SCOPE 138 / T008] BEGIN — Pre-write data check (FR-007): behavior only, never data
/**
 * Patterns that must never appear in a lesson. A lesson that matches is not written; the
 * failure names the lesson and the pattern, never the value. No flag disables this.
 */
export const DATA_PATTERNS = [
  { name: 'email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: 'JSON web token', re: /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/ },
  { name: 'API key', re: /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}|\bxox[abpr]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{30,}/ },
  { name: 'long secret-like string', re: /\b[0-9a-f]{32,}\b|\b[A-Za-z0-9+/]{40,}={0,2}(?![\w/+=])/i },
  { name: 'password or secret assignment', re: /\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S{4,}/i },
  { name: 'payment card number', re: /\b(?:\d[ -]?){13,19}\b/, check: (m) => luhn(m.replace(/\D/g, '')) },
  { name: 'US social security number', re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'phone number', re: /(?:\+\d{1,3}[ .-]?)?\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/ },
  { name: 'IBAN', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/ },
  { name: 'IP address', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
];

function luhn(digits) {
  if (digits.length < 13) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** [] when the text is clean; otherwise the names of the patterns it matched (never the values). */
export function dataFindings(text, { allow = [] } = {}) {
  let scan = String(text);
  for (const a of allow) scan = scan.split(a).join(' ');
  const found = [];
  for (const p of DATA_PATTERNS) {
    const flags = p.re.flags.includes('g') ? p.re.flags : `${p.re.flags}g`;
    const re = new RegExp(p.re.source, flags);
    let m;
    while ((m = re.exec(scan)) !== null) {
      if (!p.check || p.check(m[0])) {
        found.push(p.name);
        break;
      }
    }
  }
  return found;
}
// [SCOPE 138 / T008] END

// [SCOPE 138 / T003] BEGIN — The AI-agnostic lesson format (FR-002), with header (FR-005) and save rule (FR-003)
/**
 * Tool names a lesson's instructions must not depend on: lessons work in any AI (FR-002). These
 * are tools, not brands: an app may well have its own feature called "Copilot", and its lesson
 * says so. The template itself names no AI at all (asserted by the tests).
 */
export const VENDOR_TERMS = ['MCP', 'Claude-in-Chrome', 'Chrome extension', 'read_page', 'get_page_text', 'computer use', 'tool call', 'tool_use', 'function call'];

const LEVELS = {
  amateur: 'Go one step at a time. Explain every term the first time it appears, say why each step matters, and wait for the learner to confirm before moving on.',
  junior: 'Go one step at a time. Explain anything that is not obvious from the screen, and confirm each step before moving on.',
  senior: 'Move briskly. Give each step in a sentence, and slow down only at a Committing Step or when the learner asks.',
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'process';
const md = (s) => String(s ?? '').replace(/\r?\n/g, ' ').trim();

function actionText(step, element) {
  const label = element?.label ?? step.element;
  const kind = (step.action ?? 'click').toLowerCase();
  if (kind === 'type' || kind === 'enter' || kind === 'fill') return `In **${label}**, type ${step.example ? `an example such as \`${md(step.example)}\`` : 'a value of your own'}.`;
  if (kind === 'choose' || kind === 'select') return `In **${label}**, choose ${step.example ? `an option such as \`${md(step.example)}\`` : 'an option'}.`;
  if (kind === 'check' || kind === 'toggle') return `Turn **${label}** ${step.example === 'off' ? 'off' : 'on'}.`;
  if (kind === 'open' || kind === 'go') return `Go to **${label}**.`;
  return `Click **${label}**.`;
}

function environmentRule(environments, source) {
  const list = (l) => (l?.length ? l.map((a) => `\`${a}\``).join(', ') : '(none recorded)');
  const lines = [
    '**The save rule.** Some steps save, submit, send or delete real data. They are marked **Committing Step**.',
    '',
    `- **UAT** (practice) addresses: ${list(environments?.uat)}. Here the learner may complete every step for real.`,
    `- **Production** (live) addresses: ${list(environments?.production)}.`,
    '- **Any other address, or if the learner is unsure, counts as Production.**',
    '',
    'In Production, before every Committing Step, ask exactly: **"Do you wish to save your changes?"** Continue only on a clear yes. On anything else, do not do the step: explain what it would have done, and go on to the next part of the lesson.',
  ];
  if (source === 'definitions') {
    lines.push('', 'This app is not a web page, so its address cannot be checked: always ask the learner which environment they are in before the first Committing Step.');
  } else {
    lines.push('', "**How to know the environment.** If you can see the learner's browser, compare the page address with the lists above. If you cannot, ask the learner before the first Committing Step (the lesson tells you when).");
  }
  return lines.join('\n');
}

/**
 * Render one lesson. `screens` maps screen id → screen (with `elements`). Returns
 * { file, text, body, steps, screens, elements, commits } — `body` excludes the version lines,
 * so its hash changes only when the teaching changes.
 */
export function renderLesson(process, { product, appVersion, environments, screens, source = 'walk', version = 1, changed = null }) {
  const id = slug(process.id ?? process.title);
  const steps = [];
  const elementIds = [];
  let firstCommit = -1;
  for (const [i, step] of (process.steps ?? []).entries()) {
    const screen = screens.get(step.screen);
    const element = screen?.elements?.find((e) => e.label === step.element || e.id === step.element) ?? null;
    if (element) elementIds.push(`${step.screen}#${slug(element.id ?? element.label)}`);
    const commit = commitKind(element ?? { label: step.element, type: 'button', commits: step.commits });
    if (commit && firstCommit < 0) firstCommit = i;
    steps.push({ step, screen, element, commit });
  }
  const screenIds = [...new Set((process.steps ?? []).map((s) => s.screen))];

  const body = [];
  body.push(`# Lesson: ${md(process.title)}`, '');
  if (source === 'definitions') {
    body.push('> **From definitions, not tested by clicking.** This lesson was built from the app\'s screen definitions, not from a walk of the running app. If a screen differs from what a step says, tell your tutor.', '');
  }
  body.push(`> This lesson describes **${md(product)} version ${md(appVersion)}**. If anything you see looks different from what a step describes, say so: your tutor will stop and flag it rather than guess.`, '');
  // The "What changed" block is inserted here AFTER hashing, so the hash (and so the version)
  // moves only when the teaching itself changes, not when a regeneration explains itself.
  const changedAt = body.length;
  body.push('## For the tutor', '');
  body.push(`You are teaching a learner to ${md(process.goal ?? process.title).replace(/^./, (c) => c.toLowerCase())} in ${md(product)}. Ask the learner whether they are new to this (amateur), somewhat familiar (junior) or experienced (senior), and pace the lesson to match:`, '');
  for (const [level, text] of Object.entries(LEVELS)) body.push(`- **${level}**: ${text}`);
  body.push('');
  body.push("**Tutor or coach.** Teach in conversation: tell the learner what to do, then ask what they see. If you can see the learner's screen or browser, act as a coach instead: watch the page and confirm each step as they do it. Never do the steps for them.", '');
  body.push(environmentRule(environments, source), '');
  body.push('## Steps', '');
  steps.forEach(({ step, screen, element, commit }, i) => {
    if (i === firstCommit) {
      body.push('### Before the next step — check the environment', '');
      body.push(source === 'definitions'
        ? 'Ask the learner: "Are you working in the UAT (practice) system or in Production (live)?" Treat **unsure** as Production.'
        : 'If you can see the page address, compare it with the lists above. If you cannot, ask the learner: "Is the address in your browser one of the UAT addresses?" Treat **unsure** as Production.', '');
    }
    const where = screen ? ` (on **${md(screen.title)}**)` : '';
    body.push(`### Step ${i + 1}${commit ? ` — Committing Step (${commit})` : ''}`, '');
    if (commit) {
      body.push(`> **Committing Step.** In UAT, go ahead. In Production, or if unsure, first ask: **"Do you wish to save your changes?"** Only on a clear yes, continue. On no, skip it and explain: ${md(step.expect ?? element?.behavior ?? 'this step would save the work entered so far')}.`, '');
    }
    body.push(`${actionText(step, element)}${where}`, '');
    if (step.expect) body.push(`**What you should see:** ${md(step.expect)}`, '');
    if (element?.behavior && element.behavior !== step.expect) body.push(`**Why:** ${md(element.behavior)}`, '');
  });
  body.push('## When you are done', '');
  body.push(`The learner can now ${md(process.goal ?? process.title).replace(/^./, (c) => c.toLowerCase())}. Ask them to summarize the steps in their own words, and offer the next lesson from start-here.md.`, '');

  // The hash covers the teaching only: not the version, not the app version, not "What changed".
  const contentHash = createHash('sha256')
    .update(body.join('\n').split(`version ${md(appVersion)}**`).join('version **'))
    .digest('hex')
    .slice(0, 16);
  if (changed) {
    const block = [`## What changed since version ${changed.from}`, ''];
    for (const [label, list] of [['Added', changed.added], ['Removed', changed.removed], ['Changed', changed.changed]]) {
      if (list.length) block.push(`- **${label}:** ${list.join('; ')}`);
    }
    if (!changed.added.length && !changed.removed.length && !changed.changed.length) block.push('- Only wording changed; the steps are the same.');
    block.push('');
    body.splice(changedAt, 0, ...block);
  }
  const bodyText = body.join('\n');
  const header = [
    '---',
    `lesson: ${id}`,
    `title: ${JSON.stringify(md(process.title))}`,
    `lesson_version: ${version}`,
    `app_version: ${JSON.stringify(String(appVersion))}`,
    `source: ${source}`,
    `screens: [${screenIds.join(', ')}]`,
    `elements: [${[...new Set(elementIds)].join(', ')}]`,
    `content_hash: ${contentHash}`,
    '---',
    '',
  ].join('\n');
  return {
    id,
    file: `${id}.md`,
    text: header + bodyText,
    body: bodyText,
    contentHash,
    steps: steps.map(({ step, commit }) => ({ screen: step.screen, element: step.element, action: step.action ?? 'click', commit })),
    screens: screenIds,
    elements: [...new Set(elementIds)],
    commits: steps.filter((s) => s.commit).length,
  };
}
// [SCOPE 138 / T003] END

// [SCOPE 138 / T006] BEGIN — Lesson versions: bump only when the teaching changed (FR-005, FR-006)
export const MANIFEST = '.lessons.json';

export function readManifest(outDir) {
  try {
    return JSON.parse(readFileSync(join(outDir, MANIFEST), 'utf8'));
  } catch {
    return { lessons: {} };
  }
}

const stepKey = (s) => `${s.screen}|${s.element}|${s.action}`;

/** What changed between two step lists, in words a learner reads: added, removed, changed. */
export function stepChanges(before, after) {
  const label = (s) => `${s.action} ${s.element} on ${s.screen}${s.commit ? ` (${s.commit})` : ''}`;
  const b = new Map(before.map((s) => [stepKey(s), s]));
  const a = new Map(after.map((s) => [stepKey(s), s]));
  return {
    added: after.filter((s) => !b.has(stepKey(s))).map(label),
    removed: before.filter((s) => !a.has(stepKey(s))).map(label),
    changed: after.filter((s) => b.has(stepKey(s)) && b.get(stepKey(s)).commit !== s.commit).map(label),
  };
}
// [SCOPE 138 / T006] END

// [SCOPE 138 / T010] BEGIN — start-here.md and the zip bundle (FR-009)
export function renderStartHere({ product, appVersion, lessons, environments }) {
  const lines = [
    `# Learn ${md(product)} with your AI`,
    '',
    `These lessons teach ${md(product)} version ${md(appVersion)}, one process each. Load this file and the lesson you want into any AI chat and say "teach me".`,
    '',
    '## Start here (for the tutor)',
    '',
    'Ask the learner how familiar they are: new to it (**amateur**), somewhat familiar (**junior**) or experienced (**senior**). Then offer the lessons below and teach the one they pick.',
    '',
    '## The save rule',
    '',
    environmentRule(environments, 'walk'),
    '',
    '## Lessons',
    '',
  ];
  for (const l of lessons) lines.push(`- [${md(l.title)}](${l.file}) — version ${l.version}${l.source === 'definitions' ? ' · from definitions, not tested by clicking' : ''}`);
  lines.push('');
  return lines.join('\n');
}

// A minimal ZIP writer (stored, no compression): the bundle is a handful of small markdown files,
// and the kit takes no dependency for it.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** entries: [{ name, data: Buffer }] → a ZIP file as a Buffer. */
export function zipStore(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, n, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
// [SCOPE 138 / T010] END

// [SCOPE 138 / T002] BEGIN — --teach: one lesson per recorded process (FR-001, SC-1)
// MODIFIED-BY: [SCOPE 138 / T009] — the lesson source follows the inventory's own provenance (walk or definitions)
// MODIFIED-BY: [SCOPE 138 / T007] — records each lesson's commit and the screen → files map for precise staleness
/** Coverage: which processes have lessons, and which lesson files have no process. */
export function coverage(processes, lessonIds) {
  const want = new Set(processes.map((p) => slug(p.id ?? p.title)));
  const have = new Set(lessonIds);
  return { missing: [...want].filter((id) => !have.has(id)), extra: [...have].filter((id) => !want.has(id)) };
}

function writeAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

/**
 * Build every lesson (or, with `only`, just those), check each before any is written, then write
 * them, start-here.md, the manifest and the bundle. Returns a summary; throws on a failed check
 * or a refused output folder, having written nothing.
 */
export function buildLessons({ workspace, outDir, appVersion, source: sourceArg = null, only = null, root = process.cwd() }) {
  const rel = relative(process.cwd(), resolve(outDir)).replace(/\\/g, '/');
  if (/(^|\/)_wxAI(\/|$)/.test(rel) || /(^|\/)_wxAI(\/|$)/.test(resolve(outDir).replace(/\\/g, '/'))) {
    throw new Error('lessons are written under docs/, never _wxAI/ (the kit mirrors that folder into every release)');
  }
  const config = JSON.parse(readFileSync(join(workspace, 'config.json'), 'utf8'));
  if (!config.environments?.production?.length) {
    throw new Error('no UAT / Production addresses recorded yet: ask the developer, then run "teach.mjs env --uat … --production …"');
  }
  const inventory = JSON.parse(readFileSync(join(workspace, 'inventory.json'), 'utf8'));
  // T009: a desktop or mobile app's inventory is recorded from its screen definitions, not a walk,
  // and says so (`"source": "definitions"`); its lessons are labeled and always ask the learner.
  const source = sourceArg ?? (inventory.source === 'definitions' ? 'definitions' : 'walk');
  if (!['walk', 'definitions'].includes(source)) throw new Error(`--source must be walk or definitions, not "${source}"`);
  const processes = inventory.processes ?? [];
  if (!processes.length) throw new Error('inventory.json has no processes: record them during the walk (SKILL.md, --teach)');
  const screens = new Map((inventory.screens ?? []).map((s) => [s.id, s]));
  const product = config.product_name ?? 'this app';
  const manifest = readManifest(outDir);

  const rendered = [];
  for (const p of processes) {
    const id = slug(p.id ?? p.title);
    if (only && !only.includes(id)) continue;
    const prior = manifest.lessons[id];
    const opts = { product, appVersion, environments: config.environments, screens, source };
    let r = renderLesson(p, { ...opts, version: prior?.version ?? 1 });
    let version = prior?.version ?? 1;
    if (prior && prior.contentHash !== r.contentHash) {
      version = prior.version + 1;
      // A --stale regeneration opens with what changed (FR-006); a full rebuild just carries the new version.
      const changed = only ? { from: prior.version, ...stepChanges(prior.steps ?? [], r.steps) } : null;
      r = renderLesson(p, { ...opts, version, changed });
    }
    rendered.push({ process: p, ...r, version });
  }

  // FR-007: every lesson is checked before ANY is written. The recorded environment
  // addresses are the one thing a lesson is meant to carry, so they are not findings.
  const allow = [...(config.environments.uat ?? []), ...(config.environments.production ?? [])];
  const failures = [];
  for (const r of rendered) {
    const found = dataFindings(r.text, { allow });
    if (found.length) failures.push(`${r.file}: ${found.join(', ')}`);
  }
  if (failures.length) {
    throw new Error(`data check failed — nothing was written. Replace real values with made-up examples in the walk's processes:\n  ${failures.join('\n  ')}`);
  }
  const vendor = rendered.flatMap((r) => VENDOR_TERMS.filter((t) => r.body.includes(t)).map((t) => `${r.file}: "${t}"`));
  if (vendor.length) throw new Error(`lessons must work in any AI; vendor names found:\n  ${vendor.join('\n  ')}`);

  for (const r of rendered) {
    writeAtomic(join(outDir, r.file), r.text);
    manifest.lessons[r.id] = {
      title: r.process.title, version: r.version, contentHash: r.contentHash, appVersion, source,
      screens: r.screens, elements: r.elements, steps: r.steps, commits: r.commits,
      commit: gitHead(root), // T007: staleness for this lesson is measured from here
    };
  }
  // T007: which code renders each screen, as the walk recorded it (`files` on a screen).
  manifest.screenFiles = { ...(manifest.screenFiles ?? {}) };
  for (const [id, sc] of screens) if (Array.isArray(sc.files) && sc.files.length) manifest.screenFiles[id] = sc.files.map((f) => String(f).replace(/\\/g, '/'));
  const all = Object.entries(manifest.lessons)
    .filter(([id]) => processes.some((p) => slug(p.id ?? p.title) === id))
    .map(([id, l]) => ({ id, file: `${id}.md`, title: l.title, version: l.version, source: l.source }));
  manifest.product = product;
  manifest.appVersion = appVersion;
  manifest.generatedAt = new Date().toISOString();
  const startHere = renderStartHere({ product, appVersion, lessons: all, environments: config.environments });
  const startFound = dataFindings(startHere, { allow });
  if (startFound.length) throw new Error(`data check failed on start-here.md: ${startFound.join(', ')}`);
  writeAtomic(join(outDir, 'start-here.md'), startHere);
  writeAtomic(join(outDir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');

  // FR-009: the bundle holds only checked lessons and start-here.md — no inventory, screenshots or configuration.
  const entries = [{ name: 'start-here.md', data: Buffer.from(startHere, 'utf8') }];
  for (const l of all) entries.push({ name: l.file, data: readFileSync(join(outDir, l.file)) });
  const bundle = join(outDir, `${slug(product)}-teaching-skills.zip`);
  writeAtomic(bundle, zipStore(entries));

  const cov = coverage(processes, Object.keys(manifest.lessons));
  return {
    written: rendered.map((r) => ({ id: r.id, version: r.version, commits: r.commits })),
    lessons: all.length,
    bundle,
    coverage: cov,
    screens: [...new Set(rendered.flatMap((r) => r.screens))],
    source,
  };
}
// [SCOPE 138 / T002] END

// [SCOPE 138 / T007] BEGIN — Precise staleness through SPEC-137 Change Impact (FR-006, SC-5)
export const STALE_FILE = join('.wxai', 'teaching-stale.json');

export function gitHead(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { windowsHide: true, cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Files changed since a commit: committed since, plus uncommitted and untracked now. */
export function changedSince(root, commit) {
  const git = (...a) => {
    try {
      return execFileSync('git', a, { windowsHide: true, cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 })
        .split('\n').map((l) => l.trim().replace(/\\/g, '/')).filter(Boolean);
    } catch {
      return [];
    }
  };
  return [...new Set([
    ...(commit ? git('diff', '--name-only', `${commit}..HEAD`) : []),
    ...git('diff', '--name-only', 'HEAD'),
    ...git('ls-files', '--others', '--exclude-standard'),
  ])];
}

/** The SPEC-137 engine, found by walking up from the project root or from this script. */
export async function loadImpactEngine(start) {
  for (const from of [start, dirname(fileURLToPath(import.meta.url))]) {
    for (let dir = resolve(from); ; dir = dirname(dir)) {
      const engine = join(dir, '_wxAI', 'impact', 'change-impact.mjs');
      if (existsSync(engine)) return import(pathToFileURL(engine).href);
      if (dirname(dir) === dir) break;
    }
  }
  return null;
}

/**
 * Everything a change reaches: the changed files and every file the engine finds depending on them
 * (imports, routes, tables, named strings). Null when the change is too broad to list, which
 * flags every lesson rather than guessing.
 */
export function reachOf(engine, root, changedFiles) {
  if (!changedFiles.length) return new Set();
  const report = engine.buildReport({ root, changedFiles, useCache: true });
  if (report.broad) return null;
  const reached = new Set(changedFiles);
  for (const l of report.links) if (l.direction === 'dependent' && !String(l.to).includes(':')) reached.add(l.to);
  return reached;
}

/**
 * Which lessons a change reaches, and why. A lesson is flagged only when a file that renders one
 * of its screens was changed or is reached by the change (SC-5: 0 extra, 0 missed). A screen with
 * no recorded files cannot be judged; it is listed as unmapped, never silently passed.
 */
export function staleLessons({ manifest, reachByCommit }) {
  const flagged = [];
  const unmapped = new Set();
  for (const [id, l] of Object.entries(manifest.lessons ?? {})) {
    const reached = reachByCommit(l.commit ?? null);
    const because = new Set();
    for (const sc of l.screens ?? []) {
      const files = manifest.screenFiles?.[sc];
      if (!files?.length) {
        unmapped.add(sc);
        continue;
      }
      for (const f of files) if (reached === null || reached.has(f)) because.add(reached === null ? '(a change too broad to list)' : f);
    }
    if (because.size) flagged.push({ lesson: id, title: l.title, version: l.version, screens: l.screens, because: [...because] });
  }
  return { flagged, unmapped: [...unmapped] };
}

/** Run the check for every lesson (grouped by the commit each was built at) and record the flags. */
export async function markStale({ root, outDir, changed = null }) {
  const manifest = readManifest(outDir);
  const engine = await loadImpactEngine(root);
  if (!engine) throw new Error('the Change Impact engine (_wxAI/impact/) is not in this project; update the kit');
  const cache = new Map();
  const reachByCommit = (commit) => {
    if (!cache.has(commit)) cache.set(commit, reachOf(engine, root, changed ?? changedSince(root, commit)));
    return cache.get(commit);
  };
  const result = staleLessons({ manifest, reachByCommit });
  const file = join(root, STALE_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2) + '\n');
  return result;
}

export function readStale(root) {
  try {
    return JSON.parse(readFileSync(join(root, STALE_FILE), 'utf8'));
  } catch {
    return { flagged: [], unmapped: [] };
  }
}

/** After --stale regenerated them, the lessons are current again. */
export function clearStale(root, ids) {
  const file = join(root, STALE_FILE);
  if (!existsSync(file)) return;
  const s = readStale(root);
  s.flagged = s.flagged.filter((f) => !ids.includes(f.lesson));
  writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
}
// [SCOPE 138 / T007] END

// [SCOPE 138 / T012] BEGIN — Generation log (FR-011): one teaching_skill_generated record per run
/** Find the kit's agreement library (SCOPE-137) by walking up from here or from the project root. */
async function loadAgreementLib(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const lib = join(dir, '_wxAI', 'impact', 'lib', 'agreement.mjs');
    if (existsSync(lib)) return import(pathToFileURL(lib).href);
    if (dirname(dir) === dir) return null;
  }
}

/**
 * The generation record: who, when, app version, screens, lessons written and which were stale.
 * No learner data exists here to record. Offline, it waits in the kit's queue.
 */
export function generationEvent({ projectId, actor, appVersion, summary, stale, source }) {
  return {
    projectId,
    type: 'teaching_skill_generated',
    source: 'cli',
    actor,
    rawContent: `${actor} generated ${summary.written.length} teaching lesson(s) for app version ${appVersion}${stale.length ? ` (${stale.length} stale)` : ''}`,
    metadata: {
      appVersion: String(appVersion),
      source,
      screens: summary.screens.slice(0, 500),
      lessonsWritten: summary.written.map((w) => ({ id: w.id, version: w.version })).slice(0, 500),
      stale: stale.slice(0, 500),
      totalLessons: summary.lessons,
      occurredAt: new Date().toISOString(),
    },
  };
}

export async function logGeneration({ root, appVersion, summary, stale = [], source, actor, send = null }) {
  const lib = await loadAgreementLib(root) ?? await loadAgreementLib(dirname(fileURLToPath(import.meta.url)));
  if (!lib) return { sent: false, queued: false, skipped: 'the kit agreement library was not found' };
  const projectId = lib.projectIdFor(root);
  if (!projectId) return { sent: false, queued: false, skipped: 'no wxKanban project id configured' };
  const event = generationEvent({ projectId, actor, appVersion, summary, stale, source });
  return lib.recordAgreement(root, event, send ?? lib.mcpSender(lib.mcpConnection(root)));
}
// [SCOPE 138 / T012] END

// [SCOPE 138 / T002] BEGIN — CLI: env, build, check (FR-001, FR-004)
// MODIFIED-BY: [SCOPE 138 / T009] — --source is optional; the inventory says where it came from
// MODIFIED-BY: [SCOPE 138 / T007] — `stale` flags the lessons a change reaches; `build --stale` regenerates only those
function appVersionOf(root, explicit) {
  if (explicit) return explicit;
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function main(argv) {
  const [cmd] = argv;
  const arg = (n, d = null) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
  };
  const root = process.cwd();
  const workspace = resolve(arg('workspace', 'docs-workspace'));
  const outDir = resolve(arg('out', join('docs', 'teaching-skills')));
  const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
  try {
    if (cmd === 'env') {
      const envs = setEnvironments(workspace, { uat: list(arg('uat')), production: list(arg('production')) });
      process.stdout.write(`Recorded. UAT: ${envs.uat.join(', ') || '(none)'} · Production: ${envs.production.join(', ')}\n`);
      return 0;
    }
    if (cmd === 'stale') {
      const r = await markStale({ root, outDir, changed: arg('changed') ? list(arg('changed')) : null });
      process.stdout.write(r.flagged.length
        ? `${r.flagged.length} lesson(s) to regenerate: ${r.flagged.map((f) => `${f.lesson} (screens ${f.screens.join(', ')})`).join('; ')}. Re-walk those screens, then run "build --stale".\n`
        : 'No lesson is reached by the changes.\n');
      if (r.unmapped.length) process.stdout.write(`Not judged (no files recorded for these screens): ${r.unmapped.join(', ')}\n`);
      return 0;
    }
    if (cmd === 'check') {
      const inv = JSON.parse(readFileSync(join(workspace, 'inventory.json'), 'utf8'));
      const cov = coverage(inv.processes ?? [], Object.keys(readManifest(outDir).lessons));
      process.stdout.write(JSON.stringify({ processes: (inv.processes ?? []).length, ...cov }, null, 2) + '\n');
      return cov.missing.length || cov.extra.length ? 1 : 0;
    }
    if (cmd === 'build') {
      const appVersion = appVersionOf(root, arg('app-version'));
      const sourceArg = arg('source');
      const stale = argv.includes('--stale');
      const only = stale ? readStale(root).flagged.map((f) => f.lesson) : arg('only') ? list(arg('only')) : null;
      if (stale && !only.length) {
        process.stdout.write('No lesson is flagged stale. Run "stale" first.\n');
        return 0;
      }
      const summary = buildLessons({ workspace, outDir, appVersion, source: sourceArg, only, root });
      if (stale) clearStale(root, only);
      const source = summary.source;
      const logged = await logGeneration({ root, appVersion, summary, stale: only ?? [], source, actor: process.env.USERNAME ?? process.env.USER ?? 'developer' });
      process.stdout.write(`${summary.written.length} lesson(s) written to ${relative(root, outDir) || '.'}; bundle ${relative(root, summary.bundle)}.\n`);
      if (summary.coverage.missing.length || summary.coverage.extra.length) {
        process.stdout.write(`Coverage: missing ${summary.coverage.missing.join(', ') || 'none'}; extra ${summary.coverage.extra.join(', ') || 'none'}\n`);
      }
      process.stdout.write(`Generation log: ${logged.sent ? 'recorded in wxKanban' : logged.queued ? 'queued (offline)' : logged.skipped ?? 'not recorded'}\n`);
      return summary.coverage.missing.length ? 1 : 0;
    }
  } catch (e) {
    process.stderr.write(`teach: ${e instanceof Error ? e.message : e}\n`);
    return 2;
  }
  process.stderr.write('Usage: teach.mjs env --uat <urls> --production <urls> | build [--app-version x] [--source walk|definitions] [--only a,b] [--stale] | stale [--changed a,b] | check\n');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
// [SCOPE 138 / T002] END
