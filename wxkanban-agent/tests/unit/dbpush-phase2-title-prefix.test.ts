// Spec 029 / T005 — phase2Compare title-prefix fallback.
//
// Tests cover FR-009 (envelope shape — tasks/documents/events; no specs[])
// and FR-010 (regex parse `[NNN-T###]` from task titles when specNumber is
// absent). Tasks whose titles do not match are ignored — not errors.

import { describe, it, expect, vi } from 'vitest';

// vi.mock is hoisted — declare the mock fns BEFORE any import that
// pulls in dbpush.ts.
const callMcpToolMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const callMcpToolWithEnvelopeMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('../../core/orchestrator/mcp-client', () => ({
  callMcpTool: callMcpToolMock,
  callMcpToolWithEnvelope: callMcpToolWithEnvelopeMock,
  McpClientError: class McpClientError extends Error {
    constructor(message: string, public readonly tool: string) {
      super(message);
    }
  },
}));

const { parseScopeFromTaskTitle, dbpush } = await import('../../dbpush');

describe('parseScopeFromTaskTitle (FR-010)', () => {
  it('extracts scope from canonical [NNN-T###] prefix', () => {
    expect(parseScopeFromTaskTitle('[029-T003] envelope inspection')).toBe('029');
    expect(parseScopeFromTaskTitle('[001-T012] something else')).toBe('001');
  });

  it('handles single-digit task numbers', () => {
    expect(parseScopeFromTaskTitle('[100-T1] short id')).toBe('100');
  });

  it('returns null for titles without the prefix', () => {
    expect(parseScopeFromTaskTitle('Just a plain task title')).toBeNull();
    expect(parseScopeFromTaskTitle('029-T003 missing brackets')).toBeNull();
  });

  it('requires exactly three digits for the scope', () => {
    expect(parseScopeFromTaskTitle('[29-T003] only two digits')).toBeNull();
    expect(parseScopeFromTaskTitle('[0029-T003] four digits')).toBeNull();
  });

  it('requires T-prefixed task number after the dash', () => {
    expect(parseScopeFromTaskTitle('[029-003] missing T')).toBeNull();
    expect(parseScopeFromTaskTitle('[029-TASK3] not just digits')).toBeNull();
  });

  it('returns null for non-string inputs', () => {
    expect(parseScopeFromTaskTitle(undefined)).toBeNull();
  });
});

// Integration-style test: simulate a list_open_items envelope shape and
// confirm derivation works the way phase2Compare expects.

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// [SCOPE 029 / T005] BEGIN — fixtureProject (test helper)
function fixtureProject(): string {
  const root = join(tmpdir(), `dbpush-029-t005-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, '.wxkanban-project.json'),
    JSON.stringify({ projectId: '00000000-0000-0000-0000-000000000000' }),
  );
  mkdirSync(join(root, 'specs', '029-Sample'), { recursive: true });
  writeFileSync(
    join(root, 'specs', '029-Sample', 'spec.md'),
    `# Sample\n\n## Overview\n\nx\n\n## Actors\n\n- Primary: kit\n- Secondary: server\n`,
  );
  return root;
}
// [SCOPE 029 / T005] END

describe('phase2Compare envelope handling (FR-009 / FR-010 / FR-011)', () => {
  it('handles envelope with tasks/documents/events but no specs[] array (FR-009)', async () => {
    const cwdBefore = process.cwd();
    const fixture = fixtureProject();
    process.chdir(fixture);

    callMcpToolMock.mockReset();
    callMcpToolWithEnvelopeMock.mockReset();
    callMcpToolMock.mockImplementation((tool: unknown) => {
      if (tool === 'project.list_open_items') {
        // Real envelope shape — no `specs` key
        return Promise.resolve({
          tasks: [
            { id: 'task-uuid-1', title: '[029-T001] foundation' },
            { id: 'task-uuid-2', title: '[029-T002] envelope' },
            { id: 'task-uuid-3', specNumber: '028', title: 'no-prefix but has specNumber' },
            { id: 'task-uuid-4', title: 'unrelated task with no prefix' },
          ],
          documents: [{ id: 'doc-uuid-1', title: 'Spec 028' }],
          events: [],
        });
      }
      if (tool === 'project.capture_event') return Promise.resolve({ id: 'evt-1' });
      return Promise.resolve({});
    });
    callMcpToolWithEnvelopeMock.mockResolvedValue({
      success: true,
      blocked: false,
      blockingIssues: [],
      data: { spec: { id: 'spec-x' }, tasks: [] },
    });

    const report = await dbpush({ spec: '029' });

    process.chdir(cwdBefore);
    if (existsSync(fixture)) rmSync(fixture, { recursive: true, force: true });

    // No errors regardless of which path was hit (new vs. existing).
    expect(report.push.errors).toEqual([]);
  });
});
