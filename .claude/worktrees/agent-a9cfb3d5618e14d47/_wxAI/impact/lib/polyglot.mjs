// Links for files the engine reads through a language profile (SCOPE-137 FR-005).
//
// Every link here is Likely: profiles match text, they do not resolve symbols.
// What they find still matters — a Python handler change reaching the React
// screen that calls it, or two Ruby models sharing a table — and saying "Likely"
// is honest where saying nothing would read as "nothing affected".

import { basename, extname } from 'node:path';
import { profileFor } from './profiles.mjs';
import { urlMatchesRoute } from './routes.mjs';

// [SCOPE 137 / T007] BEGIN — Profile-read facts for one file (pure; cached per file)
function collect(res, src, group = 1) {
  const out = new Set();
  for (const re of res) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) if (m[group]) out.add(m[group]);
  }
  return [...out];
}

/** Facts for a non-JS file: { lang, imports, routes: [[METHOD, path]], w, r, env }, or null. */
// MODIFIED-BY: [SCOPE 137 / T015] — joins class-level route bases to method routes
export function extractPolyglot(src, file) {
  const p = profileFor(file);
  if (!p) return null;
  const clean = (raw) => raw.replace(/\{(\w+)(?::[^}]*)?\}/g, ':$1').replace(/\/+/g, '/');
  const bases = [];
  const declared = [];
  for (const { re, method, path, prefix, base } of p.routes) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (base) bases.push({ path: m[path], mode: base });
      else declared.push({ method: method ? m[method].toUpperCase() : 'ANY', path: m[path], prefix: prefix ?? '' });
    }
  }
  const routes = bases.map((b) => ['ANY', clean('/' + b.path.replace(/^~?\//, ''))]);
  for (const d of declared) {
    const absolute = /^~?\//.test(d.path);
    const joinTo = bases.filter((b) => b.mode === 'always' || !absolute);
    if (!joinTo.length) routes.push([d.method, clean(d.prefix + d.path.replace(/^~?\/?/, '/'))]);
    for (const b of joinTo) routes.push([d.method, clean(`/${b.path.replace(/^~?\//, '')}/${d.path.replace(/^~?\//, '')}`.replace(/\/$/, '') || '/')]);
  }
  return {
    lang: p.lang,
    imports: collect(p.imports, src),
    routes,
    w: collect(p.dataWrite, src).map((x) => x.toLowerCase()),
    r: collect(p.dataRead, src).map((x) => x.toLowerCase()),
    env: collect(p.env, src),
  };
}
// [SCOPE 137 / T007] END

// [SCOPE 137 / T007] BEGIN — Profile-read links for a change set (all Likely)
// MODIFIED-BY: [SCOPE 137 / T015] — each link names its profile, so a proven profile can be labeled Confirmed
const moduleName = (file) => basename(file, extname(file)).toLowerCase();
const lastSegment = (token) => token.split(/[./\\:]/).filter(Boolean).pop()?.toLowerCase() ?? '';

/**
 * Links reached from changed files that a profile reads:
 *  - imports: a file importing a module whose last segment is the changed file's name
 *  - routes: a JS client URL matching a route the changed file declares
 *  - data: a file reading or writing a table or model the changed file writes
 * Env vars are fed to the named-string links instead (see change-impact.mjs).
 */
export function polyglotLinks({ changedFiles, facts, clientUrls }) {
  const links = [];
  const seen = new Set();
  const push = (l) => {
    const k = `${l.type}|${l.from}|${l.to}|${l.via}`;
    if (!seen.has(k)) {
      seen.add(k);
      links.push(l);
    }
  };
  const poly = [...facts].filter(([, f]) => f?.poly).map(([file, f]) => [file, f.poly]);
  for (const changed of changedFiles) {
    const mine = facts.get(changed)?.poly;
    if (!mine) continue;
    const name = moduleName(changed);
    for (const [file, f] of poly) {
      if (file === changed) continue;
      if (f.imports.some((t) => lastSegment(t) === name)) {
        push({ type: 'import', direction: 'dependent', from: changed, to: file, via: `imports ${name} (${f.lang} profile)`, profile: mine.lang, confidence: 'Likely' });
      }
      const shared = mine.w.filter((t) => f.r.includes(t) || f.w.includes(t));
      if (shared.length) {
        push({ type: 'table', direction: 'dependent', from: changed, to: file, via: `table:${shared[0]}`, access: f.w.includes(shared[0]) ? 'write' : 'read', confidence: 'Likely', why: `writes ${shared.join(', ')}`, profile: mine.lang });
      }
    }
    for (const [method, path] of mine.routes) {
      for (const [clientFile, urls] of clientUrls) {
        if (urls.some((u) => urlMatchesRoute(u, path))) {
          push({ type: 'url-route', direction: 'dependent', from: changed, to: clientFile, via: `route:${method} ${path} (${mine.lang} profile)`, profile: mine.lang, confidence: 'Likely' });
        }
      }
    }
  }
  return links;
}
// [SCOPE 137 / T007] END

// [SCOPE 137 / T007] BEGIN — Generic text fallback for files no parser or profile reads (FR-004)
/**
 * The last resort, so an unreadable change is never reported as "0 affected":
 * every source file that mentions the changed file's name as a whole word is a
 * Likely dependent. Coarse on purpose — it is labeled as a text match.
 */
export function textFallbackLinks({ changedFiles, readText, files }) {
  const links = [];
  for (const changed of changedFiles) {
    const name = basename(changed, extname(changed));
    if (name.length < 3) continue;
    const escaped = name.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b' + escaped + '\\b');
    for (const file of files) {
      if (file === changed) continue;
      const src = readText(file);
      if (src && re.test(src)) {
        links.push({ type: 'import', direction: 'dependent', from: changed, to: file, via: `text mention of ${name}`, confidence: 'Likely', fallback: true });
      }
    }
  }
  return links;
}
// [SCOPE 137 / T007] END
