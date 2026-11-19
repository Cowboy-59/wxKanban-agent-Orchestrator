/**
 * SPEC-144 / T002 — the community session gate over real HTTP, services stubbed.
 *
 * Pinned (FR-009, FR-010): no Bearer → 401 token_required; an unknown, revoked or expired
 * token → 401 invalid-token; an email outside the token's company → 403 with the exact
 * message and one refusal audit, and YappChatt is never called; a member gets the
 * upstream session unchanged. Stubbed so this suite never loads the real db client
 * (the repo .env is production).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

const svc = vi.hoisted(() => ({
  validateToken: vi.fn(),
  isCompanyMemberEmail: vi.fn(),
  auditRefusedSession: vi.fn(),
}));

vi.mock("../../src/server/services/ApiTokenService.js", () => ({
  apiTokenService: { validateToken: svc.validateToken },
}));

vi.mock("../../src/server/lib/communityMembership.js", () => ({
  NOT_COMPANY_MEMBER_MESSAGE: "This email isn't a member of your company",
  isCompanyMemberEmail: svc.isCompanyMemberEmail,
  auditRefusedSession: svc.auditRefusedSession,
}));

import router from "../../src/server/routes/community.js";

// [SCOPE 144 / T002] BEGIN — community session gate tests
let server: Server;
let url: string;
const realFetch = globalThis.fetch;
const upstream = vi.fn();
let savedSecret: string | undefined;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/community/session`;
  savedSecret = process.env.WXKANBAN_CONSUMER_SECRET;
  // Only the server's YappChatt call is intercepted; the test's own requests go through.
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes("/api/consumer/session") ? upstream(input, init) : realFetch(input, init)) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  if (savedSecret === undefined) delete process.env.WXKANBAN_CONSUMER_SECRET;
  else process.env.WXKANBAN_CONSUMER_SECRET = savedSecret;
  server.close();
});

const TOKEN_ROW = { id: "t-1", projectid: "p-1", customerid: "c-1", issuedbyid: "u-1", expiresat: null };
const SESSION = { sessionToken: "s", userid: "y-1", communityId: "c", spaceId: "sp", conversationId: "cv" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WXKANBAN_CONSUMER_SECRET = "test-secret";
  svc.validateToken.mockResolvedValue(TOKEN_ROW);
  svc.isCompanyMemberEmail.mockResolvedValue(true);
  svc.auditRefusedSession.mockResolvedValue(undefined);
  upstream.mockResolvedValue(new Response(JSON.stringify(SESSION), { status: 200 }));
});

const post = (body: unknown, auth: string | null = "Bearer kit-token") =>
  realFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

describe("POST /api/community/session (FR-009)", () => {
  it("401 token_required with no Bearer, before any lookup", async () => {
    const res = await post({ email: "dev@acme.com" }, null);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "token_required" });
    expect(svc.validateToken).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("401 invalid-token for an unknown or revoked token", async () => {
    svc.validateToken.mockResolvedValue(null);
    const res = await post({ email: "dev@acme.com" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid-token" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("401 invalid-token for an expired token", async () => {
    svc.validateToken.mockResolvedValue({ ...TOKEN_ROW, expiresat: new Date(Date.now() - 1000) });
    expect((await post({ email: "dev@acme.com" })).status).toBe(401);
    expect(svc.isCompanyMemberEmail).not.toHaveBeenCalled();
  });

  it("400 for a missing email", async () => {
    expect((await post({ displayName: "Nobody" })).status).toBe(400);
  });

  it("403 for an email outside the token's company: exact message, one audit, no session", async () => {
    svc.isCompanyMemberEmail.mockResolvedValue(false);
    const res = await post({ email: "Outsider@Other.com" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "not_company_member",
      message: "This email isn't a member of your company",
    });
    expect(svc.isCompanyMemberEmail).toHaveBeenCalledWith("c-1", "outsider@other.com");
    expect(svc.auditRefusedSession).toHaveBeenCalledTimes(1);
    const entry = svc.auditRefusedSession.mock.calls[0][0] as Record<string, string>;
    expect(entry).toMatchObject({ companyId: "c-1", email: "outsider@other.com", projectId: "p-1", tokenId: "t-1" });
    expect(JSON.stringify(entry)).not.toContain("kit-token");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("a company member gets the upstream session unchanged", async () => {
    const res = await post({ email: "dev@acme.com", displayName: "Dev" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SESSION);
    expect(svc.auditRefusedSession).not.toHaveBeenCalled();
    const [, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ email: "dev@acme.com", displayName: "Dev" });
  });

  it("500 when the membership lookup fails, and no session", async () => {
    svc.isCompanyMemberEmail.mockRejectedValue(new Error("db down"));
    expect((await post({ email: "dev@acme.com" })).status).toBe(500);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("503 when the consumer secret is missing, after the gate passes", async () => {
    delete process.env.WXKANBAN_CONSUMER_SECRET;
    expect((await post({ email: "dev@acme.com" })).status).toBe(503);
  });
});
// [SCOPE 144 / T002] END
