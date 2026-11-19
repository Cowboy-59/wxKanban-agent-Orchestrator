/**
 * SPEC-145 (SCOPE-132 Amendment B) T002, T004 — the "Allow remote" routes over real HTTP,
 * services and auth stubbed:
 *   PUT /api/projects/:projectId/remote-access   (company ADMIN or the project's TEAM_MANAGER)
 *   GET /api/projects/:projectId/agent-access    (now also allowRemote + canManageRemote)
 *   GET /api/project-agent/settings              (kit token)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { NextFunction, Response } from "express";

const h = vi.hoisted(() => ({
  projectRows: [] as unknown[],
  project: vi.fn(),
  canManage: vi.fn(),
  setAllowRemote: vi.fn(),
  validateToken: vi.fn(),
}));

vi.mock("../../src/db/client.js", () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const k of ["from", "where"]) c[k] = () => c;
    c.limit = async () => h.projectRows;
    return c;
  };
  return { db: { select: () => chain() } };
});
vi.mock("../../src/server/middleware/auth.js", () => ({
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
vi.mock("../../src/server/services/ProjectAgentGrantService.js", () => ({
  projectAgentGrantService: { listForProject: async () => [] },
}));
vi.mock("../../src/server/services/CompanyAgentTokenService.js", () => ({
  companyAgentTokenService: { list: async () => [] },
}));
// [SCOPE 152 / T010] Who can reach the project (FR-072); the query itself is agentReach's.
vi.mock("../../src/server/lib/agentReach.js", () => ({
  consultingCompaniesReaching: async () => ["Consult Co"],
}));
vi.mock("../../src/server/services/ProjectRemoteAccessService.js", () => ({
  projectRemoteAccessService: { project: h.project, canManage: h.canManage, setAllowRemote: h.setAllowRemote },
}));
vi.mock("../../src/server/services/ApiTokenService.js", () => ({
  apiTokenService: { validateToken: h.validateToken },
}));
vi.mock("../../src/server/services/AgentConnectService.js", () => ({
  AgentConnectError: class extends Error {},
  agentConnectService: {},
}));
vi.mock("../../src/server/services/CompanyYappchattService.js", () => ({ companyYappchattService: {} }));
vi.mock("../../src/server/lib/yappchattBroker.js", () => ({ YappchattBrokerError: class extends Error {} }));

import agentGrantRoutes from "../../src/server/routes/agentGrants.js";
import projectAgentRoutes from "../../src/server/routes/projectAgent.js";

// [SCOPE 145 / T002] BEGIN — remote access route tests
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/projects", agentGrantRoutes);
  app.use("/api/project-agent", projectAgentRoutes);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const PROJECT = { id: "p-1", name: "Billing", companyid: "c-1", allowremote: false };
const who = (usertype: string) => ({ "x-test-user": "u-1", "x-test-company": "c-1", "x-test-usertype": usertype });

beforeEach(() => {
  vi.clearAllMocks();
  h.projectRows = [{ id: "p-1" }];
  h.project.mockResolvedValue(PROJECT);
  h.canManage.mockResolvedValue(false);
  h.setAllowRemote.mockResolvedValue({ allowRemote: true, changed: true });
});

const put = (body: unknown, headers: Record<string, string>) =>
  fetch(`${base}/api/projects/p-1/remote-access`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("PUT /api/projects/:projectId/remote-access (FR-002)", () => {
  it("401 without a session", async () => {
    expect((await put({ allowRemote: true }, {})).status).toBe(401);
  });

  it("404 for a project outside the caller's company; nothing changes", async () => {
    h.projectRows = [];
    expect((await put({ allowRemote: true }, who("ADMIN"))).status).toBe(404);
    expect(h.setAllowRemote).not.toHaveBeenCalled();
  });

  it("400 unless the body is exactly { allowRemote: boolean }", async () => {
    h.canManage.mockResolvedValue(true);
    expect((await put({}, who("ADMIN"))).status).toBe(400);
    expect((await put({ allowRemote: "yes" }, who("ADMIN"))).status).toBe(400);
    expect((await put({ allowRemote: true, projectId: "p-2" }, who("ADMIN"))).status).toBe(400);
    expect(h.setAllowRemote).not.toHaveBeenCalled();
  });

  it("403 when the service says the caller may not manage it; nothing changes", async () => {
    const r = await put({ allowRemote: true }, who("TEAM_MEMBER"));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "forbidden" });
    expect(h.canManage).toHaveBeenCalledWith("p-1", { userid: "u-1", usertype: "TEAM_MEMBER" });
    expect(h.setAllowRemote).not.toHaveBeenCalled();
  });

  it("an allowed caller sets it, as themselves", async () => {
    h.canManage.mockResolvedValue(true);
    const r = await put({ allowRemote: true }, who("TEAM_MANAGER"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ allowRemote: true, changed: true });
    expect(h.setAllowRemote).toHaveBeenCalledWith(PROJECT, true, "u-1");
  });
});

describe("GET /api/projects/:projectId/agent-access (FR-002)", () => {
  it("also returns allowRemote and canManageRemote, decided by the server", async () => {
    h.project.mockResolvedValue({ ...PROJECT, allowremote: true });
    h.canManage.mockResolvedValue(true);
    const r = await fetch(`${base}/api/projects/p-1/agent-access`, { headers: who("ADMIN") });
    expect(r.status).toBe(200);
    // [SCOPE 152 / T008, T010] No per-Project tick any more; who can reach it instead.
    const body = await r.json();
    expect(body).toEqual({ allowRemote: true, canManageRemote: true, reachableBy: ["Consult Co"], autopilotEnabled: false });
    expect(body).not.toHaveProperty("agents");
  });
});
// [SCOPE 145 / T002] END

// [SCOPE 145 / T004] BEGIN — project agent settings route tests (FR-004)
// MODIFIED-BY: [SCOPE 148 / T006] — feedbackSink in the answer (SPEC-148 FR-001)
describe("GET /api/project-agent/settings (FR-004)", () => {
  const get = (auth?: string) =>
    fetch(`${base}/api/project-agent/settings`, { headers: auth ? { authorization: auth } : {} });

  it("401 without a token, with an unknown one, or with an expired one", async () => {
    expect((await get()).status).toBe(401);
    h.validateToken.mockResolvedValue(null);
    expect(await (await get("Bearer nope")).json()).toEqual({ error: "invalid-token" });
    h.validateToken.mockResolvedValue({ projectid: "p-1", expiresat: new Date(Date.now() - 1000) });
    expect(await (await get("Bearer old")).json()).toEqual({ error: "token_expired" });
    expect(h.project).not.toHaveBeenCalled();
  });

  it("answers for the token's project, never one from the request", async () => {
    h.validateToken.mockResolvedValue({ projectid: "p-1", expiresat: null });
    const r = await fetch(`${base}/api/project-agent/settings?projectId=p-other`, { headers: { authorization: "Bearer kit" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ allowRemote: false, autopilotEnabled: false, projectName: "Billing", feedbackSink: false });
    expect(h.project).toHaveBeenCalledWith("p-1");
  });

  it("feedbackSink is true only for the feedback-sink project's token, whatever the request says", async () => {
    const { SINK_PROJECT_ID } = await import("../../src/server/services/FeedbackTriageService.js");
    h.validateToken.mockResolvedValue({ projectid: SINK_PROJECT_ID, expiresat: null });
    const sink = await fetch(`${base}/api/project-agent/settings?feedbackSink=false`, { headers: { authorization: "Bearer kit" } });
    expect((await sink.json()).feedbackSink).toBe(true);

    h.validateToken.mockResolvedValue({ projectid: "p-1", expiresat: null });
    const other = await fetch(`${base}/api/project-agent/settings?projectId=${SINK_PROJECT_ID}&feedbackSink=true`, {
      headers: { authorization: "Bearer kit" },
    });
    expect((await other.json()).feedbackSink).toBe(false);
  });

  it("404 when the token's project no longer exists", async () => {
    h.validateToken.mockResolvedValue({ projectid: "p-gone", expiresat: null });
    h.project.mockResolvedValue(null);
    expect((await get("Bearer kit")).status).toBe(404);
  });
});
// [SCOPE 145 / T004] END
