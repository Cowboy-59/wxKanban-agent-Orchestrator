#!/usr/bin/env node
// wxPreTest --nightly: one unattended run, every night (SCOPE-140).
//
//   node nightly.mjs check                configuration, refusal and Entry Path; writes nothing
//   node nightly.mjs plan                 tonight's selection and estimate; writes nothing
//   node nightly.mjs run [--scheduled] [--full]   the run itself (what the scheduler starts); --full
//                                         tests every machine item this once
//   node nightly.mjs record --run <id> --item <key> --status pass|fail|skip|blocked [--duration ms]
//                          [--error text] [--evidence text] [--patch file]
//                                         how the Designated Agent reports an item it drove
//   node nightly.mjs install [--dry-run] [--full-first]  register the run with the scheduler (FR-011);
//                                         --full-first makes the first night a full run (FR-015)
//   node nightly.mjs uninstall            remove it, and report any residue
//   node nightly.mjs dismiss --observation <screen::issue> [--reason text]
//   common: --root <project> (default: the current directory)
//
// Configuration: docs-workspace/config.json, beside the UAT/Production lists (environments) and
// the Entry Path (entryPath) that SPEC-138 shares, in a "nightly" block. See the wxPreTest
// SKILL.md, Nightly mode.
//
// Order of a run, and why: the refusal comes first and touches nothing (FR-002). The run then
// waits for any run still going (never overlaps), signs in for real, tests, cleans up, scans its
// own outputs for secrets, and only after a completely green run writes compliance evidence.

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkTargets, dockerDatabasePlan, refusalText } from './nightly/targets.mjs';
import { estimate, planNight, readHistory, recordResults, releaseLock, selectItems, tryLock, updateCoverage, waitForLock, writeHistory } from './nightly/selection.mjs';
import { ENTRA_STATEMENT, checkAdminPages, checkEntryPath, loadChromium, signIn } from './nightly/entry.mjs';
import { crawl, dismissObservation, helperCapacity, mergeObservations, observationsFrom, readObservations, writeObservations } from './nightly/observations.mjs';
import { diagnosis, removeKept, removeRunData, readKept, runWithRetry, savePatch, shouldRemove, taskForFailure, writeKept } from './nightly/failures.mjs';
import { expiryWarnings, redact, resolveSecrets, scanText, secretNames } from './nightly/secrets.mjs';
import { holdAwake, install, installPlan, residue, uninstall } from './nightly/schedule.mjs';
import { FRAMEWORKS, MAPPINGS, buildEvidence, chromiumPdf, ensureArtifactsIgnored, evidenceGate, hitrustMapping, readCrosswalk, writeArtifacts } from './nightly/evidence.mjs';
import { buildSummary, runEventMetadata, storeSummary } from './nightly/summary.mjs';

const SCRIPT = fileURLToPath(import.meta.url);

// [SCOPE 140 / T001] BEGIN — Configuration, arguments and the kit's MCP connection (FR-001)
const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'help';
const arg = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes(`--${name}`);

export const CONFIG_FILE = join('docs-workspace', 'config.json');

export function loadConfig(root) {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) return { environments: null, entryPath: null, nightly: null, missing: true };
  const c = JSON.parse(readFileSync(file, 'utf8'));
  return { environments: c.environments ?? null, entryPath: c.entryPath ?? null, nightly: c.nightly ?? null, product: c.product ?? null };
}

/** Defaults for the nightly block (Data Requirements: schedule, end time, split, rotation, cleanup...). */
export function nightlyDefaults(n = {}) {
  return {
    environment: n.environment ?? 'uat',
    appMode: n.appMode ?? 'deployed',
    schedule: n.schedule ?? '02:00',
    endTime: n.endTime ?? '06:00',
    splitLimitHours: n.splitLimitHours ?? 10,
    rotationSlots: n.rotationSlots ?? 5,
    cleanup: n.cleanup ?? 'remove',
    helper: n.helper !== false,
    commitArtifacts: n.commitArtifacts === true,
    accounts: n.accounts ?? [],
    adminPages: n.adminPages ?? [],
    refusedTexts: n.refusedTexts,
    adminMarker: n.adminMarker ?? null,
    database: n.database ?? null,
    appUrl: n.appUrl ?? null,
    agentName: n.agentName ?? 'nightly-designated-agent',
    agent: n.agent ?? null,
    testCommand: n.testCommand ?? null,
    agentCommand: n.agentCommand ?? null,
    bootCommand: n.bootCommand ?? null,
    schemaCommand: n.schemaCommand ?? null,
    seedCommand: n.seedCommand ?? null,
    cleanupCommand: n.cleanupCommand ?? null,
    cleanupVerifyCommand: n.cleanupVerifyCommand ?? null,
    releaseVersion: n.releaseVersion ?? null,
    currentCsfVersion: n.currentCsfVersion ?? undefined,
    fullNext: n.fullNext === true,
  };
}

// [SCOPE 140 / T017] BEGIN — A full run on request: nightly.fullNext, set and cleared (Amendment A, FR-015)
export function setFullNext(root, on) {
  const file = join(root, CONFIG_FILE);
  const c = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  c.nightly ??= {};
  if (on) c.nightly.fullNext = true;
  else delete c.nightly.fullNext;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
}

