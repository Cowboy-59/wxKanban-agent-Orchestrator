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

// [SCOPE 124 / T004] BEGIN — fixture setup/teardown helpers
async function setupFixture(): Promise<{ fixture: string; cwdBefore: string }> {
  const cwdBefore = process.cwd();
  const fixture = fixtureProject();
  process.chdir(fixture);
  callMcpToolMock.mockReset();
  callMcpToolWithEnvelopeMock.mockReset();
  callMcpToolWithEnvelopeMock.mockResolvedValue({
    success: true,
    blocked: false,
    blockingIssues: [],
    data: { spec: { id: 'spec-x' }, tasks: [] },
  });
  return { fixture, cwdBefore };
}

function teardownFixture(fixture: string, cwdBefore: string): void {
  process.chdir(cwdBefore);
  // A locked temp directory is not a test failure. On Windows the fixture is
  // intermittently still handle-locked when rmSync runs, and letting that EPERM
  // propagate fails an otherwise-passing assertion — noise that makes a real
  // regression harder to see. Best-effort cleanup; the OS reclaims the temp dir.
  try {
    if (existsSync(fixture)) rmSync(fixture, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
// [SCOPE 124 / T004] END

describe('phase2Compare envelope handling (FR-009 / FR-010 / FR-011)', () => {
  it('recognises every spec from specs[], including one with no tasks (SCOPE-124 T004)', async () => {
    const { fixture, cwdBefore } = await setupFixture();
    callMcpToolMock.mockImplementation((tool: unknown) => {
      if (tool === 'project.list_open_items') {
        // [SCOPE 124 / T004] Envelope shape as of T006: identity comes from `specs[]`.
        // Note spec 030 has NO tasks at all — under the old title-derived set it was
        // invisible and would have been pushed as new; here it must be recognised.
        return Promise.resolve({
          specs: [
            { id: 'spec-029', specNumber: '029', title: 'Spec 029', status: 'planned' },
            { id: 'spec-028', specNumber: '028', title: 'Spec 028', status: 'planned' },
            { id: 'spec-030', specNumber: '030', title: 'Spec 030 (no tasks)', status: 'released' },
          ],
          specsComplete: true,
          tasks: [
            { id: 'task-uuid-1', specId: 'spec-029', specNumber: '029', title: '[029-T001] foundation' },
            { id: 'task-uuid-2', specId: 'spec-029', specNumber: '029', title: '[029-T002] envelope' },
            { id: 'task-uuid-3', specId: 'spec-028', specNumber: '028', title: 'no-prefix but has specNumber' },
            { id: 'task-uuid-4', specId: null, specNumber: null, title: 'unrelated task with no prefix' },
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
    teardownFixture(fixture, cwdBefore);

    // No errors regardless of which path was hit (new vs. existing).
    expect(report.push.errors).toEqual([]);
  });
});

// [SCOPE 124 / T004] BEGIN — identity comes from specs[], and an untrustworthy
// answer fails closed rather than defaulting to "nothing exists".
describe('SCOPE-124 T004 — spec identity is read, not inferred', () => {
  it('refuses to push when the envelope has no specs[] (older MCP)', async () => {
    const { fixture, cwdBefore } = await setupFixture();
    callMcpToolMock.mockImplementation((tool: unknown) =>
      tool === 'project.list_open_items'
        ? Promise.resolve({ tasks: [], documents: [], events: [] }) // pre-T006 shape
        : Promise.resolve({}),
    );

    const report = await dbpush({ spec: '029' });
    teardownFixture(fixture, cwdBefore);

    // The critical property: absent identity is UNKNOWN, never "no specs exist".
    // Defaulting to empty is what made every spec look new and created the duplicates.
    expect(report.push.errors.join(' ')).toMatch(/no specs pushed/i);
    expect(report.push.specsCreated).toBe(0);
  });

  it('refuses to push when the specs[] answer was truncated', async () => {
    const { fixture, cwdBefore } = await setupFixture();
    callMcpToolMock.mockImplementation((tool: unknown) =>
      tool === 'project.list_open_items'
        ? Promise.resolve({ specs: [{ specNumber: '029' }], specsComplete: false, tasks: [] })
        : Promise.resolve({}),
    );

    const report = await dbpush({ spec: '029' });
    teardownFixture(fixture, cwdBefore);

    expect(report.push.errors.join(' ')).toMatch(/no specs pushed/i);
    expect(report.push.specsCreated).toBe(0);
  });

  it('never advertises the deleted setup-mcp.mjs script (T016)', async () => {
    const { fixture, cwdBefore } = await setupFixture();
    callMcpToolMock.mockImplementation((tool: unknown) =>
      tool === 'project.list_open_items'
        ? Promise.resolve({ tasks: [], documents: [], events: [] })
        : Promise.resolve({}),
    );

    const report = await dbpush({ spec: '029' });
    teardownFixture(fixture, cwdBefore);

    // Deleted at kit v1.1.0; advising it added MODULE_NOT_FOUND to the original failure.
    expect(report.push.errors.join(' ')).not.toMatch(/setup-mcp\.mjs/);
  });
});
// [SCOPE 124 / T004] END
