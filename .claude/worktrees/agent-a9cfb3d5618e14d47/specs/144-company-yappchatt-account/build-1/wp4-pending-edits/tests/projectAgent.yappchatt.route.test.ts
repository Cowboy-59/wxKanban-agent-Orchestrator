/**
 * SPEC-144 (SCOPE-144) T008, T009 — the project-agent routes' new behavior, services stubbed.
 * PENDING: applies once the hook-gated edits to projectAgent.ts / agentConnect.ts are approved.
 *
 * Pinned: createCompanyAccount passes through; 409 no_company_account carries contactEmail;
 * a missing companion is 503 companion_unavailable on both connect routes; the approver
 * route needs the kit token and a uuid, and answers from the service.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

const svc = vi.hoisted(() => ({
  validateToken: vi.fn(),
  projectAgentRoom: vi.fn(),
  connect: vi.fn(),
  validateTicket: vi.fn(),
  approver: vi.fn(),
}));

vi.mock("../../src/server/services/ApiTokenService.js", () => ({
  apiTokenService: { validateToken: svc.validateToken },
}));
vi.mock("../../src/server/services/CompanyAgentTokenService.js", () => ({
  companyAgentTokenService: { validate: svc.validateTicket },
}));
vi.mock("../../src/server/services/AgentConnectService.js", () => {
  class AgentConnectError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
      readonly extra: Record<string, string | null> = {},
    ) {
      super(message);
    }
  }
  return {
    AgentConnectError,
    agentConnectService: { projectAgentRoom: svc.projectAgentRoom, connect: svc.connect, grants: vi.fn() },
  };
});
vi.mock("../../src/server/services/CompanyYappchattService.js", () => ({
  companyYappchattService: { approver: svc.approver },
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
  return { YappchattBrokerError, COMPANION_UNAVAILABLE: "companion_unavailable" };
});

import projectAgentRouter from "../../src/server/routes/projectAgent.js";
import agentConnectRouter from "../../src/server/routes/agentConnect.js";
import { AgentConnectError } from "../../src/server/services/AgentConnectService.js";
import { YappchattBrokerError } from "../../src/server/lib/yappchattBroker.js";

// [SCOPE 144 / T008] BEGIN — project agent YappChatt route tests
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/project-agent", projectAgentRouter);
  app.use("/api/agent", agentConnectRouter);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const TOKEN_ROW = { projectid: "p-1", customerid: "c-1", issuedbyid: "u-1", name: "Token", expiresat: null };
const Y = "0b9f4c0e-1f2a-4d6b-9c3e-2a1b0c9d8e7f";

beforeEach(() => {
  vi.clearAllMocks();
  svc.validateToken.mockResolvedValue(TOKEN_ROW);
  svc.validateTicket.mockResolvedValue({ id: "t1", companyid: "c-1", agentname: "KAIN" });
});

const postRoom = (body: unknown) =>
  fetch(`${base}/api/project-agent/room`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer kit" },
    body: JSON.stringify(body),
  });
const postConnect = (body: unknown) =>
  fetch(`${base}/api/agent/connect`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer ticket" },
    body: JSON.stringify(body),
  });

describe("POST /api/project-agent/room (SPEC-144)", () => {
  it("passes createCompanyAccount through", async () => {
    svc.projectAgentRoom.mockResolvedValue({ projectId: "p-1" });
    expect((await postRoom({ createCompanyAccount: true })).status).toBe(200);
    expect(svc.projectAgentRoom).toHaveBeenCalledWith(TOKEN_ROW, "KAIN", { mintAgentToken: undefined, createCompanyAccount: true });
  });

  it("409 no_company_account carries the contact email (FR-006)", async () => {
    svc.projectAgentRoom.mockRejectedValue(
      new AgentConnectError("no_company_account", 409, "Create the company YappChatt account now?", { contactEmail: "info@acme.com" }),
    );
    const r = await postRoom({});
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "no_company_account", contactEmail: "info@acme.com" });
  });

  it("503 companion_unavailable", async () => {
    svc.projectAgentRoom.mockRejectedValue(new YappchattBrokerError("companion_unavailable", 503, "x"));
    const r = await postRoom({});
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: "companion_unavailable" });
  });

  it("other YappChatt refusals stay 502", async () => {
    svc.projectAgentRoom.mockRejectedValue(new YappchattBrokerError("not_a_member", 404, "x"));
    expect((await postRoom({})).status).toBe(502);
  });
});

describe("POST /api/agent/connect (SPEC-144)", () => {
  const PROJECT = "11111111-1111-4111-8111-111111111111";
  it("409 no_company_account and 503 companion_unavailable", async () => {
    svc.connect.mockRejectedValueOnce(new AgentConnectError("no_company_account", 409, "x", { contactEmail: "info@acme.com" }));
    const r1 = await postConnect({ projectId: PROJECT });
    expect(r1.status).toBe(409);
    expect(await r1.json()).toMatchObject({ error: "no_company_account", contactEmail: "info@acme.com" });
    svc.connect.mockRejectedValueOnce(new YappchattBrokerError("companion_unavailable", 503, "x"));
    expect((await postConnect({ projectId: PROJECT })).status).toBe(503);
  });

  it("still refuses createCompanyAccount on the KAIN path (body unchanged)", async () => {
    expect((await postConnect({ projectId: PROJECT, createCompanyAccount: true })).status).toBe(400);
  });
});

describe("GET /api/project-agent/approver (FR-008)", () => {
  const get = (q: string, auth = "Bearer kit") =>
    fetch(`${base}/api/project-agent/approver${q}`, { headers: auth ? { authorization: auth } : {} });

  it("401 without a token or with an unknown one", async () => {
    expect((await get(`?yappchattUserId=${Y}`, "")).status).toBe(401);
    svc.validateToken.mockResolvedValue(null);
    expect((await get(`?yappchattUserId=${Y}`)).status).toBe(401);
    expect(svc.approver).not.toHaveBeenCalled();
  });

  it("400 for a missing or malformed id", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?yappchattUserId=not-a-uuid")).status).toBe(400);
    expect(svc.approver).not.toHaveBeenCalled();
  });

  it("401 for an expired kit token", async () => {
    svc.validateToken.mockResolvedValue({ ...TOKEN_ROW, expiresat: new Date(Date.now() - 1000) });
    expect((await get(`?yappchattUserId=${Y}`)).status).toBe(401);
  });

  it("answers from the service for the token's project", async () => {
    svc.approver.mockResolvedValue({ approver: true, name: "Mia Manager", role: "TEAM_MANAGER" });
    const r = await get(`?yappchattUserId=${Y.toUpperCase()}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ approver: true, name: "Mia Manager", role: "TEAM_MANAGER" });
    expect(svc.approver).toHaveBeenCalledWith(TOKEN_ROW, Y);
  });

  it("a TEAM_MEMBER answer is approver:false", async () => {
    svc.approver.mockResolvedValue({ approver: false, name: null, role: null });
    expect(await (await get(`?yappchattUserId=${Y}`)).json()).toEqual({ approver: false, name: null, role: null });
  });
});
// [SCOPE 144 / T008] END