/** Every machine item, no rotation cap: what a full run tests. */
export function fullSelection(items) {
  const reasons = Object.fromEntries(items.map((i) => [i.itemKey, 'full run (every machine item)']));
  return { impacted: [...items], rotation: [], unmapped: items.filter((i) => !(i.subjects ?? []).length), reasons };
}
// [SCOPE 140 / T017] END

async function kitMcp(root) {
  const lib = join(root, '_wxAI', 'impact', 'lib', 'agreement.mjs');
  const here = join(dirname(SCRIPT), '..', '..', '..', 'impact', 'lib', 'agreement.mjs');
  const file = existsSync(lib) ? lib : here;
  const m = await import(pathToFileURL(file).href);
  const conn = m.mcpConnection(root);
  const projectId = m.projectIdFor(root);
  const call = (name, args, opts) => m.mcpCall(conn, name, { projectId, ...args }, opts);
  return { conn, projectId, call };
}

function releaseVersion(root, configured) {
  if (configured) return configured;
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? 'unversioned';
  } catch {
    return 'unversioned';
  }
}

const git = (root, ...a) => {
  const r = spawnSync('git', a, { cwd: root, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
};
// [SCOPE 140 / T001] END

// [SCOPE 140 / T003] BEGIN — What changed since the last run, and what it reached (SPEC-137 engine)
async function changeImpact(root, lastCommit) {
  const head = git(root, 'rev-parse', 'HEAD');
  if (!lastCommit) return { head, changed: null, reached: null, boundary: [], commits: [], note: 'first run: every mapped item counts as impacted' };
  const changed = [...new Set([...(git(root, 'diff', '--name-only', `${lastCommit}..HEAD`) ?? '').split('\n'), ...(git(root, 'diff', '--name-only', 'HEAD') ?? '').split('\n')].filter(Boolean))];
  const commits = (git(root, 'log', '--format=%h %s', `${lastCommit}..HEAD`) ?? '').split('\n').filter(Boolean).slice(0, 50);
  if (!changed.length) return { head, changed: [], reached: [], boundary: [], commits };
  const engineFile = join(root, '_wxAI', 'impact', 'change-impact.mjs');
  if (!existsSync(engineFile)) return { head, changed, reached: null, boundary: [], commits, note: 'the Change Impact engine is not installed; every mapped item counts as impacted' };
  const engine = await import(pathToFileURL(engineFile).href);
  const report = engine.buildReport({ root, changedFiles: changed, useCache: true });
  if (report.broad) return { head, changed, reached: null, boundary: changed, commits, note: 'the change was too broad to list; every mapped item counts as impacted' };
  const reached = new Set(changed);
  for (const l of report.links ?? []) if (l.direction === 'dependent' && !String(l.to).includes(':')) reached.add(l.to);
  return { head, changed, reached: [...reached], boundary: report.classification?.boundary ? changed : [], commits };
}
// [SCOPE 140 / T003] END

// [SCOPE 140 / T001] BEGIN — check and plan: read-only views of tonight's run
async function preflight(root) {
  const cfg = loadConfig(root);
  const n = nightlyDefaults(cfg.nightly ?? {});
  const problems = [];
  if (cfg.missing) problems.push(`no ${CONFIG_FILE}; run /wxHelpGenerate env first to set the UAT and Production lists, then add the nightly block`);
  if (!cfg.nightly) problems.push('no "nightly" block in the configuration');
  const names = secretNames(n);
  const { values, missing } = resolveSecrets(names);
  if (missing.length) problems.push(`secrets not available to this run: ${missing.join(', ')}`);
  let databaseUrl = null;
  if (n.database?.mode === 'docker') databaseUrl = dockerDatabasePlan('preflight').url('x');
  else if (n.database?.urlSecret) databaseUrl = values[n.database.urlSecret] ?? null;
  const targets = checkTargets({ databaseUrl, appUrl: n.appUrl, environments: cfg.environments, root, appMode: n.appMode });
  problems.push(...checkEntryPath(cfg.entryPath, n.accounts));
  if (!n.adminPages.length) problems.push('nightly.adminPages lists no admin-only page for the permission check');
  if (!n.testCommand && !n.agentCommand) problems.push('neither nightly.testCommand nor nightly.agentCommand is set; no item could be driven');
  const adapter = resolveAdapter(root);
  if (!adapter.ok) problems.push(adapter.reason);
  return { cfg, n, values, targets, problems, warnings: expiryWarnings(n), adapter };
}

function resolveAdapter(root) {
  const script = join(root, '_wxAI', 'adapters', 'resolve-adapter.mjs');
  if (!existsSync(script)) return { ok: false, reason: 'the SCOPE-127 adapter resolver is not installed; this stack is not supported' };
  const r = spawnSync(process.execPath, [script, '--json'], { cwd: root, encoding: 'utf8', windowsHide: true });
  try {
    const out = JSON.parse(r.stdout);
    if (out.adapter || out.path) return { ok: true, adapter: out.adapter ?? out.path, provenance: out.provenance ?? null };
    return { ok: false, reason: `no stack adapter matches this project (${out.reason ?? 'no-match'}); nightly testing reports it as not supported rather than passing` };
  } catch {
    return { ok: false, reason: 'the adapter resolver gave no readable answer; this stack is treated as not supported' };
  }
}

async function cmdCheck(root) {
  const p = await preflight(root);
  if (!p.targets.ok) console.log(refusalText(p.targets));
  else console.log(`Targets: app ${p.targets.app}, database ${p.targets.database}: allowed.`);
  for (const w of p.warnings) console.log(`Warning: ${w}`);
  if (p.problems.length) console.log(['Setup problems:', ...p.problems.map((x) => `  - ${x}`)].join('\n'));
  if (p.targets.ok && !p.problems.length) console.log('Ready: the nightly run can start.');
  return p.targets.ok && !p.problems.length ? 0 : 2;
}

async function cmdPlan(root) {
  const p = await preflight(root);
  if (!p.targets.ok) {
    console.log(refusalText(p.targets));
    return 2;
  }
  const mcp = await kitMcp(root);
  const listed = await mcp.call('project.start_test_run', { version: releaseVersion(root, p.n.releaseVersion), isRegression: true, dryRun: true });
  const items = listed?.items ?? [];
  const history = readHistory(root);
  const impact = await changeImpact(root, history.lastRun?.commit ?? null);
  const sel = selectItems({ items, changed: impact.changed, reached: impact.reached, boundary: impact.boundary, history, slots: p.n.rotationSlots });
  const ordered = [...sel.impacted, ...sel.rotation];
  const est = estimate(ordered, history);
  const night = planNight(ordered, est, { environment: p.n.environment, endTime: p.n.endTime, limitMs: p.n.splitLimitHours * 3600_000 });
  console.log(`Tonight: ${sel.impacted.length} impacted + ${sel.rotation.length} rotation of ${items.length} items; estimate ${Math.round(est.totalMs / 60000)} min${est.note ? ` (${est.note})` : ''}.`);
  if (impact.note) console.log(impact.note);
  for (const item of night.run) console.log(`  ${item.itemKey}  ${sel.reasons[item.itemKey]}`);
  for (const c of night.carried) console.log(`  carried: ${c.itemKey} (${c.reason})`);
  return 0;
}
// [SCOPE 140 / T001] END

// [SCOPE 140 / T001] BEGIN — Driving one item: its automation, or the Designated Agent (FR-001)
function runCommand(cmd, args, { cwd, env, timeoutMs = 60 * 60_000, input = null }) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, shell: process.platform === 'win32' });
    // An agent CLI such as `claude -p` reads its prompt from stdin; everything else gets none.
    if (input !== null) child.stdin?.end(input);
    else child.stdin?.end();
    let out = '';
    const keep = (d) => {
      out = (out + d).slice(-20_000);
    };
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ code, out, durationMs: Date.now() - started });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolveRun({ code: -1, out: String(e?.message ?? e), durationMs: Date.now() - started });
    });
  });
}

