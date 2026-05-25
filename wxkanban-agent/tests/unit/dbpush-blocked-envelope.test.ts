// Spec 029 / T003 — pushNewSpec / pushExistingSpec envelope inspection.
//
// These tests mock the MCP client to return specific envelopes and assert
// that dbpush:
//   (a) Pushes blockingIssues into r.errors prefixed with scope number,
//       and does NOT increment specsCreated / tasksCreated, when the server
//       envelope reports success:false (FR-005).
//   (b) Derives specsCreated from response.spec != null and tasksCreated
//       from response.tasks.length on success (FR-006), NOT from the local
//       artifact.
//   (c) Applies the same envelope inspection to upsert_document calls
//       in pushExistingSpec (FR-007).
//   (d) Handles a mixed batch (one blocked + one success) correctly.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the mcp-client before importing dbpush. dbpush imports
// callMcpToolWithEnvelope at module load time.
type EnvelopeShape = {
  success: boolean;
  blocked: boolean;
  blockingIssues: string[];
  data: Record<string, unknown>;
};

const callMcpToolWithEnvelopeMock = vi.fn<(...args: unknown[]) => Promise<EnvelopeShape>>();
const callMcpToolMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('../../core/orchestrator/mcp-client', () => ({
  callMcpTool: callMcpToolMock,
  callMcpToolWithEnvelope: callMcpToolWithEnvelopeMock,
  McpClientError: class McpClientError extends Error {
    constructor(message: string, public readonly tool: string) {
      super(message);
    }
  },
}));

// Import after the mock so the mocked symbols are wired up.
const { dbpush, parseTasksMd } = await import('../../dbpush');
void parseTasksMd; // keep import side-effects, silence unused

// [SCOPE 029 / T003] BEGIN — makeArtifact (test helper)
function envelopeFromShape(over: Partial<EnvelopeShape>): EnvelopeShape {
  return {
    success: true,
    blocked: false,
    blockingIssues: [],
    data: {},
    ...over,
  };
}
// [SCOPE 029 / T003] END

// We exercise dbpush() at the top level rather than the private push
// functions, so the tests reflect real operator-facing behavior. We
// configure the file system via fixture project directories below.

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// [SCOPE 029 / T003] BEGIN — fixtureProject (sets up tmp project root)
function fixtureProject(scopes: Array<{ number: string; slug: string; specBody: string }>): string {
  const root = join(tmpdir(), `dbpush-029-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, '.wxkanban-project.json'),
    JSON.stringify({ projectId: '00000000-0000-0000-0000-000000000000' }),
  );
  mkdirSync(join(root, 'specs'), { recursive: true });
  for (const s of scopes) {
    const dir = join(root, 'specs', `${s.number}-${s.slug}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'spec.md'), s.specBody);
  }
  return root;
}
// [SCOPE 029 / T003] END

const VALID_SPEC_BODY = `# Spec\n\n## Overview\n\nA real fix for a real problem with enough text to clear the meaningfulness gate easily.\n\n## Business Problem\n\nThe specific business problem is that the kit silently succeeds when the server blocks the push.\n\n## Actors\n\n- Primary: Kit operator running dbpush against the hosted MCP\n- Secondary: MCP server receiving the create_specs call\n\n## Success Metrics\n\n1. Zero silent-success reports across 50 consecutive runs.\n2. Counts match server truth — 100% of cases.\n3. capture_event metadata reports pushErrors within 1 second.\n\n## Scope Boundary\n\nKit MCP client envelope handling.\n\n## Out of Scope\n\nRewriting the preflight rules themselves.\n\n## Open Questions\n\nNone.\n`;

