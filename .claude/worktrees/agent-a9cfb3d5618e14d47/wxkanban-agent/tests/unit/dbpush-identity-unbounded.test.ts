/**
 * SCOPE-124 / T009 (FR-006) — a limit may bound a display, never an existence check.
 *
 * `phase2Compare` asked `project.list_open_items` for `maxItems: 100`. Anything outside that
 * window read as "does not exist", which is "is new", which is a duplicate. The bound could not be
 * raised to fix it: `maxItems` is capped at 100 by the tool's own schema, so no value of it can
 * express "all of them".
 *
 * These tests pin both halves of the fix: the identity call sends no bound, and a project far past
 * the old window resolves every spec.
 */
import { describe, it, expect, vi } from 'vitest';

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

const { dbpush } = await import('../../dbpush');

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// [SCOPE 124 / T009] BEGIN — fixture helpers
function fixtureProject(): string {
  const root = join(
    tmpdir(),
    `dbpush-124-t009-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, '.wxkanban-project.json'),
    JSON.stringify({ projectId: '00000000-0000-0000-0000-000000000000' }),
  );
  mkdirSync(join(root, 'specs', '150-Sample'), { recursive: true });
  writeFileSync(
    join(root, 'specs', '150-Sample', 'spec.md'),
    `# Sample\n\n## Overview\n\nx\n\n## Actors\n\n- Primary: kit\n- Secondary: server\n`,
  );
  return root;
}

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
  // A locked temp directory is not a test failure — Windows holds handles briefly.
  try {
    if (existsSync(fixture)) rmSync(fixture, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/** 150 specs — comfortably past the old 100-item window, with the pushed one at the far end. */
function manySpecs(): Array<{ id: string; specNumber: string; title: string; status: string }> {
  return Array.from({ length: 150 }, (_, i) => {
    const n = String(i + 1).padStart(3, '0');
    return { id: `spec-${n}`, specNumber: n, title: `Spec ${n}`, status: 'planned' };
  });
}
// [SCOPE 124 / T009] END

describe('SCOPE-124 T009 — the identity call carries no truncation bound', () => {
  it('sends no maxItems to list_open_items', async () => {
    const { fixture, cwdBefore } = await setupFixture();
    callMcpToolMock.mockImplementation((tool: unknown) =>
      tool === 'project.list_open_items'
        ? Promise.resolve({ specs: manySpecs(), specsComplete: true, tasks: [], documents: [], events: [] })
        : Promise.resolve({}),
    );

    await dbpush({ spec: '150' });
    teardownFixture(fixture, cwdBefore);

    const call = callMcpToolMock.mock.calls.find((c) => c[0] === 'project.list_open_items');
    expect(call).toBeDefined();
    const args = call?.[1] as Record<string, unknown>;
    expect(args).toBeDefined();
    // The bound is gone, not merely raised — a maxItems on the identity call reads as though it
    // governs identity, and the next decision routed through the bounded lists brings the bug back.
    expect(args).not.toHaveProperty('maxItems');
    expect(args.projectId).toBeDefined();
  });

  it('recognises a spec that sits far past the old 100-item window', async () => {
    const { fixture, cwdBefore } = await setupFixture();
    callMcpToolMock.mockImplementation((tool: unknown) =>
      tool === 'project.list_open_items'
        ? Promise.resolve({ specs: manySpecs(), specsComplete: true, tasks: [], documents: [], events: [] })
        : Promise.resolve({}),
    );

    // Spec 150 is the 150th entry. Under maxItems:100 it fell outside the answer entirely,
    // was read as "does not exist", and would have been pushed as new — a duplicate.
    const report = await dbpush({ spec: '150' });
    teardownFixture(fixture, cwdBefore);

    expect(report.push.errors).toEqual([]);
    expect(report.push.specsCreated).toBe(0);
    expect(report.push.specsUpdated).toBe(1);
  });

  it('still fails closed when the unbounded answer reports itself incomplete', async () => {
    // Removing the bound does not remove the backstop: the server caps specs[] at a runaway limit
    // and says so. That case must still refuse rather than treat the window as the whole truth.
    const { fixture, cwdBefore } = await setupFixture();
    callMcpToolMock.mockImplementation((tool: unknown) =>
      tool === 'project.list_open_items'
        ? Promise.resolve({ specs: manySpecs(), specsComplete: false, tasks: [], documents: [], events: [] })
        : Promise.resolve({}),
    );

    const report = await dbpush({ spec: '150' });
    teardownFixture(fixture, cwdBefore);

    expect(report.push.errors.join(' ')).toMatch(/no specs pushed/i);
    expect(report.push.specsCreated).toBe(0);
  });

  it('fails closed when the answer omits specsComplete entirely', async () => {
    // The gate used to read `specsComplete === false`, so an envelope carrying specs[] but NO
    // completeness flag sailed through and was trusted as authoritative identity. This server
    // emits both fields together, but dbpush talks to an independently-versioned hosted MCP:
    // the client cannot assume which server answered. Absent is UNKNOWN, and unknown must refuse.
    const { fixture, cwdBefore } = await setupFixture();
    callMcpToolMock.mockImplementation((tool: unknown) =>
      tool === 'project.list_open_items'
        ? Promise.resolve({ specs: manySpecs(), tasks: [], documents: [], events: [] })
        : Promise.resolve({}),
    );

    const report = await dbpush({ spec: '150' });
    teardownFixture(fixture, cwdBefore);

    expect(report.push.errors.join(' ')).toMatch(/no specs pushed/i);
    expect(report.push.specsCreated).toBe(0);
  });
});