const fill = (parts, vars) => parts.map((p) => String(p).replace(/\$\x7b(\w+)\x7d/g, (_, k) => vars[k] ?? ''));

/** One attempt at one item. Never a silent pass: no way to drive it is 'unresolved' with the reason. */
function itemRunner(ctx) {
  return async (item, attempt) => {
    const vars = { ref: item.automationRef ?? '', itemKey: item.itemKey, runId: ctx.runId, appUrl: ctx.appUrl, storageState: ctx.storageState ?? '' };
    const env = { NIGHTLY_RUN_ID: ctx.runId, NIGHTLY_ITEM: item.itemKey, NIGHTLY_ATTEMPT: String(attempt), BASE_URL: ctx.appUrl, NIGHTLY_STORAGE_STATE: ctx.storageState ?? '', WXAI_UNATTENDED: '1' };
    if (item.automationRef && ctx.n.testCommand) {
      const r = await runCommand(...splitCmd(fill(ctx.n.testCommand, vars)), { cwd: ctx.root, env });
      const tail = redact(r.out.split('\n').slice(-30).join('\n'), ctx.secrets);
      return { status: r.code === 0 ? 'pass' : 'fail', durationMs: r.durationMs, error: r.code === 0 ? null : tail, evidence: tail.slice(-1500) };
    }
    if (ctx.n.agentCommand) {
      const recordFile = join(ctx.runDir, 'records', `${safe(item.itemKey)}.${attempt}.json`);
      rmSync(recordFile, { force: true });
      const prompt = agentPrompt(ctx, item, attempt);
      const started = Date.now();
      await runCommand(...splitCmd(fill(ctx.n.agentCommand, vars)), { cwd: ctx.root, env: { ...env, NIGHTLY_PROMPT: prompt }, timeoutMs: 90 * 60_000, input: prompt });
      if (!existsSync(recordFile)) return { status: 'unresolved', reason: 'the Designated Agent ended without recording a result', durationMs: Date.now() - started };
      const rec = JSON.parse(readFileSync(recordFile, 'utf8'));
      return { status: rec.status, durationMs: rec.durationMs ?? Date.now() - started, error: rec.error ?? null, evidence: rec.evidence ?? null, patchFile: rec.patch ?? null };
    }
    return { status: 'unresolved', reason: 'it has no automation reference and no agent is configured to drive it' };
  };
}

function splitCmd(parts) {
  return [parts[0], parts.slice(1)];
}

