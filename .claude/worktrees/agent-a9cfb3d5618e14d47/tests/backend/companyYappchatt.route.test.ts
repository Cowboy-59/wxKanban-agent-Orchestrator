/**
 * SPEC-144 (SCOPE-144) T006 — GET/POST /api/company/yappchatt over real HTTP, the service
 * and auth stubbed (contract C3). Pinned: the company comes from the JWT, POST is ADMIN
 * only (403 otherwise, service never called), the body is exactly { confirm: true }, a
 * missing companion is 503 companion_unavailable.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { NextFunction, Response } from "express";

const svc = vi.hoisted(() => ({ status: vi.fn(), connectCompany: vi.fn(), previewConnect: vi.fn() }));

vi.mock("../../src/db/client.js", () => ({ db: {} }));

vi.mock("../../src/server/middleware/auth.js", () => ({
  // The test's stand-in for a verified JWT: identity from headers, 401 without one.
  authenticateToken: (
    req: { header: (n: string) => string | undefined; userid?: string; companyid?: string; usertype?: string },
    res: Response,
    next: NextFunction,
  ) => {
    const userid = req.header("x-test-user");
    if (!userid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    req.userid = userid;
    req.companyid = req.header("x-test-company");
    req.usertype = req.header("x-test-usertype");
    next();
  },
  requireAuth: (_req: unknown, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../../src/server/lib/yappchattBroker.js", () => {
  class YappchattBrokerError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return { YappchattBrokerError };
});

vi.mock("../../src/server/services/CompanyYappchattService.js", () => {
  class CompanyYappchattError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
      readonly extra: Record<string, string | null> = {},
    ) {
      super(message);
    }
  }
  return { CompanyYappchattError, companyYappchattService: svc };
});

import router from "../../src/server/routes/companyYappchatt.js";
import { YappchattBrokerError } from "../../src/server/lib/yappchattBroker.js";

// [SCOPE 144 / T006] BEGIN — company YappChatt route tests
let server: Server;
let url: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/company/yappchatt", router);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/company/yappchatt`;
});
afterAll(() => server.close());

beforeEach(() => vi.clearAllMocks());

const who = (usertype: string) => ({ "x-test-user": "u-1", "x-test-company": "c-1", "x-test-usertype": usertype });
const post = (body: unknown, headers: Record<string, string>) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const CONNECTED = {
  connected: true,
  outcome: "created",
  email: "info@acme.com",
  yappchattUserId: "y-1",
  groupId: "g-1",
  members: { added: 5, updated: 0, removed: 0, failed: [] },
};

describe("GET /api/company/yappchatt", () => {
  it("401 without a session", async () => {
    expect((await fetch(url)).status).toBe(401);
    expect(svc.status).not.toHaveBeenCalled();
  });

  it("returns the status for the token's company to any company user", async () => {
    svc.status.mockResolvedValue({ connected: false, email: null, contactEmail: "info@acme.com", yappchattUserId: null, groupId: null, linkedAt: null, canManage: false });
    const r = await fetch(url, { headers: who("TEAM_MEMBER") });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ connected: false, canManage: false });
    expect(svc.status).toHaveBeenCalledWith("c-1", "TEAM_MEMBER");
  });
});

describe("POST /api/company/yappchatt", () => {
  it("403 for a non-ADMIN; the service is never called (FR-002)", async () => {
    for (const t of ["TEAM_MEMBER", "TEAM_MANAGER"]) {
      const r = await post({ confirm: true }, who(t));
      expect(r.status).toBe(403);
    }
    expect(svc.connectCompany).not.toHaveBeenCalled();
  });

  it("400 unless the body is exactly { confirm: boolean }", async () => {
    expect((await post({}, who("ADMIN"))).status).toBe(400);
    expect((await post({ confirm: "yes" }, who("ADMIN"))).status).toBe(400);
    expect((await post({ confirm: true, companyId: "c-2" }, who("ADMIN"))).status).toBe(400);
    expect(svc.connectCompany).not.toHaveBeenCalled();
    expect(svc.previewConnect).not.toHaveBeenCalled();
  });

  it("{ confirm: false } returns the preview for the JWT's company and never connects (D5)", async () => {
    const preview = { wouldLink: { email: "info@acme.com", exists: true, displayName: "Acme" } };
    svc.previewConnect.mockResolvedValue(preview);
    const r = await post({ confirm: false }, who("ADMIN"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(preview);
    expect(svc.previewConnect).toHaveBeenCalledWith("c-1");
    expect(svc.connectCompany).not.toHaveBeenCalled();
  });

  it("the preview is ADMIN only and reports a missing companion as 503", async () => {
    expect((await post({ confirm: false }, who("TEAM_MANAGER"))).status).toBe(403);
    expect(svc.previewConnect).not.toHaveBeenCalled();
    svc.previewConnect.mockRejectedValue(new YappchattBrokerError("companion_unavailable", 503, "x"));
    const r = await post({ confirm: false }, who("ADMIN"));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: "companion_unavailable" });
  });

  it("creates or links for the JWT's company, with the acting admin", async () => {
    svc.connectCompany.mockResolvedValue(CONNECTED);
    const r = await post({ confirm: true }, who("ADMIN"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(CONNECTED);
    expect(svc.connectCompany).toHaveBeenCalledWith("c-1", "u-1");
  });

  it("a second press passes the idempotent 'already' outcome through", async () => {
    svc.connectCompany.mockResolvedValue({ ...CONNECTED, outcome: "already", members: { added: 0, updated: 0, removed: 0, failed: [] } });
    const r = await post({ confirm: true }, who("ADMIN"));
    expect(await r.json()).toMatchObject({ outcome: "already" });
  });

  it("503 companion_unavailable when the YappChatt companion is missing (FR-011)", async () => {
    svc.connectCompany.mockRejectedValue(new YappchattBrokerError("companion_unavailable", 503, "x"));
    const r = await post({ confirm: true }, who("ADMIN"));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: "companion_unavailable" });
  });

  it("other YappChatt refusals are 502 with the code; an invalid contact email is 400", async () => {
    svc.connectCompany.mockRejectedValueOnce(new YappchattBrokerError("rate_limited", 429, "x"));
    const r1 = await post({ confirm: true }, who("ADMIN"));
    expect(r1.status).toBe(502);
    expect(await r1.json()).toMatchObject({ error: "rate_limited" });
    svc.connectCompany.mockRejectedValueOnce(new YappchattBrokerError("invalid_email", 400, "x"));
    expect((await post({ confirm: true }, who("ADMIN"))).status).toBe(400);
  });
});
// [SCOPE 144 / T006] END
