#!/usr/bin/env node
// Claude Code PreToolUse hook for AI edits (SCOPE-137 FR-008).
//
// Runs before every Edit, Write, MultiEdit and NotebookEdit, in every permission
// mode — a hook deny holds even in bypass mode, where permission prompts do not
// (memory: canUseTool is shadowed by bypass; a PreToolUse hook is the gate).
//
//   nothing to say   → no output: the edit continues through the NORMAL permission
//                      flow. The hook never answers "allow"; that would skip the
//                      developer's own permission prompt.
//   notify           → additionalContext: Claude is told what the edit affects.
//   Impact Boundary  → deny, with the impact list as the reason. Claude asks the
//                      developer in chat; their yes is recorded by approve.mjs as an
//                      approval bound to these files and this exact content; the
//                      retried edit finds it, uses it once, and goes ahead.
//   possible data    → deny in every mode. Checked FIRST, from the new content alone,
//   loss               so a slow or failing impact check can never let it through.
//
// Unattended runs (WXAI_UNATTENDED=1): a boundary is logged as a crossing and the
// edit continues; possible data loss still stops (FR-009).
//
// Bash (Amendment A, FR-008a): a command that writes or deletes project files is judged
// like an edit of those files, and SQL sent through a database client is checked for
// possible data loss. A command that changes nothing the reader can name gets no opinion.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { buildReport, renderSummary, toImpactGraph } from './change-impact.mjs';
import { dataLossChanges, dataLossIn, decide } from './lib/classify.mjs';
import { fromMsysPath, readBashCommand } from './lib/shell.mjs';
import { buildAgreementEvent, changeHash, mcpCall, mcpConnection, mcpSender, projectIdFor, recordAgreement } from './lib/agreement.mjs';
import { consumeApproval, savePending } from './lib/approvals.mjs';
import { logCrossingLine, unattendedState } from './lib/unattended.mjs';
import { refreshOwnerImpactMode } from './lib/owner-mode.mjs';

// [SCOPE 137 / T009] BEGIN — The proposed change: which file, its content before and after, which lines (FR-008)
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SKIP_PREFIXES = ['.git/', 'node_modules/', '.wxai/'];

function applyEdit(text, oldString, newString, replaceAll) {
  if (!oldString) return null;
  const at = text.indexOf(oldString);
  if (at < 0) return null; // the tool will fail on its own; nothing to check
  return replaceAll ? text.split(oldString).join(newString) : text.slice(0, at) + newString + text.slice(at + oldString.length);
}

/** 1-based line ranges, in the CURRENT file, that an edit replaces. */
function rangesOf(text, oldString) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(oldString, from);
    if (at < 0) break;
    const start = text.slice(0, at).split('\n').length;
    out.push([start, start + oldString.split('\n').length - 1]);
    from = at + Math.max(oldString.length, 1);
  }
  return out;
}

/**
 * What the tool call would change: { file (repo-relative), oldSrc, newSrc, ranges, isNew },
 * or null when it is not a code edit this hook checks (outside the project, kit state, or
 * an edit that cannot apply).
 */