const safe = (s) => String(s).replace(/[^\w.-]/g, '_');

function agentPrompt(ctx, item, attempt) {
  return [
    `You are the Designated Agent for a nightly test run (${ctx.runId}), attempt ${attempt}. Unattended: nobody can answer questions.`,
    `Test exactly one wxCreateTestPlan item: ${item.itemKey} "${item.title}" (requirement ${item.requirementId ?? 'n/a'}, gate ${item.gate}). Read its steps and expected results with the wxKanban MCP (project.list_open_items or the test plan), and drive them with the wxPreTest method, Phase 6, as the normal user.`,
    `The app is at ${ctx.appUrl}. You are already signed in: load the Playwright storage state at ${ctx.storageState} (NIGHTLY_STORAGE_STATE). Never sign in another way and never use an admin account.`,
    'Rules: never commit, merge, push, deploy, or edit a test. Never weaken an assertion. Use only data you create, and tag it with the run id (NIGHTLY_RUN_ID) where the app allows. Never print a password, token or cookie.',
    `If it fails, you may write a proposed fix to application code as a unified diff file (not applied), and pass it with --patch.`,
    `Finish by recording the result exactly once: node "${SCRIPT}" record --root "${ctx.root}" --run ${ctx.runId} --item ${item.itemKey} --attempt ${attempt} --status pass|fail|blocked --duration <ms> [--error "<first line of the failure>"] [--evidence "<what you saw>"] [--patch <file>]`,
  ].join('\n');
}

function cmdRecord(root) {
  const runId = arg('run');
  const itemKey = arg('item');
  const status = arg('status');
  if (!runId || !itemKey || !['pass', 'fail', 'skip', 'blocked'].includes(status)) {
    console.error('record needs --run, --item and --status pass|fail|skip|blocked');
    return 1;
  }
  const dir = join(root, '.wxai', 'nightly', 'runs', safe(runId), 'records');
  mkdirSync(dir, { recursive: true });
  const rec = { itemKey, status, durationMs: Number(arg('duration')) || null, error: arg('error'), evidence: arg('evidence'), patch: arg('patch'), at: new Date().toISOString() };
  writeFileSync(join(dir, `${safe(itemKey)}.${Number(arg('attempt', '1')) || 1}.json`), JSON.stringify(rec, null, 2) + '\n');
  console.log(`recorded ${itemKey}: ${status}`);
  return 0;
}
// [SCOPE 140 / T001] END

