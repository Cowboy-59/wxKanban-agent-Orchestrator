/**
 * SPEC-152 (SCOPE-132 Amendment F) T009 — K.A.I.N. device lists and revoke over real HTTP, service stubbed.
 *
 * What is pinned: a person lists and revokes their own devices; a company ADMIN lists and revokes
 * any device of their company; anyone else gets 404 (missing, never forbidden), nothing changes and
 * nothing is audited; every revoke writes one `agent.device.revoked` row (FR-071, FR-073).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

const h = vi.hoisted(() => ({
  listForUser: vi.fn(),
  listForCompany: vi.fn(),
  getLive: vi.fn(),
  revoke: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../../src/server/services/AgentDeviceTokenService.js", () => ({
  agentDeviceTokenService: { listForUser: h.listForUser, listForCompany: h.listForCompany, getLive: h.getLive, revoke: h.revoke },
  recordAgentAudit: h.audit,
}));

// The session is whatever the test's headers say: x-user, x-company, x-type.
vi.mock("../../src/server/middleware/auth.js", () => ({
  authenticateToken: (req: Request & Record<string, unknown>, _res: Response, next: NextFunction) => {
    req.userid = req.header("x-user");
    req.companyid = req.header("x-company");
    req.usertype = req.header("x-type");
    next();
  },
  requireAuth: (_req: unknown, _res: Response, next: NextFunction) => next(),
}));
vi.mock("../../src/server/middleware/requireAdmin.js", () => ({
  requireAdmin: (req: Request & { usertype?: string }, res: Response, next: NextFunction) =>
    req.usertype === "ADMIN" ? next() : res.status(403).json({ error: "admin only" }),
}));

import router from "../../src/server/routes/agentDevices.js";

// [SCOPE 152 / T009] BEGIN — device route tests
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

const DEVICE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const DEVICE = { id: DEVICE_ID, userid: "u-owner", companyid: "c-1", devicename: "Phone" };
const as = (user: string, company: string, type: string) => ({ "x-user": user, "x-company": company, "x-type": type });
const revoke = (headers: Record<string, string>, id = DEVICE_ID) =>
  fetch(`${base}/agent/devices/${id}/revoke`, { method: "POST", headers });

beforeEach(() => {
  vi.clearAllMocks();
  h.getLive.mockResolvedValue(DEVICE);
  h.revoke.mockResolvedValue(DEVICE);
});

describe("lists", () => {
  it("a person lists their own devices", async () => {
    h.listForUser.mockResolvedValue([{ deviceId: DEVICE_ID }]);
    const r = await fetch(`${base}/agent/devices`, { headers: as("u-owner", "c-1", "TEAM_MEMBER") });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ count: 1 });
    expect(h.listForUser).toHaveBeenCalledWith("u-owner");
  });

  it("only an ADMIN lists the company's devices", async () => {
    h.listForCompany.mockResolvedValue([]);
    expect((await fetch(`${base}/company/agent-devices`, { headers: as("u-2", "c-1", "TEAM_MEMBER") })).status).toBe(403);
    const r = await fetch(`${base}/company/agent-devices`, { headers: as("u-admin", "c-1", "ADMIN") });
    expect(r.status).toBe(200);
    expect(h.listForCompany).toHaveBeenCalledWith("c-1");
  });
});

describe("revoke", () => {
  it("the owner signs their device out, and it is audited", async () => {
    const r = await revoke(as("u-owner", "c-1", "TEAM_MEMBER"));
    expect(r.status).toBe(200);
    expect(h.revoke).toHaveBeenCalledWith(DEVICE_ID, "u-owner", "revoked");
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "agent.device.revoked", companyid: "c-1", newvalue: expect.objectContaining({ by: "owner" }) }),
    );
  });

  it("an ADMIN of the owner's company signs it out", async () => {
    const r = await revoke(as("u-admin", "c-1", "ADMIN"));
    expect(r.status).toBe(200);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ newvalue: expect.objectContaining({ by: "admin" }) }));
  });

  it.each([
    ["another member of the company", as("u-2", "c-1", "TEAM_MEMBER")],
    ["an ADMIN of another company", as("u-x", "c-2", "ADMIN")],
  ])("%s gets 404 and nothing changes", async (_who, headers) => {
    const r = await revoke(headers);
    expect(r.status).toBe(404);
    expect(h.revoke).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("an unknown or already-revoked device is 404", async () => {
    h.getLive.mockResolvedValue(null);
    expect((await revoke(as("u-owner", "c-1", "TEAM_MEMBER"))).status).toBe(404);
    expect(h.revoke).not.toHaveBeenCalled();
  });

  it("a malformed id is 400", async () => {
    expect((await revoke(as("u-owner", "c-1", "TEAM_MEMBER"), "not-a-uuid")).status).toBe(400);
  });
});
// [SCOPE 152 / T009] END
