// Nightly Testing: the morning summary (SCOPE-140 FR-012).
//
// One summary per run: pass/fail, flaky tests, failures with their tasks, Observations, coverage,
// estimate against actual, any split or wait, cleanup, and what was NOT tested. It is written to
// the run folder, to .wxai/nightly/last-summary.json (the Cockpit card reads it), and to wxKanban
// as a nightly_run_completed event. The run's results go to the test history separately, through
// start_test_run / report_test_progress / complete_test_run.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// [SCOPE 140 / T012] BEGIN — Build, render and store the morning summary (FR-012)
export const LAST_SUMMARY_FILE = join('.wxai', 'nightly', 'last-summary.json');

const mins = (ms) => (ms == null ? '?' : `${Math.round(ms / 60000)} min`);

/** The summary object (pure). Everything the Cockpit card and the markdown need. */
export function buildSummary(r) {
  const results = r.results ?? [];
  const count = (s) => results.filter((x) => x.status === s).length;
  const notTested = [...(r.notTested ?? [])];
  for (const c of r.carried ?? []) notTested.push(`${c.itemKey}: ${c.reason}`);
  for (const x of results.filter((y) => ['skip', 'blocked', 'unresolved'].includes(y.status))) notTested.push(`${x.itemKey}: ${x.reason ?? x.status}`);
  if (r.unmapped?.length) notTested.push(`${r.unmapped.length} item(s) record no code, so changes cannot select them; they run by rotation only`);
  if (r.entryPath?.kind === 'portal') notTested.push('Entra ID sign-in is not tested nightly; it stays a human UAT check.');
  if (r.helper && !r.helper.ran) notTested.push(`usability pass skipped: ${r.helper.reason}`);
  return {
    runId: r.runId,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    environment: r.environment,
    designatedAgent: r.agent,
    refused: r.refused ?? null,
    setupProblems: r.setupProblems ?? [],
    results: { total: results.length, passed: count('pass'), failed: count('fail'), flaky: count('flaky'), notRun: count('skip') + count('blocked') + count('unresolved') },
    failures: results.filter((x) => x.status === 'fail').map((x) => ({ itemKey: x.itemKey, title: x.title, taskId: x.taskId ?? null, patch: x.patchPath ?? null, patchNote: x.patchNote ?? null, cause: x.impactReason ?? null })),
    flaky: results.filter((x) => x.status === 'flaky').map((x) => x.itemKey),
    permission: r.permission ? { ok: r.permission.ok, leaks: r.permission.leaks?.map((l) => l.path) ?? [], sampled: r.permission.results?.length ?? 0 } : null,
    observations: { fresh: r.observations?.fresh?.length ?? 0, open: r.observations?.open?.length ?? 0, items: (r.observations?.fresh ?? []).map((o) => ({ screen: o.screen, issue: o.issue, detail: o.detail })) },
    selection: { impacted: r.selection?.impacted?.length ?? 0, rotation: r.selection?.rotation?.length ?? 0, carried: r.carried?.length ?? 0, unmapped: r.unmapped?.length ?? 0 },
    coverage: r.coverage ?? null,
    estimate: { estimateMs: r.estimate?.totalMs ?? 0, actualMs: r.actualMs ?? 0, note: r.estimate?.note ?? null, split: Boolean(r.carried?.length), waitedMs: r.waitedMs ?? 0 },
    cleanup: r.cleanup ?? null,
    warnings: r.warnings ?? [],
    green: Boolean(r.gate?.green),
    noArtifactReasons: r.gate?.green ? [] : r.gate?.reasons ?? [],
    artifacts: r.artifacts ?? [],
    artifactSkips: r.artifactSkips ?? [],
    notTested,
  };
}

