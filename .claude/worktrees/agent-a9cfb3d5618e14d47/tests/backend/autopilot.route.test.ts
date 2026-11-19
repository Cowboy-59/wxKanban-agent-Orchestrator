/**
 * SPEC-154 (SCOPE-132 Amendment H) T002 — the Autopilot switch over real HTTP, services and auth
 * stubbed:
 *   PUT /api/projects/:projectId/autopilot      (company ADMIN or the project's TEAM_MANAGER)
 *   GET /api/projects/:projectId/agent-access   (now also autopilotEnabled)
 *   GET /api/project-agent/settings             (kit token; now also autopilotEnabled)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { NextFunction, Response } from "express";

const h = vi.hoisted(() => ({
  projectRows: [] as unknown[],
  remoteProject: vi.fn(),
  remoteCanManage: vi.fn(),
  autopilotProject: vi.fn(),
  autopilotCanManage: vi.fn(),
  setAutopilotEnabled: vi.fn(),
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
vi.mock("../../src/server/lib/agentReach.js", () => ({ consultingCompaniesReaching: async () => [] }));
vi.mock("../../src/server/services/ProjectRemoteAccessService.js", () => ({
  projectRemoteAccessService: { project: h.remoteProject, canManage: h.remoteCanManage, setAllowRemote: vi.fn() },
}));
vi.mock("../../src/server/services/ProjectAutopilotService.js", () => ({
  projectAutopilotService: {
    project: h.autopilotProject,
    canManage: h.autopilotCanManage,
    setAutopilotEnabled: h.setAutopilotEnabled,
  },
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

// [SCOPE 154 / T002] BEGIN — Autopilot switch route tests (FR-001)
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

const PROJECT = { id: "p-1", name: "Billing", companyid: "c-1", allowremote: true, autopilotenabled: false };
const who = (usertype: string) => ({ "x-test-user": "u-1", "x-test-company": "c-1", "x-test-usertype": usertype });

beforeEach(() => {
  vi.clearAllMocks();
  h.projectRows = [{ id: "p-1" }];
  h.remoteProject.mockResolvedValue({ id: "p-1", name: "Billing", companyid: "c-1", allowremote: true });
  h.remoteCanManage.mockResolvedValue(true);
  h.autopilotProject.mockResolvedValue(PROJECT);
  h.autopilotCanManage.mockResolvedValue(false);
  h.setAutopilotEnabled.mockResolvedValue({ autopilotEnabled: true, changed: true });
});

const put = (body: unknown, headers: Record<string, string>) =>
  fetch(`${base}/api/projects/p-1/autopilot`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("PUT /api/projects/:projectId/autopilot (FR-001)", () => {
  it("401 without a session", async () => {
    expect((await put({ autopilotEnabled: true }, {})).status).toBe(401);
  });

  it("404 for a project outside the caller's company; nothing changes", async () => {
    h.projectRows = [];
    expect((await put({ autopilotEnabled: true }, who("ADMIN"))).status).toBe(404);
    expect(h.setAutopilotEnabled).not.toHaveBeenCalled();
  });

  it("400 unless the body is exactly { autopilotEnabled: boolean }", async () => {
    h.autopilotCanManage.mockResolvedValue(true);
    expect((await put({}, who("ADMIN"))).status).toBe(400);
    expect((await put({ autopilotEnabled: "yes" }, who("ADMIN"))).status).toBe(400);
    expect((await put({ autopilotEnabled: true, projectId: "p-2" }, who("ADMIN"))).status).toBe(400);
    expect(h.setAutopilotEnabled).not.toHaveBeenCalled();
  });

  it("403 for a caller who is neither ADMIN nor the project's TEAM_MANAGER; nothing changes", async () => {
    const r = await put({ autopilotEnabled: true }, who("TEAM_MEMBER"));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "forbidden" });
    expect(h.autopilotCanManage).toHaveBeenCalledWith("p-1", { userid: "u-1", usertype: "TEAM_MEMBER" });
    expect(h.setAutopilotEnabled).not.toHaveBeenCalled();
  });

  it("400 remote_not_allowed when Allow remote is off", async () => {
    h.autopilotCanManage.mockResolvedValue(true);
    h.setAutopilotEnabled.mockResolvedValue({ error: "remote_not_allowed" });
    const r = await put({ autopilotEnabled: true }, who("ADMIN"));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({
      error: "remote_not_allowed",
      message: "Turn Allow remote on before enabling Autopilot.",
    });
  });

  it("an allowed caller toggles it, as themselves", async () => {
    h.autopilotCanManage.mockResolvedValue(true);
    const r = await put({ autopilotEnabled: true }, who("TEAM_MANAGER"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ autopilotEnabled: true, changed: true });
    expect(h.setAutopilotEnabled).toHaveBeenCalledWith(PROJECT, true, "u-1");
  });
});

describe("GET /api/projects/:projectId/agent-access (FR-001)", () => {
  it("returns autopilotEnabled from the project", async () => {
    h.autopilotProject.mockResolvedValue({ ...PROJECT, autopilotenabled: true });
    const r = await fetch(`${base}/api/projects/p-1/agent-access`, { headers: who("ADMIN") });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ allowRemote: true, canManageRemote: true, reachableBy: [], autopilotEnabled: true });
  });
});

describe("GET /api/project-agent/settings (FR-001)", () => {
  it("returns autopilotEnabled for the token's project", async () => {
    h.validateToken.mockResolvedValue({ projectid: "p-1", expiresat: null });
    h.autopilotProject.mockResolvedValue({ ...PROJECT, autopilotenabled: true });
    const r = await fetch(`${base}/api/project-agent/settings`, { headers: { authorization: "Bearer kit" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ allowRemote: true, autopilotEnabled: true, projectName: "Billing" });
    expect(h.autopilotProject).toHaveBeenCalledWith("p-1");
  });
});
// [SCOPE 154 / T002] END
