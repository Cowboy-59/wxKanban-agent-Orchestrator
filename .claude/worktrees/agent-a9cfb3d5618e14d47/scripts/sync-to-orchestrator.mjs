#!/usr/bin/env node
/**
 * sync-to-orchestrator.mjs — Mirror kit content from this repo (wxKanban)
 * to a local checkout of the orchestrator repo
 * (https://github.com/Cowboy-59/wxKanban-agent-Orchestrator), then optionally
 * build + push a new GitHub release.
 *
 * Why this exists: the wxKanban server's /api/projects/:id/kit/upgrade endpoint
 * serves release assets from the orchestrator repo, not from this repo. Files
 * added or edited here (wxICA skill, /analyzecode command, recent commands)
 * never reach real consumers until they land in an orchestrator release.
 * Before this script, that sync was manual and silently drifted.
 *
 * What gets mirrored:
 *   - wxkanban-agent/       (the kit's CLI + orchestrator code)
 *   - _wxAI/                (commands + rules + templates)
 *   - .claude/<skill>/      (every subdirectory with at least one file — the
 *                            new wxICA + diagnose + code-review + ... skills)
 *   - package.json          (root)
 *   - package-lock.json     (root)
 *
 * What is DELIBERATELY NOT mirrored:
 *   - scripts/              (orchestrator ships consumer-facing scripts; this
 *                            repo has kit-author-facing scripts. Different
 *                            files under the same name.)
 *   - mcp-server/           (orchestrator embeds distribution credentials)
 *   - .vscode/              (per-environment IDE settings)
 *   - CLAUDE.md, AI.md,     (customizable templates; orchestrator owns its
 *     ProjectOverview.md,    defaults)
 *     README.md
 *
 * Usage:
 *   node scripts/sync-to-orchestrator.mjs --orchestrator <path>
 *   node scripts/sync-to-orchestrator.mjs --orchestrator <path> --dry-run
 *   node scripts/sync-to-orchestrator.mjs --orchestrator <path> --release --notes "what's new"
 *   node scripts/sync-to-orchestrator.mjs --orchestrator <path> --version 1.0.5 --release
 *
 * Flags:
 *   --orchestrator <path>   Local checkout of the orchestrator repo.
 *                           Defaults to env WXKANBAN_ORCHESTRATOR_PATH or
 *                           ../wxKanban-agent-Orchestrator (sibling).
 *   --version <semver>      Version to write to the orchestrator's
 *                           package.json + wxkanban-agent/package.json
 *                           (defaults to this repo's wxkanban-agent version).
 *   --release               After sync, run build-release.mjs in the
 *                           orchestrator, commit + push to origin/main, then
 *                           create a GitHub release with the 4 archive assets.
 *   --notes "<text>"        Release notes body (with --release).
 *   --dry-run               Preview the file plan without writing anything.
 *   --yes                   Skip the confirmation prompt before write phase.
 *
 * Exit codes:
 *   0 — sync (and release if requested) succeeded
 *   1 — sync or release failed
 *   2 — missing/invalid orchestrator path
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  readdirSync,
  lstatSync,
  mkdtempSync,
} from 'fs';
import { join, dirname, resolve, basename, relative } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';
import readline from 'readline';
import crypto from 'node:crypto';
import os from 'node:os';
import { isSecretName, findSecretPaths } from './release-secret-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(__dirname, '..');

// ─── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RELEASE = args.includes('--release');
const YES = args.includes('--yes');

const argVal = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
};
const NOTES = argVal('--notes');

const ORCH_PATH =
  argVal('--orchestrator') ??
  process.env['WXKANBAN_ORCHESTRATOR_PATH'] ??
  resolve(SOURCE_ROOT, '..', 'wxKanban-agent-Orchestrator');

// ─── Colours ─────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m',
  yellow: '\x1b[33m', red: '\x1b[31m', magenta: '\x1b[35m',
};
const col = (s, t) => `${s}${t}${c.reset}`;
const log = (tag, color, msg) =>
  console.log(`${col(color, `[${tag}]`)} ${msg}`);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Files that live inside a mirrored directory but are kit-author tooling, not
 * consumer-facing kit content. Excluded from the mirror rather than deleted, so
 * they stay available in this repo.
 */
// Kit-author drivers that live under `wxkanban-agent/` for module resolution (the
// kit is CommonJS, the repo root is ESM) but are author tooling, not consumer kit
// content. mkproposal/run-implement are additionally gitignored; the SCOPE-127
// pair is committed (they use console.error, which Constitution IV permits), so
// the untracked-content guard cannot see them — this filter is the ONLY thing
// keeping them out of a PUBLIC release.
const AUTHOR_ONLY_FILES = new Set([
  'mkproposal.ts',
  'run-implement.ts',
  'create-specs-from-scope.ts',
  'seed-127-tasks.ts',
]);