// [SCOPE 140 / T001] BEGIN — The run: refusal, wait, sign-in, test, clean up, scan, summarize, evidence
// MODIFIED-BY: [SCOPE 140 / T017] — a full run when nightly.fullNext or --full; the flag clears after it
// MODIFIED-BY: [SCOPE 140 / T018] — each first-attempt pass is signed off with project.sign_off_test
async function cmdRun(root) {
  const startedAt = new Date();
  const runId = `n-${startedAt.toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${randomBytes(2).toString('hex')}`;
  const runDir = join(root, '.wxai', 'nightly', 'runs', runId);
  mkdirSync(runDir, { recursive: true });
  const p = await preflight(root);
  const n = p.n;
  const base = { runId, startedAt: startedAt.toISOString(), environment: n.environment, agent: n.agentName, entryPath: p.cfg.entryPath };

  // 1. The refusal: before anything is touched (FR-002).
  if (!p.targets.ok) {
    const s = buildSummary({ ...base, refused: refusalText(p.targets), finishedAt: new Date().toISOString() });
    console.log(storeSummary(root, runDir, s));
    return 2;
  }

  // 2. Never overlap a run still going (FR-004). On the fallback a busy night is skipped, not delayed.
  let waitedMs = 0;
  if (n.environment === 'uat') ({ waitedMs } = await waitForLock(root, runId));
  else if (!tryLock(root, runId).ok) {
    console.log('A previous nightly run is still going on this machine; tonight\'s run is skipped.');
    return 0;
  }
  const awake = holdAwake({ fallback: n.environment === 'fallback' });
  const mcp = await kitMcp(root).catch(() => null);
  let testRun = null;
  try {
    const setupProblems = [...p.problems];
    const warnings = [...p.warnings];
    if (setupProblems.length) {
      const s = buildSummary({ ...base, setupProblems, warnings, waitedMs, finishedAt: new Date().toISOString() });
      console.log(storeSummary(root, runDir, s));
      await sendRunEvent(mcp, s);
      return 1;
    }

    // 3. Data an earlier run kept on failure goes first (FR-009).
    for (const k of removeKept(root, n.cleanup)) if (!k.removed) warnings.push(`data kept by run ${k.runId} could not be removed: ${k.detail}`);

    // 4. The run's own database (docker) or the configured UAT one.
    let dbCleanup = null;
    let databaseUrl = null;
    if (n.database?.mode === 'docker') {
      const plan = dockerDatabasePlan(runId);
      const password = randomBytes(18).toString('base64url');
      const started = spawnSync(plan.start[0], plan.start[1], { encoding: 'utf8', windowsHide: true, env: { ...process.env, POSTGRES_PASSWORD: password } });
      if (started.status !== 0) throw new Error(`could not start the run's PostgreSQL container: ${String(started.stderr).split('\n')[0]}`);
      for (let i = 0; i < 60 && spawnSync(plan.ready[0], plan.ready[1], { windowsHide: true }).status !== 0; i++) await new Promise((r) => setTimeout(r, 1000));
      databaseUrl = plan.url(password);
      p.values.__RUN_DATABASE_URL = databaseUrl;
      dbCleanup = { kind: 'docker', container: plan.name };
    } else {
      databaseUrl = p.values[n.database.urlSecret];
      dbCleanup = { kind: 'commands', command: n.cleanupCommand, verifyCommand: n.cleanupVerifyCommand };
    }
    const appEnv = { DATABASE_URL: databaseUrl, NIGHTLY_RUN_ID: runId };
    let app = null;
    if (n.appMode === 'local') {
      for (const [label, c] of [['schema', n.schemaCommand], ['seed', n.seedCommand]]) {
        if (!c) continue;
        const r = await runCommand(c[0], c.slice(1), { cwd: root, env: appEnv });
        if (r.code !== 0) throw new Error(`the ${label} command failed (exit ${r.code})`);
      }
      if (n.bootCommand) {
        app = spawn(n.bootCommand[0], n.bootCommand.slice(1), { cwd: root, env: { ...process.env, ...appEnv }, windowsHide: true, stdio: 'ignore', shell: process.platform === 'win32' });
        await waitForApp(n.appUrl);
      }
    }

    // 5. What to test tonight (FR-003) and how long (FR-004).
    const history = readHistory(root);
    const listed = await mcp.call('project.start_test_run', { version: releaseVersion(root, n.releaseVersion), isRegression: true, dryRun: true });
    const items = listed?.items ?? [];
    const impact = await changeImpact(root, history.lastRun?.commit ?? null);
    const full = n.fullNext || flag('full');
    const sel = full ? fullSelection(items) : selectItems({ items, changed: impact.changed, reached: impact.reached, boundary: impact.boundary, history, slots: n.rotationSlots });
    if (full) warnings.push(`Full run: every machine item in the plan was selected (${items.length})${n.fullNext ? '; nightly.fullNext is cleared, so the next night tests what changed plus the rotation' : ''}.`);
    const ordered = [...sel.impacted, ...sel.rotation];
    const est = estimate(ordered, history);
    const night = planNight(ordered, est, { environment: n.environment, endTime: n.endTime, limitMs: n.splitLimitHours * 3600_000 });

    // 6. Real sign-in through the Entry Path, as a normal user (FR-005), then the permission check (FR-006).
    const chromium = loadChromium(root);
    if (!chromium) throw new Error('Playwright is not installed in this project (npm i -D playwright)');
    const browser = await chromium.launch();
    const normal = n.accounts.filter((a) => (a.role ?? 'normal') === 'normal');
    const mainCtx = await browser.newContext();
    const page = await mainCtx.newPage();
    const signed = await signIn(page, p.cfg.entryPath, normal[0], p.values);
    let permission = null;
    let storageState = null;
    if (!signed.ok) {
      await page.screenshot({ path: join(runDir, 'sign-in-failure.png'), mask: [page.locator('input[type=password]')] }).catch(() => {});
      (signed.kind === 'setup' ? setupProblems : warnings).push(`sign-in (${signed.step}): ${signed.detail}`);
    } else {
      permission = await checkAdminPages(page, p.cfg.entryPath.appUrl ?? n.appUrl, n.adminPages, { refusedTexts: n.refusedTexts, adminMarker: n.adminMarker });
      storageState = join(runDir, 'session.json');
      await mainCtx.storageState({ path: storageState });
    }

    // 7. The background helper, beside the main run (FR-007): its own account and session.
    const capacity = n.helper ? helperCapacity(root) : { allowed: false, reason: 'turned off (nightly.helper)' };
    const helperRun = capacity.allowed && signed.ok && normal[1] ? runHelper({ browser, cfg: p.cfg, n, account: normal[1], values: p.values, root, runId, mcp }) : Promise.resolve({ ran: false, reason: capacity.reason ?? (normal[1] ? 'sign-in failed' : 'a second normal-user account is needed') });

    // 8. The planned items, each failure re-run once (FR-008), recorded in the test history (FR-012).
    const results = [];
    if (signed.ok) {
      testRun = await mcp.call('project.start_test_run', { version: releaseVersion(root, n.releaseVersion), itemIds: night.run.map((i) => i.id), runnerType: 'ci', runnerRef: n.agentName, environment: 'uat', isRegression: false, commitSha: impact.head ?? undefined });
      const ctx = { root, runId, runDir, n, appUrl: p.cfg.entryPath.appUrl ?? n.appUrl, storageState, secrets: p.values };
      const runOne = itemRunner(ctx);
      for (const item of night.run) {
        await mcp.call('project.report_test_progress', { runId: testRun.runId, currentItemId: item.id }).catch(() => {});
        const r = await runWithRetry(runOne, item);
        const row = { ...r, itemKey: item.itemKey, title: item.title, id: item.id, impactReason: sel.reasons[item.itemKey] };
        if (r.status === 'fail') {
          const patchDiff = r.patchFile && existsSync(r.patchFile) ? readFileSync(r.patchFile, 'utf8') : null;
          const saved = savePatch(runDir, item, patchDiff);
          row.patchPath = saved.path;
          row.patchNote = saved.note;
          const t = await taskForFailure(root, { item, result: r, diagnosisText: diagnosis(item, r, { impactReason: row.impactReason, changeCommits: impact.commits }), patchPath: saved.path, patchNote: saved.note, createTask: (t) => mcp.call('project.create_task', t), runId }).catch((e) => ({ taskId: null, error: e.message }));
          row.taskId = t.taskId;
        }
        results.push(row);
        // FR-016: an item this run proved (first attempt) is signed off, so the scope's machine gate can clear.
        if (r.status === 'pass') {
          await mcp.call('project.report_test_progress', { runId: testRun.runId, itemId: item.id, status: 'pass', durationMs: r.durationMs, evidence: redact(r.evidence ?? '', p.values).slice(0, 4000) }).catch(() => {});
          const signed = await mcp.call('project.sign_off_test', { itemId: item.id, runId: testRun.runId, label: n.agentName, notes: `nightly run ${runId}` }).catch((e) => ({ refused: e.message }));
          if (signed?.refused || signed?.blocked) warnings.push(`sign-off for ${item.itemKey} was refused: ${String(signed.refused ?? signed.reason ?? '').slice(0, 160)}`);
          continue;
        }
        await mcp.call('project.report_test_progress', { runId: testRun.runId, itemId: item.id, status: r.status === 'flaky' ? 'pass' : r.status, durationMs: r.durationMs, evidence: redact(r.status === 'flaky' ? `flaky: failed once, then passed. ${r.evidence ?? ''}` : r.evidence ?? r.reason ?? '', p.values).slice(0, 4000) }).catch(() => {});
      }
    }
    // SC-4: on a fallback night the helper never extends the run; whatever it has not finished
    // when the main run ends is stopped and said so.
    const helper = n.environment === 'fallback'
      ? await Promise.race([helperRun, new Promise((r) => setTimeout(() => r({ ran: false, reason: 'stopped when the main run ended (a fallback night is never extended)' }), 5000))])
      : await helperRun;
    await browser.close();
    if (app) app.kill();
    rmSync(storageState ?? join(runDir, 'session.json'), { force: true });

    // 9. Cleanup (FR-009).
    const green0 = results.length > 0 && results.every((r) => r.status === 'pass') && permission?.ok;
    let cleanup = { choice: n.cleanup, removed: false, leftovers: null, detail: 'kept by the cleanup choice' };
    if (shouldRemove(n.cleanup, { green: green0 })) cleanup = { choice: n.cleanup, ...removeRunData(runId, dbCleanup) };
    else if (n.cleanup === 'keep-on-failure') writeKept(root, [...readKept(root), { runId, cleanup: dbCleanup, keptAt: new Date().toISOString() }]);
    if (n.cleanup === 'keep-on-failure' && !green0) cleanup.detail = 'kept for inspection; the next run removes it';

    // 10. Secret scan over every output of the run (FR-010).
    const secretScan = scanRunOutputs(runDir, p.values);

    // 11. Coverage and history.
    recordResults(history, results.map((r) => ({ itemKey: r.itemKey, status: r.status, durationMs: r.durationMs })), { carried: night.carried, commit: impact.head });
    const coverage = updateCoverage(history, items.map((i) => i.itemKey), results.map((r) => r.itemKey));
    writeHistory(root, history);
    if (n.fullNext && results.length) setFullNext(root, false);

    // 12. Evidence after a completely green run only, for ticked frameworks (FR-013, FR-014).
    const gate = evidenceGate({ results, permission, cleanup, secretScan });
    if (setupProblems.length) gate.green = false;
    const artifacts = [];
    const artifactSkips = [];
    if (gate.green) await writeEvidence({ root, mcp, n, runId, runDir, chromium, results, permission, cleanup, impact, artifacts, artifactSkips, appUrl: p.cfg.entryPath.appUrl ?? n.appUrl, database: p.targets.database });

    if (testRun?.runId) await mcp.call('project.complete_test_run', { runId: testRun.runId, status: results.some((r) => r.status === 'fail') ? 'failed' : 'completed' }).catch(() => {});

    // 13. The morning summary (FR-012).
    const s = buildSummary({
      ...base, setupProblems, warnings, waitedMs, results, permission, selection: sel, carried: night.carried, unmapped: sel.unmapped,
      coverage, estimate: est, actualMs: Date.now() - startedAt.getTime(), cleanup, gate, artifacts, artifactSkips,
      observations: helper.observations, helper, finishedAt: new Date().toISOString(),
      notTested: impact.note ? [impact.note] : [],
    });
    if (secretScan.length) s.warnings.push(`secret scan: ${secretScan.map((f) => `${f.kind} in ${f.where}`).join('; ')}`);
    console.log(storeSummary(root, runDir, s));
    await sendRunEvent(mcp, s);
    return s.results.failed || !s.permission?.ok ? 1 : 0;
  } catch (e) {
    // A run that cannot finish still leaves a summary saying why, and closes its test-history run.
    if (testRun?.runId) await mcp?.call('project.complete_test_run', { runId: testRun.runId, status: 'failed' }).catch(() => {});
    const s = buildSummary({ ...base, setupProblems: [`the run stopped: ${redact(e instanceof Error ? e.message : String(e), p.values)}`], waitedMs, finishedAt: new Date().toISOString() });
    console.log(storeSummary(root, runDir, s));
    await sendRunEvent(mcp, s);
    return 1;
  } finally {
    awake.release();
    releaseLock(root, runId);
  }
}

