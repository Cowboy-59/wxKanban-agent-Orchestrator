/**
 * Spec 028 / T012 — Audit middleware unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const insertedRows: Array<Record<string, unknown>> = [];

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(async (row: Record<string, unknown>) => {
        insertedRows.push(row);
        return [];
      }),
    })),
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockReqRes(path: string, body: unknown = {}, statusCode = 200): {
  req: Request;
  res: Response;
  fireFinish: () => void;
} {
  const finishHandlers: Array<() => void> = [];
  const req = {
    path,
    method: 'POST',
    body,
    header: () => undefined,
    socket: { remoteAddress: '127.0.0.1' },
    ip: '127.0.0.1',
  } as unknown as Request;
  const res = {
    statusCode,
    on: (event: string, cb: () => void) => {
      if (event === 'finish') finishHandlers.push(cb);
    },
  } as unknown as Response;
  return {
    req,
    res,
    fireFinish: () => finishHandlers.forEach((h) => h()),
  };
}

describe('auditStartMiddleware', () => {
  beforeEach(() => {
    insertedRows.length = 0;
  });

  it('skips /health entirely', async () => {
    const { auditStartMiddleware } = await import('../../src/middleware/audit.js');
    const { req } = mockReqRes('/health');
    const next = vi.fn();
    auditStartMiddleware(req, {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.mcpAudit).toBeUndefined();
  });

  it('attaches mcpAudit on non-health routes', async () => {
    const { auditStartMiddleware } = await import('../../src/middleware/audit.js');
    const { req } = mockReqRes('/call', { tool: 'project.help' });
    const next = vi.fn();
    auditStartMiddleware(req, {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.mcpAudit).toBeDefined();
    expect(req.mcpAudit?.tool).toBe('project.help');
    expect(req.mcpAudit?.outcome).toBe('success');
  });
});

describe('auditFinishMiddleware', () => {
  beforeEach(() => {
    insertedRows.length = 0;
  });

  async function runChain(
    path: string,
    body: unknown,
    statusCode: number,
    mcpScope: unknown = undefined,
  ): Promise<Record<string, unknown> | undefined> {
    const { auditStartMiddleware, auditFinishMiddleware } = await import('../../src/middleware/audit.js');
    const { req, res, fireFinish } = mockReqRes(path, body, statusCode);
    (req as { mcpScope?: unknown }).mcpScope = mcpScope;
    auditStartMiddleware(req, res, vi.fn());
    auditFinishMiddleware(req, res, vi.fn());
    fireFinish();
    // The audit write is async (fire-and-forget); microtask flush.
    await Promise.resolve();
    await Promise.resolve();
    return insertedRows[0];
  }

  it('does not write a row for /health', async () => {
    const row = await runChain('/health', {}, 200);
    expect(row).toBeUndefined();
  });

  it('writes outcome=success on 2xx', async () => {
    const row = await runChain('/call', { tool: 'project.help' }, 200);
    expect(row).toBeDefined();
    expect(row?.outcome).toBe('success');
    expect(row?.tool).toBe('project.help');
    expect(row?.responsestatus).toBe(200);
  });

  it('derives outcome=auth-failed on 401', async () => {
    const row = await runChain('/call', {}, 401);
    expect(row?.outcome).toBe('auth-failed');
  });

  it('derives outcome=scope-violation on 403', async () => {
    const row = await runChain('/call', {}, 403);
    expect(row?.outcome).toBe('scope-violation');
  });

  it('derives outcome=throttled on 429', async () => {
    const row = await runChain('/call', {}, 429);
    expect(row?.outcome).toBe('throttled');
  });

  it('derives outcome=error on 5xx', async () => {
    const row = await runChain('/call', {}, 500);
    expect(row?.outcome).toBe('error');
  });

  it('captures resolved scope on the audit row', async () => {
    const row = await runChain('/call', {}, 200, {
      tokenId: 'tok-1',
      customerId: 'cust-1',
      projectId: 'proj-1',
      tokenPrefix: 'wxk',
      authMode: 'token',
    });
    expect(row?.tokenid).toBe('tok-1');
    expect(row?.customerid).toBe('cust-1');
    expect(row?.projectid).toBe('proj-1');
  });
});

// [SCOPE 043 / audit] BEGIN — requested-project + multi-transport tool extraction
//
// The cross-tenant feedback disclosure (2026-08-02) could not be investigated
// historically because the audit row recorded only the TOKEN's project, never the
// project the caller asked for. These pin both halves of the fix: the requested
// project is captured, and it is captured from every transport shape rather than
// just the REST one.
const SINK = 'ba924193-0335-4080-9fa6-33cd6b81300a';
const OTHER = '68cf2d4b-fb8e-442f-8290-3aa3fd2be701';

describe('extractCallDetails', () => {
  it('reads tool + requested project from the REST /call shape', async () => {
    const { extractCallDetails } = await import('../../src/middleware/audit.js');
    expect(
      extractCallDetails({ tool: 'project.list_my_feedback', args: { projectId: OTHER } }),
    ).toEqual({ tool: 'project.list_my_feedback', requestedProjectId: OTHER });
  });

  it('reads tool + requested project from the JSON-RPC shape (was recording null)', async () => {
    const { extractCallDetails } = await import('../../src/middleware/audit.js');
    expect(
      extractCallDetails({
        method: 'tools/call',
        params: { name: 'project.list_my_feedback', arguments: { projectId: SINK } },
      }),
    ).toEqual({ tool: 'project.list_my_feedback', requestedProjectId: SINK });
  });

  it('takes the first tool call from a JSON-RPC batch', async () => {
    const { extractCallDetails } = await import('../../src/middleware/audit.js');
    const out = extractCallDetails([
      { jsonrpc: '2.0', id: 1 },
      { method: 'tools/call', params: { name: 'project.help', arguments: { projectId: OTHER } } },
      { method: 'tools/call', params: { name: 'project.mcp_health', arguments: {} } },
    ]);
    expect(out).toEqual({ tool: 'project.help', requestedProjectId: OTHER });
  });

  it('drops a non-UUID projectId to null — a malformed value would 22P02 the INSERT', async () => {
    const { extractCallDetails } = await import('../../src/middleware/audit.js');
    // asyncWriteAudit swallows insert errors, so an unvalidated string here would
    // let a client silently suppress its own audit row.
    expect(
      extractCallDetails({ tool: 'project.help', args: { projectId: "not-a-uuid'; drop--" } })
        .requestedProjectId,
    ).toBeNull();
  });

  it('drops the nil UUID to null — it is "no project", not a project reference', async () => {
    const { extractCallDetails } = await import('../../src/middleware/audit.js');
    // The nil UUID is shape-valid, so a shape-only check records it as if the caller
    // had asked for a project. `requestedprojectid IS DISTINCT FROM projectid` is the
    // ONLY cross-tenant detection predicate (NEW-2), so every such row is a false
    // positive in the one query an investigation depends on. Observed in production
    // 2026-08-04: project.kit_status sent it and the row landed in the detection set.
    expect(
      extractCallDetails({
        tool: 'project.kit_status',
        args: { projectId: '00000000-0000-0000-0000-000000000000' },
      }).requestedProjectId,
    ).toBeNull();
    // Same rule on the JSON-RPC transport — that is where it was actually seen.
    expect(
      extractCallDetails({
        method: 'tools/call',
        params: {
          name: 'project.kit_status',
          arguments: { projectid: '00000000-0000-0000-0000-000000000000' },
        },
      }).requestedProjectId,
    ).toBeNull();
  });

  it('keeps a real UUID that merely contains zeros', async () => {
    const { extractCallDetails } = await import('../../src/middleware/audit.js');
    // Guard against over-matching: only the all-zero UUID is a sentinel.
    const REAL = '00000000-0000-0000-0000-000000000001';
    expect(
      extractCallDetails({ tool: 'project.help', args: { projectId: REAL } }).requestedProjectId,
    ).toBe(REAL);
  });

  it('tolerates missing args, null body and unknown shapes', async () => {
    const { extractCallDetails } = await import('../../src/middleware/audit.js');
    expect(extractCallDetails({ tool: 'project.help' })).toEqual({
      tool: 'project.help',
      requestedProjectId: null,
    });
    expect(extractCallDetails(null)).toEqual({ tool: null, requestedProjectId: null });
    expect(extractCallDetails({ nonsense: true })).toEqual({ tool: null, requestedProjectId: null });
    expect(extractCallDetails([])).toEqual({ tool: null, requestedProjectId: null });
  });
});

describe('audit row records the requested project', () => {
  beforeEach(() => {
    insertedRows.length = 0;
  });

  it('writes requestedprojectid alongside the token projectid', async () => {
    const { auditStartMiddleware, auditFinishMiddleware } = await import(
      '../../src/middleware/audit.js'
    );
    const { req, res, fireFinish } = mockReqRes('/call', {
      tool: 'project.list_my_feedback',
      args: { projectId: OTHER },
    });
    (req as unknown as { mcpScope: unknown }).mcpScope = {
      tokenId: 'tok-1',
      customerId: 'cust-1',
      projectId: SINK,
      tokenPrefix: null,
      userId: 'user-1',
      authMode: 'token',
    };
    auditStartMiddleware(req, res, vi.fn());
    auditFinishMiddleware(req, res, vi.fn());
    fireFinish();
    await new Promise((r) => setTimeout(r, 0));

    const row = insertedRows[0];
    // The whole point: token project and requested project are both present and
    // visibly different, which is what makes a cross-project request detectable.
    expect(row?.projectid).toBe(SINK);
    expect(row?.requestedprojectid).toBe(OTHER);
    expect(row?.projectid).not.toBe(row?.requestedprojectid);
  });
});
// [SCOPE 043 / audit] END