// Secret-shaped files the mirror skipped, reported after the copy so the exclusion is visible.
const SKIPPED_SECRETS = new Set();

function copyFilter(src) {
  const name = basename(src);
  // A gitignored secret inside a mirrored directory still ships: this script mirrors the
  // filesystem. v1.7.83 and v1.7.84 shipped wxkanban-agent/.wxai/.entitlement that way.
  if (isSecretName(name)) {
    SKIPPED_SECRETS.add(src);
    return false;
  }
  // Never carry symlinks into the mirrored kit. .claude/skills/ picks up symlinks to
  // the author's local media/HyperFrames skills (absolute machine paths) — they would
  // be dangling for every consumer, and Windows cannot recreate them without elevation
  // (EPERM). Skip any symlink outright.
  try {
    if (lstatSync(src).isSymbolicLink()) return false;
  } catch {
    /* unreadable — let cpSync surface it */
  }
  return (
    name !== 'node_modules' &&
    name !== '.git' &&
    name !== 'dist' &&
    name !== 'logs' &&
    name !== 'releases' &&
    // SCOPE-086 — the Dev Cockpit ships only via the VS Code Marketplace; the kit
    // never carries a `.vsix`. Belt-and-suspenders guard against a stray artifact.
    !name.endsWith('.vsix') &&
    // Kit-author drivers that live inside wxkanban-agent/ for module-resolution
    // reasons (the kit is CommonJS, the repo root is ESM) but are NOT consumer
    // code. run-implement.ts references "this checkout" and would be meaningless
    // — and misleading — in a customer's kit. Tracked in wxKanban so they are not
    // lost; excluded here so they never ship.
    !AUTHOR_ONLY_FILES.has(name)
  );
}

function ask(q) {
  return new Promise((resolveP) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolveP(a.trim().toLowerCase()); });
  });
}

function runIn(cmd, cwd, opts = {}) {
  log('run', c.dim, `${cmd}  ${col(c.dim, `(in ${cwd})`)}`);
  if (DRY_RUN && !opts.alwaysRun) return '';
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: opts.capture ? 'pipe' : 'inherit', shell: true });
}

function sha256(file) {
  return crypto.createHash('sha256').update(readFileSync(file)).digest('hex');
}