export function proposedChange(root, toolName, input) {
  const target = input?.file_path ?? input?.notebook_path;
  if (!target || typeof target !== 'string') return null;
  const abs = isAbsolute(target) ? target : resolve(root, target);
  const file = relative(root, abs).replace(/\\/g, '/');
  if (!file || file.startsWith('..') || isAbsolute(file) || SKIP_PREFIXES.some((p) => file.startsWith(p))) return null;
  const isNew = !existsSync(abs);
  const oldSrc = isNew ? '' : readFileSync(abs, 'utf8');

  if (toolName === 'Write') {
    return { file, oldSrc, newSrc: String(input.content ?? ''), ranges: null, isNew };
  }
  if (toolName === 'Edit') {
    const newSrc = applyEdit(oldSrc, input.old_string, input.new_string ?? '', input.replace_all === true);
    if (newSrc === null) return null;
    return { file, oldSrc, newSrc, ranges: rangesOf(oldSrc, input.old_string), isNew };
  }
  if (toolName === 'MultiEdit') {
    let text = oldSrc;
    const ranges = [];
    for (const e of Array.isArray(input.edits) ? input.edits : []) {
      ranges.push(...rangesOf(text, e.old_string ?? ''));
      const next = applyEdit(text, e.old_string, e.new_string ?? '', e.replace_all === true);
      if (next === null) return null;
      text = next;
    }
    return { file, oldSrc, newSrc: text, ranges, isNew };
  }
  if (toolName === 'NotebookEdit') {
    // A cell, not a file: check the cell's new text, and bind the approval to the whole call.
    return { file, oldSrc: '', newSrc: String(input.new_source ?? ''), ranges: null, isNew, cellOnly: true, callKey: JSON.stringify(input) };
  }
  return null;
}
// [SCOPE 137 / T009] END

// [SCOPE 137 / T009] BEGIN — What the hook tells Claude (FR-008)
// MODIFIED-BY: [SCOPE 137 / T010] — a data-loss stop in an unattended run says who decides, and where
// MODIFIED-BY: [SCOPE 137 / T017] — windowsHide on the git spawn (no console window on Windows)
// MODIFIED-BY: [SCOPE 137 / T019] — says when a local impactMode was ignored for the owner's (FR-007a)

function headOf(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { windowsHide: true, cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'uncommitted';
  }
}

function reachedLines(report, max = 15) {
  const seen = new Set();
  const lines = [];
  for (const l of report.links) {
    if (l.direction !== 'dependent' || String(l.to).includes(':') || seen.has(l.to)) continue;
    seen.add(l.to);
    lines.push(`  - ${l.to} (${l.type}, ${l.confidence})`);
  }
  const more = lines.length > max ? [`  - … and ${lines.length - max} more (see .wxai/impact-summary.md)`] : [];
  return [...lines.slice(0, max), ...more];
}

function approveHow(hash, dataLoss) {
  return [
    'Show the developer this list in chat and ask whether to go ahead. Do not decide for them.',
    'Only if they say yes, record their answer with their own words, then retry this exact edit:',
    `  node _wxAI/impact/approve.mjs --hash ${hash} --answer approve --quote "<the developer's words>"${dataLoss ? ' --data-loss' : ''}`,
    'If they say no:',
    `  node _wxAI/impact/approve.mjs --hash ${hash} --answer decline --quote "<the developer's words>"`,
    'and do not retry it. An approval covers this exact change once; any other change is checked again.',
  ].join('\n');
}

export function denyReason({ report, hash, dataLoss, file, state = null }) {
  const c = report?.classification;
  const lines = [];
  if (dataLoss.length) {
    lines.push(`Change Impact: STOPPED — possible data loss in ${file}. This stops in every impactMode.`);
    for (const d of dataLoss) lines.push(`  - ${d.kind} ${[d.table, d.column].filter(Boolean).join('.')}${d.line ? ` (line ${d.line})` : ''}: ${d.text}`);
  } else {
    lines.push(`Change Impact: this edit to ${file} crosses an Impact Boundary (impactMode ${c.mode}).`);
  }
  if (c) {
    for (const r of c.reasons) lines.push(`  - Boundary: ${r.detail}`);
    if (!c.signoff?.checked) lines.push(`  - Human sign-offs: not checked (${c.signoff?.reason ?? 'unavailable'})`);
    if (c.warning) lines.push(`  - Note: ${c.warning}`);
    if (report.summary?.affected) {
      lines.push(`Affected files: ${report.summary.affected}`);
      lines.push(...reachedLines(report));
    }
  }
  if (dataLoss.length && state?.remote) {
    lines.push('', 'Unattended under the Remote Session Bridge: ask this question in the room so it reaches the developer\'s phone, and wait for their answer. Do not continue past it.');
  } else if (dataLoss.length && state?.unattended) {
    lines.push('', `Unattended run (${state.by}): nobody can approve this now. Stop the run here, save your state, and say at the next checkpoint that this change is waiting for the developer.`);
  }
  lines.push('', approveHow(hash, dataLoss.length > 0));
  return lines.join('\n');
}

