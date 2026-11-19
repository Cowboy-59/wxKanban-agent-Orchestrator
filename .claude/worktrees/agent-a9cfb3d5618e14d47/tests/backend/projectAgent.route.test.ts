/**
 * SCOPE-134 / T029 — the project agent's room route over real HTTP, services stubbed.
 *
 * Pinned: the project's kit token is required; the project and room come from the token,
 * so a projectId or conversationId in the body is a 400 (FR-013); the supervisor defaults
 * to KAIN; service refusals keep their status.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

const svc = vi.hoisted(() => ({ validateToken: vi.fn(), projectAgentRoom: vi.fn() }));

vi.mock("../../src/server/services/ApiTokenService.js", () => ({
  apiTokenService: { validateToken: svc.validateToken },
}));

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
  return { AgentConnectError, agentConnectService: { projectAgentRoom: svc.projectAgentRoom } };
});

vi.mock("../../src/server/lib/yappchattBroker.js", () => ({ YappchattBrokerError: class extends Error {} }));

// SCOPE-144 / T009: the route imports the company YappChatt service for the approver
// check; stubbed so this suite never loads the real db client (the repo .env is production).
vi.mock("../../src/server/services/CompanyYappchattService.js", () => ({
  companyYappchattService: { approver: vi.fn() },
}));

import router from "../../src/server/routes/projectAgent.js";
import { AgentConnectError } from "../../src/server/services/AgentConnectService.js";

// [SCOPE 134 / T029] BEGIN — project agent route tests
let server: Server;
let url: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/project-agent", router);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/project-agent/room`;
});
afterAll(() => server.close());

const TOKEN_ROW = { projectid: "p-1", customerid: "c-1", issuedbyid: "u-1", name: "Token", expiresat: null };

beforeEach(() => {
  vi.clearAllMocks();
  svc.validateToken.mockResolvedValue(TOKEN_ROW);
});

const post = (body: unknown, auth = "Bearer kit-token") =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

describe("POST /api/project-agent/room", () => {
  it("401 with no bearer, 401 for an unknown token", async () => {
    expect((await post({}, "")).status).toBe(401);
    svc.validateToken.mockResolvedValue(null);
    expect((await post({})).status).toBe(401);
    expect(svc.projectAgentRoom).not.toHaveBeenCalled();
  });

  it("defaults the supervisor to KAIN and passes the token row through", async () => {
    svc.projectAgentRoom.mockResolvedValue({ projectId: "p-1" });
    const r = await post({});
    expect(r.status).toBe(200);
    expect(svc.projectAgentRoom).toHaveBeenCalledWith(TOKEN_ROW, "KAIN", { mintAgentToken: undefined });
  });

  it("rejects a client-supplied project or room id (FR-013)", async () => {
    expect((await post({ projectId: "p-2" })).status).toBe(400);
    expect((await post({ conversationId: "x" })).status).toBe(400);
    expect(svc.projectAgentRoom).not.toHaveBeenCalled();
  });

  it("refuses a supervising agent's token being used as a project token", async () => {
    svc.projectAgentRoom.mockRejectedValue(new AgentConnectError("wrong_token", 403, "Use the project kit token"));
    const r = await post({});
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "wrong_token" });
  });
});
// [SCOPE 134 / T029] END
