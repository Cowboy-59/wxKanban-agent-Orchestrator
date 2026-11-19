// Client URL → server route links for the Change Impact engine (SCOPE-137 FR-002 (3)).
//
// A screen calls the server by URL text — fetch(`/api/projects/${id}/tasks`) —
// never by import, so the import graph cannot connect a route handler to the
// screens that use it. Measured on wxKanban: 360 client calls link only this
// way. This module rebuilds the full route table from Express mounts and route
// definitions, then matches client URL templates against it, segment by segment.
// Matching is textual, so every link is labeled Likely.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// [SCOPE 137 / T004] BEGIN — URL → route (FR-002 (3)): Express mounts and route definitions
// MODIFIED-BY: [SCOPE 137 / T003] — extraction split out (pure, cached per file); builders accept facts
const IMPORT_DEFAULT_RE = /import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s+from\s+['"]([^'"]+)['"]/g;
const IMPORT_NAMED_RE = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
const MOUNT_RE = /\.use\(\s*(['"`])(\/[^'"`]*)\1\s*,([^;]*?)\)\s*;/g;
const ROUTE_RE = /\b(\w+)\.(get|post|put|patch|delete|all)\(\s*(['"`])(\/[^'"`]*)\3/g;

/**
 * Routing facts of one source text (pure; cached per file — T003):
 * { imports: [[local, spec]], mounts: [[prefix, ident]], routes: [[METHOD, path]] }.
 */
export function extractRouteFacts(src) {
  const facts = { imports: [], mounts: [], routes: [] };
  if (!/\.(use|get|post|put|patch|delete|all)\(\s*['"`]\//.test(src)) return facts;
  let m;
  IMPORT_DEFAULT_RE.lastIndex = 0;
  while ((m = IMPORT_DEFAULT_RE.exec(src)) !== null) facts.imports.push([m[1], m[2]]);
  IMPORT_NAMED_RE.lastIndex = 0;
  while ((m = IMPORT_NAMED_RE.exec(src)) !== null) {
    for (const part of m[1].split(',')) {
      const local = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (local) facts.imports.push([local, m[2]]);
    }
  }
  MOUNT_RE.lastIndex = 0;
  while ((m = MOUNT_RE.exec(src)) !== null) {
    const ident = m[3].trim().match(/(\w+)\s*$/)?.[1];
    if (ident) facts.mounts.push([m[2], ident]);
  }
  ROUTE_RE.lastIndex = 0;
  while ((m = ROUTE_RE.exec(src)) !== null) facts.routes.push([m[2].toUpperCase(), m[4]]);
  return facts;
}

const joinPath = (a, b) => (`${a.replace(/\/$/, '')}/${b.replace(/^\//, '')}`).replace(/\/$/, '') || '/';

/**
 * Build the route table: [{ file, method, path }], with every mount prefix applied.
 * Nested routers (router.use('/sub', child)) are followed up to five levels.
 */
export function scanRoutes(root, files, resolveSpecifier, facts = null) {
  const sources = new Map(); // file -> route facts
  for (const file of files) {
    if (/(^|\/)(client|components|pages|public)\//.test(file)) continue; // server side only
    let rf = facts?.get(file)?.route;
    if (!rf) {
      let src;
      try {
        src = readFileSync(join(root, file), 'utf8');
      } catch {
        continue;
      }
      rf = extractRouteFacts(src);
    }
    if (rf.mounts.length || rf.routes.length) sources.set(file, rf);
  }

  // prefixes: file -> Set(prefix). A file nobody mounts keeps its own paths as written.
  const mounts = []; // { parent, prefix, child }
  for (const [file, rf] of sources) {
    const imports = new Map();
    for (const [local, spec] of rf.imports) {
      const target = resolveSpecifier(file, spec);
      if (target) imports.set(local, target);
    }
    for (const [prefix, ident] of rf.mounts) {
      const child = imports.get(ident);
      if (child) mounts.push({ parent: file, prefix, child });
    }
  }
  const prefixes = new Map();
  const mountedChildren = new Set(mounts.map((x) => x.child));
  for (const file of sources.keys()) if (!mountedChildren.has(file)) prefixes.set(file, new Set(['']));
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const { parent, prefix, child } of mounts) {
      for (const p of prefixes.get(parent) ?? []) {
        const full = joinPath(p, prefix);
        if (!prefixes.has(child)) prefixes.set(child, new Set());
        if (!prefixes.get(child).has(full)) {
          prefixes.get(child).add(full);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const routes = [];
  for (const [file, rf] of sources) {
    for (const [method, path] of rf.routes) {
      for (const p of prefixes.get(file) ?? ['']) routes.push({ file, method, path: joinPath(p, path) });
    }
  }
  return routes;
}
// [SCOPE 137 / T004] END

// [SCOPE 137 / T004] BEGIN — URL → route (FR-002 (3)): client URL calls and segment matching
// MODIFIED-BY: [SCOPE 137 / T003] — extraction split out (pure, cached per file); builders accept facts
const CLIENT_URL_RE = /(['"`])(\/api\/[^'"`\s]*)\1/g;

/** URL templates in one source text (pure; cached per file — T003). */
export function extractClientUrls(src) {
  if (!src.includes('/api/')) return [];
  const urls = new Set();
  CLIENT_URL_RE.lastIndex = 0;
  let m;
  while ((m = CLIENT_URL_RE.exec(src)) !== null) urls.add(m[2].split('?')[0]);
  return [...urls];
}

/** Client-side URL templates per file: Map(file -> [url]); an interpolated part stays as a dynamic marker. */
export function scanClientUrls(root, files, facts = null) {
  const byFile = new Map();
  for (const file of files) {
    if (!/(^|\/)(client|components|pages|app|web|frontend)\//.test(file) && !/\.(tsx|jsx|vue|svelte|astro)$/.test(file)) continue;
    let urls = facts?.get(file)?.urls;
    if (!urls) {
      let src;
      try {
        src = readFileSync(join(root, file), 'utf8');
      } catch {
        continue;
      }
      urls = extractClientUrls(src);
    }
    if (urls.length) byFile.set(file, urls);
  }
  return byFile;
}

// [SCOPE 137 / T004] END

// [SCOPE 137 / T004] BEGIN — URL → route (FR-002 (3)): segment matching of a URL template against a route
const DYNAMIC_MARK = '$' + '{'; // a template-literal interpolation in a client URL
const segs = (p) => p.replace(/\/$/, '').split('/').filter(Boolean);

/** True when a client URL template can hit a route path (an interpolated segment matches any one segment). */
export function urlMatchesRoute(url, routePath) {
  const u = segs(url);
  const r = segs(routePath);
  if (u.length !== r.length) return false;
  return r.every((rs, i) => rs === u[i] || rs.startsWith(':') || u[i].includes(DYNAMIC_MARK) || rs === '*');
}
// [SCOPE 137 / T004] END

// [SCOPE 137 / T004] BEGIN — URL → route (FR-002 (3)): links for a change set
/**
 * For each route file the change touches (directly, or reached through imports),
 * every client file whose URLs hit one of its routes is a Likely dependent; a
 * changed client file relies on the route files it calls.
 */
export function urlRouteLinks({ changedFiles, reachedFiles, routes, clientUrls }) {
  const links = [];
  const seen = new Set();
  const routesByFile = new Map();
  for (const r of routes) {
    if (!routesByFile.has(r.file)) routesByFile.set(r.file, []);
    routesByFile.get(r.file).push(r);
  }
  const touchedRouteFiles = [...new Set([...changedFiles, ...reachedFiles])].filter((f) => routesByFile.has(f));
  for (const routeFile of touchedRouteFiles) {
    const origin = changedFiles.includes(routeFile) ? routeFile : changedFiles.join(', ');
    for (const [clientFile, urls] of clientUrls) {
      if (changedFiles.includes(clientFile)) continue;
      const hit = routesByFile.get(routeFile).find((r) => urls.some((u) => urlMatchesRoute(u, r.path)));
      if (!hit) continue;
      const key = `${routeFile}|${clientFile}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ type: 'url-route', direction: 'dependent', from: origin, to: clientFile, via: `route:${hit.method} ${hit.path} (${routeFile})`, confidence: 'Likely' });
    }
  }
  for (const file of changedFiles) {
    for (const u of clientUrls.get(file) ?? []) {
      const hit = routes.find((r) => urlMatchesRoute(u, r.path));
      if (hit) links.push({ type: 'url-route', direction: 'dependency', from: file, to: hit.file, via: `route:${hit.method} ${hit.path}`, confidence: 'Likely' });
    }
  }
  return links;
}
// [SCOPE 137 / T004] END
