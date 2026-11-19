/**
 * The Cockpit's morning summary card — SCOPE-140 (FR-012).
 *
 * The nightly run (wxPreTest --nightly) writes `.wxai/nightly/last-summary.json` in the project.
 * This reads it and turns it into the rows the Cockpit shows: the result line, each failure with
 * its task, the permission check, Observations, coverage, time, cleanup, evidence, and what was
 * not tested. Pure: no vscode import, so it is unit-tested directly.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// [SCOPE 140 / T012] BEGIN — Read the last nightly summary into Cockpit rows
export interface NightlyRow {
  label: string;
  detail: string;
  tone: 'ok' | 'warn' | 'error' | 'info';
}

export interface NightlyCard {
  title: string;
  tone: 'ok' | 'warn' | 'error';
  finishedAt: string | null;
  summaryPath: string | null;
  rows: NightlyRow[];
}

interface Summary {
  runId?: string;
  finishedAt?: string;
  refused?: string | null;
  setupProblems?: string[];
  results?: { total: number; passed: number; failed: number; flaky: number; notRun: number };
  failures?: Array<{ itemKey: string; title?: string; taskId?: string | null }>;
  flaky?: string[];
  permission?: { ok: boolean; leaks: string[]; sampled: number } | null;
  observations?: { fresh: number; open: number };
  coverage?: { covered: number; total: number } | null;
  estimate?: { estimateMs: number; actualMs: number; split: boolean; waitedMs: number };
  cleanup?: { choice: string; detail: string; removed: boolean } | null;
  green?: boolean;
  artifacts?: Array<{ framework: string }>;
  noArtifactReasons?: string[];
  notTested?: string[];
  summaryPath?: string;
}

const mins = (ms: number | undefined): string => `${Math.round((ms ?? 0) / 60000)} min`;

export function nightlyCard(s: Summary): NightlyCard {
  const rows: NightlyRow[] = [];
  const base = { finishedAt: s.finishedAt ?? null, summaryPath: s.summaryPath ?? null };
  if (s.refused) {
    return { ...base, title: 'Nightly run — refused', tone: 'error', rows: [{ label: 'Refused', detail: s.refused.split('\n').slice(1, 3).join(' ').trim(), tone: 'error' }] };
  }
  const r = s.results ?? { total: 0, passed: 0, failed: 0, flaky: 0, notRun: 0 };
  for (const p of s.setupProblems ?? []) rows.push({ label: 'Setup problem', detail: p, tone: 'warn' });
  rows.push({ label: 'Results', detail: `${r.passed} passed, ${r.failed} failed, ${r.flaky} flaky, ${r.notRun} not run of ${r.total}`, tone: r.failed ? 'error' : r.flaky || r.notRun ? 'warn' : 'ok' });
  for (const f of s.failures ?? []) rows.push({ label: `Failed: ${f.itemKey}`, detail: `${f.title ?? ''}${f.taskId ? ` · task ${f.taskId}` : ''}`.trim(), tone: 'error' });
  if (s.flaky?.length) rows.push({ label: 'Flaky', detail: s.flaky.join(', '), tone: 'warn' });
  if (s.permission) rows.push({ label: 'Permission check', detail: s.permission.ok ? `passed (${s.permission.sampled} admin pages refused)` : `FAILED: ${s.permission.leaks.join(', ')}`, tone: s.permission.ok ? 'ok' : 'error' });
  if (s.observations && (s.observations.fresh || s.observations.open)) rows.push({ label: 'Observations', detail: `${s.observations.fresh} new, ${s.observations.open} open (not pass/fail)`, tone: 'info' });
  if (s.coverage) rows.push({ label: 'Coverage', detail: `${s.coverage.covered} of ${s.coverage.total} items this cycle`, tone: 'info' });
  if (s.estimate) rows.push({ label: 'Time', detail: `estimated ${mins(s.estimate.estimateMs)}, took ${mins(s.estimate.actualMs)}${s.estimate.split ? ', split' : ''}${s.estimate.waitedMs ? `, waited ${mins(s.estimate.waitedMs)}` : ''}`, tone: 'info' });
  if (s.cleanup) rows.push({ label: 'Cleanup', detail: `${s.cleanup.choice}: ${s.cleanup.detail}`, tone: s.cleanup.choice === 'remove' && !s.cleanup.removed ? 'warn' : 'ok' });
  rows.push(s.green
    ? { label: 'Evidence', detail: s.artifacts?.length ? s.artifacts.map((a) => a.framework).join(', ') : 'no framework ticked', tone: 'ok' }
    : { label: 'Evidence', detail: `none: ${(s.noArtifactReasons ?? []).join('; ') || 'the run was not green'}`, tone: 'info' });
  for (const n of s.notTested ?? []) rows.push({ label: 'Not tested', detail: n, tone: 'info' });
  const tone: NightlyCard['tone'] = r.failed || s.permission?.ok === false ? 'error' : s.setupProblems?.length || r.flaky || r.notRun ? 'warn' : 'ok';
  const title = s.setupProblems?.length && !r.total ? 'Nightly run — setup problem' : `Nightly run — ${r.passed} passed${r.failed ? `, ${r.failed} failed` : ''}`;
  return { ...base, title, tone, rows };
}

/** The card for a project folder, or null when no nightly run has written a summary there. */
export function loadNightlyCard(folder: string): NightlyCard | null {
  const file = join(folder, '.wxai', 'nightly', 'last-summary.json');
  if (!existsSync(file)) return null;
  try {
    return nightlyCard(JSON.parse(readFileSync(file, 'utf8')) as Summary);
  } catch {
    return { title: 'Nightly run — summary unreadable', tone: 'warn', finishedAt: null, summaryPath: null, rows: [] };
  }
}
// [SCOPE 140 / T012] END