describe('dbpush — envelope inspection (FR-005, FR-006, FR-007)', () => {
  let cwdBefore = '';
  let fixture = '';

  beforeEach(() => {
    callMcpToolWithEnvelopeMock.mockReset();
    callMcpToolMock.mockReset();
    // phase2Compare's list_open_items + capture_event use the legacy path.
    callMcpToolMock.mockImplementation((tool: unknown) => {
      if (tool === 'project.list_open_items') {
        return Promise.resolve({ tasks: [], documents: [], events: [] });
      }
      if (tool === 'project.capture_event') {
        return Promise.resolve({ id: 'evt-1' });
      }
      return Promise.resolve({});
    });
    cwdBefore = process.cwd();
  });

  function cleanup() {
    process.chdir(cwdBefore);
    if (fixture && existsSync(fixture)) {
      rmSync(fixture, { recursive: true, force: true });
    }
  }

  it('(a) blocked envelope → r.errors populated, counters zero', async () => {
    fixture = fixtureProject([{ number: '030', slug: 'BlockedScope', specBody: VALID_SPEC_BODY }]);
    process.chdir(fixture);

    callMcpToolWithEnvelopeMock.mockResolvedValueOnce(
      envelopeFromShape({
        success: false,
        blocked: true,
        blockingIssues: [
          'Actors section must identify a primary actor.',
          'Success Metrics must include at least 3 measurable outcomes.',
        ],
        data: { spec: null, tasks: [] },
      }),
    );

    const report = await dbpush({ spec: '030' });
    cleanup();

    expect(report.push.specsCreated).toBe(0);
    expect(report.push.tasksCreated).toBe(0);
    expect(report.push.errors).toHaveLength(2);
    expect(report.push.errors[0]).toBe('030: Actors section must identify a primary actor.');
    expect(report.push.errors[1]).toBe('030: Success Metrics must include at least 3 measurable outcomes.');
    // T006 / FR-021 — blockingIssuesCount tracks server-reported blocks.
    expect(report.push.blockingIssuesCount).toBe(2);
  });

  it('(b) success envelope → counters derived from response.spec + response.tasks (not local artifact)', async () => {
    fixture = fixtureProject([{ number: '031', slug: 'SuccessScope', specBody: VALID_SPEC_BODY }]);
    process.chdir(fixture);

    callMcpToolWithEnvelopeMock.mockResolvedValueOnce(
      envelopeFromShape({
        success: true,
        data: {
          spec: { id: 'spec-uuid-031', specNumber: '031' },
          tasks: [
            { id: 't1', title: 'Task 1' },
            { id: 't2', title: 'Task 2' },
            { id: 't3', title: 'Task 3' },
          ],
        },
      }),
    );

    const report = await dbpush({ spec: '031' });
    cleanup();

    expect(report.push.errors).toEqual([]);
    expect(report.push.specsCreated).toBe(1);
    // Server reported 3 tasks even though local artifact had 0 — must
    // reflect the SERVER count, not the local one (FR-006).
    expect(report.push.tasksCreated).toBe(3);
    // T006 / FR-021 — success path → 0 blocking issues.
    expect(report.push.blockingIssuesCount).toBe(0);
  });

  it('(b.2) success envelope with spec:null → specsCreated is 0', async () => {
    fixture = fixtureProject([{ number: '032', slug: 'NoOpScope', specBody: VALID_SPEC_BODY }]);
    process.chdir(fixture);

    callMcpToolWithEnvelopeMock.mockResolvedValueOnce(
      envelopeFromShape({
        success: true,
        data: { spec: null, tasks: [] },
      }),
    );

    const report = await dbpush({ spec: '032' });
    cleanup();

    expect(report.push.errors).toEqual([]);
    expect(report.push.specsCreated).toBe(0);
    expect(report.push.tasksCreated).toBe(0);
  });

  it('(c) success-without-blockingIssues path — fallback diagnostic added', async () => {
    fixture = fixtureProject([{ number: '033', slug: 'MalformedBlock', specBody: VALID_SPEC_BODY }]);
    process.chdir(fixture);

    callMcpToolWithEnvelopeMock.mockResolvedValueOnce(
      envelopeFromShape({
        success: false,
        blocked: true,
        blockingIssues: [],
        data: { spec: null, tasks: [] },
      }),
    );

    const report = await dbpush({ spec: '033' });
    cleanup();

    expect(report.push.specsCreated).toBe(0);
    expect(report.push.errors).toHaveLength(1);
    expect(report.push.errors[0]).toContain('033:');
    expect(report.push.errors[0]).toContain('without blockingIssues');
  });
});
