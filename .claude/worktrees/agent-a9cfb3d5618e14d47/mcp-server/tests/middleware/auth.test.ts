/**
 * Spec 028 / T012 — Auth middleware unit tests.
 *
 * These tests exercise the request-shaping logic directly. The DB lookup is
 * mocked via vi.mock on the connection module so tests stay hermetic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

const dbMock = {
  rows: [] as Array<Record<string, unknown>>,
  // [SCOPE 134 / T028] Successive selects answer from this queue when it is non-empty
  // (token lookup, then grant re-check); otherwise every select returns `rows`.
  queue: [] as Array<Array<Record<string, unknown>>>,
  selects: 0,
  selectWhereChain() {
    this.selects++;
    const answer = this.queue.length ? this.queue.shift() : this.rows;
    const limit = vi.fn().mockResolvedValue(answer);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    return { from };
  },
};

vi.mock('../../src/db/connection.js', () => ({
  db: {
    select: vi.fn(() => dbMock.selectWhereChain()),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          // Update returns a thenable that resolves to nothing; the auth
          // middleware fire-and-forgets, so a no-op catch chain suffices.
          catch: vi.fn(),
        }),
      }),
    })),
  },
}));

// [SCOPE 152 / T007] The device and reach checks are their own module; the name parser stays real.
const reachMock = vi.hoisted(() => ({ isDeviceLive: vi.fn(), findInAgentReach: vi.fn() }));
vi.mock('../../src/utils/agent-reach.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/agent-reach.js')>();
  return { ...actual, isDeviceLive: reachMock.isDeviceLive, findInAgentReach: reachMock.findInAgentReach };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const ORIG_AUTH_REQUIRED = process.env.MCP_AUTH_REQUIRED;

function mockReqRes(headers: Record<string, string> = {}, path = '/call'): {
  req: Request;
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  next: ReturnType<typeof vi.fn>;
} {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const next = vi.fn();
  const req = {
    path,
    header: (n: string) => headers[n.toLowerCase()] ?? headers[n],
    socket: { remoteAddress: '127.0.0.1' },
    ip: '127.0.0.1',
  } as unknown as Request;
  const res = { status, json } as unknown as Response;
  return { req, res, status, json, next };
}

describe('authMiddleware', () => {
  beforeEach(() => {
    dbMock.rows = [];
    dbMock.queue = [];
    dbMock.selects = 0;
    vi.clearAllMocks();
    process.env.MCP_AUTH_REQUIRED = 'true';
  });

  afterEach(() => {
    process.env.MCP_AUTH_REQUIRED = ORIG_AUTH_REQUIRED;
  });

  it('passes /health through without auth check', async () => {
    const { authMiddleware } = await import('../../src/middleware/auth.js');
    const { req, res, next, status } = mockReqRes({}, '/health');
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it('returns 401 missing-token when Authorization header absent', async () => {
    const { authMiddleware } = await import('../../src/middleware/auth.js');
    const { req, res, next, status, json } = mockReqRes({});
    await authMiddleware(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'missing-token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 invalid-token when the token is unknown', async () => {
    const { authMiddleware } = await import('../../src/middleware/auth.js');
    dbMock.rows = [];
    const { req, res, next, status, json } = mockReqRes({
      authorization: 'Bearer wxk_live_unknown',
    });
    await authMiddleware(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'invalid-token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches mcpScope when the token resolves to a live row', async () => {
    const { authMiddleware } = await import('../../src/middleware/auth.js');
    dbMock.rows = [
      {
        id: 'tok-1',
        customerid: 'cust-1',
        projectid: 'proj-1',
        tokenprefix: 'wxk_live_abc',
        name: 'Token 2026-09-25',
      },
    ];
    const { req, res, next } = mockReqRes({ authorization: 'Bearer wxk_live_real' });
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    // An ordinary token never pays for the grant re-check.
    expect(dbMock.selects).toBe(1);
    expect(req.mcpScope).toMatchObject({
      tokenId: 'tok-1',
      customerId: 'cust-1',
      projectId: 'proj-1',
      authMode: 'token',
    });
  });

  // [SCOPE 134 / T028] BEGIN — grant-minted agent tokens are re-checked on every call
  // MODIFIED-BY: [SCOPE 152 / T007] — the re-check is the K.A.I.N. device and the person's reach (FR-067, FR-070)
  const DEVICE = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
  const agentRow = {
    id: 'tok-agent',
    customerid: 'cust-1',
    projectid: 'proj-1',
    tokenprefix: 'abc',
    issuedbyid: 'user-1',
    name: `agent-grant:KAIN:${DEVICE}`,
  };

  it('refuses a retired company-token mint (no device in its name) without checking reach', async () => {
    const { authMiddleware } = await import('../../src/middleware/auth.js');
    dbMock.queue = [[{ ...agentRow, name: 'agent-grant:KAIN' }]];
    const { req, res, next, status, json } = mockReqRes({ authorization: 'Bearer agent' });
    await authMiddleware(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'device_signed_out' });
    expect(reachMock.isDeviceLive).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses when the device was revoked or its person deactivated', async () => {
    const { authMiddleware } = await import('../../src/middleware/auth.js');
    dbMock.queue = [[agentRow]];
    reachMock.isDeviceLive.mockResolvedValue(false);
    const { req, res, next, status, json } = mockReqRes({ authorization: 'Bearer agent' });
    await authMiddleware(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'device_signed_out' });
    expect(reachMock.isDeviceLive).toHaveBeenCalledWith(expect.anything(), DEVICE, 'user-1');
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses when the project left the person\'s reach (Allow remote off, engagement ended, …)', async () => {
    const { authMiddleware } = await import('../../src/middleware/auth.js');
    dbMock.queue = [[agentRow]];
    reachMock.isDeviceLive.mockResolvedValue(true);
    reachMock.findInAgentReach.mockResolvedValue(null);
    const { req, res, next, status, json } = mockReqRes({ authorization: 'Bearer agent' });
    await authMiddleware(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'access_revoked' });
    expect(reachMock.findInAgentReach).toHaveBeenCalledWith(expect.anything(), 'user-1', 'proj-1');
    expect(next).not.toHaveBeenCalled();
  });

  it('admits a live device whose person still reaches the project', async () => {
    const { authMiddleware } = await import('../../src/middleware/auth.js');
    dbMock.queue = [[agentRow]];
    reachMock.isDeviceLive.mockResolvedValue(true);
    reachMock.findInAgentReach.mockResolvedValue({ projectId: 'proj-1' });
    const { req, res, next } = mockReqRes({ authorization: 'Bearer agent' });
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.mcpScope).toMatchObject({ tokenId: 'tok-agent', projectId: 'proj-1', userId: 'user-1' });
  });

  // [SCOPE 152 / T018] A failing check must answer this request, not reject: an unhandled
  // rejection exits the process (index-http.ts) and takes MCP down for every user.
  it('answers 500 when the reach check fails, and never throws', async () => {
    const { authMiddleware } = await import('../../src/middleware/auth.js');
    dbMock.queue = [[agentRow]];
    reachMock.isDeviceLive.mockResolvedValue(true);
    reachMock.findInAgentReach.mockRejectedValue(new Error('operator does not exist: character varying = uuid'));
    const { req, res, next, status, json } = mockReqRes({ authorization: 'Bearer agent' });
    await expect(authMiddleware(req, res, next)).resolves.toBeUndefined();
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: 'auth_check_failed' });
    expect(next).not.toHaveBeenCalled();
  });
  // [SCOPE 134 / T028] END

  it('dev-bypass attaches a synthetic scope when MCP_AUTH_REQUIRED=false', async () => {
    process.env.MCP_AUTH_REQUIRED = 'false';
    const { authMiddleware } = await import('../../src/middleware/auth.js');
    const { req, res, next } = mockReqRes({});
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.mcpScope?.authMode).toBe('dev-bypass');
  });
});