async function waitForApp(url, timeoutMs = 180_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`the app did not start at ${new URL(url).origin}`);
}

async function runHelper({ browser, cfg, n, account, values, root, runId, mcp }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const signed = await signIn(page, cfg.entryPath, account, values);
  if (!signed.ok) return { ran: false, reason: `the helper account could not sign in (${signed.detail})` };
  const found = await crawl(page, cfg.entryPath.appUrl ?? n.appUrl);
  const observations = observationsFrom(found);
  // The usability persona (MCP wxuiuxcodereview) on the live screens, as the normal user, when an
  // agent is configured. Its findings join the measured ones; they are Observations, never pass/fail.
  if (n.agentCommand) {
    const statePath = join(root, '.wxai', 'nightly', 'runs', runId, 'helper-session.json');
    const outFile = join(root, '.wxai', 'nightly', 'runs', runId, 'usability.json');
    await ctx.storageState({ path: statePath });
    const prompt = [
      `You are the background helper of nightly run ${runId}. Unattended. Apply the usability pass of the wxUIUXCodeReview methodology (project.get_command_prompt "wxuiuxcodereview", UI/UX track) to these live screens, as the normal user: ${found.visited.slice(0, 20).join(', ')}.`,
      `The app is at ${cfg.entryPath.appUrl ?? n.appUrl}; load the Playwright storage state at ${statePath}. Change nothing: do not save, submit or delete.`,
      `Write ONLY a JSON array to ${outFile}: [{ "screen": "<path>", "issue": "<short-kebab-id>", "detail": "<what a user would notice>" }]. These are Observations, never pass/fail.`,
    ].join('\n');
    await runCommand(n.agentCommand[0], n.agentCommand.slice(1), { cwd: root, env: { NIGHTLY_PROMPT: prompt, NIGHTLY_RUN_ID: runId, WXAI_UNATTENDED: '1' }, timeoutMs: 45 * 60_000, input: prompt });
    try {
      for (const o of JSON.parse(readFileSync(outFile, 'utf8'))) if (o?.screen && o?.issue) observations.push({ screen: String(o.screen), issue: String(o.issue).slice(0, 60), detail: String(o.detail ?? '').slice(0, 500) });
    } catch {
      // no usability findings written; the measured Observations still stand
    }
    rmSync(statePath, { force: true });
  }
  const register = readObservations(root);
  const merged = mergeObservations(register, observations, { visited: found.visited, runId });
  for (const o of merged.fresh) {
    const out = await mcp.call('project.create_task', { title: `[Observation] ${o.screen}: ${o.issue}`.slice(0, 200), descriptionMarkdown: `${o.detail}\n\nAn Observation from the nightly usability pass (run ${runId}). It is not a test failure. Dismiss it with \`nightly.mjs dismiss --observation "${o.screen}::${o.issue}"\`, or take it to /wxBrainstorm.`, priority: 'low' }).catch(() => null);
    o.taskId = out?.task?.id ?? null;
  }
  writeObservations(root, register);
  await ctx.close();
  return { ran: true, observations: merged };
}

