#!/usr/bin/env node
/**
 * build-release.mjs — Package the orchestrator kit for GitHub release.
 *
 * Produces four artifacts in releases/<version>/:
 *   kit.tar.gz          Unix install archive
 *   kit.tar.gz.sha256   SHA-256 sidecar (consumed by upgrade-kit.mjs)
 *   kit.zip             Windows install archive
 *   kit.zip.sha256      SHA-256 sidecar
 *
 * Per-project files and customizable templates are excluded so archives
 * can be safely extracted over an existing install (spec 019 R15 AC2).
 *
 * Usage:
 *   node scripts/build-release.mjs                   # uses package.json version
 *   node scripts/build-release.mjs --version v0.1.2  # explicit tag
 *   node scripts/build-release.mjs --dry-run         # show what would be staged
 */

import archiver from 'archiver';
import crypto from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, promises as fsp, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here  = path.dirname(fileURLToPath(import.meta.url));
const root  = path.resolve(here, '..');

// ─── Colours ─────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  cyan: '\x1b[36m', green: '\x1b[32m',
  yellow: '\x1b[33m', red: '\x1b[31m',
  magenta: '\x1b[35m', dim: '\x1b[2m',
};
const col = (color, text) => `${color}${text}${c.reset}`;
function log(tag, color, msg) {
  console.log(`${col(color, `[${tag}]`)} ${msg}`);
}

// ─── Args ─────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const vIdx    = args.indexOf('--version');
let version   = vIdx !== -1 ? args[vIdx + 1] : null;

if (!version) {
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json');
  version = `v${pkg.version}`;
}
if (!version.startsWith('v')) version = `v${version}`;

// ─── What goes into the kit archive ──────────────────────────────────────────
// These dirs/files are copied relative to the project root.
// `.claude` is included so kit-shipped Claude Code skills (wxICA, diagnose,
// code-review, …) reach consumers. Top-level .claude/ files like
// settings.json / settings.local.json / mcp.json are kept out via
// EXCLUDE_BASENAMES + EXCLUDE_CLAUDE_TOPLEVEL below.
// Spec 029 / v1.2.8 hotfix — `shared/` is included so wxkanban-agent's
// `@wxkanban/preflight` file: dependency resolves on consumer machines
// after extract. Without this, dbpush crashes on a freshly upgraded kit
// with "Cannot find module '@wxkanban/preflight'".
// `mcp-server` is deliberately ABSENT: the MCP runs only on wxKanban-operated
// infrastructure (spec 019 Decision #1 + spec 028), the orchestrator repo has no
// mcp-server/ to pack, and check-no-pg-in-kit.sh FAILS the build if one ever
// appears. Listing it made a real omission (shared/) hard to tell apart from an
// intentional one during the v1.7.32 diagnosis — see field report 9cd91ed8.
const KIT_INCLUDE_DIRS  = ['bin', 'wxkanban-agent', '_wxAI', 'scripts', '.vscode', '.claude', 'shared'];
// SPEC-058 Amendment B / FR-010 — the wxAIGit launchers ship at project root so
// the Cockpit's scope check-out can create the branch. Backing scripts live under
// scripts/wxaigit/ (scripts/ is already in KIT_INCLUDE_DIRS).
// SCOPE-121 Amendment A / T016 — `tsconfig.wxdbanalyze.json` is named by the packed
// `typecheck:dbanalyze` script and by the shipped wxDBAnalyze skill, but was in neither this
// allowlist nor sync-to-orchestrator's KIT_FILES, so every consumer's run died with TS5058
// (ticket 192e08c1). BOTH allowlists must carry it — sync copies it into this repo, this list
// packs it. The integrity gate below is what turned an invisible omission into a build failure.
const KIT_INCLUDE_FILES = ['package.json', 'package-lock.json', 'wxAIGit', 'wxAIGit.cmd', 'README_MAC_OS.md', 'tsconfig.wxdbanalyze.json'];

