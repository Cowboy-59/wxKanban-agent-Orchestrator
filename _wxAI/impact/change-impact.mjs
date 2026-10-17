#!/usr/bin/env node
// Change Impact check — the single entry point every caller uses (SCOPE-137 FR-001).
//
// Given a change set, writes .wxai/impact.json (machine-readable, read by the
// Claude Code hook and the Cockpit) and .wxai/impact-summary.md (human-readable),
// and prints the JSON to stdout.
//
// Honest by construction (FR-004): every report names the link types it checked
// and the ones it did not, and lists changed files the engine could not read.
// A partial list that looks complete is worse than none.
//
// Usage:
//   node _wxAI/impact/change-impact.mjs --changed "src/a.ts,src/b.ts" [--root .] [--out .wxai/impact.json]
//   node _wxAI/impact/change-impact.mjs --base <ref> [--head HEAD] [--root .]
//   node _wxAI/impact/change-impact.mjs --working        (uncommitted changes vs HEAD)
//   options: --mode notify|boundaries|always (else .wxai/project.json impactMode, default boundaries)
//            --signoffs <file.json> (sign-offs the change would undo, when the caller knows them)
//            --before <file> (the one changed file as it was before a hand edit; else HEAD is compared)
//            --no-write (write no file; add --no-cache to skip the facts cache too) --summary (print the readable summary)
// Exit 3 when the decision is stop (possible data loss), in every mode.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { analyzeChange, norm, SOURCE_EXT, classifyEdgeless, extractImports, gitVisibleFiles, walkSourceFiles } from './lib/graph.mjs';
import { scanSchema, scanTableUsage, dataLinks, extractSchemaDecls, extractTableTokens } from './lib/data.mjs';
import { scanNamedStrings, namedStringLinks, extractKeys } from './lib/strings.mjs';
import { scanScopes, scopeLinks, fencedScopes } from './lib/scopes.mjs';
import { scanRoutes, scanClientUrls, urlRouteLinks, extractRouteFacts, extractClientUrls } from './lib/routes.mjs';
import { loadFacts } from './lib/facts.mjs';
import { loadTypeScript, exportedDeclarations, changedExports, exportUsage } from './lib/exports.mjs';
import { readFileSync } from 'node:fs';
import { extractPolyglot, polyglotLinks, textFallbackLinks } from './lib/polyglot.mjs';
import { profileFor, PROFILE_EXT } from './lib/profiles.mjs';
import { provenTypes } from './fixtures/index.mjs';
import { classifyImpact, dataLossChanges, decide, IMPACT_MODES, readImpactMode, scopesAtLines } from './lib/classify.mjs';

// [SCOPE 137 / T003] BEGIN — Every fact for one file, from a single read (FR-003)
// MODIFIED-BY: [SCOPE 137 / T007] — files a language profile reads get profile facts instead (FR-005)
export function extractAll(src, file = '') {
  const poly = file ? extractPolyglot(src, file) : null;
  if (poly) {
    return {
      imports: [], schema: [], tables: { w: [], r: [], rw: [], rr: [], cw: [], cr: [] },
      keys: poly.env.map((k) => 'env:' + k),
      scopes: src.includes('[SCOPE') ? fencedScopes(src) : [],
      route: { imports: [], mounts: [], routes: [] }, urls: [], poly,
    };
  }
  return {
    imports: extractImports(src),
    schema: extractSchemaDecls(src),
    tables: extractTableTokens(src),
    keys: [...extractKeys(src)],
    scopes: src.includes('[SCOPE') ? fencedScopes(src) : [],
    route: extractRouteFacts(src),
    urls: extractClientUrls(src),
  };
}
// [SCOPE 137 / T003] END

