// Spec 029 / T008 — Layer 2 integration test (blocked report end-to-end).
//
// Exercises dbpush() against a fixture project with two scopes:
//   - one well-formed (preflight passes → 200 success envelope)
//   - one heading-shape-broken (preflight blocks → 422 envelope)
//
// Asserts the operator-visible truth: kit report counts come from the
// server, errors carry one entry per blocking issue, capture_event
// metadata reports pushErrors and blockingIssuesCount honestly.
//
// Interactive retry (FR-018 / FR-019) is deferred to T015 — this file
// covers Layer 2's truth-telling only.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { stubStdin } from '../helpers/stdin-stub';

// vi.mock is hoisted — declare mock fns BEFORE any import that pulls in
// dbpush.ts. The mocks let us simulate envelope shapes returned by the
// hosted MCP without spinning up a real server.

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

const { dbpush } = await import('../../dbpush');

// [SCOPE 029 / T008] BEGIN — validSpecBody (passes preflight)
const VALID_SPEC_BODY = `# Spec\n\n## Overview\n\nA real fix for a real problem with enough text to clear the meaningfulness gate easily.\n\n## Business Problem\n\nThe specific business problem is that the kit silently succeeds when the server blocks the push.\n\n## Actors\n\n- Primary: Kit operator running dbpush against the hosted MCP\n- Secondary: MCP server receiving the create_specs call\n\n## Success Metrics\n\n1. Zero silent-success reports across 50 consecutive runs.\n2. Counts match server truth — 100% of cases.\n3. capture_event metadata reports pushErrors within 1 second.\n\n## Scope Boundary\n\nKit MCP client envelope handling.\n\n## Out of Scope\n\nRewriting the preflight rules themselves.\n\n## Open Questions\n\nNone.\n`;
// [SCOPE 029 / T008] END

// [SCOPE 029 / T008] BEGIN — brokenSpecBody (heading-shape broken)
//
// Same content as the valid spec but the Actors section uses the bold
// em-dash form — preflight will fail with `hasActors: false` because
// extractActorValue() looks for `Primary:` / `Secondary:` line labels.
const BROKEN_SPEC_BODY = `# Spec\n\n## Overview\n\nA real fix for a real problem with enough text to clear the meaningfulness gate easily.\n\n## Business Problem\n\nThe specific business problem is that the kit silently succeeds when the server blocks the push.\n\n## Actors\n\n**Primary actor — Kit operator running dbpush against the hosted MCP**\n**Secondary actor — MCP server receiving the create_specs call**\n\n## Success Metrics\n\n1. Zero silent-success reports across 50 consecutive runs.\n2. Counts match server truth — 100% of cases.\n3. capture_event metadata reports pushErrors within 1 second.\n\n## Scope Boundary\n\nKit MCP client envelope handling.\n\n## Out of Scope\n\nRewriting the preflight rules themselves.\n\n## Open Questions\n\nNone.\n`;
// [SCOPE 029 / T008] END