// Files at exactly .claude/<name> (top-level of .claude/) that must never be
// packed — they hold per-machine state, not kit content.
const EXCLUDE_CLAUDE_TOPLEVEL = new Set([
  'settings.json',
  'settings.local.json',
  'mcp.json',
]);

// Never include these anywhere in the tree (matched against basename).
const EXCLUDE_BASENAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'logs',
  'releases',
  'resources',
  'settings.local.json',
  'PHASE1_SUMMARY.md',
]);

// Never include these root-level entries (per-project + template files).
const EXCLUDE_ROOT_FILES = new Set([
  '.wxkanban-project.json',
  'ai-settings.json',
  '.env',
  '.env.local',
  'CLAUDE.md',
  'AI.md',
  'ProjectOverview.md',
  'README.md',
  'TODO.md',
  'project-kit.md',
  'wxkanban-agent-orchestrator-draft.md',
  'PHASE1_SUMMARY.md',
]);

// Never include files matching these glob-like suffixes/patterns.
const EXCLUDE_SUFFIXES = [
  '.pid',
  '.log',
  '.output',
  '.backup',
  'decrypted-url.txt',
  '.draft.md',
  'npm-debug.log',
  'verify-output.txt',
  'verify-output2.txt',
];

function shouldExclude(relPath /* relative to root, forward slashes */) {
  const parts = relPath.split('/');
  const basename = parts[parts.length - 1];

  // Top-level entry in exclude list
  if (parts.length === 1 && EXCLUDE_ROOT_FILES.has(basename)) return true;

  // .claude/<name> top-level (files only, skill subdirs are fine)
  if (parts.length === 2 && parts[0] === '.claude' && EXCLUDE_CLAUDE_TOPLEVEL.has(basename)) {
    return true;
  }

  // Spec 029 / v1.2.8 — shared/preflight/dist/ MUST ship in the archive
  // so wxkanban-agent's `@wxkanban/preflight` file: dependency resolves
  // on consumer machines. The generic `dist` basename ban (used to keep
  // wxkanban-agent/dist out) would otherwise drop the pre-built JS.
  if (parts[0] === 'shared' && parts.length >= 2) {
    // Allow everything under shared/, including dist/
    for (const suffix of EXCLUDE_SUFFIXES) {
      if (basename.endsWith(suffix) || basename === suffix) return true;
    }
    // Still drop node_modules and .git inside shared/
    if (basename === 'node_modules' || basename === '.git') return true;
    return false;
  }

  // Banned basenames at any depth
  if (EXCLUDE_BASENAMES.has(basename)) return true;

  // Suffix / pattern exclusions
  for (const suffix of EXCLUDE_SUFFIXES) {
    if (basename.endsWith(suffix) || basename === suffix) return true;
  }

  return false;
}

// ─── Collect files to stage ───────────────────────────────────────────────────
async function collectFiles(srcDir, relBase = '') {
  const result = [];
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (shouldExclude(rel)) continue;
    const full = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      const sub = await collectFiles(full, rel);
      result.push(...sub);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      result.push({ full, rel });
    }
  }
  return result;
}

async function gatherKitFiles() {
  const files = [];

  for (const dir of KIT_INCLUDE_DIRS) {
    const dirPath = path.join(root, dir);
    if (!existsSync(dirPath)) {
      log('skip', c.yellow, `${dir}/ not found — skipping`);
      continue;
    }
    const sub = await collectFiles(dirPath, dir);
    files.push(...sub);
  }

  for (const file of KIT_INCLUDE_FILES) {
    const filePath = path.join(root, file);
    if (!existsSync(filePath)) {
      log('skip', c.yellow, `${file} not found — skipping`);
      continue;
    }
    if (!shouldExclude(file)) {
      files.push({ full: filePath, rel: file });
    }
  }

  return files;
}