export function renderSummary(s) {
  const lines = [`# Nightly run ${s.runId}`, ''];
  if (s.refused) return [...lines, '**Refused before touching anything.**', '', s.refused, ''].join('\n');
  if (s.setupProblems.length) lines.push('**Setup problems** (not app failures):', ...s.setupProblems.map((p) => `- ${p}`), '');
  lines.push(
    `**${s.results.passed} passed, ${s.results.failed} failed, ${s.results.flaky} flaky, ${s.results.notRun} not run** of ${s.results.total} (${s.environment}, as ${s.designatedAgent}).`,
    '',
    `Selected: ${s.selection.impacted} reached by changes, ${s.selection.rotation} by rotation${s.selection.carried ? `, ${s.selection.carried} carried to the next night` : ''}.`,
    s.coverage ? `Coverage this cycle: ${s.coverage.covered} of ${s.coverage.total} items${s.coverage.complete ? ' (cycle complete; a new one starts)' : ''}.` : '',
    `Time: estimated ${mins(s.estimate.estimateMs)}, took ${mins(s.estimate.actualMs)}${s.estimate.waitedMs ? `; waited ${mins(s.estimate.waitedMs)} for the previous run to finish` : ''}.${s.estimate.note ? ` ${s.estimate.note}.` : ''}`,
    '',
  );
  if (s.failures.length) {
    lines.push('## Failures', ...s.failures.map((f) => `- **${f.itemKey}** ${f.title}${f.taskId ? ` (task ${f.taskId})` : ''}${f.cause ? `; selected because ${f.cause}` : ''}${f.patch ? `; proposed patch ${f.patch}` : f.patchNote ? `; ${f.patchNote}` : ''}`), '');
  }
  if (s.flaky.length) lines.push('## Flaky (failed, then passed)', ...s.flaky.map((k) => `- ${k}`), '');
  if (s.permission) lines.push('## Permission check', s.permission.ok ? `Passed: the normal user was refused on all ${s.permission.sampled} sampled admin page(s).` : `**Failed**: reachable as a normal user: ${s.permission.leaks.join(', ') || 'no admin pages sampled'}.`, '');
  if (s.observations.fresh || s.observations.open) {
    lines.push(`## Observations (not pass/fail): ${s.observations.fresh} new, ${s.observations.open} open`, ...s.observations.items.map((o) => `- ${o.screen}: ${o.detail}`), '');
  }
  if (s.cleanup) lines.push('## Cleanup', `${s.cleanup.choice}: ${s.cleanup.detail}`, '');
  if (s.warnings.length) lines.push('## Warnings', ...s.warnings.map((w) => `- ${w}`), '');
  lines.push('## Compliance evidence');
  if (s.green) lines.push(s.artifacts.length ? s.artifacts.map((a) => `- ${a.framework}: ${a.dir} (manifest ${a.manifestSha256.slice(0, 12)})`).join('\n') : '- No framework is ticked for this project.');
  else lines.push(`None written: ${s.noArtifactReasons.join('; ')}.`);
  for (const k of s.artifactSkips) lines.push(`- ${k}`);
  lines.push('', '## Not tested tonight', ...(s.notTested.length ? s.notTested.map((n) => `- ${n}`) : ['- Nothing was left out.']), '');
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

export function storeSummary(root, runDir, summary) {
  const md = renderSummary(summary);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'summary.md'), md);
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const last = join(root, LAST_SUMMARY_FILE);
  mkdirSync(dirname(last), { recursive: true });
  writeFileSync(last, JSON.stringify({ ...summary, summaryPath: join(runDir, 'summary.md') }, null, 2) + '\n');
  return md;
}

/** The nightly_run_completed event metadata (validated by the MCP's NightlyRunMetadataSchema). */
export function runEventMetadata(s) {
  return {
    runId: s.runId,
    designatedAgent: s.designatedAgent,
    environment: s.environment,
    estimateMs: Math.round(s.estimate.estimateMs),
    actualMs: Math.round(s.estimate.actualMs),
    selection: s.selection,
    results: s.results,
    permissionCheck: s.permission ? (s.permission.ok ? 'passed' : 'failed') : 'not-run',
    cleanup: { choice: s.cleanup?.choice ?? 'remove', removed: Boolean(s.cleanup?.removed), leftovers: s.cleanup?.leftovers ?? null },
    green: s.green,
    artifactFrameworks: s.artifacts.map((a) => a.framework),
    notTested: s.notTested.slice(0, 50).map((n) => String(n).slice(0, 300)),
  };
}
// [SCOPE 140 / T012] END
