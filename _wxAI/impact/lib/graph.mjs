// Shared Change Impact engine — the module graph and its reachability.
//
// One engine serves every entry point (SCOPE-137 FR-001): the Claude Code hook,
// the Cockpit, /buildscope, wxBrainstorm, and wxCreateTestPlan's
// project.report_change_impact payload (SCOPE-111). It lives under _wxAI/ so it
// ships to customers through the normal kit sync, the same way _wxAI/adapters/
// does — one copy, read by every skill, so no second lineage can drift.
//
// The logic below was moved verbatim from
// _wxAI/skills/wxCreateTestPlan/scripts/impact-graph.mjs ([SCOPE 111 / T041]);
// that script is now a thin wrapper and must keep producing byte-identical
// output. Behavior changes for the other link types land in later SCOPE-137
// tasks, behind options that default to today's behavior.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { loadAliases } from './aliases.mjs';

// [SCOPE 137 / T001] BEGIN — Shared Change Impact engine (FR-001): file discovery constants
// MODIFIED-BY: [SCOPE 137 / T002] — reads .vue, .svelte and .astro files (FR-005)
export const SOURCE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '.svelte', '.astro'];
export const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out']);
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Shared Change Impact engine (FR-001): path normalization
export function norm(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Shared Change Impact engine (FR-001): source file walk
export function walkSourceFiles(root, dir = root, out = [], exts = SOURCE_EXT, skipDirs = SKIP_DIRS) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkSourceFiles(root, full, out, exts, skipDirs);
    else if (exts.some((e) => entry.endsWith(e))) out.push(norm(relative(root, full)));
  }
  return out;
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T004] BEGIN — Git-visible files: honor .gitignore so ignored copies (.history/) never count
/**
 * Files git can see: tracked, plus untracked-but-not-ignored. Returns null when
 * the root is not a git work tree, in which case callers fall back to the walk.
 * Without this, VS Code's gitignored .history/ copies made up 179 of 276
 * "route files" on wxKanban and produced phantom links.
 */
export function gitVisibleFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return new Set(out.split('\n').map(norm).filter(Boolean));
  } catch {
    return null;
  }
}
// [SCOPE 137 / T004] END

// [SCOPE 137 / T001] BEGIN — Shared Change Impact engine (FR-001): import specifier resolver
// MODIFIED-BY: [SCOPE 137 / T002] — resolves tsconfig/jsconfig `paths` and Vite aliases (FR-005)
/**
 * Resolve an import specifier to a repo-relative file, trying the usual extensions.
 * `aliases` (from loadAliases) maps prefixes like `@/` to repo folders; the legacy
 * `~/` → `src/` mapping stays as the fallback so projects without a tsconfig
 * resolve exactly as before.
 */
export function createResolver(fileSet, exts = SOURCE_EXT, aliases = []) {
  return function resolveSpecifier(fromFile, spec) {
    const bases = [];
    if (spec.startsWith('.')) {
      bases.push(norm(join(dirname(fromFile), spec)));
    } else {
      for (const a of aliases) {
        if (a.wildcard ? spec.startsWith(a.prefix) : spec === a.prefix) {
          const rest = a.wildcard ? spec.slice(a.prefix.length) : '';
          for (const t of a.targets) bases.push(norm(`${t}${rest}`).replace(/\/$/, ''));
          break;
        }
      }
      if (bases.length === 0 && spec.startsWith('~/')) bases.push(norm(join('src', spec.slice(2))));
      if (bases.length === 0) return null; // external package
    }
    for (const base of bases) {
      const withoutJs = base.replace(/\.js$/, ''); // NodeNext writes .js for .ts sources
      for (const candidate of [
        base,
        withoutJs,
        ...exts.map((e) => withoutJs + e),
        ...exts.map((e) => `${withoutJs}/index${e}`),
      ]) {
        if (fileSet.has(candidate)) return candidate;
      }
    }
    return null;
  };
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Shared Change Impact engine (FR-001): import statement pattern
export const IMPORT_RE = /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
// [SCOPE 137 / T001] END

// [SCOPE 137 / T003] BEGIN — Import specifiers of one source text (pure; cached per file)
export function extractImports(src) {
  const specs = [];
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) specs.push(spec);
  }
  return specs;
}
// [SCOPE 137 / T003] END

// [SCOPE 137 / T001] BEGIN — Shared Change Impact engine (FR-001): import graph, both directions
// MODIFIED-BY: [SCOPE 137 / T003] — uses cached per-file import facts when given
/**
 * Build the import graph in both directions.
 *   dependents:   file -> Set(files that import it)     (what a change reaches)
 *   dependencies: file -> Set(files it imports)          (what a file relies on)
 * Insertion order matches the legacy single-direction walk exactly, so callers
 * that only read `dependents` see the same iteration order as before.
 */
