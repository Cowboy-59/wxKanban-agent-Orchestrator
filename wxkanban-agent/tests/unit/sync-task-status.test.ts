// Spec 042 / T037 — task-status write-back (the deferred half of FR-006/SC-3).
//
// Verifies syncTaskStatuses:
//   (a) flips incomplete DB tasks to 'done' when tasks.md marks them done,
//       matching by full description and by truncated name (truncation
//       tolerance), via project.update_task_status.
//   (b) leaves tasks alone when tasks.md does not mark them done.
//   (c) dry-run counts matches but issues no update calls.
//   (d) collects (never throws) when cockpit_summary is unreachable.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const callMcpToolMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('../../core/orchestrator/mcp-client', () => ({
  callMcpTool: callMcpToolMock,
  callMcpToolWithEnvelope: vi.fn(),
  McpClientError: class McpClientError extends Error {},
}));

const { syncTaskStatuses, buildDoneTitles } = await import(
  '../../core/orchestrator/sync-task-status'
);

// [SCOPE 042 / T037] BEGIN — test helpers (temp specs tree + cockpit fixture)
function makeSpecsRoot(scope: string, tasksMd: string): string {
  const root = mkdtempSync(join(tmpdir(), 'wxk-sync-'));
  mkdirSync(join(root, `${scope}-feature`), { recursive: true });
  writeFileSync(join(root, `${scope}-feature`, 'tasks.md'), tasksMd);
  return root;
}

// A cockpit_summary response with incomplete tasks under one scope.
function cockpit(scope: string, tasks: Array<{ id: string; title: string; descriptionMarkdown: string }>) {
  return {
    projectId: 'p1',
    scopes: [{ specNumber: scope, tasks: tasks.map((t) => ({ ...t, status: 'todo' })) }],
    unlinkedTasks: [],
  };
}
// [SCOPE 042 / T037] END

describe('syncTaskStatuses', () => {
  beforeEach(() => callMcpToolMock.mockReset());

  it('flips done-in-md tasks to done in the DB (full + truncated match)', async () => {
    const longTitle =
      'Implement the current-project cockpit read: return the project scopes and specs with tasks grouped by phase and each task status so the dev cockpit can render remaining work without leaving the editor at all';
    const tasksMd = [
      '| # | Task | FR / SC | Priority | Status |',
      '|---|------|---------|----------|--------|',
      '| T001 | Short task one | FR-1 | high | done |',
      `| T002 | ${longTitle} | FR-2 | high | done |`,
      '| T003 | Not finished yet | FR-3 | high | todo |',
    ].join('\n');
    const specsRoot = makeSpecsRoot('042', tasksMd);

    // DB name is truncated to 252 + "…"; description holds the full text.
    const truncated = longTitle.slice(0, 252) + '…';
    callMcpToolMock.mockImplementation(async (...args: unknown[]) => {
      const tool = args[0] as string;
      if (tool === 'project.cockpit_summary') {
        return cockpit('042', [
          { id: 'u1', title: 'Short task one', descriptionMarkdown: 'Short task one' },
          { id: 'u2', title: truncated, descriptionMarkdown: longTitle },
          { id: 'u3', title: 'Not finished yet', descriptionMarkdown: 'Not finished yet' },
        ]);
      }
      return {};
    });

    const res = await syncTaskStatuses({ projectId: 'p1', scope: '042', specsRoot });

    expect(res.matched).toBe(2);
    expect(res.updated).toBe(2);
    expect(res.errors).toEqual([]);
    const updateCalls = callMcpToolMock.mock.calls.filter((c) => c[0] === 'project.update_task_status');
    const updatedIds = updateCalls.map((c) => (c[1] as { taskId: string }).taskId).sort();
    expect(updatedIds).toEqual(['u1', 'u2']); // u3 (todo) untouched
    for (const c of updateCalls) expect((c[1] as { status: string }).status).toBe('done');
  });

  it('dry-run matches but issues no update calls', async () => {
    const tasksMd = [
      '| # | Task | Priority | Status |',
      '|---|------|----------|--------|',
      '| T001 | Task A | high | done |',
    ].join('\n');
    const specsRoot = makeSpecsRoot('050', tasksMd);
    callMcpToolMock.mockResolvedValue(
      cockpit('050', [{ id: 'a1', title: 'Task A', descriptionMarkdown: 'Task A' }]),
    );

    const res = await syncTaskStatuses({ projectId: 'p1', scope: '050', specsRoot, dryRun: true });
    expect(res.matched).toBe(1);
    expect(res.updated).toBe(1);
    expect(callMcpToolMock.mock.calls.some((c) => c[0] === 'project.update_task_status')).toBe(false);
  });

  it('does nothing when nothing is marked done', async () => {
    const tasksMd = [
      '| # | Task | Priority | Status |',
      '|---|------|----------|--------|',
      '| T001 | Task A | high | todo |',
    ].join('\n');
    const specsRoot = makeSpecsRoot('051', tasksMd);
    const res = await syncTaskStatuses({ projectId: 'p1', scope: '051', specsRoot });
    expect(res.updated).toBe(0);
    expect(callMcpToolMock).not.toHaveBeenCalled(); // short-circuits before MCP
  });

  it('collects (never throws) when cockpit_summary is unreachable', async () => {
    const tasksMd = [
      '| # | Task | Priority | Status |',
      '|---|------|----------|--------|',
      '| T001 | Task A | high | done |',
    ].join('\n');
    const specsRoot = makeSpecsRoot('052', tasksMd);
    callMcpToolMock.mockImplementationOnce(async () => {
      throw new Error('MCP not reachable');
    });
    const res = await syncTaskStatuses({ projectId: 'p1', scope: '052', specsRoot });
    expect(res.updated).toBe(0);
    expect(res.errors[0]).toContain('cockpit_summary');
  });

  it('parses the checkbox tasks.md format', async () => {
    const tasksMd = [
      '# Tasks',
      '- [x] T001 [high] T001 Build the thing - some detail',
      '- [ ] T002 [high] T002 Unfinished thing - detail',
    ].join('\n');
    const specsRoot = makeSpecsRoot('024', tasksMd);
    callMcpToolMock.mockResolvedValue(
      cockpit('024', [
        { id: 'c1', title: 'build the thing - some detail', descriptionMarkdown: 'build the thing - some detail' },
        { id: 'c2', title: 'unfinished thing - detail', descriptionMarkdown: 'unfinished thing - detail' },
      ]),
    );
    const res = await syncTaskStatuses({ projectId: 'p1', scope: '024', specsRoot });
    expect(res.updated).toBe(1);
    const ids = callMcpToolMock.mock.calls
      .filter((c) => c[0] === 'project.update_task_status')
      .map((c) => (c[1] as { taskId: string }).taskId);
    expect(ids).toEqual(['c1']);
  });

  it('buildDoneTitles normalizes and filters to terminal statuses', () => {
    const titles = buildDoneTitles([
      { title: '`Backticked`  Title', status: 'done' },
      { title: 'Completed One', status: 'completed' },
      { title: 'Open One', status: 'todo' },
    ]);
    expect(titles.has('backticked title')).toBe(true);
    expect(titles.has('completed one')).toBe(true);
    expect(titles.has('open one')).toBe(false);
  });
});
