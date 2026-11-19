#!/usr/bin/env node
/**
 * sync-kit-version.mjs — force every local "kit version" surface to match the
 * single source of truth: wxkanban-agent/package.json `version`.
 *
 * The kit version historically lived in three drifting places:
 *   1. wxkanban-agent/package.json  `version`        ← SOURCE OF TRUTH
 *   2. .wxkanban-project.json       `kitVersion`     ← installed-stamp (display)
 *   3. wxkanban-agent-v<ver>.tgz                      ← consumer install artifact
 *
 * This script stamps (2) from (1) and records the current HEAD sha in
 * `kitReleaseSha`, so the displayed/installed version can never silently lag a
 * bump. It is called automatically by .husky/pre-push after a kit bump, and can
 * be run by hand to FORCE a refresh:
 *
 *   node scripts/sync-kit-version.mjs            # stamp + report
 *   node scripts/sync-kit-version.mjs --check    # report drift only, exit 1 if out of sync
 *
 * (Re)packing the tarball is a separate explicit step:
 *   bash wxkanban-agent/scripts/pack-kit.sh
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'wxkanban-agent', 'package.json');
const CFG = join(ROOT, '.wxkanban-project.json');
const checkOnly = process.argv.includes('--check');

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf-8'));
}

const pkg = readJson(PKG);
const source = pkg.version;
if (!source) {
  console.error(`sync-kit-version: no version in ${PKG}`);
  process.exit(2);
}

let headSha = null;
try {
  headSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
} catch {
  /* not fatal — sha is best-effort */
}

if (!existsSync(CFG)) {
  console.log(`sync-kit-version: no .wxkanban-project.json (nothing to stamp). Source kit version: ${source}`);
  process.exit(0);
}

const cfg = readJson(CFG);
const stampedVersion = cfg.kitVersion ?? '(unset)';
const stampedSha = cfg.kitReleaseSha ?? '(unset)';
const inSync = cfg.kitVersion === source && (!headSha || cfg.kitReleaseSha === headSha);

if (checkOnly) {
  if (inSync) {
    console.log(`kit version in sync: ${source}`);
    process.exit(0);
  }
  console.error(
    `kit version DRIFT — source ${source} (sha ${headSha ?? '?'}) ` +
      `vs stamped ${stampedVersion} (sha ${stampedSha}). Run: node scripts/sync-kit-version.mjs`,
  );
  process.exit(1);
}

if (inSync) {
  console.log(`kit version already in sync: ${source}`);
  process.exit(0);
}

cfg.kitVersion = source;
if (headSha) cfg.kitReleaseSha = headSha;
writeFileSync(CFG, JSON.stringify(cfg, null, 2) + '\n');

console.log(
  `kit version stamped: ${stampedVersion} -> ${source}` +
    (headSha ? `  (sha ${headSha.slice(0, 8)})` : ''),
);
console.log(`Reminder: repack the consumer tarball with  bash wxkanban-agent/scripts/pack-kit.sh`);