// SCOPE-086 FR-001 — after `gh release create`, re-download the PUBLISHED GitHub
// assets and assert they byte-match the freshly-built local archives (SHA-256).
// A stale/failed upload (published != local build) is exactly the defect that
// shipped a broken kit on 2026-07-04 while the script still reported success —
// fail the release loudly instead of letting it reach customers. KitProxyService
// verifies the archive against the release's OWN sidecar, so a
// self-consistent-but-stale pair passes there; this catches it at release time.
const ORCH_REPO_SLUG = 'Cowboy-59/wxKanban-agent-Orchestrator';
function verifyPublishedRelease(tag, releaseDir) {
  if (DRY_RUN) return;
  log('verify', c.yellow, 'Verifying published assets match the local build (SHA-256)…');
  const tmp = mkdtempSync(join(os.tmpdir(), 'wxk-relverify-'));
  try {
    for (const asset of ['kit.tar.gz', 'kit.zip']) {
      const localSha = sha256(join(releaseDir, asset));
      const outPath = join(tmp, asset);
      runIn(
        `gh release download ${tag} --repo ${ORCH_REPO_SLUG} --pattern ${asset} -O "${outPath}" --clobber`,
        ORCH_PATH,
      );
      const pubSha = sha256(outPath);
      if (pubSha !== localSha) {
        const assets = ['kit.tar.gz', 'kit.tar.gz.sha256', 'kit.zip', 'kit.zip.sha256']
          .map((n) => `"${join(releaseDir, n)}"`).join(' ');
        log('error', c.red,
          `PUBLISHED ${asset} does NOT match the local build — the upload did not land the fresh archive.\n` +
          `    local build: ${localSha}\n` +
          `    published:   ${pubSha}\n` +
          `    Re-upload the correct assets, then re-run this verify:\n` +
          `      gh release upload ${tag} --repo ${ORCH_REPO_SLUG} ${assets} --clobber`);
        process.exit(1);
      }
    }
    log('verify', c.green, 'Published assets verified: byte-match local build.');
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// Directories under `.claude/` that are AUTHOR-SIDE ONLY and must never reach a consumer.
// This function ships every `.claude/<dir>` that contains any file, and the kit release is a
// PUBLIC GitHub release — so anything dropped in here is published by default. `agents/` holds
// vendor-process agents (feedback triage, release batching) that reference our own feedback-sink
// project ID; they are meaningless to a consumer and should not be handed out. Same hazard class
// as the untracked-content guard: the sync mirrors the FILESYSTEM, not git.
// If a consumer-facing agent is ever wanted, give it its own directory rather than removing this.
const CLAUDE_AUTHOR_ONLY_DIRS = new Set(['agents']);

// `.claude/skills/` is a MIXED directory — product skills sit alongside the author's personal
// ones (video production, HyperFrames, design tooling), because that is simply where Claude Code
// keeps project-scoped skills. Shipping the directory wholesale published every personal skill to
// a PUBLIC GitHub release, and `.claude/skills/` is gitignored here, so neither `git status` nor
// the untracked-content guard could see it — ignored is not untracked.
//
// This is an ALLOWLIST, deliberately: a newly-dropped skill defaults to NOT shipping. A denylist
// would default to leaking, which is the bug class this exists to close. Add a name here only when
// the skill is genuinely part of the customer-facing kit.
const CLAUDE_SKILLS_DIR = 'skills';
// 'dev-plan' was retired by SCOPE-136 FR-011: its roadmap and PDF renderer moved into wxG-O-D, and
// /dev-plan is a command alias for one release. The orchestrator's old copy is NOT pruned by this
// sync (see above) and must be deleted there by hand when this ships.
const CLAUDE_SKILLS_ALLOWLIST = new Set([
  'help-catalog',
  'marketing-feature-set',
  'scope-flow-map',
  'test-sweep',
  'web-artifacts-builder',
  'wxBrainstorm',
  'wxBrand',
  'wxDesigner',
  'wxG-O-D',
  'wxHelpGenerate',
  'wxUIUXCodeReview',
]);

function listClaudeSkillDirs(root) {
  const claudeDir = join(root, '.claude');
  if (!existsSync(claudeDir)) return [];
  function hasAnyFile(dir) {
    try {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isFile()) return true;
        if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') {
          if (hasAnyFile(join(dir, e.name))) return true;
        }
      }
    } catch { /* ignore */ }
    return false;
  }
  try {
    const dirs = readdirSync(claudeDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git')
      .filter((e) => !CLAUDE_AUTHOR_ONLY_DIRS.has(e.name))
      .filter((e) => hasAnyFile(join(claudeDir, e.name)));

    const out = [];
    for (const e of dirs) {
      if (e.name !== CLAUDE_SKILLS_DIR) {
        out.push(`.claude/${e.name}`);
        continue;
      }
      // Expand the mixed skills directory into one path per ALLOWLISTED skill, so the
      // mirror copies (and `git add`s) only those. Non-allowlisted skills are never read,
      // and existing orchestrator content outside the allowlist is left untouched rather
      // than deleted — removing a skill from the kit is a deliberate act, not a side effect.
      const skillsRoot = join(claudeDir, e.name);
      for (const s of readdirSync(skillsRoot, { withFileTypes: true })) {
        if (!s.isDirectory() || s.name === 'node_modules' || s.name === '.git') continue;
        if (!CLAUDE_SKILLS_ALLOWLIST.has(s.name)) continue;
        if (!hasAnyFile(join(skillsRoot, s.name))) continue;
        out.push(`.claude/${e.name}/${s.name}`);
      }
    }
    return out;
  } catch {
    return [];
  }
}

// Paths to mirror from this repo to the orchestrator. See header doc for what
// is deliberately excluded.
//
// Spec 029 / v1.2.8 hotfix — shared/preflight/ is included so wxkanban-agent's
// `@wxkanban/preflight` file: dependency resolves on consumer machines.
// Without this, dbpush crashes on a freshly upgraded kit with
// "Cannot find module '@wxkanban/preflight'".
// SCOPE-086 — vscode-extension/ is NO LONGER mirrored into the orchestrator. The
// Dev Cockpit is delivered solely via the VS Code Marketplace
// (`wxperts.wxkanban-dev-cockpit`); the kit neither bundles a `.vsix` nor rebuilds
// one at release. ensureCockpitUpToDate installs it by Marketplace ID on first run.
const KIT_DIRS = ['wxkanban-agent', '_wxAI', 'shared'];
// SCOPE-121 / T016: tsconfig.wxdbanalyze.json is referenced by the kit's `typecheck:dbanalyze`
// script and by the shipped wxDBAnalyze skill, but was in neither allowlist — so the entry has
// always failed with TS5058 on consumers (ticket 192e08c1). Adding it to ONE allowlist is not
// enough; KIT_INCLUDE_FILES in the orchestrator's build-release.mjs must list it too.
const KIT_FILES = ['package.json', 'package-lock.json', 'README_MAC_OS.md', 'tsconfig.wxdbanalyze.json'];

