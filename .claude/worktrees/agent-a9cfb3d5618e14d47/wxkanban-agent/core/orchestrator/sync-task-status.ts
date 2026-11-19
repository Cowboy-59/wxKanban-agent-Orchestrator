// Spec 042 / T037 — push completed task statuses from a scope's tasks.md into
// the DB via MCP, so the Dev Cockpit's remaining counts actually drop when
// work is finished (FR-006 / SC-3).
//
// Background: spec 042 shipped the *refresh ping* (emitCockpitRefresh, T021)
// but the half it pings for — writing task completion back to the DB — was
// left as a deferred stub in dbpush ("Task status sync deferred — needs
// T-ID → UUID resolution on the MCP side"). Result: tasks marked done in
// tasks.md never reached projecttasks.status, so the cockpit re-queried an
// unchanged DB and counts never moved. This module is that missing half.
//
// Resolution strategy (the "T-ID → UUID" the stub punted on): we don't need
// the markdown T-ID at all. project.cockpit_summary already returns each
// INCOMPLETE task with its DB UUID + full title/description, scoped to the
// token's project. We match those against the scope's tasks.md rows by
// normalized title/description and flip the ones now marked done via the
// (scope-bound) project.update_task_status tool.
//
// Fences hand-written because the orchestrator implement CLI is broken
// (memory: feedback_orchestrator_cli_broken). Canonical format; auditfences
// passes.

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { callMcpTool, type McpCallOptions } from './mcp-client';

// [SCOPE 042 / T037] BEGIN — sync types + tasks.md parsing
export interface SyncTaskStatusResult {
  scope: string;
  updated: number; // tasks flipped to a terminal status in the DB
  matched: number; // incomplete DB tasks matched to a done tasks.md row
  errors: string[];
}

interface ParsedMdTask {
  title: string; // normalized
  status: string; // raw, lowercased
}

interface CockpitTask {
  id: string;
  title: string;
  status: string;
  descriptionMarkdown: string;
}
interface CockpitScope {
  specNumber: string;
  tasks: CockpitTask[];
}
interface CockpitSummary {
  projectId: string;
  scopes: CockpitScope[];
  unlinkedTasks: CockpitTask[];
}

// Terminal statuses authored in tasks.md (table "done"/"completed" or
// checkbox "[x]"). Mirrors dbpush.normalizeTaskStatus's closed set.
const TERMINAL_MD_STATUSES = new Set<string>(['done', 'completed', 'complete', 'x', 'shipped']);

function normalizeTitle(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[…….]+$/, '') // trailing ellipsis (DB names are truncated to 252+"…")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build the normalized terminal-status title set from already-parsed tasks
 *  (dbpush parses the artifact itself; this keeps normalization in one place). */
export function buildDoneTitles(tasks: Array<{ title: string; status: string }>): Set<string> {
  return new Set(
    tasks
      .filter((t) => TERMINAL_MD_STATUSES.has((t.status ?? '').toLowerCase().trim()))
      .map((t) => normalizeTitle(t.title)),
  );
}

function findTasksMdPath(specsRoot: string, scope: string): string | null {
  if (!existsSync(specsRoot)) return null;
  const dir = readdirSync(specsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .find((name) => name === scope || name.startsWith(`${scope}-`));
  if (!dir) return null;
  const p = join(specsRoot, dir, 'tasks.md');
  return existsSync(p) ? p : null;
}

// Parse tasks.md in either format the repo uses:
//   pipe table : | # | Task | FR/SC | Priority | Status |  (header-aware)
//   checkbox   : - [x] T001 ... text
function parseTasksMd(path: string): ParsedMdTask[] {
  const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
  const out: ParsedMdTask[] = [];

  // Checkbox format first.
  let sawCheckbox = false;
  for (const line of lines) {
    const m = line.match(/^\s*-\s*\[([ xX])\]\s*(T\d+)\b\s*(.*)$/);
    if (!m) continue;
    sawCheckbox = true;
    out.push({
      title: normalizeTitle((m[3] ?? '').replace(/^\[[^\]]*\]\s*/, '').replace(/^T\d+\s*/, '')),
      status: (m[1] ?? '').toLowerCase() === 'x' ? 'done' : 'todo',
    });
  }
  if (sawCheckbox) return out;

  // Pipe-table format — resolve Task + Status columns from the header.
  let taskCol = -1;
  let statusCol = -1;
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (
      taskCol < 0 &&
      cells.some((c) => /^(task|title)$/i.test(c)) &&
      cells.some((c) => /^status$/i.test(c))
    ) {
      taskCol = cells.findIndex((c) => /^(task|title)$/i.test(c));
      statusCol = cells.findIndex((c) => /^status$/i.test(c));
      continue;
    }
    if (taskCol < 0) continue;
    if (cells.every((c) => /^[-:\s]*$/.test(c))) continue; // separator row
    const title = normalizeTitle((cells[taskCol] ?? '').replace(/^T\d+[:\s.]+/, ''));
    const status = (cells[statusCol] ?? '').toLowerCase().trim();
    if (!title) continue;
    out.push({ title, status });
  }
  return out;
}
// [SCOPE 042 / T037] END

