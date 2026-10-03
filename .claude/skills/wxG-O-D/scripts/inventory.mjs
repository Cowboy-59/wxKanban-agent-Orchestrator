#!/usr/bin/env node
/**
 * inventory.mjs  (wxKanban kit skill: wxG-O-D)
 * --------------------------------------------------------------------------
 * Lists the files G.O.D. may read as evidence, sorts them into buckets, and
 * records what was left out and why. Writes docs/GOD-Inventory.json and
 * prints a short summary.
 *
 *   node .claude/skills/wxG-O-D/scripts/inventory.mjs               # whole project tree
 *   node .claude/skills/wxG-O-D/scripts/inventory.mjs --dir=a,b     # only these folders
 *
 * Whole-tree mode honours .gitignore. Inside a git work tree it asks git for
 * tracked plus untracked-but-not-ignored files, which is exact. Outside git it
 * walks the tree and applies the root .gitignore approximately, and says so.
 * Named folders are read as given (the user chose them), minus build output
 * and dependency folders.
 *
 * wxKanban kit files are never evidence in either mode: the exact list from
 * .wxai/kit-manifest.json when the kit wrote one, otherwise the kit's known
 * paths. Plain Node 18+, no dependencies; git is used when present.
 * --------------------------------------------------------------------------
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const OUT_PATH = join(ROOT, 'docs', 'GOD-Inventory.json');
const SPLIT_AT = 400; // a folder bigger than this is also broken down one level, for explorer assignment

// Folders that never hold anyone's source: skipped in every mode. `.remember`
// is AI-assistant session notes, which can hold conversation content.
const NEVER_SOURCE = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv', '.next', '.nuxt', '.turbo', '.cache',
  '.history', '.vs', '.idea', '.pytest_cache', '.remember',
]);
// Usual build-output folder names. Skipped only where no .gitignore decides it
// (named folders, or a tree with no .gitignore), because a bin/ or build/ the
// project chose to keep (CLI scripts, Rails binstubs) is real code.
const BUILD_OUTPUT = new Set(['dist', 'build', 'bin', 'obj', 'out', 'coverage', 'target']);
const LOCKFILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'composer.lock',
  'gemfile.lock', 'poetry.lock', 'cargo.lock', 'packages.lock.json',
]);

// Kit fallback: the kit archive (v1.7.67) plus the files the kit writes when it
// runs (gateway pid and log, project and AI settings, the downloaded archive).
// Whole folders only where the name is the kit's own; mixed folders (scripts/,
// shared/types/, .vscode/, bin/, logs/) list exact files so a customer's own
// files there are kept.
const KIT_DIRS = [
  'wxkanban-agent/', '_wxAI/', '.claude/', '.wxai/', 'shared/preflight/', 'shared/watermark/', 'scripts/wxaigit/',
];
const KIT_PATTERNS = [/^logs\/orchestrator-gateway[^/]*$/, /^wxkanban-kit-[^/]*\.(zip|tar\.gz)$/];
const KIT_FILES = new Set([
  'CLAUDE.md', 'AI.md', '.mcp.json', 'wxAIGit', 'wxAIGit.cmd', 'tsconfig.wxdbanalyze.json',
  'README_MAC_OS.md', 'bin/wxkanban-agent', 'bin/wxkanban-agent.cmd',
  '.vscode/settings.json', '.vscode/tasks.json',
  '.wxkanban-project.json', 'ai-settings.json', '.orchestrator-gateway.pid',
  ...['aiProposal', 'feedbackEntry', 'index', 'projectPhase', 'timeEntry', 'specification']
    .map((n) => `shared/types/${n}.ts`),
  ...[
    'build-release.mjs', 'check-getting-started-sync.mjs', 'check-hardcoded-strings.mjs',
    'check-kit-version.mjs', 'check-no-pg-in-kit.sh', 'check-schema-drift.ts',
    'copy-repo-rules-to-project.js', 'init.mjs', 'install-cockpit-extension.mjs', 'kit-start.mjs',
    'kit-status.mjs', 'kit-stop.mjs', 'orchestrator-health-check.mjs', 'setup-gateway.mjs',
    'upgrade-kit.mjs', 'watermark.mjs',
  ].map((n) => `scripts/${n}`),
]);
// Conversion output and scopes are always reviewed, so named-folder mode adds
// them from the project root when they exist even if they were not named.
const ALWAYS_INCLUDE = ['pre-convert', 'rebuild', 'specs/Project-Scope'];
// The kit merges its dependencies into the customer's package.json, so the file
// appears in the manifest, but it still describes the customer's own stack.
const NEVER_KIT = new Set(['package.json']);

const LEGACY = {
  windev: new Set(['wdp', 'wdw', 'wdr', 'wdg', 'wdc', 'wdd', 'wwh']),
  vb6: new Set(['vbp', 'frm', 'frx', 'bas', 'cls', 'ctl']),
  clarion: new Set(['app', 'clw', 'dct', 'inc', 'tpw']),
};
const DATABASE = new Set(['sql', 'ddl', 'dbml', 'prisma', 'edmx', 'fic', 'ndx', 'mmo', 'mdb', 'accdb', 'sqlite', 'sqlite3', 'db', 'tps', 'dbf']);
const CODE = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'cs', 'vb', 'java', 'kt', 'go', 'rb', 'php', 'rs', 'swift',
  'c', 'h', 'cpp', 'hpp', 'm', 'scala', 'dart', 'lua', 'pl', 'ps1', 'psm1', 'sh', 'bat', 'cmd', 'vue',
  'svelte', 'html', 'htm', 'css', 'scss', 'less', 'cshtml', 'razor', 'aspx', 'xaml', 'wl', 'groovy',
]);
const CONFIG = new Set(['json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'config', 'xml', 'properties', 'tf', 'hcl', 'csproj', 'sln', 'gradle']);
const DOCS = new Set(['md', 'mdx', 'txt', 'rst', 'adoc', 'pdf', 'doc', 'docx', 'rtf', 'odt', 'xls', 'xlsx', 'csv', 'ppt', 'pptx']);
const MEDIA = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tif', 'tiff', 'mp4', 'mov', 'avi', 'webm', 'mkv', 'mp3', 'wav']);

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function parseDirs(argv) {
  const dirs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = a.startsWith('--dir=') ? a.slice(6) : a === '--dir' ? argv[++i] : null;
    if (v) dirs.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return dirs;
}

const toPosix = (p) => p.split('\\').join('/');

function loadKitManifest() {
  try {
    const raw = JSON.parse(readFileSync(join(ROOT, '.wxai', 'kit-manifest.json'), 'utf8'));
    if (raw && typeof raw.files === 'object') return new Set(Object.keys(raw.files).map(toPosix));
  } catch { /* absent or unreadable: use the fallback list */ }
  return null;
}