export function notifyContext(report, file) {
  return [
    `Change Impact (notify): the edit to ${file} affects ${report.summary.affected} other file(s). No agreement is needed; tell the developer what it affects when you report the change.`,
    ...reachedLines(report, 10),
    ...(report.classification?.warning ? [`Note: ${report.classification.warning}`] : []),
  ].join('\n');
}

const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
const inform = (text) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } });
// [SCOPE 137 / T009] END

// [SCOPE 137 / T009] BEGIN — The decision for one tool call (FR-008, FR-009)
// MODIFIED-BY: [SCOPE 137 / T011] — the report it writes says it came from the hook, with the content hash, so the Cockpit does not ask again when the AI edit lands through the editor
// MODIFIED-BY: [SCOPE 137 / T010] — unattended from the environment or a session-bound marker; data-loss stops are logged for the checkpoint
// MODIFIED-BY: [SCOPE 137 / T018] — Bash commands go to decideBashCall (Amendment A, FR-008a)
// MODIFIED-BY: [SCOPE 137 / T019] — refreshes the owner-set impactMode before the report (FR-007a)
/**
 * Decide one PreToolUse call. Returns the JSON to print, or null for "no opinion".
 * `deps` lets tests replace the network calls.
 */
export async function decideToolCall(input, { root, deps = {} } = {}) {
  if (input?.hook_event_name === 'PreToolUse' && input.tool_name === 'Bash') return decideBashCall(input, { root, deps });
  if (input?.hook_event_name !== 'PreToolUse' || !EDIT_TOOLS.has(input.tool_name)) return null;
  const change = proposedChange(root, input.tool_name, input.tool_input ?? {});
  if (!change) return null;
  const { file } = change;
  const hash = change.callKey ? changeHash([{ file, content: change.callKey }]) : changeHash([{ file, content: change.newSrc }]);
  const state = unattendedState(root, input.session_id ?? null);

  // 1. Possible data loss — from the content alone, before anything slow can time out.
  const dataLoss = dataLossChanges({ file, oldSrc: change.oldSrc, newSrc: change.newSrc });
  const approval = () => consumeApproval(root, { hash, files: [file] });
  if (dataLoss.length) {
    const ok = approval();
    if (ok?.dataLoss) return null;
    savePending(root, { hash, files: [file], report: stubReport(file, dataLoss), reason: 'data-loss' });
    if (state.unattended) {
      logCrossingLine(root, { kind: 'stop', files: [file], hash, reasons: dataLoss.map((d) => `possible data loss: ${d.kind} ${[d.table, d.column].filter(Boolean).join('.')}`) });
    }
    return deny(denyReason({ report: null, hash, dataLoss, file, state }));
  }
  if (change.cellOnly) return null;

  // 2. The impact itself, under the owner's impactMode (refreshed at most hourly).
  await refreshOwnerImpactMode(root, deps.ownerMode ?? { conn: deps.conn });
  const report = buildReport({
    root,
    changedFiles: [file],
    precise: Boolean(change.ranges?.length),
    ranges: change.ranges?.length ? new Map([[file, change.ranges]]) : null,
    contents: new Map([[file, { old: change.oldSrc, new: change.newSrc }]]),
  });
  const c = report.classification;

  // 3. Human sign-offs this change would undo: asked read-only (report_change_impact dryRun).
  if (c.decision !== 'none' && (report.summary.affected ?? 0) > 0) {
    await addSignoffs(root, report, deps);
  }
  writeReport(root, { ...report, origin: 'hook', contentHash: hash, checkedAt: new Date().toISOString() });

  if (c.decision === 'none') return null;
  if (c.decision === 'notify') return inform(notifyContext(report, file));

  // 4. Ask (an Impact Boundary, or impactMode always).
  if (approval()) return null;
  if (state.unattended) {
    await logCrossing(root, report, hash, deps, state);
    return inform(`Change Impact: unattended run — this edit to ${file} crossed an Impact Boundary and was logged; it will be listed at the next checkpoint.\n${c.reasons.map((r) => `  - ${r.detail}`).join('\n')}`);
  }
  savePending(root, { hash, files: [file], report, reason: 'boundary' });
  return deny(denyReason({ report, hash, dataLoss: [], file }));
}