// ─── Integrity gate: every packed script path must exist in the archive ──────
// SCOPE-121 Amendment A / FR-013 (T016). The kit's root package.json is mirrored verbatim from
// wxKanban, but root scripts/ is deliberately NOT mirrored — so the manifest named 11 scripts/*
// paths no archive has ever contained, and `npm run kit:start` has failed with MODULE_NOT_FOUND
// on every consumer since v1.2.7 (field report a01a6b7c). Nothing detected it: the v1.7.32
// incident shows a short archive publishes and SHA-verifies exactly like a complete one, because
// the checksum attests to what was packed, never to what was promised. This gate closes that gap
// by resolving the promise against the pack — it runs on the staged file list, before any archive
// is written, and exits non-zero naming each unresolvable path.
//
// WHICH paths are checked: those rooted in a kit-owned directory (KIT_INCLUDE_DIRS), plus `tsc -p`
// config arguments. Entries like `dev:server` → `src/server/index.ts`, `build:client` →
// `vite.config.ts` and `test:unit` → `tests/unit` are deliberately NOT checked: the archive ships
// zero files under src/ by design, and those entries are templates the CONSUMER's own application
// satisfies. Checking them would fail every build for paths the kit is not responsible for.
// Kit-owned paths are the opposite — if the kit names one, the kit must ship it.
//
// Paths are matched ANYWHERE in the command string, not as a leading token. The field report's own
// regex assumed a leading `scripts/` and so chopped `tsx _wxAI/skills/wxDBAnalyze/scripts/cli.ts`
// down to `scripts/cli.ts`, reporting a present file as missing and inflating the count to 12.
// Matching in place keeps that a non-finding.
function extractKitOwnedPaths(command) {
  const found = new Set();

  // Any kit-owned directory prefix, wherever it appears — after `node `, inside `tsx …`, in a
  // quoted argument, or mid-string. Trailing shell/quote punctuation is trimmed off the match.
  const owned = KIT_INCLUDE_DIRS.map((d) => d.replace(/\./g, '\\.')).join('|');
  const pathRe = new RegExp(`(?:^|[\\s"'=(,;])((?:${owned})/[^\\s"'\`)]+)`, 'g');
  for (const m of command.matchAll(pathRe)) {
    const cleaned = m[1].replace(/[,;:.]+$/, '');
    if (cleaned && !cleaned.includes('*') && !cleaned.includes('?')) found.add(cleaned);
  }

  // `tsc -p <config>` / `--project <config>`. The config lives at the repo root, so the prefix
  // rule above cannot see it — and an unshipped tsconfig fails the script just as hard as an
  // unshipped .mjs would (ticket 192e08c1).
  for (const m of command.matchAll(/(?:^|\s)(?:-p|--project)(?:\s+|=)([^\s"'`]+)/g)) {
    if (m[1]) found.add(m[1]);
  }

  return [...found];
}

function verifyPackagedScriptPaths(files) {
  const pkgPath = path.join(root, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error('package.json not found at repo root — cannot verify the packed scripts block');
  }
  const scripts = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {};

  // Resolve against what is actually STAGED, not against the working tree — the exclusion rules
  // above can drop a file that exists on disk, and that is precisely the failure worth catching.
  const stagedFiles = new Set(files.map((f) => f.rel));
  const stagedDirs = new Set();
  for (const { rel } of files) {
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i += 1) stagedDirs.add(parts.slice(0, i).join('/'));
  }

  const failures = [];
  for (const [name, command] of Object.entries(scripts)) {
    for (const p of extractKitOwnedPaths(command)) {
      if (!stagedFiles.has(p) && !stagedDirs.has(p)) failures.push({ name, path: p });
    }
  }

  if (failures.length) {
    console.log('');
    log('gate', c.red, col(c.bold, `${failures.length} package.json script path(s) are not in the archive:`));
    for (const { name, path: p } of failures) {
      console.log(`    ${col(c.red, '✗')}  ${col(c.bold, name)}  →  ${p}`);
    }
    console.log('');
    console.log(`  ${col(c.dim, 'Fix by shipping the file (KIT_INCLUDE_DIRS / KIT_INCLUDE_FILES, or copy it into')}`);
    console.log(`  ${col(c.dim, 'this repo), or by removing the script entry in sync-to-orchestrator.mjs\'s')}`);
    console.log(`  ${col(c.dim, 'FORBIDDEN_KIT_SCRIPTS. Editing only this repo\'s package.json will regress on')}`);
    console.log(`  ${col(c.dim, 'the next sync, which re-mirrors wxKanban\'s manifest.')}`);
    console.log('');
    throw new Error('release blocked — the archive does not contain every script it advertises');
  }

  const checked = Object.values(scripts).reduce((n, cmd) => n + extractKitOwnedPaths(cmd).length, 0);
  log('gate', c.green, `${checked} kit-owned script path(s) resolve in the staged archive`);
}

// ─── Integrity gate: every spawn in a shipped script must hide its console ────
// On Windows a console program (cmd.exe, powershell.exe, a .cmd shim, or node.exe
// itself) launched from a console-LESS parent — the VS Code task runner — is handed
// a fresh, VISIBLE console window. The folderOpen task runs on every project open,
// so the windows accumulate across a multi-project estate and never close.
//
// This has now regressed three times (feedback e8849e53, 8a2b439a, and again at
// v1.7.53 when setup-gateway.mjs and kit-start.mjs arrived carrying the same
// omission). The existing defence was a comment inside init.mjs, which protects
// exactly one file — that is precisely how two NEW files repeated the bug. A gate
// travels with the archive instead.
//
// Deliberately a count-based heuristic, not an AST: it asks only "does this file
// have at least as many `windowsHide` options as spawn call sites". That is enough
// to catch the real failure mode (a new file that spawns and never mentions it) and
// is cheap enough to never be the reason a release is skipped. A file with a genuine
// exception opts out explicitly with `// windows-hide-exempt: <reason>`, which is
// reviewable — unlike deleting the gate.
// The leading lookbehind excludes member calls — `RE.exec(line)` is a regex match,
// not a process spawn, and without this a lint script full of regexes trips the gate.
// Known trade-off: a namespaced `child_process.exec(...)` is missed. The kit's own
// style is destructured imports (`spawnSync(...)`), which is what this must catch.
const SPAWN_CALL_RE = /(?<![.\w])(?:spawnSync|spawn|execFileSync|execFile|execSync|exec)\s*\(/g;
const WINDOWS_HIDE_RE = /windowsHide\s*:\s*true/g;
// Anchored to the start of a comment line so the marker is a DIRECTIVE, not a
// mention. Unanchored, this file exempted itself simply by documenting the marker
// — and so would any file that merely explains the convention.
const WINDOWS_HIDE_EXEMPT_RE = /^\s*(?:\/\/|#)\s*windows-hide-exempt:/m;

/** Blank out block and line comments, preserving offsets well enough to count. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function verifyWindowsHide(files) {
  const failures = [];
  let checked = 0;

  for (const { full, rel } of files) {
    if (!rel.startsWith('scripts/')) continue;
    if (!/\.(mjs|js|cjs)$/.test(rel)) continue;

    let src;
    try {
      src = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    if (WINDOWS_HIDE_EXEMPT_RE.test(src)) continue;

    // Count against CODE only. Comments discussing the pattern — including this
    // file's own — otherwise inflate both sides of the comparison and make the
    // gate lie in whichever direction the prose happens to fall.
    const code = stripComments(src);

    const calls = (code.match(SPAWN_CALL_RE) || []).length;
    if (calls === 0) continue;
    checked++;

    const hides = (code.match(WINDOWS_HIDE_RE) || []).length;
    if (hides < calls) failures.push({ rel, calls, hides });
  }

  if (failures.length) {
    console.log('');
    log('gate', c.red, col(c.bold, `${failures.length} shipped script(s) spawn without windowsHide:`));
    for (const { rel, calls, hides } of failures) {
      console.log(`    ${col(c.red, '✗')}  ${col(c.bold, rel)}  —  ${calls} spawn site(s), ${hides} windowsHide`);
    }
    console.log('');
    console.log(`  ${col(c.dim, 'On Windows each un-hidden spawn opens a console window that never closes.')}`);
    console.log(`  ${col(c.dim, 'Add `windowsHide: true` to the options object at each site — inherited stdio')}`);
    console.log(`  ${col(c.dim, 'still carries the output, and `detached`/`shell` can stay. See init.mjs for the')}`);
    console.log(`  ${col(c.dim, 'proven pattern. If a site genuinely cannot hide, add a `// windows-hide-exempt:')}`);
    console.log(`  ${col(c.dim, '<reason>` comment to the file so the exception is recorded rather than silent.')}`);
    console.log('');
    throw new Error('release blocked — a shipped script spawns a visible console window on Windows');
  }

  log('gate', c.green, `${checked} shipped script(s) with spawn sites all hide the console`);
}

// ─── SHA-256 of a file ────────────────────────────────────────────────────────
async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

// ─── Create tar.gz archive ───────────────────────────────────────────────────
function createTarGz(files, outPath) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(outPath);
    const arc = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });
    out.on('close', resolve);
    out.on('error', reject);
    arc.on('error', reject);
    arc.pipe(out);
    for (const { full, rel } of files) {
      arc.file(full, { name: rel });
    }
    arc.finalize();
  });
}

// ─── Create zip archive ───────────────────────────────────────────────────────
function createZip(files, outPath) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(outPath);
    const arc = archiver('zip', { zlib: { level: 9 } });
    out.on('close', resolve);
    out.on('error', reject);
    arc.on('error', reject);
    arc.pipe(out);
    for (const { full, rel } of files) {
      arc.file(full, { name: rel });
    }
    arc.finalize();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${col(c.bold + c.magenta, 'wxKanban Kit — Build Release')}\n`);
  log('version', c.cyan, col(c.bold, version));

  const outDir = path.join(root, 'releases', version);
  const tarPath = path.join(outDir, 'kit.tar.gz');
  const zipPath = path.join(outDir, 'kit.zip');
  const tarShaPath = `${tarPath}.sha256`;
  const zipShaPath = `${zipPath}.sha256`;

  log('output', c.cyan, `releases/${version}/`);

  // ─── Pre-build every shared/* package so its dist/ ships in the archive ───
  // Spec 029 / v1.2.8 — wxkanban-agent's `@wxkanban/preflight` file: dependency
  // resolves to shared/preflight/dist/index.js. Same for `@wxkanban/watermark`
  // → shared/watermark/dist/index.js. Every dist/ is .gitignored AND filtered
  // out by EXCLUDE_BASENAMES-adjacent mirroring, so we build them on demand
  // right before packing.
  //
  // Discovered, not hard-coded: hard-coding `preflight` shipped a kit whose
  // @wxkanban/watermark resolved to a package with no dist/ (field report
  // 9cd91ed8, 2026-07-23). Any shared/<pkg> with a package.json `build` script
  // is now pre-built, so adding a third shared package needs no edit here.
  const sharedRoot = path.join(root, 'shared');
  const sharedPkgDirs = existsSync(sharedRoot)
    ? (await fsp.readdir(sharedRoot, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && e.name !== 'node_modules')
        .map((e) => path.join(sharedRoot, e.name))
        .filter((d) => existsSync(path.join(d, 'package.json')))
        .filter((d) => {
          try {
            const pkg = JSON.parse(readFileSync(path.join(d, 'package.json'), 'utf8'));
            return Boolean(pkg.scripts?.build);
          } catch {
            return false;
          }
        })
    : [];

  if (sharedPkgDirs.length) {
    const { execSync } = await import('node:child_process');
    for (const pkgDir of sharedPkgDirs) {
      const name = path.basename(pkgDir);
      log('prebuild', c.yellow, `Building shared/${name}...`);
      // Remove any stale tsbuildinfo that got mirrored from wxKanban; tsc -b
      // treats it as proof the build is current and skips emitting dist/.
      const buildInfo = path.join(pkgDir, 'tsconfig.tsbuildinfo');
      if (existsSync(buildInfo)) await fsp.rm(buildInfo);
      const distDir = path.join(pkgDir, 'dist');
      if (existsSync(distDir)) await fsp.rm(distDir, { recursive: true, force: true });
      if (!existsSync(path.join(pkgDir, 'node_modules'))) {
        execSync('npm install', { cwd: pkgDir, stdio: 'inherit', windowsHide: true });
      }
      execSync('npx tsc -b --force', { cwd: pkgDir, stdio: 'inherit', windowsHide: true });
      if (!existsSync(distDir)) {
        throw new Error(`shared/${name} prebuild produced no dist/ — investigate before packing`);
      }
      log('prebuild', c.green, `shared/${name}/dist ready`);
    }
  }

  // ─── Dev Cockpit — Marketplace-only (SCOPE-086) ───────────────────────────
  // The kit no longer bundles or ships a .vsix. The Dev Cockpit is published to
  // the public VS Code Marketplace (wxperts.wxkanban-dev-cockpit); the kit's
  // ensureCockpitUpToDate installs and updates it from there by extension ID.
  // Nothing to pre-build, pack, or track here.

  // ─── Collect ────────────────────────────────────────────────────────────
  log('scan', c.yellow, 'Scanning kit files...');
  const files = await gatherKitFiles();
  log('scan', c.green, `${files.length} files staged`);

  // Gate BEFORE packing, and in --dry-run too — a dry run is how this is checked ahead of a
  // release, so it has to be able to fail.
  verifyPackagedScriptPaths(files);
  verifyWindowsHide(files);

  if (DRY_RUN) {
    console.log('');
    for (const { rel } of files) {
      console.log(`  ${col(c.dim, '+')}  ${rel}`);
    }
    console.log(`\n${col(c.yellow, '  Dry run — no archives created.')}\n`);
    process.exit(0);
  }

  // ─── Create output dir ───────────────────────────────────────────────────
  await fsp.mkdir(outDir, { recursive: true });

  // ─── tar.gz ──────────────────────────────────────────────────────────────
  log('pack', c.yellow, 'Creating kit.tar.gz...');
  await createTarGz(files, tarPath);
  const tarBytes = statSync(tarPath).size;
  const tarSha = await sha256File(tarPath);
  await fsp.writeFile(tarShaPath, `${tarSha}  kit.tar.gz\n`, 'utf8');
  log('pack', c.green, `kit.tar.gz  ${(tarBytes / 1024 / 1024).toFixed(2)} MB  ${tarSha.slice(0, 12)}...`);

  // ─── zip ─────────────────────────────────────────────────────────────────
  log('pack', c.yellow, 'Creating kit.zip...');
  await createZip(files, zipPath);
  const zipBytes = statSync(zipPath).size;
  const zipSha = await sha256File(zipPath);
  await fsp.writeFile(zipShaPath, `${zipSha}  kit.zip\n`, 'utf8');
  log('pack', c.green, `kit.zip     ${(zipBytes / 1024 / 1024).toFixed(2)} MB  ${zipSha.slice(0, 12)}...`);

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${col(c.bold, '  Release artifacts:')}`);
  for (const f of ['kit.tar.gz', 'kit.tar.gz.sha256', 'kit.zip', 'kit.zip.sha256']) {
    console.log(`    ${col(c.green, '✓')}  releases/${version}/${f}`);
  }

  console.log(`\n${col(c.bold, '  GitHub release checklist:')}`);
  console.log(`    1. Commit + tag:   ${col(c.cyan, `git tag ${version} && git push origin ${version}`)}`);
  console.log(`    2. Create release: ${col(c.cyan, `gh release create ${version} --title "Kit ${version}" --generate-notes \\`)}`);
  console.log(`       ${col(c.cyan, `  releases/${version}/kit.tar.gz \\`)}`);
  console.log(`       ${col(c.cyan, `  releases/${version}/kit.tar.gz.sha256 \\`)}`);
  console.log(`       ${col(c.cyan, `  releases/${version}/kit.zip \\`)}`);
  console.log(`       ${col(c.cyan, `  releases/${version}/kit.zip.sha256`)}`);
  console.log('');
}

main().catch(err => {
  log('error', c.red, err.message);
  process.exit(1);
});