function isKitFile(p, manifest) {
  if (NEVER_KIT.has(p)) return false;
  if (manifest && manifest.has(p)) return true;
  return KIT_FILES.has(p) || KIT_DIRS.some((d) => p.startsWith(d)) || KIT_PATTERNS.some((re) => re.test(p));
}

function inGitTree() {
  try {
    return execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() === 'true';
  } catch {
    return false;
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString('utf8').split('\0').filter(Boolean);
}

// Approximate .gitignore (root file only) for projects that are not git repositories.
function loadGitignore() {
  let text = '';
  try {
    text = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  } catch {
    return null;
  }
  const rules = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const neg = line.startsWith('!');
    if (neg) line = line.slice(1);
    const dirOnly = line.endsWith('/');
    if (dirOnly) line = line.slice(0, -1);
    let anchored = line.includes('/');
    if (line.startsWith('**/')) {
      line = line.slice(3);
      anchored = line.includes('/');
    }
    if (line.startsWith('/')) line = line.slice(1);
    const body = line.split('**')
      .map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
      .join('.*');
    rules.push({ re: new RegExp(anchored ? `^${body}$` : `(^|/)${body}$`), neg, dirOnly });
  }
  // Ignored when the path itself matches; the last matching rule wins.
  return (rel, isDir) => {
    let ignored = false;
    for (const r of rules) {
      if (r.dirOnly && !isDir) continue;
      if (r.re.test(rel)) ignored = !r.neg;
    }
    return ignored;
  };
}