function scanRunOutputs(runDir, secrets) {
  const findings = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (!/\.(png|jpg|pdf)$/i.test(name)) findings.push(...scanText(readFileSync(full, 'utf8'), { secrets, where: full.slice(runDir.length + 1) }));
    }
  };
  if (existsSync(runDir)) walk(runDir);
  return findings;
}

async function writeEvidence({ root, mcp, n, runId, runDir, chromium, results, permission, cleanup, impact, artifacts, artifactSkips, appUrl, database }) {
  const ctx = await mcp.call('project.get_compliance_context', { mode: 'summary' }).catch(() => null);
  if (!ctx) {
    artifactSkips.push('the compliance settings could not be read, so no evidence was written');
    return;
  }
  const ticked = (ctx.activeFrameworks ?? []).filter((f) => FRAMEWORKS.includes(f));
  if (!ticked.length) return;
  ensureArtifactsIgnored(root, n.commitArtifacts);
  const passed = results.filter((r) => r.status === 'pass').length;
  const found = {
    'separate-environment': `app ${new URL(appUrl).origin} (UAT list), database ${database} (UAT database list; refusal check passed)`,
    'permission-check': `refused on ${permission.results.length} of ${permission.results.length} sampled admin pages (${permission.results.map((r) => `${r.path}: ${r.why}`).join('; ')})`,
    'tests-green': `${passed} of ${results.length} selected items passed; 0 failed; 0 flaky`,
    'change-log': impact.commits?.length ? `${impact.commits.length} commit(s) since the last run; ${impact.changed?.length ?? 0} changed file(s) reached ${impact.reached?.length ?? 'all'} file(s)` : 'no change since the last run',
    'run-record': `run ${runId} recorded in wxKanban test history by ${n.agentName}`,
    'cleanup-verified': cleanup.detail,
    'secret-scan': 'no credential found in any output',
    'test-data': 'seeded demonstration data and data created by the run only',
  };
  const run = { releaseVersion: releaseVersion(root, n.releaseVersion), runId, runAt: new Date().toISOString(), agent: n.agentName, environment: { app: new URL(appUrl).origin, database }, changeLog: impact.commits ?? [], results: { total: results.length, passed, failed: 0 } };
  const renderPdf = chromiumPdf(chromium);
  for (const framework of ticked) {
    let mapping = MAPPINGS[framework];
    if (framework === 'HITRUST') {
      const cw = readCrosswalk(root, { currentCsf: n.currentCsfVersion });
      if (!cw.ok) {
        artifactSkips.push(`HITRUST: ${cw.reason}`);
        continue;
      }
      mapping = hitrustMapping(cw.crosswalk);
    }
    const doc = buildEvidence({ framework, mapping, run, found });
    const w = await writeArtifacts(root, doc, { renderPdf });
    artifacts.push({ framework, dir: w.dir, manifestSha256: w.manifestSha256 });
    await mcp.call('project.capture_event', {
      type: 'compliance_artifact_written', source: 'cli', actor: n.agentName,
      rawContent: `${framework} nightly evidence for ${run.releaseVersion} (run ${runId})`,
      metadata: { runId, framework, releaseVersion: run.releaseVersion, manifestSha256: w.manifestSha256, files: w.manifest.files.map((f) => ({ file: f.file, sha256: f.sha256 })) },
    }).catch((e) => artifactSkips.push(`${framework}: the fingerprints could not be recorded in wxKanban (${e.message})`));
  }
}

