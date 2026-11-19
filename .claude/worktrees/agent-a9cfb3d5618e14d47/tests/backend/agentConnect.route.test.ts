/**
 * SCOPE-134 / T028, T006 — agent connect routes over real HTTP, services stubbed.
 * SPEC-152 / T005, T006 — K.A.I.N. signs in as the person, per device.
 *
 * What is pinned: a K.A.I.N. device token is required and checked (one 401 for unknown,
 * revoked, inactive or moved person); sign-in runs the web app's own check with its 401 / 423
 * and never echoes or stores the password; the connect body is `{ projectId, mintAgentToken? }`
 * and NOTHING else — a client-supplied room id is rejected, not recorded (FR-013, SC-8);
 * service refusals keep their status; YappChatt refusals are surfaced plainly (FR-016).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

const svc = vi.hoisted(() => ({
  verify: vi.fn(),
  issue: vi.fn(),
  audit: vi.fn(),
  signIn: vi.fn(),
  connect: vi.fn(),
  grants: vi.fn(),
  findInAgentReach: vi.fn(), // [SCOPE 155 / T008]
  sessionStatus: vi.fn(), // [SCOPE 155 / T008]
  refusalRows: [] as Array<{ id: string; companyid: string }>,
}));

vi.mock("../../src/server/services/AgentDeviceTokenService.js", () => ({
  agentDeviceTokenService: { verify: svc.verify, issue: svc.issue },
  recordAgentAudit: svc.audit,
  normalizeDeviceName: (raw: string) => {
    const name = raw.trim();
    return name.length >= 1 && name.length <= 100 ? name : null;
  },
}));

vi.mock("../../src/server/services/userService.js", () => {
  class AccountLockedError extends Error {}
  return { AccountLockedError, signInUser: svc.signIn };
});

// The repo .env points at production: the refusal look-up reads a stub, never the database.
vi.mock("../../src/db/client.js", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => svc.refusalRows,
  };
  return { db: chain };
});

vi.mock("../../src/server/services/AgentConnectService.js", () => {
  class AgentConnectError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return { AgentConnectError, agentConnectService: { connect: svc.connect, grants: svc.grants } };
});

vi.mock("../../src/server/lib/agentReach.js", () => ({
  findInAgentReach: svc.findInAgentReach,
})); // [SCOPE 155 / T008]

vi.mock("../../src/server/services/ProjectAgentConnectionService.js", () => ({
  sessionStatus: svc.sessionStatus,
})); // [SCOPE 155 / T008]

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

import router from "../../src/server/routes/agentConnect.js";
import { AgentConnectError } from "../../src/server/services/AgentConnectService.js";
import { AccountLockedError } from "../../src/server/services/userService.js";
import { YappchattBrokerError } from "../../src/server/lib/yappchattBroker.js";

// [SCOPE 134 / T028] BEGIN — agent connect route tests
// MODIFIED-BY: [SCOPE 152 / T006] — device token instead of a Company Access Token
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/agent", router);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/agent`;
});
afterAll(() => server.close());

const DEVICE = { deviceId: "d1", deviceName: "Andy's phone", userId: "u1", companyId: "c1" };

beforeEach(() => {
  vi.clearAllMocks();
  svc.refusalRows = [];
  svc.verify.mockResolvedValue(DEVICE);
});

const PROJECT = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown, auth = "Bearer kdt_device") =>
  fetch(`${base}/connect`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

describe("device authentication", () => {
  it("401 with no bearer", async () => {
    const r = await post({ projectId: PROJECT }, "");
    expect(r.status).toBe(401);
    expect(svc.connect).not.toHaveBeenCalled();
  });

  it("401 device_signed_out for an unknown, revoked or ended device — one answer for all", async () => {
    svc.verify.mockResolvedValue(null);
    const r = await post({ projectId: PROJECT });
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: "device_signed_out" });
    expect(svc.connect).not.toHaveBeenCalled();
  });

  it("lists the person's reach for a live device", async () => {
    svc.grants.mockResolvedValue([{ projectId: PROJECT, projectName: "wxKanban", via: "own" }]);
    const r = await fetch(`${base}/grants`, { headers: { authorization: "Bearer kdt_device" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ userId: "u1", deviceId: "d1", count: 1 });
    expect(svc.grants).toHaveBeenCalledWith(DEVICE);
  });
});

describe("FR-013 — the room is derived, never claimed", () => {
  it("rejects a client-supplied room id with 400 and never calls the service", async () => {
    const r = await post({ projectId: PROJECT, conversationId: "attacker-room" });
    expect(r.status).toBe(400);
    expect(svc.connect).not.toHaveBeenCalled();
  });

  it("passes only the device, projectId and mintAgentToken through", async () => {
    svc.connect.mockResolvedValue({ ok: true });
    const r = await post({ projectId: PROJECT, mintAgentToken: true });
    expect(r.status).toBe(200);
    expect(svc.connect).toHaveBeenCalledWith(DEVICE, PROJECT, { mintAgentToken: true });
  });
});

describe("refusals keep their meaning", () => {
  it("not in reach → 404 not_granted", async () => {
    svc.connect.mockRejectedValue(new AgentConnectError("not_granted", 404, "KAIN has not been granted this project."));
    const r = await post({ projectId: PROJECT });
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: "not_granted" });
  });

  it("YappChatt not_a_member → 502 carrying the upstream code, not retried (FR-016)", async () => {
    svc.connect.mockRejectedValue(new YappchattBrokerError("not_a_member", 404, "not a member"));
    const r = await post({ projectId: PROJECT });
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ error: "not_a_member", upstreamStatus: 404 });
    expect(svc.connect).toHaveBeenCalledTimes(1);
  });
});
// [SCOPE 134 / T028] END

// [SCOPE 152 / T005] BEGIN — K.A.I.N. sign-in route tests (FR-064, FR-065, FR-073; FR-075 test 5)
const MARKER_PASSWORD = "marker-Pw-7f3a9c";
const signin = (body: unknown) =>
  fetch(`${base}/signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const SESSION = {
  userid: "u1",
  email: "andy@example.com",
  fullname: "Andy",
  active: true,
  companyid: "c1",
  companyname: "Own Co",
};

describe("POST /signin", () => {
  it("issues a device token once, sets no cookie, and audits agent.signin", async () => {
    svc.signIn.mockResolvedValue(SESSION);
    svc.issue.mockResolvedValue({ token: "kdt_raw", deviceId: "d9" });
    const r = await signin({ email: "andy@example.com", password: MARKER_PASSWORD, deviceName: "  Andy's   phone " });
    expect(r.status).toBe(201);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = await r.json();
    expect(body).toMatchObject({ token: "kdt_raw", deviceId: "d9", userId: "u1", companyName: "Own Co" });
    expect(JSON.stringify(body)).not.toContain(MARKER_PASSWORD);
    expect(svc.issue).toHaveBeenCalledWith("u1", "c1", "Andy's   phone");
    expect(svc.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "agent.signin", companyid: "c1" }));
    expect(JSON.stringify(svc.audit.mock.calls)).not.toContain(MARKER_PASSWORD);
  });

  it("wrong password → 401, nothing issued, refusal audited under the person's company", async () => {
    svc.signIn.mockRejectedValue(new Error("Invalid email or password"));
    svc.refusalRows = [{ id: "u1", companyid: "c1" }];
    const r = await signin({ email: "andy@example.com", password: MARKER_PASSWORD, deviceName: "Laptop" });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "invalid_credentials", message: "Invalid email or password" });
    expect(svc.issue).not.toHaveBeenCalled();
    expect(svc.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "agent.signin.refused", newvalue: expect.objectContaining({ reason: "bad_credentials" }) }),
    );
    expect(JSON.stringify(svc.audit.mock.calls)).not.toContain(MARKER_PASSWORD);
  });

  it("an unknown email → 401 and no audit row (no company to file it under)", async () => {
    svc.signIn.mockRejectedValue(new Error("Invalid email or password"));
    const r = await signin({ email: "nobody@example.com", password: MARKER_PASSWORD, deviceName: "Laptop" });
    expect(r.status).toBe(401);
    expect(svc.audit).not.toHaveBeenCalled();
  });

  it("a locked account → 423, nothing issued", async () => {
    svc.signIn.mockRejectedValue(new AccountLockedError("Account locked due to too many failed attempts."));
    const r = await signin({ email: "andy@example.com", password: MARKER_PASSWORD, deviceName: "Laptop" });
    expect(r.status).toBe(423);
    expect(svc.issue).not.toHaveBeenCalled();
  });

  it("an inactive person → 401 with the same answer as a wrong password", async () => {
    svc.signIn.mockResolvedValue({ ...SESSION, active: false });
    const r = await signin({ email: "andy@example.com", password: MARKER_PASSWORD, deviceName: "Laptop" });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "invalid_credentials", message: "Invalid email or password" });
    expect(svc.issue).not.toHaveBeenCalled();
  });

  it("a malformed body → 400 that never echoes the password", async () => {
    const r = await signin({ email: "not-an-email", password: MARKER_PASSWORD, deviceName: "Laptop" });
    expect(r.status).toBe(400);
    expect(await r.text()).not.toContain(MARKER_PASSWORD);
    expect(svc.signIn).not.toHaveBeenCalled();
  });

  it("a blank device name → 400 invalid_device_name", async () => {
    const r = await signin({ email: "andy@example.com", password: MARKER_PASSWORD, deviceName: "   " });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: "invalid_device_name" });
    expect(svc.signIn).not.toHaveBeenCalled();
  });

  // Review fix 2026-10-29: 10 attempts per email per 15 minutes, then 429 before any password check.
  it("the 11th attempt on one email → 429, with no password check and no audit row", async () => {
    svc.signIn.mockRejectedValue(new Error("Invalid email or password"));
    for (let i = 0; i < 10; i++) {
      const r = await signin({ email: "Flood@Example.com", password: MARKER_PASSWORD, deviceName: "Laptop" });
      expect(r.status).toBe(401);
    }
    vi.clearAllMocks();
    const r = await signin({ email: "flood@example.com ", password: MARKER_PASSWORD, deviceName: "Laptop" });
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ error: "too_many_attempts", retryAfter: 900 });
    expect(svc.signIn).not.toHaveBeenCalled();
    expect(svc.audit).not.toHaveBeenCalled();
  });
});
// [SCOPE 152 / T005] END

// [SCOPE 155 / T008] BEGIN — GET /projects/:projectId/status route tests (FR-004, FR-005)
// Pinned: out of reach -> 404 not_granted, never reaches sessionStatus; sharing=false masks
// summary/lastEntry/blockers but keeps state/liveness/sharing visible; director is always null
// (reserved for piece B); exactly one agent.status.read audit row per read, filed under the
// reached project's company (not necessarily the device holder's own company).
const REACHED = { projectId: PROJECT, projectName: "Acme Co", companyId: "company-of-project", via: "own" as const };

const getStatus = (projectId: string) =>
  fetch(`${base}/projects/${projectId}/status`, { headers: { authorization: "Bearer kdt_device" } });

describe("GET /projects/:projectId/status", () => {
  it("400 when projectId is not a UUID, before any lookup", async () => {
    const r = await getStatus("not-a-uuid");
    expect(r.status).toBe(400);
    expect(svc.findInAgentReach).not.toHaveBeenCalled();
    expect(svc.sessionStatus).not.toHaveBeenCalled();
  });

  it("404 not_granted when the project is out of this device's reach", async () => {
    svc.findInAgentReach.mockResolvedValue(null);
    const r = await getStatus(PROJECT);
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: "not_granted" });
    expect(svc.sessionStatus).not.toHaveBeenCalled();
    expect(svc.audit).not.toHaveBeenCalled();
  });

  it("sharing on: returns summary/lastEntry/blockers, director always null, one audit row under the project's company", async () => {
    svc.findInAgentReach.mockResolvedValue(REACHED);
    svc.sessionStatus.mockResolvedValue({
      summary: "Masked rolling summary.",
      lastEntry: "Last turn text.",
      blockers: ["waiting on review"],
      state: "working",
      lastSeenAt: new Date("2026-11-07T12:00:00.000Z"),
      liveness: "live",
      sharing: true,
    });
    const r = await getStatus(PROJECT);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      summary: "Masked rolling summary.",
      lastEntry: "Last turn text.",
      blockers: ["waiting on review"],
      state: "working",
      lastSeenAt: "2026-11-07T12:00:00.000Z",
      liveness: "live",
      director: null,
      sharing: true,
    });
    expect(svc.audit).toHaveBeenCalledTimes(1);
    expect(svc.audit).toHaveBeenCalledWith(
      expect.objectContaining({ companyid: "company-of-project", action: "agent.status.read", changedby: "u1" }),
    );
  });

  it("sharing off: summary/lastEntry/blockers are masked but state/liveness/sharing remain visible", async () => {
    svc.findInAgentReach.mockResolvedValue(REACHED);
    svc.sessionStatus.mockResolvedValue({
      summary: "Should never reach the wire.",
      lastEntry: "Should never reach the wire either.",
      blockers: ["should be hidden"],
      state: "idle",
      lastSeenAt: null,
      liveness: "stale",
      sharing: false,
    });
    const r = await getStatus(PROJECT);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({
      summary: null,
      lastEntry: null,
      blockers: [],
      state: "idle",
      lastSeenAt: null,
      liveness: "stale",
      director: null,
      sharing: false,
    });
    expect(JSON.stringify(body)).not.toContain("should be hidden");
    expect(svc.audit).toHaveBeenCalledTimes(1);
  });

  it("a sessionStatus failure -> 500, with no audit row written for a failed read", async () => {
    svc.findInAgentReach.mockResolvedValue(REACHED);
    svc.sessionStatus.mockRejectedValue(new Error("db unavailable"));
    const r = await getStatus(PROJECT);
    expect(r.status).toBe(500);
    expect(svc.audit).not.toHaveBeenCalled();
  });
});
// [SCOPE 155 / T008] END