function walk(startRel, { skipDirs, ignored }, counts, acc) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, startRel), { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const rel = startRel ? `${startRel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (NEVER_SOURCE.has(e.name) || skipDirs.has(e.name)) { counts.build++; continue; }
      if (ignored && ignored(rel, true)) { counts.gitignored++; continue; }
      walk(rel, { skipDirs, ignored }, counts, acc);
    } else if (e.isFile()) {
      if (ignored && ignored(rel, false)) { counts.gitignored++; continue; }
      acc.push(rel);
    }
  }
  return acc;
}

function ext(p) {
  const base = p.slice(p.lastIndexOf('/') + 1).toLowerCase();
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1) : '';
}

function classify(p) {
  const lower = p.toLowerCase();
  const segs = lower.split('/');
  const base = segs[segs.length - 1];
  const x = ext(p);
  if (/^docs\/(god-[^/]+|development-plan\.(md|pdf))$/.test(lower)) return 'prior-plan';
  if (/(^|\.)env($|\.)/.test(base) && !base.endsWith('.example') && !base.endsWith('.sample')) return 'secret';
  if (['pem', 'key', 'pfx', 'p12', 'jks', 'keystore'].includes(x)) return 'secret';
  if (segs.includes('pre-convert') || segs.includes('rebuild')) return 'conversion';
  if (lower.startsWith('specs/project-scope/')) return 'scope';
  if (lower.startsWith('specs/')) return 'spec';
  for (const [kind, set] of Object.entries(LEGACY)) if (set.has(x)) return `legacy-${kind}`;
  if (DATABASE.has(x) || segs.includes('migrations')) return 'database';
  if (/\.(test|spec)\.[a-z0-9]+$/.test(base) || segs.some((s) => ['test', 'tests', '__tests__', 'e2e'].includes(s))) return 'test';
  if (CODE.has(x)) return 'code';
  if (CONFIG.has(x) || ['dockerfile', 'makefile', 'procfile', 'jenkinsfile'].includes(base) || lower.startsWith('.github/workflows/')) return 'config';
  if (DOCS.has(x)) return 'docs';
  if (MEDIA.has(x)) return 'media';
  return 'other';
}

function tally(files) {
  const byBucket = {};
  for (const f of files) byBucket[f.bucket] = (byBucket[f.bucket] || 0) + 1;
  return byBucket;
}

function groupFolders(files) {
  const groups = new Map();
  for (const f of files) {
    const i = f.path.indexOf('/');
    const key = i === -1 ? '(root files)' : f.path.slice(0, i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return [...groups.entries()]
    .map(([path, list]) => {
      const folder = { path, files: list.length, byBucket: tally(list) };
      if (list.length > SPLIT_AT && path !== '(root files)') {
        folder.children = groupFolders(list.map((f) => ({ ...f, path: f.path.slice(path.length + 1) })))
          .map((c) => ({ ...c, path: c.path === '(root files)' ? `${path} (files directly in it)` : `${path}/${c.path}` }));
      }
      return folder;
    })
    .sort((a, b) => b.files - a.files);
}

function conversionSummary(files) {
  const roots = new Map();
  for (const f of files) {
    const segs = f.path.split('/');
    const i = segs.findIndex((s) => s.toLowerCase() === 'pre-convert' || s.toLowerCase() === 'rebuild');
    if (i === -1) continue;
    const root = segs.slice(0, i + 1).join('/') + '/';
    roots.set(root, (roots.get(root) || 0) + 1);
  }
  const has = (re) => files.filter((f) => re.test(f.path)).map((f) => f.path);
  return {
    folders: Object.fromEntries(roots),
    discarded: has(/(^|\/)_discarded\.md$/i),
    redactionLogs: has(/(^|\/)_redactions\.md$/i),
    scopeDocs: files.filter((f) => f.bucket === 'scope' && /\.md$/i.test(f.path)).length,
    scopeProgress: has(/(^|\/)\.scope-progress\.json$/i),
    parityProgress: has(/(^|\/)\.parity-progress\.json$/i),
  };
}

function main() {
  const dirs = parseDirs(process.argv.slice(2));
  const manifest = loadKitManifest();
  const counts = { gitignored: 0, build: 0, kit: 0, lockfiles: 0 };
  let mode;
  let raw;

  if (dirs.length) {
    const missing = dirs.filter((d) => !existsSync(resolve(ROOT, d)) || !statSync(resolve(ROOT, d)).isDirectory());
    if (missing.length) fail(`These --dir folders do not exist: ${missing.join(', ')}`);
    const extra = ALWAYS_INCLUDE.filter((d) => existsSync(join(ROOT, d)));
    mode = 'named folders (.gitignore not applied: the folders were chosen explicitly)' +
      (extra.length ? `, plus ${extra.join(', ')} from the project root` : '');
    raw = [];
    for (const d of [...dirs, ...extra]) walk(toPosix(relative(ROOT, resolve(ROOT, d))), { skipDirs: BUILD_OUTPUT, ignored: null }, counts, raw);
    raw = [...new Set(raw)];
  } else if (inGitTree()) {
    mode = 'whole project tree (git: .gitignore applied exactly)';
    raw = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
      .filter((p) => { try { return statSync(join(ROOT, p)).isFile(); } catch { return false; } });
    counts.gitignored = git(['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory']).length;
    raw = raw.filter((p) => {
      if (p.split('/').some((s) => NEVER_SOURCE.has(s))) { counts.build++; return false; }
      return true;
    });
  } else {
    const ignored = loadGitignore();
    mode = ignored
      ? 'whole project tree (not a git repository: root .gitignore applied approximately)'
      : 'whole project tree (not a git repository and no .gitignore: usual build-output folders skipped)';
    raw = walk('', { skipDirs: ignored ? new Set() : BUILD_OUTPUT, ignored }, counts, []);
  }

  const files = [];
  for (const p of raw.map(toPosix)) {
    if (isKitFile(p, manifest)) { counts.kit++; continue; }
    if (LOCKFILES.has(p.slice(p.lastIndexOf('/') + 1).toLowerCase())) { counts.lockfiles++; continue; }
    files.push({ path: p, bucket: classify(p) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  const evidence = files.filter((f) => f.bucket !== 'prior-plan');
  const legacy = Object.fromEntries(Object.keys(LEGACY).map((k) => [k, files.filter((f) => f.bucket === `legacy-${k}`).length]));
  const result = {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    mode,
    dirs: dirs.length ? dirs : null,
    kitExclusion: manifest ? '.wxai/kit-manifest.json (exact)' : 'known kit paths (no kit manifest found)',
    totals: { evidenceFiles: evidence.length, byBucket: tally(files) },
    folders: groupFolders(evidence),
    conversion: conversionSummary(files),
    legacy,
    excluded: {
      gitignored: dirs.length ? null : counts.gitignored,
      kitFiles: counts.kit,
      buildAndDependencyFolders: counts.build,
      lockfiles: counts.lockfiles,
    },
    files,
  };

  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8');
  printSummary(result);
}

function printSummary(r) {
  const n = (x) => x.toLocaleString('en-US');
  const ex = r.excluded;
  console.log(`G.O.D. inventory: ${r.mode}`);
  console.log(`  Evidence: ${n(r.totals.evidenceFiles)} files in ${r.folders.length} folders`);
  console.log(
    `  Excluded: ${ex.gitignored === null ? '' : `${n(ex.gitignored)} gitignored paths · `}` +
    `${n(ex.kitFiles)} kit files (${r.kitExclusion}) · ${n(ex.buildAndDependencyFolders)} build or dependency folders · ` +
    `${n(ex.lockfiles)} lockfiles`,
  );
  const buckets = Object.keys(r.totals.byBucket).filter((b) => b !== 'prior-plan').sort();
  const rows = r.folders.flatMap((f) => [f, ...(f.children || []).map((c) => ({ ...c, path: `  ${c.path}` }))]);
  const width = Math.max(6, ...rows.map((f) => f.path.length));
  console.log(`  ${'Folder'.padEnd(width)}  ${'Files'.padStart(6)}  ${buckets.map((b) => b.padStart(Math.max(5, b.length))).join(' ')}`);
  for (const f of rows) {
    const cells = buckets.map((b) => String(f.byBucket[b] || '').padStart(Math.max(5, b.length)));
    console.log(`  ${f.path.padEnd(width)}  ${String(f.files).padStart(6)}  ${cells.join(' ')}`);
  }
  const c = r.conversion;
  const conv = Object.entries(c.folders).map(([k, v]) => `${k} (${n(v)})`);
  if (conv.length || c.scopeDocs) {
    console.log(`  Conversion output: ${conv.join(', ') || 'none'}; ${c.scopeDocs} scope docs` +
      `${c.scopeProgress.length ? '; .scope-progress.json' : ''}${c.parityProgress.length ? '; .parity-progress.json' : ''}` +
      `${c.discarded.length ? `; ${c.discarded.length} _discarded.md` : ''}`);
  }
  const leg = Object.entries(r.legacy).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`);
  if (leg.length) console.log(`  Legacy files (by extension): ${leg.join(' · ')}`);
  const secrets = r.files.filter((f) => f.bucket === 'secret').length;
  if (secrets) console.log(`  ${secrets} secret-bearing files listed by path only (bucket "secret"): never open them`);
  const prior = r.files.filter((f) => f.bucket === 'prior-plan').length;
  if (prior) console.log(`  ${prior} files from a previous G.O.D. run (bucket "prior-plan"): this is a re-run`);
  console.log(`✓ Wrote ${relative(ROOT, OUT_PATH).split('\\').join('/')}`);
}

main();