// [SCOPE 137 / T018] BEGIN — Bash commands judged like edits (Amendment A, FR-008a)
// MODIFIED-BY: [SCOPE 137 / T020] — a Git Bash path such as /e/project/file is judged, not skipped as outside the project
// MODIFIED-BY: [SCOPE 137 / T019] — refreshes the owner-set impactMode before the report (FR-007a)
/**
 * A Bash command that writes or deletes project files is judged like an edit of those files; SQL
 * it sends through a database client is checked for possible data loss. A command that touches
 * nothing the reader can name gets no opinion, so ordinary commands pass untouched. The approval
 * binds to the exact command text.
 */
export async function decideBashCall(input, { root, deps = {} } = {}) {
  const command = String(input.tool_input?.command ?? '');
  if (!command.trim()) return null;
  const read = readBashCommand(command);
  if (!read.writes.length && !read.deletes.length && !read.sql.length) return null;

  const cwd = resolve(input.cwd ?? root);
  const files = [];
  for (const raw of [...read.writes, ...read.deletes]) {
    const p = fromMsysPath(raw);
    const abs = isAbsolute(p) ? p : resolve(cwd, p);
    const rel = relative(root, abs).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || SKIP_PREFIXES.some((x) => rel.startsWith(x))) continue;
    if (!files.includes(rel)) files.push(rel);
  }
  const hash = changeHash([{ file: '(bash)', content: command }]);
  const key = files.length ? files : ['(bash)'];
  const label = files.length ? `${files.join(', ')} (by a Bash command)` : 'the database (by a Bash command)';
  const state = unattendedState(root, input.session_id ?? null);
  const approval = () => consumeApproval(root, { hash, files: key });

  // 1. SQL through a database client: possible data loss stops in every mode.
  const dataLoss = [];
  for (const s of read.sql) {
    dataLoss.push(...dataLossIn(s.text).map((d) => ({ ...d, file: '(command)', line: null })));
    if (s.file) {
      const f = fromMsysPath(s.file);
      const abs = isAbsolute(f) ? f : resolve(cwd, f);
      try {
        dataLoss.push(...dataLossIn(readFileSync(abs, 'utf8')).map((d) => ({ ...d, file: s.file })));
      } catch {
        // an unreadable script cannot be judged here; the client will report it
      }
    }
  }
  if (dataLoss.length) {
    const ok = approval();
    if (ok?.dataLoss) return null;
    savePending(root, { hash, files: key, report: stubReport(label, dataLoss), reason: 'data-loss' });
    if (state.unattended) {
      logCrossingLine(root, { kind: 'stop', files: key, hash, reasons: dataLoss.map((d) => `possible data loss: ${d.kind} ${[d.table, d.column].filter(Boolean).join('.')}`) });
    }
    return deny(denyReason({ report: null, hash, dataLoss, file: label, state }));
  }
  if (!files.length) return null;

  // 2. The impact of the files it writes or deletes (file level: the new content is not known yet).
  await refreshOwnerImpactMode(root, deps.ownerMode ?? { conn: deps.conn });
  const report = buildReport({ root, changedFiles: files });
  const c = report.classification;
  if (c.decision !== 'none' && (report.summary.affected ?? 0) > 0) await addSignoffs(root, report, deps);
  writeReport(root, { ...report, origin: 'hook', contentHash: hash, checkedAt: new Date().toISOString() });
  if (c.decision === 'none') return null;
  if (c.decision === 'notify') return inform(notifyContext(report, label));
  if (approval()) return null;
  if (state.unattended) {
    await logCrossing(root, report, hash, deps, state);
    return inform(`Change Impact: unattended run — this Bash command changing ${files.join(', ')} crossed an Impact Boundary and was logged; it will be listed at the next checkpoint.\n${c.reasons.map((r) => `  - ${r.detail}`).join('\n')}`);
  }
  savePending(root, { hash, files: key, report, reason: 'boundary' });
  return deny(denyReason({ report, hash, dataLoss: [], file: label }));
}
// [SCOPE 137 / T018] END