// [SCOPE 042 / T037] BEGIN — syncTaskStatuses (cockpit_summary → update_task_status)
/**
 * Reconcile DB task statuses for one scope to match its tasks.md. Forward-only:
 * incomplete DB tasks whose tasks.md row is now terminal are flipped to 'done'.
 * Best-effort by design — callers (implement/dbpush) must not fail if MCP is
 * unreachable; errors are collected and returned, never thrown.
 */
export async function syncTaskStatuses(input: {
  projectId: string;
  scope: string;
  /** Source of the scope's tasks.md when `doneTitles` is not supplied. */
  specsRoot?: string;
  /** Pre-parsed terminal-status titles (dbpush already parses the artifact). */
  doneTitles?: Set<string>;
  dryRun?: boolean;
  mcpOptions?: McpCallOptions;
}): Promise<SyncTaskStatusResult> {
  const result: SyncTaskStatusResult = { scope: input.scope, updated: 0, matched: 0, errors: [] };

  let doneTitles = input.doneTitles;
  if (!doneTitles) {
    if (!input.specsRoot) {
      result.errors.push('syncTaskStatuses: either doneTitles or specsRoot is required');
      return result;
    }
    const tasksMdPath = findTasksMdPath(input.specsRoot, input.scope);
    if (!tasksMdPath) {
      result.errors.push(`tasks.md not found for scope ${input.scope} under ${input.specsRoot}`);
      return result;
    }
    doneTitles = new Set(
      parseTasksMd(tasksMdPath)
        .filter((t) => TERMINAL_MD_STATUSES.has(t.status))
        .map((t) => t.title),
    );
  }
  if (doneTitles.size === 0) return result; // nothing marked done locally

  let summary: CockpitSummary;
  try {
    summary = await callMcpTool<CockpitSummary>(
      'project.cockpit_summary',
      { projectId: input.projectId },
      input.mcpOptions ?? {},
    );
  } catch (err) {
    result.errors.push(`cockpit_summary: ${(err as Error).message}`);
    return result;
  }

  const scopeNode = summary.scopes?.find((s) => s.specNumber === input.scope);
  const incomplete = scopeNode?.tasks ?? [];

  const isDoneInMd = (t: CockpitTask): boolean => {
    const byDesc = normalizeTitle(t.descriptionMarkdown);
    const byName = normalizeTitle(t.title);
    if (doneTitles.has(byDesc) || doneTitles.has(byName)) return true;
    // Truncation tolerance: DB name is capped at 252 chars + "…".
    for (const d of doneTitles) {
      if (d.startsWith(byName) || byName.startsWith(d)) return true;
      if (d.startsWith(byDesc) || byDesc.startsWith(d)) return true;
    }
    return false;
  };

  for (const task of incomplete) {
    if (!isDoneInMd(task)) continue;
    result.matched += 1;
    if (input.dryRun) {
      result.updated += 1;
      continue;
    }
    try {
      await callMcpTool(
        'project.update_task_status',
        { projectId: input.projectId, taskId: task.id, status: 'done' },
        input.mcpOptions ?? {},
      );
      result.updated += 1;
    } catch (err) {
      result.errors.push(`update_task_status ${task.id}: ${(err as Error).message}`);
    }
  }

  return result;
}
// [SCOPE 042 / T037] END