// [SCOPE 029 / T008] BEGIN — fixtureProject (two-scope tmp project)
function fixtureProject(): string {
  const root = join(tmpdir(), `dbpush-029-t008-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, '.wxkanban-project.json'),
    JSON.stringify({ projectId: '00000000-0000-0000-0000-000000000000' }),
  );
  mkdirSync(join(root, 'specs', '300-ValidScope'), { recursive: true });
  writeFileSync(join(root, 'specs', '300-ValidScope', 'spec.md'), VALID_SPEC_BODY);
  mkdirSync(join(root, 'specs', '301-BrokenScope'), { recursive: true });
  writeFileSync(join(root, 'specs', '301-BrokenScope', 'spec.md'), BROKEN_SPEC_BODY);
  return root;
}
// [SCOPE 029 / T008] END

describe('dbpush — blocked report end-to-end (FR-023, Layer 2 portions)', () => {
  let cwdBefore = '';
  let fixture = '';
  let captureEventCalls: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    callMcpToolWithEnvelopeMock.mockReset();
    callMcpToolMock.mockReset();
    captureEventCalls = [];
    callMcpToolMock.mockImplementation((tool: unknown, args: unknown) => {
      if (tool === 'project.list_open_items') {
        return Promise.resolve({ tasks: [], documents: [], events: [] });
      }
      if (tool === 'project.capture_event') {
        captureEventCalls.push(args as Record<string, unknown>);
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

  it('mixed batch: valid spec lands, broken spec surfaces blocking issues', async () => {
    fixture = fixtureProject();
    process.chdir(fixture);

    // Order matters — phase1Validate visits specs alphabetically (300 then 301).
    // First call (300-ValidScope) returns success envelope; second call
    // (301-BrokenScope) returns blocked envelope.
    callMcpToolWithEnvelopeMock.mockImplementation((tool: unknown, args: unknown) => {
      const a = args as { specNumber?: string };
      if (tool === 'project.create_specs' && a.specNumber === '300') {
        return Promise.resolve({
          success: true,
          blocked: false,
          blockingIssues: [],
          data: {
            spec: { id: 'spec-uuid-300', specNumber: '300' },
            tasks: [],
          },
        });
      }
      if (tool === 'project.create_specs' && a.specNumber === '301') {
        return Promise.resolve({
          success: false,
          blocked: true,
          blockingIssues: [
            'Actors section must identify a primary actor.',
            'Actors section must identify at least one secondary actor.',
          ],
          data: { spec: null, tasks: [] },
        });
      }
      return Promise.resolve({
        success: true,
        blocked: false,
        blockingIssues: [],
        data: {},
      });
    });

    const report = await dbpush({});

    cleanup();

    // Counters reflect server truth (FR-006).
    expect(report.push.specsCreated).toBe(1);
    expect(report.push.tasksCreated).toBe(0);

    // Blocked envelope surfaced as errors (FR-005), one per blocking issue.
    expect(report.push.errors).toHaveLength(2);
    expect(report.push.errors[0]).toBe('301: Actors section must identify a primary actor.');
    expect(report.push.errors[1]).toBe('301: Actors section must identify at least one secondary actor.');

    // T006 / FR-021 — blockingIssuesCount aggregated across all blocked
    // specs in the run.
    expect(report.push.blockingIssuesCount).toBe(2);

    // T006 / FR-021 — capture_event metadata reflects post-envelope truth.
    expect(captureEventCalls).toHaveLength(1);
    const eventArgs = captureEventCalls[0] as {
      metadata?: { pushErrors?: number; blockingIssuesCount?: number; specsProcessed?: number };
    };
    expect(eventArgs.metadata?.specsProcessed).toBe(2);
    expect(eventArgs.metadata?.pushErrors).toBe(2);
    expect(eventArgs.metadata?.blockingIssuesCount).toBe(2);
  });

  it('all-blocked batch: zero specsCreated, every issue in errors, blockingIssuesCount equals sum', async () => {
    fixture = fixtureProject();
    process.chdir(fixture);

    callMcpToolWithEnvelopeMock.mockImplementation(() =>
      Promise.resolve({
        success: false,
        blocked: true,
        blockingIssues: ['Business Problem must be specific and non-placeholder.'],
        data: { spec: null, tasks: [] },
      }),
    );

    const report = await dbpush({});

    cleanup();

    expect(report.push.specsCreated).toBe(0);
    expect(report.push.errors).toHaveLength(2);
    expect(report.push.errors[0]).toMatch(/^300: /);
    expect(report.push.errors[1]).toMatch(/^301: /);
    expect(report.push.blockingIssuesCount).toBe(2);

    const eventArgs = captureEventCalls[0] as {
      metadata?: { pushErrors?: number; blockingIssuesCount?: number };
    };
    expect(eventArgs.metadata?.pushErrors).toBe(2);
    expect(eventArgs.metadata?.blockingIssuesCount).toBe(2);
  });

  // [SCOPE 029 / T015] BEGIN — interactive retry end-to-end
  it('interactive retry: heading-shape broken spec → user answers y → rewrite + retry → spec lands', async () => {
    // Setup: fixture with ONE heading-shape-broken spec.
    const root = join(tmpdir(), `dbpush-029-t015-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, '.wxkanban-project.json'),
      JSON.stringify({ projectId: '00000000-0000-0000-0000-000000000000' }),
    );
    const specDir = join(root, 'specs', '350-HeadingBroken');
    mkdirSync(specDir, { recursive: true });
    const specPath = join(specDir, 'spec.md');
    // Bold-em-dash actors form — classifier flags as heading-shape.
    writeFileSync(
      specPath,
      `# Spec 350: Heading Broken\n\n## Overview\n\nA reasonable Overview paragraph with enough text to clear the meaningfulness gate.\n\n## Business Problem\n\nReal business problem text long enough to pass the meaningfulness check.\n\n## Actors\n\n**Primary actor — Kit operator running dbpush**\n**Secondary actor — MCP server receiving the call**\n\n## Success Metrics\n\n1. Outcome 1 within 5 minutes\n2. Outcome 2 reduce errors by 30%\n3. Outcome 3 at least 95% pass rate\n\n## Scope Boundary\n\nKit MCP client surface.\n\n## Out of Scope\n\nServer-side rewrites.\n\n## Open Questions\n\nNone.\n`,
    );
    process.chdir(root);

    // MCP returns blocked on first call (Actors mismatch), success on
    // second call (after rewrite makes Primary:/Secondary: lines).
    let createSpecsCalls = 0;
    callMcpToolWithEnvelopeMock.mockImplementation(() => {
      createSpecsCalls += 1;
      if (createSpecsCalls === 1) {
        return Promise.resolve({
          success: false,
          blocked: true,
          blockingIssues: [
            'Actors section must identify a primary actor.',
            'Actors section must identify at least one secondary actor.',
          ],
          data: { spec: null, tasks: [] },
        });
      }
      return Promise.resolve({
        success: true,
        blocked: false,
        blockingIssues: [],
        data: { spec: { id: 'spec-uuid-350', specNumber: '350' }, tasks: [] },
      });
    });

    // Stub stdin to feed `y` to the prompt (T013).
    const stub = stubStdin(['y']);
    try {
      const report = await dbpush({});

      // FR-019 — .bak file created with Windows-safe timestamp.
      const bakFiles = readdirSync(specDir).filter((f) => /^spec\.md\.bak-/.test(f));
      expect(bakFiles).toHaveLength(1);
      const bakName = bakFiles[0] ?? '';
      expect(bakName).toMatch(/^spec\.md\.bak-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);

      // Rewritten file has Primary:/Secondary: line shape.
      const rewritten = readFileSync(specPath, 'utf-8');
      expect(rewritten).toContain('- Primary: Kit operator running dbpush');
      expect(rewritten).toContain('- Secondary: MCP server receiving the call');
      expect(rewritten).not.toMatch(/\*\*Primary actor —/);

      // Two calls to create_specs (first blocked, second success).
      expect(createSpecsCalls).toBe(2);

      // Final report: spec landed, no errors.
      expect(report.push.specsCreated).toBe(1);
      expect(report.push.errors).toEqual([]);
      expect(report.retryAttempted).toBe(true);
      expect(report.rewroteSpecs).toHaveLength(1);
      expect(report.rewroteSpecs?.[0]?.scope).toBe('350');
      expect(report.rewroteSpecs?.[0]?.rewroteSections).toContain('actors');
    } finally {
      stub.restore();
      process.chdir(cwdBefore);
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    }
  });
  // [SCOPE 029 / T015] END

  it('all-success batch: counts come from server response, errors empty, blockingIssuesCount zero', async () => {
    fixture = fixtureProject();
    process.chdir(fixture);

    let callCount = 0;
    callMcpToolWithEnvelopeMock.mockImplementation((tool: unknown, args: unknown) => {
      callCount += 1;
      const a = args as { specNumber?: string };
      return Promise.resolve({
        success: true,
        blocked: false,
        blockingIssues: [],
        data: {
          spec: { id: `spec-${a.specNumber ?? `${callCount}`}`, specNumber: a.specNumber },
          tasks: [{ id: 't1', title: '[300-T001] one' }, { id: 't2', title: '[300-T002] two' }],
        },
      });
    });

    const report = await dbpush({});

    cleanup();

    // 2 specs * 1 each = 2 specsCreated; 2 specs * 2 tasks each = 4 tasks
    expect(report.push.specsCreated).toBe(2);
    expect(report.push.tasksCreated).toBe(4);
    expect(report.push.errors).toEqual([]);
    expect(report.push.blockingIssuesCount).toBe(0);

    const eventArgs = captureEventCalls[0] as {
      metadata?: { pushErrors?: number; blockingIssuesCount?: number };
    };
    expect(eventArgs.metadata?.pushErrors).toBe(0);
    expect(eventArgs.metadata?.blockingIssuesCount).toBe(0);
  });
});
