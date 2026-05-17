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
import { createReadStream, createWriteStream, existsSync, promises as fsp, statSync } from 'node:fs';
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
const KIT_INCLUDE_DIRS  = ['bin', 'wxkanban-agent', 'mcp-server', '_wxAI', 'scripts', '.vscode', '.claude'];
const KIT_INCLUDE_FILES = ['package.json', 'package-lock.json'];

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

  // ─── Collect ────────────────────────────────────────────────────────────
  log('scan', c.yellow, 'Scanning kit files...');
  const files = await gatherKitFiles();
  log('scan', c.green, `${files.length} files staged`);

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