async function sendRunEvent(mcp, s) {
  if (!mcp?.conn) return;
  const failed = s.results.failed;
  await mcp.call('project.capture_event', {
    type: 'nightly_run_completed', source: 'cli', actor: s.designatedAgent,
    rawContent: s.refused ? `Nightly run ${s.runId} refused` : `Nightly run ${s.runId}: ${s.results.passed} passed, ${failed} failed, ${s.results.flaky} flaky of ${s.results.total}`,
    metadata: runEventMetadata(s),
  }).catch(() => {});
}
// [SCOPE 140 / T001] END

// [SCOPE 140 / T011] BEGIN — install / uninstall / dismiss commands
// MODIFIED-BY: [SCOPE 140 / T017] — install --full-first sets nightly.fullNext
function cmdInstall(root) {
  const { nightly } = loadConfig(root);
  const n = nightlyDefaults(nightly ?? {});
  const plan = installPlan({ root, script: SCRIPT, at: n.schedule, fallback: n.environment === 'fallback', agentUser: n.agent?.osUser ?? null });
  if (flag('dry-run')) {
    console.log(JSON.stringify({ ...plan, xml: plan.xml ? `${plan.xml.slice(0, 120)}...` : undefined }, null, 2));
    return 0;
  }
  const password = n.agent?.osPasswordSecret ? process.env[n.agent.osPasswordSecret] : null;
  const r = install(plan, { password });
  console.log(r.ok ? `Installed ${plan.id} (${plan.kind}), daily at ${n.schedule}${n.agent?.osUser ? ` as ${n.agent.osUser}` : ''}.` : `Install failed: ${r.detail}`);
  if (r.ok && flag('full-first')) {
    setFullNext(root, true);
    console.log('The first night will run every machine item in the plan (nightly.fullNext); later nights test what changed plus the rotation.');
  }
  if (plan.note) console.log(plan.note);
  return r.ok ? 0 : 1;
}

function cmdUninstall(root) {
  const { nightly } = loadConfig(root);
  const n = nightlyDefaults(nightly ?? {});
  const plan = installPlan({ root, script: SCRIPT, at: n.schedule, fallback: n.environment === 'fallback', agentUser: n.agent?.osUser ?? null });
  const left = uninstall(plan);
  console.log(left.length ? `Removed, but residue remains: ${left.join(', ')}` : `Uninstalled ${plan.id}; nothing left behind.`);
  return left.length ? 1 : 0;
}

function cmdDismiss(root) {
  const key = arg('observation');
  const register = readObservations(root);
  if (!key || !dismissObservation(register, key, arg('reason'))) {
    console.error('dismiss needs --observation "<screen>::<issue>" naming a recorded Observation');
    return 1;
  }
  writeObservations(root, register);
  console.log(`dismissed ${key}`);
  return 0;
}

export { residue };
// [SCOPE 140 / T011] END

// [SCOPE 140 / T001] BEGIN — Entry point
async function main() {
  const root = resolve(arg('root', process.cwd()));
  const handlers = { check: cmdCheck, plan: cmdPlan, run: cmdRun, record: cmdRecord, install: cmdInstall, uninstall: cmdUninstall, dismiss: cmdDismiss };
  if (!handlers[command]) {
    console.log('Usage: nightly.mjs check | plan | run [--full] | record | install [--dry-run] [--full-first] | uninstall | dismiss  [--root <project>]');
    return command === 'help' ? 0 : 1;
  }
  return handlers[command](root);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT)) {
  main().then((code) => process.exit(code ?? 0), (e) => {
    console.error(`nightly: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
// [SCOPE 140 / T001] END