// ─── Validation ──────────────────────────────────────────────────────────────
function validateOrchestrator() {
  if (!existsSync(ORCH_PATH)) {
    log('error', c.red, `Orchestrator path does not exist: ${ORCH_PATH}`);
    process.exit(2);
  }
  if (!existsSync(join(ORCH_PATH, '.git'))) {
    log('error', c.red, `Not a git checkout: ${ORCH_PATH}`);
    process.exit(2);
  }
  let remote = '';
  try {
    remote = execSync('git remote get-url origin', {
      cwd: ORCH_PATH, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { /* swallow */ }
  if (!/wxKanban-agent-Orchestrator(\.git)?$/i.test(remote)) {
    log('error', c.red,
      `Remote origin doesn't look like the orchestrator repo: "${remote}"`);
    log('hint', c.dim,
      `Expected something ending in "wxKanban-agent-Orchestrator". Refusing to sync.`);
    process.exit(2);
  }
  return remote;
}

// [SCOPE 080 / T003] Release-time regression guard for the SPEC-FIRST gate.
// The scaffold CLAUDE.md is orchestrator-OWNED (deliberately NOT mirrored by
// this script), so a softened gate can't be caught by re-syncing — assert the
// hardened canonical markers here and REFUSE to publish a drifted gate.
// Origin: SCOPE-080 (gate rationalized past in YappChat dogfooding → FR-003).
const SPEC_FIRST_REQUIRED = [
  'HARD GATE',
  'REFUSE to write the feature code',
  'What the gate covers',
  'What is exempt',
  'trivial fixes',
  'operational AWS',
];
const SPEC_FIRST_FORBIDDEN = ['STOP, ASK user'];

function assertSpecFirstGateHardened() {
  const claudePath = join(ORCH_PATH, 'CLAUDE.md');
  if (!existsSync(claudePath)) {
    log('error', c.red, `Orchestrator CLAUDE.md not found at ${claudePath} — cannot verify the SPEC-FIRST gate.`);
    process.exit(1);
  }
  const text = readFileSync(claudePath, 'utf8');
  const missing = SPEC_FIRST_REQUIRED.filter((m) => !text.includes(m));
  const leaked = SPEC_FIRST_FORBIDDEN.filter((m) => text.includes(m));
  if (missing.length || leaked.length) {
    log('error', c.red, 'SPEC-FIRST gate in orchestrator CLAUDE.md has drifted from the hardened canonical text (SCOPE-080).');
    if (missing.length) log('error', c.red, `  missing required phrase(s): ${missing.map((m) => JSON.stringify(m)).join(', ')}`);
    if (leaked.length) log('error', c.red, `  soft wording still present: ${leaked.map((m) => JSON.stringify(m)).join(', ')}`);
    log('hint', c.dim, '  Re-harden the SPEC-FIRST section before releasing (SCOPE-080 / FR-001..FR-003).');
    process.exit(1);
  }
  log('gate', c.green, 'SPEC-FIRST hard-gate verified in orchestrator CLAUDE.md.');
}

// This script mirrors the FILESYSTEM, not git. Anything sitting inside a mirrored
// directory is packed and published, committed or not — and the orchestrator repo is
// public. On 2026-07-28 that shipped three untracked WIP directories (`_wxAI/
// CourseCreator/`, `_wxAI/skills/BuildBrandLinkedIn/`, `_wxAI/skills/FacelessChannel/`,
// 29 files) into public release v1.7.40, which had to be deleted and re-cut.
//
// So: refuse to sync while a mirrored directory holds uncommitted content. Untracked
// files are the dangerous case — they are usually WIP nobody meant to publish — but a
// modified tracked file is also a signal the release would not match the commit it
// claims to be built from. `--allow-untracked` is the deliberate override.
function assertMirroredTreeCommitted() {
  if (args.includes('--allow-untracked')) {
    log('warn', c.yellow, 'Skipping the uncommitted-content check (--allow-untracked).');
    return;
  }

  const mirrored = [...KIT_DIRS, '.claude'];
  let porcelain = '';
  try {
    porcelain = execSync(`git status --porcelain -- ${mirrored.join(' ')}`, {
      cwd: SOURCE_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    log('warn', c.yellow, 'Could not read git status — skipping the uncommitted-content check.');
    return;
  }

  const entries = porcelain.split('\n').map((l) => l.trim()).filter(Boolean);
  if (entries.length === 0) return;

  const untracked = entries.filter((l) => l.startsWith('??')).map((l) => l.slice(2).trim());
  const modified = entries.filter((l) => !l.startsWith('??')).map((l) => l.slice(2).trim());

  console.log('');
  log('error', c.red, 'Uncommitted content inside a mirrored directory — it WOULD ship to customers.');
  if (untracked.length > 0) {
    console.log(col(c.bold, '\n  Untracked (most likely work in progress):'));
    for (const f of untracked) console.log(`    ${col(c.red, '??')}  ${f}`);
  }
  if (modified.length > 0) {
    console.log(col(c.bold, '\n  Modified but not committed:'));
    for (const f of modified) console.log(`    ${col(c.yellow, ' M')}  ${f}`);
  }
  console.log(
    `\n  Commit them, move them outside ${mirrored.join('/, ')}/, or re-run with ` +
    `${col(c.cyan, '--allow-untracked')} if you genuinely intend to publish them.\n`,
  );
  process.exit(2);
}

// Second layer behind copyFilter: re-scan what was actually staged in the orchestrator and fail
// the release if any secret-shaped file is there. copyFilter can regress (a new copy path, a
// renamed helper); this cannot be bypassed by one. There is no override flag on purpose.
function assertNoSecretPaths(stagedDirs, stagedFiles) {
  const found = [
    ...findSecretPaths(stagedDirs.map((d) => join(ORCH_PATH, d)), ORCH_PATH),
    // Root files are single files, so the directory scan never sees them; cpSync gives them no filter.
    ...stagedFiles.filter((f) => isSecretName(basename(f))),
  ];
  if (found.length === 0) return;
  console.log('');
  log('error', c.red, 'Secret-shaped files are staged for a PUBLIC release. Nothing was committed or pushed.');
  for (const f of found) console.log(`    ${col(c.red, '!!')}  ${f}`);
  console.log(
    `\n  Remove them from ${ORCH_PATH} and from the source tree, or fix copyFilter, then re-run.\n` +
    '  If one of these held a live token, rotate it: the file was readable on this machine only,\n' +
    '  but a token that reached any earlier release must be treated as exposed.\n',
  );
  process.exit(1);
}

// [SCOPE 139 / T009] BEGIN — Release checklist: review the pinned HyperFrames version (FR-009)
// --video installs HyperFrames on first use at the version pinned in video.mjs. The pin is reviewed
// at every kit release: this prints it, and the newest published version when npm can be reached.
function reviewHyperframesPin() {
  let pin = null;
  try {
    pin = /PINNED_HYPERFRAMES\s*=\s*'([^']+)'/.exec(readFileSync(join(SOURCE_ROOT, '_wxAI', 'skills', 'wxHelpGenerate', 'scripts', 'video.mjs'), 'utf8'))?.[1] ?? null;
  } catch {
    return;
  }
  if (!pin) return;
  let latest = null;
  try {
    latest = execSync('npm view hyperframes version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim();
  } catch {
    // offline: the reminder still prints
  }
  log('checklist', c.yellow, `Review the HyperFrames pin for --video: ${col(c.bold, pin)}${latest ? ` (newest published: ${latest}${latest === pin ? ', current' : '; pin a release at least two weeks old'})` : ''}. It lives in _wxAI/skills/wxHelpGenerate/scripts/video.mjs (both copies).`);
}
// [SCOPE 139 / T009] END

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${col(c.bold + c.magenta, 'wxKanban → Orchestrator Sync')}\n`);

  const remote = validateOrchestrator();
  log('source', c.cyan, SOURCE_ROOT);
  log('target', c.cyan, `${ORCH_PATH}  ${col(c.dim, `(${remote})`)}`);

  // [SCOPE 080 / T003] Fail fast if the published SPEC-FIRST gate has softened.
  assertSpecFirstGateHardened();

  // Refuse to publish work-in-progress that is not in git.
  assertMirroredTreeCommitted();

  // Resolve target version
  const sourceAgentPkg = readJson(join(SOURCE_ROOT, 'wxkanban-agent', 'package.json'));
  const explicitVersion = argVal('--version');
  let targetVersion =
    (explicitVersion && explicitVersion.replace(/^v/, '')) ||
    sourceAgentPkg?.version;
  if (!targetVersion) {
    log('error', c.red, 'Could not determine target version. Pass --version.');
    process.exit(1);
  }
  log('version', c.cyan, `Target version: ${col(c.bold, targetVersion)}`);
  reviewHyperframesPin(); // [SCOPE 139 / T009]

  // ── Build a plan ────────────────────────────────────────────────────────────
  const claudeSkills = listClaudeSkillDirs(SOURCE_ROOT);
  console.log('');
  console.log(col(c.bold, '  Directories to mirror (source → orchestrator):'));
  for (const d of KIT_DIRS) {
    const ok = existsSync(join(SOURCE_ROOT, d));
    console.log(`    ${ok ? col(c.green, '✓') : col(c.yellow, '— (not in source)')}  ${d}/`);
  }
  console.log('');
  console.log(col(c.bold, '  Claude Code skill directories:'));
  if (claudeSkills.length === 0) {
    console.log(`    ${col(c.dim, '— (none found)')}`);
  } else {
    for (const d of claudeSkills) console.log(`    ${col(c.green, '✓')}  ${d}/`);
  }
  console.log('');
  console.log(col(c.bold, '  Root files:'));
  for (const f of KIT_FILES) {
    const ok = existsSync(join(SOURCE_ROOT, f));
    console.log(`    ${ok ? col(c.green, '✓') : col(c.yellow, '— (not in source)')}  ${f}`);
  }
  console.log('');
  console.log(col(c.bold, '  NOT mirrored (orchestrator owns its copy):'));
  for (const f of ['scripts/', 'mcp-server/', '.vscode/', 'CLAUDE.md', 'AI.md', 'ProjectOverview.md', 'README.md']) {
    console.log(`    ${col(c.dim, '–')}  ${f}`);
  }

  if (DRY_RUN) {
    console.log(`\n${col(c.yellow, '  Dry run — no files were changed.')}\n`);
    process.exit(0);
  }

  if (!YES) {
    const answer = await ask(`\n  Proceed with sync${RELEASE ? ' + release' : ''}? [y/N] `);
    if (answer !== 'y' && answer !== 'yes') {
      log('abort', c.yellow, 'Cancelled.');
      process.exit(0);
    }
  }
  console.log('');

  // ── Copy kit dirs ──────────────────────────────────────────────────────────
  for (const dir of KIT_DIRS) {
    const src = join(SOURCE_ROOT, dir);
    const dst = join(ORCH_PATH, dir);
    if (!existsSync(src)) { log('skip', c.yellow, `${dir}/ not in source`); continue; }
    log('copy', c.cyan, `${dir}/`);
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
    cpSync(src, dst, { recursive: true, filter: copyFilter });
  }

  // Claude skills
  for (const dir of claudeSkills) {
    const src = join(SOURCE_ROOT, dir);
    const dst = join(ORCH_PATH, dir);
    log('copy', c.cyan, `${dir}/`);
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
    cpSync(src, dst, { recursive: true, filter: copyFilter });
  }

  // Root files
  for (const f of KIT_FILES) {
    const src = join(SOURCE_ROOT, f);
    const dst = join(ORCH_PATH, f);
    if (!existsSync(src)) { log('skip', c.yellow, `${f} not in source`); continue; }
    log('copy', c.cyan, f);
    cpSync(src, dst);
  }

  // Secret gate: report what the filter skipped, then re-scan the staged tree and fail on any hit.
  if (SKIPPED_SECRETS.size > 0) {
    log('secret', c.yellow, `Skipped ${SKIPPED_SECRETS.size} secret-shaped file(s) — not mirrored:`);
    for (const f of [...SKIPPED_SECRETS].sort()) console.log(`    ${col(c.dim, '–')}  ${relative(SOURCE_ROOT, f).split('\\').join('/')}`);
  }
  assertNoSecretPaths([...KIT_DIRS, ...claudeSkills], KIT_FILES);

  // ── Normalize line endings on the mirrored kit (cross-platform fix) ──────────
  // The kit is authored on a Windows working tree (CRLF). Shipping CRLF shebangs
  // (#!/usr/bin/env node\r) breaks the orchestrator CLI + scripts on macOS/Linux
  // ("env: node\r: No such file or directory"). Strip CR from copied text/script
  // files so the published artifact runs on every OS, regardless of build host.
  // .ps1/.cmd/.bat are intentionally excluded (they stay CRLF for Windows).
  const LF_EXTS = new Set(['.mjs', '.cjs', '.js', '.ts', '.tsx', '.sh', '.json', '.md', '.yml', '.yaml', '.map', '.txt']);
  let eolFixed = 0;
  const stripCr = (absFile) => {
    try {
      const buf = readFileSync(absFile);
      if (!buf.includes(13)) return; // no CR present
      // latin1 round-trip preserves every non-CR byte exactly (UTF-8 safe).
      const out = Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'latin1');
      writeFileSync(absFile, out);
      eolFixed++;
    } catch { /* skip unreadable */ }
  };
  const walkNormalize = (absDir) => {
    let entries;
    try { entries = readdirSync(absDir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = join(absDir, e.name);
      if (e.isDirectory()) { walkNormalize(p); continue; }
      if (!e.isFile()) continue;
      const dot = e.name.lastIndexOf('.');
      const ext = dot >= 0 ? e.name.slice(dot).toLowerCase() : '';
      if (LF_EXTS.has(ext)) stripCr(p);
    }
  };
  // Normalize the ENTIRE orchestrator working tree (not just the mirrored kit
  // dirs) so orchestrator-OWNED files like scripts/init.mjs also ship LF.
  // build-release packs from this filesystem; node_modules/.git are skipped
  // inside walkNormalize, and binaries are excluded by the LF_EXTS allowlist.
  walkNormalize(ORCH_PATH);
  log('eol', c.green, `Normalized line endings to LF (${eolFixed} file(s) had CRLF).`);

  // ── Update orchestrator root package.json: bump version + strip app-only DB deps ──
  // The kit is an HTTP/workflow engine — it must NOT ship pg/postgres/drizzle (the MCP server,
  // which uses them, is never bundled). The app's root package.json carries these for the app
  // itself; mirroring it verbatim made the kit's package.json declare them, which the orchestrator's
  // check-no-pg-in-kit guard (spec 028 T055 / BUG-20) correctly rejects. Strip them here so the kit
  // manifest is clean.
  const FORBIDDEN_KIT_DEPS = ['pg', 'postgres', 'drizzle-orm', 'drizzle-kit'];

  // [SCOPE 121 / T015] BEGIN — strip npm scripts the kit cannot honour
  // Same class of bug as FORBIDDEN_KIT_DEPS, one level up: root package.json is mirrored verbatim
  // while root scripts/ deliberately is NOT (see the header), so the kit shipped a manifest naming
  // scripts/* files no archive has ever contained. Every consumer's `npm run kit:start` has failed
  // with MODULE_NOT_FOUND since v1.2.7 (field report a01a6b7c). The eight shippable scripts now live
  // in the orchestrator repo; these four entries cannot be made to work there and are stripped:
  //   kit:start:mcp / kit:start:legacy — reference setup-mcp.mjs, deleted at v1.1.0 (hosted-MCP
  //     cutover). The local-MCP path is gone; the entries outlived it.
  //   lifecycle:generate / devplan:generate — import ../src/db/* and ../src/server/services/*, and
  //     the archive ships zero files under src/. They are app-side generators that open a direct
  //     wxKanban database connection; consumers reach both documents via the Dev Cockpit and MCP.
  // This strip is what keeps the fix durable — the next sync re-mirrors this repo's package.json,
  // so a one-off edit of the orchestrator's copy would silently regress. build-release.mjs now
  // fails the build if any surviving entry still names a path the archive lacks.
  const FORBIDDEN_KIT_SCRIPTS = [
    'kit:start:mcp',
    'kit:start:legacy',
    'lifecycle:generate',
    'devplan:generate',
  ];
  // [SCOPE 121 / T015] END

  const orchPkgPath = join(ORCH_PATH, 'package.json');
  const orchPkg = readJson(orchPkgPath);
  if (orchPkg) {
    orchPkg.version = targetVersion;
    const stripped = [];
    for (const field of ['dependencies', 'devDependencies']) {
      if (orchPkg[field]) {
        for (const dep of FORBIDDEN_KIT_DEPS) {
          if (dep in orchPkg[field]) { delete orchPkg[field][dep]; stripped.push(dep); }
        }
      }
    }
    const strippedScripts = [];
    if (orchPkg.scripts) {
      for (const name of FORBIDDEN_KIT_SCRIPTS) {
        if (name in orchPkg.scripts) { delete orchPkg.scripts[name]; strippedScripts.push(name); }
      }
    }
    writeFileSync(orchPkgPath, JSON.stringify(orchPkg, null, 2) + '\n', 'utf8');
    log('version', c.green, `orchestrator package.json → ${targetVersion}`);
    if (stripped.length) {
      log('strip', c.green, `removed app-only DB deps from kit package.json: ${stripped.join(', ')}`);
    }
    if (strippedScripts.length) {
      log('strip', c.green, `removed unshippable npm scripts from kit package.json: ${strippedScripts.join(', ')}`);
    }
  }

  // Always ensure orchestrator's wxkanban-agent/package.json matches (it was
  // overwritten by the sync, but in case the explicit --version differs)
  const agentPkgPath = join(ORCH_PATH, 'wxkanban-agent', 'package.json');
  const agentPkg = readJson(agentPkgPath);
  if (agentPkg && agentPkg.version !== targetVersion) {
    agentPkg.version = targetVersion;
    writeFileSync(agentPkgPath, JSON.stringify(agentPkg, null, 2) + '\n', 'utf8');
    log('version', c.green, `wxkanban-agent/package.json → ${targetVersion}`);
  }

  log('sync', c.green, 'Working-tree sync complete.');

  if (!RELEASE) {
    console.log(`\n  Next: review the orchestrator diff, commit, push, and run scripts/build-release.mjs there.`);
    console.log(`  Or re-run this script with --release to do it automatically.\n`);
    process.exit(0);
  }

  // ── Release flow ───────────────────────────────────────────────────────────
  const tag = `v${targetVersion}`;
  log('release', c.magenta, `Cutting release ${tag}`);

  // 1. Commit + push — stage ONLY the kit paths we just mirrored, plus the
  //    orchestrator's build-release.mjs (in case it was patched in this same
  //    workflow). We deliberately avoid `git add -A` because the orchestrator
  //    working tree may carry unrelated dirty state (stale node_modules
  //    deletions, etc.) that should not land in a release commit.
  const addPaths = [
    ...KIT_DIRS,
    ...claudeSkills,
    ...KIT_FILES,
    'scripts/build-release.mjs',
    // NOTE (SPEC-086 T002): the legacy `scripts/install-cockpit-extension.mjs`
    // was retired — the cockpit fresh-install + self-update is handled by
    // `cockpit-refresh.ts` `ensureCockpitUpToDate` (gateway boot, gallery-first
    // per SCOPE-086 FR-004). The stale reference here was already a no-op (the
    // existsSync filter below dropped it); removed to stop implying a shipped file.
  ];
  // Filter to paths that actually exist on disk in the orchestrator now.
  const existingAddPaths = addPaths.filter((p) => existsSync(join(ORCH_PATH, p)));
  const addArgs = ['add', '--', ...existingAddPaths];
  log('run', c.dim, `git ${addArgs.join(' ')}  ${col(c.dim, `(in ${ORCH_PATH})`)}`);
  const addRes = spawnSync('git', addArgs, { cwd: ORCH_PATH, stdio: 'inherit' });
  if (addRes.status !== 0) {
    log('error', c.red, 'git add failed');
    process.exit(1);
  }
  // commit is allowed to no-op if there are no real changes
  const status = execSync('git diff --cached --name-only', {
    cwd: ORCH_PATH, encoding: 'utf8',
  }).trim();
  if (status) {
    const message = NOTES
      ? `chore(release): sync from wxKanban → ${tag}\n\n${NOTES}`
      : `chore(release): sync from wxKanban → ${tag}`;
    // shell quoting: use here-doc style via file isn't worth it; use -F -
    const child = spawnSync('git', ['commit', '-m', message], {
      cwd: ORCH_PATH, stdio: 'inherit',
    });
    if (child.status !== 0) {
      log('error', c.red, 'git commit failed');
      process.exit(1);
    }
  } else {
    log('info', c.dim, 'No changes to commit; release will tag current HEAD.');
  }

  runIn('git push origin main', ORCH_PATH);

  // 2. Build assets
  const buildScript = join(ORCH_PATH, 'scripts', 'build-release.mjs');
  if (!existsSync(buildScript)) {
    log('error', c.red, `${buildScript} missing — cannot build release archives.`);
    process.exit(1);
  }
  runIn(`node "${buildScript}" --version ${tag}`, ORCH_PATH);

  // 3. Locate produced artifacts
  const releaseDir = join(ORCH_PATH, 'releases', tag);
  const wantAssets = ['kit.tar.gz', 'kit.tar.gz.sha256', 'kit.zip', 'kit.zip.sha256'];
  const missing = wantAssets.filter((n) => !existsSync(join(releaseDir, n)));
  if (missing.length) {
    log('error', c.red, `Expected assets missing in ${releaseDir}: ${missing.join(', ')}`);
    process.exit(1);
  }

  // 4. gh release create
  const assetArgs = wantAssets.map((n) => `"${join(releaseDir, n)}"`).join(' ');
  const titleArg = `wxKanban Orchestrator Kit ${tag}`;
  const notesArg = NOTES ? NOTES : `Synced from wxKanban repo on ${new Date().toISOString().slice(0, 10)}.`;
  const tempNotesFile = join(ORCH_PATH, '.release-notes.tmp.md');
  writeFileSync(tempNotesFile, notesArg, 'utf8');
  try {
    runIn(
      `gh release create ${tag} ${assetArgs} --title "${titleArg}" --notes-file "${tempNotesFile}"`,
      ORCH_PATH,
    );
  } finally {
    try { rmSync(tempNotesFile, { force: true }); } catch { /* ignore */ }
  }

  // SCOPE-086 FR-001 — gate success on the published assets actually matching
  // the local build (exits non-zero on any SHA-256 mismatch).
  verifyPublishedRelease(tag, releaseDir);

  log('release', c.green, `Created ${tag} — assets uploaded and verified.`);
  console.log(`\n  Verify: ${col(c.cyan, `gh release view ${tag} --repo ${ORCH_REPO_SLUG}`)}\n`);
}

main().catch((err) => {
  log('error', c.red, err.message || String(err));
  process.exit(1);
});
