// Nightly Testing: the background helper's Observations (SCOPE-140 FR-007).
//
// While the main run tests, a helper explores the app as the normal user, in its own session and
// account, and applies the usability pass to live screens. What it finds is an Observation:
//   - anything more than 3 clicks from the signed-in home, with the click path;
//   - fields out of flow order: tab order against visual order, a required field after optional
//     ones, related fields split apart;
//   - other odd issues (an unlabeled field, a page that errored).
// An Observation is never pass/fail. Each one is reported once, by screen and issue, and tracked
// until fixed or dismissed. The helper runs only when the machine can carry a second agent.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// [SCOPE 140 / T007] BEGIN — Usability analysis of a crawled app: click depth and field order (FR-007)
export const MAX_CLICKS = 3;

/** Breadth-first click depth from home. graph: { page: [{ to, label }] }. Pages deeper than 3 come back with their path. */
export function deepPages(graph, home, maxClicks = MAX_CLICKS) {
  const seen = new Map([[home, []]]);
  const queue = [home];
  while (queue.length) {
    const page = queue.shift();
    for (const link of graph[page] ?? []) {
      if (seen.has(link.to)) continue;
      seen.set(link.to, [...seen.get(page), link.label || link.to]);
      queue.push(link.to);
    }
  }
  return [...seen.entries()].filter(([, path]) => path.length > maxClicks).map(([page, path]) => ({ page, clicks: path.length, path }));
}

/**
 * Field-order issues on one form. fields, in tab order: [{ name, label, required, x, y, group }].
 * Visual order is top to bottom, then left to right (fields within 8 px vertically share a row).
 */
export function fieldOrderIssues(fields) {
  const issues = [];
  const visual = [...fields].sort((a, b) => (Math.abs(a.y - b.y) <= 8 ? a.x - b.x : a.y - b.y));
  const tabNames = fields.map((f) => f.name);
  const visualNames = visual.map((f) => f.name);
  if (tabNames.join('|') !== visualNames.join('|')) {
    const at = tabNames.findIndex((n, i) => n !== visualNames[i]);
    issues.push({ issue: 'tab-order', detail: `tab order leaves the visual order at "${fields[at].label || fields[at].name}" (tab goes to it where the eye expects "${visual[at].label || visual[at].name}")` });
  }
  const firstOptional = visual.findIndex((f) => !f.required);
  const lateRequired = firstOptional < 0 ? [] : visual.slice(firstOptional).filter((f) => f.required);
  if (lateRequired.length) {
    issues.push({ issue: 'required-after-optional', detail: `required ${lateRequired.map((f) => `"${f.label || f.name}"`).join(', ')} come after optional fields` });
  }
  const groups = visual.map((f) => f.group).filter(Boolean);
  const split = [...new Set(groups)].filter((g) => {
    const idx = visual.map((f, i) => (f.group === g ? i : -1)).filter((i) => i >= 0);
    return idx.length > 1 && idx[idx.length - 1] - idx[0] + 1 !== idx.length;
  });
  for (const g of split) issues.push({ issue: 'group-split', detail: `the "${g}" fields are split by unrelated fields` });
  const unlabeled = fields.filter((f) => !f.label);
  if (unlabeled.length) issues.push({ issue: 'unlabeled', detail: `${unlabeled.length} field(s) have no label: ${unlabeled.map((f) => f.name).join(', ')}` });
  return issues;
}

/** Observations from one crawl: { graph, home, forms: [{ screen, fields }], errors: [{ screen, detail }] }. */
export function observationsFrom(crawl) {
  const out = [];
  for (const d of deepPages(crawl.graph ?? {}, crawl.home)) {
    out.push({ screen: d.page, issue: 'click-depth', detail: `${d.clicks} clicks from home: ${d.path.join(' > ')}` });
  }
  for (const form of crawl.forms ?? []) {
    for (const i of fieldOrderIssues(form.fields ?? [])) out.push({ screen: form.screen, ...i });
  }
  for (const e of crawl.errors ?? []) out.push({ screen: e.screen, issue: 'odd', detail: e.detail });
  return out;
}
// [SCOPE 140 / T007] END

// [SCOPE 140 / T007] BEGIN — The Observation register: reported once, tracked until fixed or dismissed
export const OBSERVATIONS_FILE = join('.wxai', 'nightly', 'observations.json');
export const observationKey = (o) => `${o.screen}::${o.issue}`;