export function buildImportGraph(root, files, resolveSpecifier, facts = null) {
  const dependents = new Map();
  const dependencies = new Map();
  for (const file of files) {
    let specs = facts?.get(file)?.imports;
    if (!specs) {
      let src;
      try {
        src = readFileSync(join(root, file), 'utf8');
      } catch {
        continue;
      }
      specs = extractImports(src);
    }
    for (const spec of specs) {
      const target = resolveSpecifier(file, spec);
      if (!target) continue;
      if (!dependents.has(target)) dependents.set(target, new Set());
      dependents.get(target).add(file);
      if (!dependencies.has(file)) dependencies.set(file, new Set());
      dependencies.get(file).add(target);
    }
  }
  return { dependents, dependencies };
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Shared Change Impact engine (FR-001): transitive dependents, shortest path kept
export function reachDependents(changedFiles, fileSet, dependents) {
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
  return out;
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Shared Change Impact engine (FR-001): edgeless change classification (SCOPE-111 FR-049b3)
// Nothing imports a migration, a lockfile, or a stylesheet, so the transitive
// walk reaches nothing from them. A migration maps precisely via the tables it
// alters, and is the highest-consequence miss, so its tables are extracted.
export function classifyEdgeless(path) {
  const p = path.toLowerCase();
  if (/(^|\/)src\/db\/migrations\/.*\.sql$/.test(p) || /(^|\/)migrations\/.*\.sql$/.test(p)) return 'migration';
  if (/(^|\/)\.env(\.|$)/.test(p)) return 'env';
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|package\.json)$/.test(p)) return 'dependency';
  if (/\/(locales?|i18n)\//.test(p)) return 'static';
  if (/\.(json|ya?ml|toml|ini|conf)$/.test(p)) return 'config';
  if (/\.(css|scss|svg|png|jpe?g|webp|ico|woff2?|md|html)$/.test(p)) return 'static';
  return null;
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Shared Change Impact engine (FR-001): migration table extraction
// Deliberately generous — every DDL/DML form that names a table — because an
// omission silently under-marks, while an extra table costs one dismissal.
// Returns [] when nothing could be read; callers treat that as unresolvable.
export const TABLE_RE = [
  /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["']?([a-z0-9_]+)["']?/gi,
  /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?[^\s]+\s+ON\s+["']?([a-z0-9_]+)["']?/gi,
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?([a-z0-9_]+)["']?/gi,
  /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["']?([a-z0-9_]+)["']?/gi,
  /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["']?([a-z0-9_]+)["']?/gi,
  /\bON\s+["']?([a-z0-9_]+)["']?\s*\(/gi,
];

export function migrationTables(root, path) {
  let sql;
  try {
    sql = readFileSync(join(root, path), 'utf8');
  } catch {
    return [];
  }
  sql = sql.replace(/--.*$/gm, ' '); // a table named only in a comment is not counted
  const found = new Set();
  for (const re of TABLE_RE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(sql)) !== null) if (m[1]) found.add(m[1].toLowerCase());
  }
  return [...found];
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Shared Change Impact engine (FR-001): edgeless entries for a change set
export function edgelessEntries(root, changedFiles) {
  const edgeless = [];
  for (const path of changedFiles) {
    const kind = classifyEdgeless(path);
    if (!kind) continue;
    const entry = { path, kind };
    if (kind === 'migration') {
      entry.tables = migrationTables(root, path);
      entry.note = entry.tables.length
        ? `migration alters: ${entry.tables.join(', ')}`
        : 'tables could not be read from the migration — application will mark every human test';
    }
    edgeless.push(entry);
  }
  return edgeless;
}
// [SCOPE 137 / T001] END

// [SCOPE 137 / T001] BEGIN — Shared Change Impact engine (FR-001): one-call analysis
// MODIFIED-BY: [SCOPE 137 / T002] — loads the project's path aliases before building the graph
// MODIFIED-BY: [SCOPE 137 / T004] — returns the resolver so route mounts can follow their imports; optional .gitignore filter
// MODIFIED-BY: [SCOPE 137 / T003] — accepts a precomputed file list and cached facts
/**
 * Analyse a change set. Returns the graph pieces callers need plus the
 * report_change_impact payload pieces (dependents, edgeless). `max` is the
 * SCOPE-111 oversize cap: over it, `broad` is set rather than truncating —
 * a truncated set looks complete and produces confidently wrong marking.
 */
export function analyzeChange({ root, changedFiles, max = 5000, respectGitignore = false, files: givenFiles = null, facts = null }) {
  // respectGitignore defaults off so report_change_impact (SCOPE-111) keeps its exact legacy output.
  // T003: callers holding cached facts pass their file list and facts, skipping the walk and re-reads.
  let files = givenFiles;
  if (!files) {
    const visible = respectGitignore ? gitVisibleFiles(root) : null;
    files = walkSourceFiles(root).filter((f) => !visible || visible.has(f));
  }
  const fileSet = new Set(files);
  const resolveSpecifier = createResolver(fileSet, SOURCE_EXT, loadAliases(root));
  const { dependents, dependencies } = buildImportGraph(root, files, resolveSpecifier, facts);
  const reached = reachDependents(changedFiles, fileSet, dependents);
  const broad = reached.length > max;
  return {
    files,
    fileSet,
    resolveSpecifier,
    dependents,
    dependencies,
    reached,
    broad,
    broadReason: broad
      ? `${reached.length} transitive dependents exceeds the ${max} cap — declaring broad rather than sending a partial set.`
      : null,
    edgeless: broad ? [] : edgelessEntries(root, changedFiles),
  };
}
// [SCOPE 137 / T001] END