// [SCOPE 137 / T003] BEGIN — Changed line ranges: given explicitly, or from git diff hunks (FR-002 (2))
/** "a.ts:10-40;b.ts:5" → Map(file -> [[start, end]]). */
export function parseLines(spec) {
  const map = new Map();
  for (const part of (spec ?? '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const i = part.lastIndexOf(':');
    const file = norm(part.slice(0, i));
    for (const r of part.slice(i + 1).split(',')) {
      const [a, b] = r.split('-').map(Number);
      if (!map.has(file)) map.set(file, []);
      map.get(file).push([a, Number.isFinite(b) ? b : a]);
    }
  }
  return map;
}

/** Ranges of new-file lines changed vs HEAD, from `git diff -U0` hunk headers. */
export function diffRanges(root, file) {
  try {
    const out = execFileSync('git', ['diff', '-U0', 'HEAD', '--', file], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const ranges = [];
    for (const m of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      ranges.push([start, Math.max(start, start + count - 1)]);
    }
    return ranges;
  } catch {
    return [];
  }
}
// [SCOPE 137 / T003] END

// [SCOPE 137 / T007] BEGIN — stack.md text, for the declared database (FR-005)
export function readStackMd(root) {
  try {
    return readFileSync(join(root, 'stack.md'), 'utf8');
  } catch {
    return '';
  }
}
// [SCOPE 137 / T007] END

// [SCOPE 137 / T015] BEGIN — Profiles an adapter has proven (`**Links proof:** passed`, SC-8)
/**
 * Profiles named by an adapter (shipped or the project's own) whose links proof
 * line reads `passed`. validate-adapter.mjs refuses that line unless the
 * profile's proof fixture passes, so the engine can trust it here.
 */
export function provenProfiles(root) {
  const out = new Set();
  for (const dir of [join(root, '_wxAI', 'adapters'), join(root, '.wxai', 'adapters')]) {
    let names = [];
    try {
      names = readdirSync(dir).filter((f) => /^[a-z0-9][a-z0-9-]*\.md$/.test(f));
    } catch {
      continue;
    }
    for (const name of names) {
      let src = '';
      try {
        src = readFileSync(join(dir, name), 'utf8');
      } catch {
        continue;
      }
      const profile = /^\*\*Links profile:\*\*\s*([\w-]+)/m.exec(src)?.[1];
      if (profile && profile !== 'native' && /^\*\*Links proof:\*\*\s*passed\b/im.test(src)) out.add(profile);
    }
  }
  return out;
}
// [SCOPE 137 / T015] END

// [SCOPE 137 / T008] BEGIN — Inputs to classification: file text before and after, and whose change it is (FR-006)
// MODIFIED-BY: [SCOPE 137 / T009] — owning scopes read the file on disk, which the line ranges always refer to
/** File types scanned for possible data loss: everything the engine reads, plus SQL. */
const DATA_LOSS_EXT = [...SOURCE_EXT, ...PROFILE_EXT, '.sql'];

function readText(root, file) {
  try {
    return readFileSync(join(root, file), 'utf8');
  } catch {
    return '';
  }
}

/** The file as committed at HEAD; '' for a new file or outside git. */
function gitShow(root, file) {
  try {
    return execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
}

/**
 * The scopes a change belongs to: the fences around the changed lines when the
 * lines are known; else every fence in the changed files; else the project's
 * active scope. Without this a one-line fix inside SCOPE-026's block of a shared
 * file would count SCOPE-058's code in the same file as its own.
 */
function ownScopesFor({ root, changedFiles, ranges, scopesByFile, fallback }) {
  const own = new Set();
  for (const file of changedFiles) {
    const fileRanges = ranges?.get(file);
    if (fileRanges?.length) {
      // Ranges always refer to the file as it is on disk: the diff of the working tree for the
      // CLI, and the lines about to be replaced for the AI-edit hook (which runs before the edit).
      const src = readText(root, file);
      const at = scopesAtLines(src, fileRanges);
      if (at.length) {
        at.forEach((s) => own.add(s));
        continue;
      }
    }
    (scopesByFile.get(file) ?? []).forEach((s) => own.add(s));
  }
  fallback.forEach((s) => {
    if (!ranges) own.add(s);
  });
  if (!own.size) {
    try {
      const active = JSON.parse(readFileSync(join(root, '.wxai', 'project.json'), 'utf8'))?.activeScope;
      if (active) own.add(String(active));
    } catch {
      // no project file: no own scope, so every reached scope counts as another's
    }
  }
  return [...own];
}
// [SCOPE 137 / T008] END

// [SCOPE 137 / T008] BEGIN — Report → graph for report_change_impact (dryRun to ask about sign-offs, FR-006)
/**
 * The graph project.report_change_impact takes, built from a report. Every
 * reached FILE counts as a dependent (import, table, route, named string), so a
 * sign-off on a screen reached only through a shared table is still found.
 * Send it with dryRun: true to ask which live human sign-offs the change would
 * undo; the answer goes back into buildReport as `signoffs`.
 */
export function toImpactGraph(report, commitsha) {
  const seen = new Set();
  const dependents = [];
  for (const l of report.links) {
    if (l.direction !== 'dependent' || String(l.to).includes(':')) continue;
    const key = `${l.from}|${l.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dependents.push({ changedFile: l.from, dependentPath: l.to, path: l.path ?? [l.from, l.to] });
  }
  return {
    commitsha,
    changedFiles: report.changedFiles,
    dependents,
    edgeless: report.edgeless.map((e) => ({ path: e.path, kind: e.kind, tables: e.tables })),
    broad: report.broad,
    broadReason: report.broadReason ?? undefined,
  };
}
// [SCOPE 137 / T008] END

// [SCOPE 137 / T003] BEGIN — Source file list: git's view when available, else the walk (FR-003)
// MODIFIED-BY: [SCOPE 137 / T007] — includes every file a language profile reads (FR-005)
// MODIFIED-BY: [SCOPE 137 / T009] — never indexes the kit's proof fixtures (sample tables and events, not project code)
export function sourceFiles(root) {
  const exts = [...SOURCE_EXT, ...PROFILE_EXT];
  const visible = gitVisibleFiles(root);
  const files = visible
    ? [...visible].filter((f) => exts.some((e) => f.toLowerCase().endsWith(e)))
    : walkSourceFiles(root, root, [], exts);
  // The kit ships these into every project; their sample `items` table would otherwise link
  // to a customer's real `items` table.
  return files.filter((f) => !f.startsWith('_wxAI/impact/fixtures/'));
}
// [SCOPE 137 / T003] END

// [SCOPE 137 / T001] BEGIN — Change Impact CLI (FR-001, FR-004): the eight link types and their confidence
/** The eight link types SCOPE-137 FR-002 defines, with the confidence each carries. */
export const LINK_TYPES = [
  { type: 'import', label: 'Imports, both directions', confidence: 'Confirmed' },
  { type: 'export-usage', label: 'Which exported function is used', confidence: 'Confirmed' },
  { type: 'url-route', label: 'Client URL to server route', confidence: 'Likely' },
  { type: 'table', label: 'Code to table, read or write', confidence: 'Confirmed' },
  { type: 'foreign-key', label: 'Table to table foreign keys', confidence: 'Confirmed' },
  { type: 'migration', label: 'Migration to tables', confidence: 'Confirmed' },
  { type: 'named-string', label: 'Named strings (tool, event, job, env, config)', confidence: 'Likely' },
  { type: 'scope', label: 'Code to scope through fences', confidence: 'Confirmed' },
];

/** Link types this build of the engine actually checks. Grows as SCOPE-137 tasks land. */
// MODIFIED-BY: [SCOPE 137 / T005] — table and foreign-key links are now checked
// MODIFIED-BY: [SCOPE 137 / T006] — named-string and scope links are now checked
// MODIFIED-BY: [SCOPE 137 / T004] — client URL → server route links are now checked
export const CHECKED_TYPES = new Set(['import', 'migration', 'table', 'foreign-key', 'named-string', 'scope', 'url-route']);
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Change Impact CLI (FR-001): argument parsing
// MODIFIED-BY: [SCOPE 137 / T003] — --no-cache, --precise and --lines options
// MODIFIED-BY: [SCOPE 137 / T008] — --mode and --signoffs options
// MODIFIED-BY: [SCOPE 137 / T011] — --before option
// MODIFIED-BY: [SCOPE 137 / T013] — --no-write and --summary options
function readArgs(argv) {
  const arg = (name, fallback = null) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const root = resolve(arg('root', process.cwd()));
  return {
    root,
    base: arg('base', null),
    head: arg('head', 'HEAD'),
    changed: arg('changed', null),
    working: argv.includes('--working'),
    out: resolve(root, arg('out', join('.wxai', 'impact.json'))),
    max: Number(arg('max', '5000')),
    quiet: argv.includes('--quiet'),
    useCache: !argv.includes('--no-cache'),
    precise: argv.includes('--precise'),
    lines: arg('lines', null),
    mode: arg('mode', null),
    signoffs: arg('signoffs', null),
    before: arg('before', null),
    noWrite: argv.includes('--no-write'),
    summary: argv.includes('--summary'),
  };
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Change Impact CLI (FR-001): which files changed
function changedFilesFor(opts) {
  const git = (...a) => execFileSync('git', a, { cwd: opts.root, encoding: 'utf8' }).trim();
  const lines = (s) => s.split('\n').map(norm).filter(Boolean);
  if (opts.changed) return opts.changed.split(',').map((s) => norm(s.trim())).filter(Boolean);
  if (opts.base) return lines(git('diff', '--name-only', `${opts.base}..${opts.head}`));
  if (opts.working) {
    const tracked = lines(git('diff', '--name-only', 'HEAD'));
    const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
    return [...new Set([...tracked, ...untracked])];
  }
  return null;
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Change Impact CLI (FR-001, FR-004): build the report
// MODIFIED-BY: [SCOPE 137 / T005] — adds code→table, foreign-key and migration→code data links
// MODIFIED-BY: [SCOPE 137 / T006] — adds named-string links and the scopes reached (via fences)
// MODIFIED-BY: [SCOPE 137 / T004] — adds client URL → server route links
// MODIFIED-BY: [SCOPE 137 / T003] — reads every file once through the persistent facts cache
// MODIFIED-BY: [SCOPE 137 / T007] — language-profile links, text fallback, languages read, document data model
// MODIFIED-BY: [SCOPE 137 / T015] — a proven profile's links carry the native label for their type (SC-8)
// MODIFIED-BY: [SCOPE 137 / T008] — classification: Impact Boundary, possible data loss, impactMode decision
/**
 * Build the Change Impact report for a change set. Pure apart from reading the
 * repo; callers decide where to write it.
 */
export function buildReport({
  root, changedFiles, max = 5000, useCache = true, precise = false, ranges = null, proven = provenProfiles(root),
  contents = null, signoffs = null, mode = null,
}) {
  const { facts, stats: cacheStats } = loadFacts(root, sourceFiles(root), extractAll, { useCache });
  const files = [...facts.keys()];
  const result = analyzeChange({ root, changedFiles, max, files, facts });
  const links = [];

  // Imports, reverse direction: everything the change reaches.
  for (const r of result.reached) {
    links.push({
      type: 'import',
      direction: 'dependent',
      from: r.changedFile,
      to: r.dependentPath,
      path: r.path,
      confidence: 'Confirmed',
    });
  }
  // Imports, forward direction: what each changed file itself relies on (direct only).
  for (const f of changedFiles) {
    for (const dep of result.dependencies.get(f) ?? []) {
      links.push({ type: 'import', direction: 'dependency', from: f, to: dep, path: [f, dep], confidence: 'Confirmed' });
    }
  }
  // Migrations: the tables they alter.
  for (const e of result.edgeless) {
    if (e.kind !== 'migration') continue;
    for (const table of e.tables ?? []) {
      links.push({ type: 'migration', direction: 'dependent', from: e.path, to: `table:${table}`, path: [e.path], confidence: 'Confirmed' });
    }
  }

  // Data links: code that shares a table never imports each other (FR-002 (4)–(6)).
  if (!result.broad) {
    const schema = scanSchema(root, result.files, facts);
    const usage = scanTableUsage(root, result.files, schema, facts);
    const migrationTablesByFile = new Map(
      result.edgeless.filter((e) => e.kind === 'migration').map((e) => [e.path, e.tables ?? []]),
    );
    links.push(...dataLinks({ changedFiles, schema, usage, migrationTablesByFile }));
    // Named strings: wired by a name, not an import or a table (FR-002 (7)).
    links.push(...namedStringLinks({ changedFiles, index: scanNamedStrings(root, result.files, facts) }));
    // Client URL → server route: screens call handlers by URL text (FR-002 (3)).
    const importReached = result.reached.map((r) => r.dependentPath);
    const clientUrls = scanClientUrls(root, result.files, facts);
    links.push(...urlRouteLinks({
      changedFiles,
      reachedFiles: importReached,
      routes: scanRoutes(root, result.files, result.resolveSpecifier, facts),
      clientUrls,
    }));
    // Stacks read through a language profile (FR-005): imports, routes and data, all Likely.
    links.push(...polyglotLinks({ changedFiles, facts, clientUrls }));
  }

  // Scopes: who owns the changed files and every file the change reaches (FR-002 (8)).
  let scopes = { ownScopes: [], reachedScopes: [], unfencedReached: 0 };
  const scopesByFile = scanScopes(root, result.files, facts);
  if (!result.broad) {
    const reachedFiles = [...new Set(
      links.filter((l) => l.direction === 'dependent' && !String(l.to).includes(':')).map((l) => l.to),
    )];
    const s = scopeLinks({ changedFiles, reachedFiles, scopesByFile });
    links.push(...s.links);
    scopes = { ownScopes: s.ownScopes, reachedScopes: s.reachedScopes, unfencedReached: s.unfencedReached };
  }

  // Function level (ask moment only): which importers use the exports the change touched.
  let functionLevel = null;
  if (precise && !result.broad) {
    const ts = loadTypeScript(root);
    functionLevel = { parser: ts ? 'typescript' : 'line-fallback', files: [] };
    for (const file of changedFiles) {
      if (!result.fileSet.has(file)) continue;
      let src;
      try {
        src = readFileSync(join(root, file), 'utf8');
      } catch {
        continue;
      }
      const fileRanges = ranges?.get(file) ?? diffRanges(root, file);
      const { decls, precise: exact } = exportedDeclarations(src, file, ts);
      const symbols = fileRanges.length ? changedExports(decls, fileRanges) : decls.map((d) => d.name);
      const usage = exportUsage({ root, file, symbols, dependents: result.dependents, resolveSpecifier: result.resolveSpecifier, precise: exact });
      functionLevel.files.push({ file, ranges: fileRanges, symbols, using: usage.using, notUsing: usage.notUsing });
      for (const u of usage.using) {
        links.push({ type: 'export-usage', direction: 'dependent', from: file, to: u.file, via: `uses ${u.symbols.join(', ')}`, confidence: u.confidence });
      }
    }
  }

  // Files the engine cannot read: not a source type it parses, no language profile
  // reads it, and not an edgeless kind it classifies. Reported as not read — never
  // as "0 affected" — and given a text-mention fallback, labeled as such (FR-004).
  const notRead = changedFiles.filter(
    (f) => !SOURCE_EXT.some((e) => f.endsWith(e)) && !profileFor(f) && !classifyEdgeless(f),
  );
  if (notRead.length && !result.broad) {
    const readText = (file) => {
      try {
        return readFileSync(join(root, file), 'utf8');
      } catch {
        return '';
      }
    };
    links.push(...textFallbackLinks({ changedFiles: notRead, readText, files: result.files }));
  }

  // A profile whose proof fixture passed (an adapter says so, and the validator
  // refuses that line otherwise) is labeled as native parsing would label the
  // type. Text-fallback links are never promoted.
  // Only the link types the fixture seeds are promoted: a C# proof covers routes,
  // tables and env vars, not namespace imports.
  for (const l of links) {
    if (l.profile && !l.fallback && proven.has(l.profile) && provenTypes(l.profile).has(l.type)) {
      l.confidence = LINK_TYPES.find((t) => t.type === l.type)?.confidence ?? l.confidence;
    }
  }

  // Which stacks were read, and how (FR-005): native parsing is Confirmed, profiles Likely until proven.
  const languages = {};
  for (const [, f] of facts) {
    const key = f.poly ? f.poly.lang : 'js-ts';
    const provenFor = f.poly && proven.has(f.poly.lang) ? [...provenTypes(f.poly.lang)] : [];
    languages[key] ??= {
      files: 0,
      read: f.poly ? `built-in profile${provenFor.length ? `, proven for ${provenFor.join(', ')}` : ''}` : 'native',
      confidence: f.poly ? 'Likely' : 'Confirmed',
    };
    languages[key].files++;
  }
  // A document database has collections, not foreign keys (FR-005).
  const dataModel = /\|\s*Database\s*\|\s*[^|]*mongo/i.test(readStackMd(root)) ? 'document' : 'relational';

  // Affected = files only; tables, keys and scopes are reported in their own fields.
  const affected = new Set(
    links.filter((l) => l.direction === 'dependent' && !String(l.to).includes(':')).map((l) => l.to),
  );

  // Classification (FR-006, FR-007). Data loss is checked even for a broad change.
  const dataLoss = changedFiles.flatMap((file) => {
    if (!DATA_LOSS_EXT.some((e) => file.toLowerCase().endsWith(e))) return [];
    const given = contents?.get(file);
    const newSrc = given?.new ?? readText(root, file);
    const oldSrc = given?.old ?? gitShow(root, file);
    return dataLossChanges({ file, oldSrc, newSrc });
  });
  const ownScopes = ownScopesFor({ root, changedFiles, ranges, scopesByFile, fallback: scopes.ownScopes });
  const impactMode = mode ? { mode, source: 'caller' } : readImpactMode(root);
  const classification = classifyImpact({
    links: result.broad ? [] : links, ownScopes, scopesByFile, dataLoss, signoffs, mode: impactMode.mode, affected: affected.size,
  });
  if (result.broad) {
    // Too many dependents to list means too many to rule out: treat it as a boundary.
    classification.reasons.push({ kind: 'broad', detail: result.broadReason });
    classification.boundary = true;
    classification.decision = decide(impactMode.mode, { hasImpact: true, boundary: true, dataLoss: dataLoss.length > 0 });
  }
  if (impactMode.warning) classification.warning = impactMode.warning;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    changedFiles,
    linkTypes: {
      // export-usage is checked only when the function-level pass ran (the ask moment).
      checked: LINK_TYPES.filter((t) => (CHECKED_TYPES.has(t.type) || (t.type === 'export-usage' && functionLevel))
        && !(t.type === 'foreign-key' && dataModel === 'document')),
      notChecked: LINK_TYPES.filter((t) => !CHECKED_TYPES.has(t.type) && !(t.type === 'export-usage' && functionLevel)),
      notApplicable: dataModel === 'document' ? LINK_TYPES.filter((t) => t.type === 'foreign-key') : [],
    },
    notRead,
    readByFallback: notRead.length > 0,
    languages,
    dataModel,
    broad: result.broad,
    broadReason: result.broadReason,
    links: result.broad ? [] : links,
    edgeless: result.edgeless,
    scopes,
    functionLevel,
    classification,
    cache: cacheStats,
    summary: {
      affected: result.broad ? null : affected.size,
      dependencies: links.filter((l) => l.direction === 'dependency').length,
    },
  };
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Change Impact CLI (FR-001, FR-004): readable summary
// MODIFIED-BY: [SCOPE 137 / T005] — data links have no import path; show from → table → to
// MODIFIED-BY: [SCOPE 137 / T007] — languages read, not-applicable link types, fallback note
// MODIFIED-BY: [SCOPE 137 / T008] — leads with the decision, data loss and boundary reasons
export function renderSummary(report) {
  const lines = [];
  lines.push('# Change Impact');
  lines.push('');
  lines.push(`Changed: ${report.changedFiles.length ? report.changedFiles.join(', ') : '(nothing)'}`);
  lines.push('');
  const c = report.classification;
  if (c) {
    const verdict = { stop: 'STOP: possible data loss', ask: 'Ask before this change lands', notify: 'Notify', none: 'No impact' }[c.decision];
    lines.push(`**Decision:** ${verdict} (impactMode ${c.mode}${c.boundary ? ', Impact Boundary' : ''})`);
    for (const d of c.dataLoss) {
      lines.push(`- Possible data loss: ${d.kind} ${[d.table, d.column].filter(Boolean).join('.')} in ${d.file}${d.line ? `:${d.line}` : ''} (${d.text})`);
    }
    for (const r of c.reasons) lines.push(`- Boundary: ${r.detail}`);
    if (!c.signoff.checked) lines.push(`- Human sign-offs: not checked (${c.signoff.reason})`);
    if (c.warning) lines.push(`- Warning: ${c.warning}`);
    lines.push('');
  }
  if (report.broad) {
    lines.push(`**Broad:** ${report.broadReason}`);
  } else {
    lines.push(`**Affected:** ${report.summary.affected} · **Relies on:** ${report.summary.dependencies}`);
    if (report.scopes) {
      const s = report.scopes;
      lines.push(`**Scopes:** own ${s.ownScopes.join(', ') || 'none'} · reached ${s.reachedScopes.join(', ') || 'none'}` +
        (s.unfencedReached ? ` · ${s.unfencedReached} reached file(s) carry no fence` : ''));
    }
    const dependents = report.links.filter((l) => l.direction === 'dependent');
    if (dependents.length) {
      lines.push('');
      lines.push('| Reached | Through | Link | Confidence |');
      lines.push('|---|---|---|---|');
      for (const l of dependents) {
        const through = (l.path ?? [l.from, l.via, l.to].filter(Boolean)).join(' → ');
        lines.push(`| ${l.to} | ${through} | ${l.type} | ${l.confidence} |`);
      }
    }
  }
  lines.push('');
  lines.push(`**Checked:** ${report.linkTypes.checked.map((t) => t.label).join('; ')}`);
  lines.push(`**Not checked yet:** ${report.linkTypes.notChecked.map((t) => t.label).join('; ') || 'none'}`);
  if (report.linkTypes.notApplicable?.length) {
    lines.push(`**Not applicable (${report.dataModel} database):** ${report.linkTypes.notApplicable.map((t) => t.label).join('; ')}`);
  }
  if (report.notRead.length) {
    lines.push(`**Not read (file type not supported):** ${report.notRead.join(', ')}` +
      (report.readByFallback ? ' — checked by text mention only (Likely)' : ''));
  }
  if (report.languages) {
    lines.push(`**Read:** ${Object.entries(report.languages).map(([k, v]) => `${k} ${v.files} files (${v.read}, ${v.confidence})`).join('; ')}`);
  }
  lines.push('');
  return lines.join('\n');
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Change Impact CLI (FR-001): entry point
// MODIFIED-BY: [SCOPE 137 / T003] — passes the cache option through
// MODIFIED-BY: [SCOPE 137 / T008] — --mode and --signoffs; exit 3 when the decision is stop
// MODIFIED-BY: [SCOPE 137 / T011] — --before: the file as it was before a hand edit's save (the Cockpit)
// MODIFIED-BY: [SCOPE 137 / T013] — --no-write: show only, write nothing; --summary: print the readable summary
function main() {
  const opts = readArgs(process.argv.slice(2));
  const changedFiles = changedFilesFor(opts);
  if (!changedFiles) {
    process.stderr.write('Need --changed "a,b", --base <ref>, or --working\n');
    process.exit(2);
  }
  if (opts.before && changedFiles.length !== 1) {
    process.stderr.write('--before needs exactly one --changed file\n');
    process.exit(2);
  }
  if (opts.mode && !IMPACT_MODES.includes(opts.mode)) {
    process.stderr.write(`--mode must be one of ${IMPACT_MODES.join(', ')}\n`);
    process.exit(2);
  }
  const report = buildReport({
    root: opts.root, changedFiles, max: opts.max, useCache: opts.useCache,
    precise: opts.precise, ranges: opts.lines ? parseLines(opts.lines) : null,
    mode: opts.mode, signoffs: opts.signoffs ? JSON.parse(readFileSync(resolve(opts.root, opts.signoffs), 'utf8')) : null,
    contents: opts.before
      ? new Map([[changedFiles[0], { old: readFileSync(resolve(opts.before), 'utf8'), new: readText(opts.root, changedFiles[0]) }]])
      : null,
  });
  // --no-write (wxBrainstorm's show-only step, FR-012): nothing is written; with --no-cache too,
  // not even the facts cache.
  if (!opts.noWrite) {
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n');
    writeFileSync(join(dirname(opts.out), 'impact-summary.md'), renderSummary(report));
  }
  if (!opts.quiet) process.stdout.write(opts.summary ? renderSummary(report) : JSON.stringify(report, null, 2) + '\n');
  // Possible data loss stops in every mode (FR-007): callers can rely on the exit code alone.
  if (report.classification.decision === 'stop') process.exitCode = 3;
}
// [SCOPE 137 / T001] END

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '/$1')}` ||
    process.argv[1]?.endsWith('change-impact.mjs')) {
  main();
}
