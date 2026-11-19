#!/usr/bin/env node
/**
 * sync-all-versions.mjs — ONE command to force every distribution artifact into
 * line with its source-of-truth version, so a drift like "added a command but
 * the kit/vsix never refreshed" can be fixed without customers re-downloading
 * anything. The kit upgrade flow and the cockpit self-update (which installs the
 * highest-versioned bundled .vsix) deliver these automatically once the
 * artifacts are fresh.
 *
 * Source-of-truth versions:
 *   KIT      wxkanban-agent/package.json     -> kit tarball  wxkanban-agent-v<ver>.tgz
 *                                            -> .wxkanban-project.json kitVersion stamp
 *   COCKPIT  vscode-extension/package.json   -> wxkanban-dev-cockpit-<ver>.vsix
 *
 * Usage:
 *   node scripts/sync-all-versions.mjs            # FORCE: stamp + rebuild all artifacts
 *   node scripts/sync-all-versions.mjs --check    # report drift only, exit 1 if any
 *   node scripts/sync-all-versions.mjs --kit      # only the kit (stamp + tarball)
 *   node scripts/sync-all-versions.mjs --cockpit  # only the cockpit (.vsix)
 *
 * Build steps are best-effort and reported per-artifact; a failure in one does
 * not abort the others. Exit 1 if anything ended out of sync.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const onlyKit = args.includes('--kit');
const onlyCockpit = args.includes('--cockpit');
const doKit = !onlyCockpit;
const doCockpit = !onlyKit;

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'));
const cmp = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
};
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'inherit' });

// Highest-versioned wxkanban-dev-cockpit-<ver>.vsix in vscode-extension/ — the
// locally-built artifact that gets `vsce publish`ed to the VS Code Marketplace
// (the kit no longer bundles it; SCOPE-086). Used to reconcile the COCKPIT version.
function highestVsix(dir, prefix) {
  if (!existsSync(dir)) return null;
  let best = null;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(prefix) || !name.endsWith('.vsix')) continue;
    const v = name.slice(prefix.length, -'.vsix'.length);
    if (!/^\d+(\.\d+)*$/.test(v)) continue;
    if (!best || cmp(v, best) > 0) best = v;
  }
  return best;
}

// Read the live state of every artifact from disk. Returns { rows, drift }.
function snapshot() {
  const rows = [];
  let drift = false;

  if (doKit) {
    const kitVer = readJson(join(ROOT, 'wxkanban-agent', 'package.json')).version;
    const cfgPath = join(ROOT, '.wxkanban-project.json');
    const stamped = existsSync(cfgPath) ? readJson(cfgPath).kitVersion : null;
    const tgzFresh = existsSync(join(ROOT, `wxkanban-agent-v${kitVer}.tgz`));
    const stampFresh = stamped === kitVer;
    rows.push(['KIT  package.json', kitVer, 'source of truth']);
    rows.push(['KIT  .wxkanban-project.json kitVersion', stamped ?? '(none)', stampFresh ? 'in sync' : 'DRIFT']);
    rows.push(['KIT  tarball', tgzFresh ? `v${kitVer}.tgz` : 'MISSING', tgzFresh ? 'in sync' : 'DRIFT']);
    if (!stampFresh || !tgzFresh) drift = true;
  }

  if (doCockpit) {
    const cockpitDir = join(ROOT, 'vscode-extension');
    const cockpitVer = readJson(join(cockpitDir, 'package.json')).version;
    const bundled = highestVsix(cockpitDir, 'wxkanban-dev-cockpit-');
    const vsixFresh = bundled !== null && cmp(bundled, cockpitVer) >= 0 &&
      existsSync(join(cockpitDir, `wxkanban-dev-cockpit-${cockpitVer}.vsix`));
    rows.push(['COCKPIT  package.json', cockpitVer, 'source of truth']);
    rows.push(['COCKPIT  bundled .vsix (self-update source)', bundled ? `v${bundled}` : 'MISSING',
      vsixFresh ? 'in sync' : 'DRIFT — help would be stale']);
    if (!vsixFresh) drift = true;
  }

  return { rows, drift };
}

function report({ rows }) {
  const w = Math.max(...rows.map((r) => r[0].length));
  console.log('\nVersion artifact status:');
  for (const [label, ver, note] of rows) {
    console.log(`  ${label.padEnd(w)}  ${String(ver).padEnd(12)}  ${note}`);
  }
}

// ---- check mode -----------------------------------------------------------
if (checkOnly) {
  const snap = snapshot();
  report(snap);
  console.log(snap.drift ? '\nDRIFT detected — run: node scripts/sync-all-versions.mjs' : '\nAll artifacts in sync.');
  process.exit(snap.drift ? 1 : 0);
}

// ---- force mode: regenerate only what's out of sync -----------------------
const before = snapshot();
if (!before.drift) {
  report(before);
  console.log('\nAll artifacts already in sync — nothing to rebuild.');
  process.exit(0);
}

if (doKit) {
  const kitVer = readJson(join(ROOT, 'wxkanban-agent', 'package.json')).version;
  const stamped = existsSync(join(ROOT, '.wxkanban-project.json')) ? readJson(join(ROOT, '.wxkanban-project.json')).kitVersion : null;
  const tgzFresh = existsSync(join(ROOT, `wxkanban-agent-v${kitVer}.tgz`));
  if (stamped !== kitVer || !tgzFresh) {
    try {
      run('node scripts/sync-kit-version.mjs');
      run('bash wxkanban-agent/scripts/pack-kit.sh');
      console.log('KIT: stamped + repacked tarball.');
    } catch (e) {
      console.error(`KIT: regenerate failed — ${e.message}`);
    }
  }
}

if (doCockpit) {
  const cockpitDir = join(ROOT, 'vscode-extension');
  const cockpitVer = readJson(join(cockpitDir, 'package.json')).version;
  if (!existsSync(join(cockpitDir, `wxkanban-dev-cockpit-${cockpitVer}.vsix`))) {
    try {
      run('npm run package', cockpitDir);
      console.log(`COCKPIT: built wxkanban-dev-cockpit-${cockpitVer}.vsix.`);
    } catch (e) {
      console.error(`COCKPIT: vsix build failed — ${e.message} (need vsce + esbuild deps: npm i in vscode-extension/)`);
    }
  }
}

// Report the POST-rebuild state so the table reflects reality.
const after = snapshot();
report(after);
console.log(after.drift
  ? '\nSome artifacts still out of sync — see errors above.'
  : '\nForce-update complete — all artifacts match source versions.');
process.exit(after.drift ? 1 : 0);