export function readObservations(root) {
  try {
    return JSON.parse(readFileSync(join(root, OBSERVATIONS_FILE), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Merge tonight's findings. New ones are returned to report (once); ones seen before are not.
 * An open Observation not seen tonight on a screen the helper visited is marked fixed. Dismissed
 * ones stay dismissed and are never reported again.
 */
export function mergeObservations(register, found, { visited = [], runId, now = new Date() } = {}) {
  const fresh = [];
  const seen = new Set();
  for (const o of found) {
    const key = observationKey(o);
    seen.add(key);
    const prior = register[key];
    if (!prior || prior.state === 'fixed') {
      register[key] = { ...o, state: 'open', firstSeen: now.toISOString(), lastSeen: now.toISOString(), runId };
      fresh.push(register[key]);
    } else {
      prior.lastSeen = now.toISOString();
      prior.detail = o.detail;
    }
  }
  const visitedSet = new Set(visited);
  for (const [key, o] of Object.entries(register)) {
    if (o.state === 'open' && !seen.has(key) && visitedSet.has(o.screen)) {
      o.state = 'fixed';
      o.fixedAt = now.toISOString();
    }
  }
  return { fresh, open: Object.values(register).filter((o) => o.state === 'open') };
}

export function dismissObservation(register, key, reason) {
  if (!register[key]) return false;
  register[key].state = 'dismissed';
  register[key].dismissedReason = reason ?? null;
  return true;
}

export function writeObservations(root, register) {
  const file = join(root, OBSERVATIONS_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(register, null, 2) + '\n');
}
// [SCOPE 140 / T007] END

// [SCOPE 140 / T007] BEGIN — Whether the machine can carry the helper (wxG-O-D machine-capacity.mjs)
/** Finds machine-capacity.mjs in the project or the kit and asks how many agents fit right now. */
export function helperCapacity(root, { run = spawnSync } = {}) {
  const candidates = [
    join(root, '.claude', 'skills', 'wxG-O-D', 'scripts', 'machine-capacity.mjs'),
    join(root, '_wxAI', 'skills', 'wxG-O-D', 'scripts', 'machine-capacity.mjs'),
  ];
  const script = candidates.find((c) => existsSync(c));
  if (!script) return { allowed: false, reason: 'machine-capacity.mjs not found; the helper is skipped' };
  const r = run(process.execPath, [script, '--json'], { encoding: 'utf8', windowsHide: true });
  try {
    const out = JSON.parse(r.stdout);
    const now = out.rightNow ?? out.right_now ?? out.now ?? out.maxNow;
    if (typeof now !== 'number') return { allowed: false, reason: 'machine-capacity.mjs gave no "right now" figure; the helper is skipped' };
    return now >= 2 ? { allowed: true, rightNow: now } : { allowed: false, rightNow: now, reason: `the machine can carry only ${now} agent right now; the helper is skipped this run` };
  } catch {
    return { allowed: false, reason: 'machine-capacity.mjs output could not be read; the helper is skipped' };
  }
}
// [SCOPE 140 / T007] END

// [SCOPE 140 / T007] BEGIN — Crawl the live app as the normal user (Playwright page, own session)
/**
 * Collect the graph, forms and errors the analysis reads. Same-origin links only, at most
 * `maxPages`, never following a link that logs out or deletes. Field geometry comes from the
 * rendered page; tab order is the order focusable fields are reached.
 */
export async function crawl(page, appUrl, { maxPages = 40, skip = /logout|sign-?out|delete|remove/i, timeoutMs = 20_000 } = {}) {
  const origin = new URL(appUrl).origin;
  const norm = (u) => {
    const x = new URL(u, appUrl);
    return x.origin === origin ? `${x.pathname}${x.search}` : null;
  };
  const home = norm(appUrl);
  const graph = {};
  const forms = [];
  const errors = [];
  const queue = [home];
  const visited = [];
  while (queue.length && visited.length < maxPages) {
    const screen = queue.shift();
    if (graph[screen]) continue;
    graph[screen] = [];
    visited.push(screen);
    try {
      const res = await page.goto(new URL(screen, origin).toString(), { timeout: timeoutMs });
      if (res && res.status() >= 500) errors.push({ screen, detail: `the page answered HTTP ${res.status()}` });
      await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
    } catch (e) {
      errors.push({ screen, detail: `the page did not load: ${String(e?.message ?? e).split('\n')[0].slice(0, 160)}` });
      continue;
    }
    const snap = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.getAttribute('href'), label: (a.textContent || '').trim().slice(0, 60) }));
      const labelFor = (el) => {
        if (el.id) {
          const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (l) return l.textContent.trim();
        }
        const wrap = el.closest('label');
        return (wrap?.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim();
      };
      const formsOut = [...document.querySelectorAll('form')].map((f) => {
        const els = [...f.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')];
        const ordered = els
          .map((el, dom) => ({ el, dom, ti: el.tabIndex > 0 ? el.tabIndex : Number.MAX_SAFE_INTEGER }))
          .sort((a, b) => a.ti - b.ti || a.dom - b.dom);
        return ordered.map(({ el }) => {
          const r = el.getBoundingClientRect();
          return {
            name: el.name || el.id || el.type,
            label: labelFor(el),
            required: el.required || el.getAttribute('aria-required') === 'true',
            x: Math.round(r.left),
            y: Math.round(r.top),
            group: el.closest('fieldset')?.querySelector('legend')?.textContent?.trim() || el.dataset.group || null,
          };
        });
      });
      return { links, forms: formsOut };
    });
    snap.forms.forEach((fields, i) => fields.length && forms.push({ screen: snap.forms.length > 1 ? `${screen}#form${i + 1}` : screen, fields }));
    for (const l of snap.links) {
      if (!l.href || l.href.startsWith('#') || skip.test(l.href) || skip.test(l.label)) continue;
      let to;
      try {
        to = norm(l.href);
      } catch {
        continue;
      }
      if (!to) continue;
      graph[screen].push({ to, label: l.label });
      if (!graph[to] && !queue.includes(to)) queue.push(to);
    }
  }
  return { home, graph, forms, errors, visited };
}
// [SCOPE 140 / T007] END
