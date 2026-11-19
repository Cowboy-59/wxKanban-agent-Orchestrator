/**
 * Spec 028 / T017 — Admin token role-check tests.
 *
 * Full HTTP-level integration against the live server requires a fixture
 * user + session + project, which the rest of this project's integration
 * suite handles via a running API server. This file covers the
 * branching logic of `requireProjectAdminOrOwner` with mocked DB so the
 * three accept/reject paths are tested without that infra.
 *
 * The route handlers in `src/server/routes/admin/tokens.ts` themselves
 * are thin glue over Drizzle; their correctness is best validated via
 * the manual smoke test path documented in the spec's QT-3 scenario.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../../src/server/middleware/auth.js";

const dbMock = {
  rows: [] as Array<Record<string, unknown>>,
};

vi.mock("../../src/db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => dbMock.rows),
        })),
      })),
    })),
  },
}));

vi.mock("../../src/server/lib/logger.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function mockReqRes(
  params: { projectid?: string },
  user: { userid?: string; companyid?: string; usertype?: string },
): {
  req: AuthRequest;
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  next: ReturnType<typeof vi.fn> & NextFunction;
} {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const next = vi.fn() as ReturnType<typeof vi.fn> & NextFunction;
  const req = {
    params,
    userid: user.userid,
    companyid: user.companyid,
    usertype: user.usertype,
  } as unknown as AuthRequest;
  const res = { status, json } as unknown as Response;
  return { req, res, status, json, next };
}

describe("requireProjectAdminOrOwner", () => {
  beforeEach(() => {
    dbMock.rows = [];
    vi.clearAllMocks();
  });

  it("400 when projectid missing", async () => {
    const { requireProjectAdminOrOwner } = await import(
      "../../src/server/middleware/requireProjectAdminOrOwner.js"
    );
    const { req, res, next, status, json } = mockReqRes({}, { userid: "u1", companyid: "c1" });
    await requireProjectAdminOrOwner(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: "missing-projectid" });
    expect(next).not.toHaveBeenCalled();
  });

  it("401 when unauthenticated", async () => {
    const { requireProjectAdminOrOwner } = await import(
      "../../src/server/middleware/requireProjectAdminOrOwner.js"
    );
    const { req, res, next, status } = mockReqRes({ projectid: "p1" }, {});
    await requireProjectAdminOrOwner(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("404 when project not found", async () => {
    dbMock.rows = [];
    const { requireProjectAdminOrOwner } = await import(
      "../../src/server/middleware/requireProjectAdminOrOwner.js"
    );
    const { req, res, next, status } = mockReqRes(
      { projectid: "p1" },
      { userid: "u1", companyid: "c1", usertype: "ADMIN" },
    );
    await requireProjectAdminOrOwner(req, res, next);
    expect(status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows the project owner through (userid match)", async () => {
    dbMock.rows = [{ id: "p1", userid: "u1", companyid: "other-co" }];
    const { requireProjectAdminOrOwner } = await import(
      "../../src/server/middleware/requireProjectAdminOrOwner.js"
    );
    const { req, res, next } = mockReqRes(
      { projectid: "p1" },
      { userid: "u1", companyid: "c1", usertype: "TEAM_MEMBER" },
    );
    await requireProjectAdminOrOwner(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows a company ADMIN through (same company, not owner)", async () => {
    dbMock.rows = [{ id: "p1", userid: "u2", companyid: "c1" }];
    const { requireProjectAdminOrOwner } = await import(
      "../../src/server/middleware/requireProjectAdminOrOwner.js"
    );
    const { req, res, next } = mockReqRes(
      { projectid: "p1" },
      { userid: "u1", companyid: "c1", usertype: "ADMIN" },
    );
    await requireProjectAdminOrOwner(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("403 for a non-owner, non-admin (or admin from a different company)", async () => {
    dbMock.rows = [{ id: "p1", userid: "u2", companyid: "other-co" }];
    const { requireProjectAdminOrOwner } = await import(
      "../../src/server/middleware/requireProjectAdminOrOwner.js"
    );
    const { req, res, next, status, json } = mockReqRes(
      { projectid: "p1" },
      { userid: "u1", companyid: "c1", usertype: "ADMIN" },
    );
    await requireProjectAdminOrOwner(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ roleRequired: expect.any(String) }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
