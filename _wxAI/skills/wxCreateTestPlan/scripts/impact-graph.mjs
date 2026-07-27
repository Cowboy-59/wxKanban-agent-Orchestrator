#!/usr/bin/env node
// [SCOPE 111 / T041] Change-impact graph for project.report_change_impact.
//
// Computes what a release changed and everything that transitively depends on
// it, then emits the payload the MCP tool expects. Runs where the code is —
// the application never reads a repository, so reachability has to be computed
// here and posted.
//
// Deliberately over-marks. The two errors are not symmetric: an under-mark
// ships a defect under a green human signoff and has no recovery, while an
// over-mark costs a tester one dismissal with a stated reason.
//
// Usage:
//   node impact-graph.mjs --base <ref> [--head HEAD] [--root .] [--max 5000]
//   node impact-graph.mjs --changed "src/a.ts,src/b.ts" --commit <sha>
//
// Output: JSON on stdout — { commitsha, changedFiles, dependents[] } or
// { commitsha, changedFiles, broad: true, broadReason } when oversized.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ROOT = resolve(arg('root', process.cwd()));
const BASE = arg('base', null);
const HEAD = arg('head', 'HEAD');
const MAX_DEPENDENTS = Number(arg('max', '5000'));
const SOURCE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out']);

const norm = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '');

function git(...a) {
  return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
}

// --- what changed -----------------------------------------------------------
let changedFiles;
let commitsha;

const explicitChanged = arg('changed', null);
if (explicitChanged) {
  changedFiles = explicitChanged.split(',').map((s) => norm(s.trim())).filter(Boolean);
  commitsha = arg('commit', null) ?? git('rev-parse', HEAD);
} else {
  if (!BASE) {
    console.error('Need --base <ref> (or --changed "a,b" --commit <sha>)');
    process.exit(2);
  }
  commitsha = git('rev-parse', HEAD);
  changedFiles = git('diff', '--name-only', `${BASE}..${HEAD}`)
    .split('\n')
    .map(norm)
    .filter(Boolean);
}

// --- build the module graph -------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.some((e) => entry.endsWith(e))) out.push(norm(relative(ROOT, full)));
  }
  return out;
}

const files = walk(ROOT);
const fileSet = new Set(files);

/** Resolve a specifier to a repo-relative file, trying the usual extensions. */
function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('~/')) return null; // external package
  const base = spec.startsWith('~/')
    ? norm(join('src', spec.slice(2)))
    : norm(join(dirname(fromFile), spec));
  const withoutJs = base.replace(/\.js$/, ''); // NodeNext writes .js for .ts sources
  for (const candidate of [
    base,
    withoutJs,
    ...SOURCE_EXT.map((e) => withoutJs + e),
    ...SOURCE_EXT.map((e) => `${withoutJs}/index${e}`),
  ]) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

const IMPORT_RE = /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

// dependents: file -> Set(files that import it)
const dependents = new Map();
for (const file of files) {
  let src;
  try {
    src = readFileSync(join(ROOT, file), 'utf8');
  } catch {
    continue;
  }
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec) continue;
    const target = resolveSpecifier(file, spec);
    if (!target) continue;
    if (!dependents.has(target)) dependents.set(target, new Set());
    dependents.get(target).add(file);
  }
}

// --- transitive reachability, keeping the shortest path we saw --------------
const out = [];
const seen = new Set();

for (const changed of changedFiles) {
  if (!fileSet.has(changed)) continue; // deleted, or not a source file
  const queue = [[changed, [changed]]];
  const localSeen = new Set([changed]);

  while (queue.length > 0) {
    const [current, path] = queue.shift();
    for (const dep of dependents.get(current) ?? []) {
      if (localSeen.has(dep)) continue;
      localSeen.add(dep);
      const nextPath = [...path, dep];
      const key = `${changed}→${dep}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ changedFile: changed, dependentPath: dep, path: nextPath });
      }
      queue.push([dep, nextPath]);
    }
  }
}

// --- emit -------------------------------------------------------------------
// Oversized means DECLARE IT, never truncate. A truncated set looks complete
// and produces confidently wrong marking; a declared-broad analysis simply asks
// everyone to re-test, which is honest and recoverable.
if (out.length > MAX_DEPENDENTS) {
  console.log(
    JSON.stringify(
      {
        commitsha,
        changedFiles,
        broad: true,
        broadReason: `${out.length} transitive dependents exceeds the ${MAX_DEPENDENTS} cap — declaring broad rather than sending a partial set.`,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}


// --- FR-049b3: changes with NO import edges --------------------------------
// Nothing imports a migration, a lockfile, or a stylesheet, so the transitive
// walk above reaches nothing from them and the change would read as affecting
// no tests. The runner classifies them because it is the only party holding the
// code; the application decides what each one means for testing.
//
// A migration is the one kind that maps precisely, via the tables it alters —
// and the one with the highest consequence when missed, because a column or
// constraint change reaches every screen reading it through code that never
// mentions the file. So its tables are extracted here rather than guessed there.
function classifyEdgeless(path) {
  const p = path.toLowerCase();
  if (/(^|\/)src\/db\/migrations\/.*\.sql$/.test(p) || /(^|\/)migrations\/.*\.sql$/.test(p)) return 'migration';
  if (/(^|\/)\.env(\.|$)/.test(p)) return 'env';
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|package\.json)$/.test(p)) return 'dependency';
  if (/\/(locales?|i18n)\//.test(p)) return 'static';
  if (/\.(json|ya?ml|toml|ini|conf)$/.test(p)) return 'config';
  if (/\.(css|scss|svg|png|jpe?g|webp|ico|woff2?|md|html)$/.test(p)) return 'static';
  return null;
}

// Tables a migration touches. Deliberately generous — every DDL/DML form that
// names a table — because an omission here silently under-marks, while an extra
// table costs one dismissal. Returns [] when nothing could be read, which the
// application treats as unresolvable and marks everything.
const TABLE_RE = [
  /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["']?([a-z0-9_]+)["']?/gi,
  /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?[^\s]+\s+ON\s+["']?([a-z0-9_]+)["']?/gi,
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?([a-z0-9_]+)["']?/gi,
  /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["']?([a-z0-9_]+)["']?/gi,
  /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["']?([a-z0-9_]+)["']?/gi,
  /\bON\s+["']?([a-z0-9_]+)["']?\s*\(/gi,
];
function migrationTables(path) {
  let sql;
  try {
    sql = readFileSync(join(ROOT, path), 'utf8');
  } catch {
    return [];
  }
  // Strip -- comments so a table named only in prose is not counted.
  sql = sql.replace(/--.*$/gm, ' ');
  const found = new Set();
  for (const re of TABLE_RE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(sql)) !== null) if (m[1]) found.add(m[1].toLowerCase());
  }
  return [...found];
}

const edgeless = [];
for (const path of changedFiles) {
  const kind = classifyEdgeless(path);
  if (!kind) continue;
  const entry = { path, kind };
  if (kind === 'migration') {
    entry.tables = migrationTables(path);
    entry.note = entry.tables.length
      ? `migration alters: ${entry.tables.join(', ')}`
      : 'tables could not be read from the migration — application will mark every human test';
  }
  edgeless.push(entry);
}

console.log(JSON.stringify({ commitsha, changedFiles, dependents: out, edgeless }, null, 2));

// FR-049b3 is implemented above: edgeless changes are classified and, for a
// migration, the altered tables are extracted so the application can map them to
// the items whose subjects cover those tables.