function stubReport(file, dataLoss) {
  return {
    changedFiles: [file],
    broad: false,
    summary: { affected: 0 },
    links: [],
    scopes: { ownScopes: [], reachedScopes: [] },
    classification: { mode: 'boundaries', decision: 'stop', boundary: false, reasons: [], dataLoss, ownScopes: [], signoff: { checked: false, reason: 'not asked: stopped for possible data loss' } },
  };
}

async function addSignoffs(root, report, deps) {
  const c = report.classification;
  const projectId = projectIdFor(root);
  const conn = deps.conn !== undefined ? deps.conn : mcpConnection(root);
  if (!projectId || !conn) {
    c.signoff = { checked: false, reason: 'no wxKanban connection configured' };
    return;
  }
  try {
    const call = deps.mcpCall ?? mcpCall;
    const out = await call(conn, 'project.report_change_impact', {
      projectId, version: 'preview', dryRun: true, graph: toImpactGraph(report, headOf(root)),
    }, { timeoutMs: 4000 });
    if (!out?.dryRun) throw new Error(out?.reason ?? 'the hosted MCP does not support dryRun yet');
    c.signoff = { checked: true, count: out.wouldUndo.length };
    for (const s of out.wouldUndo) c.reasons.push({ kind: 'signoff', item: s, detail: `would undo the human sign-off on ${s.title}` });
    if (out.wouldUndo.length) {
      c.boundary = true;
      c.decision = decide(c.mode, { hasImpact: true, boundary: true, dataLoss: c.dataLoss.length > 0 });
    }
  } catch (e) {
    c.signoff = { checked: false, reason: `sign-off check failed: ${e instanceof Error ? e.message : e}` };
  }
}

async function logCrossing(root, report, hash, deps, state) {
  logCrossingLine(root, { kind: 'crossing', files: report.changedFiles, hash, reasons: report.classification.reasons.map((r) => r.detail), affected: report.summary.affected, by: state.by });
  const projectId = projectIdFor(root);
  if (!projectId) return;
  const event = buildAgreementEvent({
    projectId, actor: process.env.WXAI_AGENT_NAME ?? 'unattended-agent', kind: 'crossing', answer: 'continued',
    attended: false, entryPoint: state.remote ? 'remote' : 'unattended', report, hash,
  });
  await recordAgreement(root, event, deps.send ?? mcpSender(mcpConnection(root)));
}

function writeReport(root, report) {
  try {
    const out = join(root, '.wxai', 'impact.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    writeFileSync(join(root, '.wxai', 'impact-summary.md'), renderSummary(report));
  } catch {
    // the Cockpit view is a convenience; never let it decide the edit
  }
}
// [SCOPE 137 / T009] END

// [SCOPE 137 / T009] BEGIN — Hook entry point: stdin JSON in, decision JSON out (FR-008)
async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // not a hook call; no opinion
  }
  const root = resolve(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd());
  try {
    const out = await decideToolCall(input, { root });
    if (out) process.stdout.write(JSON.stringify(out));
  } catch (e) {
    // The impact check failed. Possible data loss was already checked above it, so the
    // edit continues through the normal flow — and Claude is told the check did not run.
    process.stdout.write(JSON.stringify(inform(`Change Impact: the impact check could not run (${e instanceof Error ? e.message : e}); this edit was not checked.`)));
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('_wxAI/impact/hook.mjs')) main();
// [SCOPE 137 / T009] END
