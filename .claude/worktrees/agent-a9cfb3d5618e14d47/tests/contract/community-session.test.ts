// [SCOPE 079 / FR-008] Contract tests for the community-chat session broker.
// MODIFIED-BY: [SCOPE 144 / T002] — the endpoint is no longer open: an app token is required (FR-009)
// Boots the real app on an ephemeral port and drives it with global fetch (no
// supertest) — mirrors feature-snippets.test.ts. Only the no-token paths run here,
// because a token lookup would query the database and the repo .env is production.
// The token, membership, refusal-audit and upstream paths are pinned with the
// services stubbed in tests/backend/communitySession.route.test.ts.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config as loadEnv } from "dotenv";
import type { Server } from "node:http";

describe("Community chat session broker (SCOPE-079 / FR-008, SPEC-144 FR-009)", () => {
  let server: Server;
  let base: string;
  let savedSecret: string | undefined;

  beforeAll(async () => {
    loadEnv();
    const { createApp } = await import("../../src/server/app.js");
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    base = `http://127.0.0.1:${port}`;
    savedSecret = process.env.WXKANBAN_CONSUMER_SECRET;
  });

  afterAll(() => {
    if (savedSecret === undefined) delete process.env.WXKANBAN_CONSUMER_SECRET;
    else process.env.WXKANBAN_CONSUMER_SECRET = savedSecret;
    server?.close();
  });

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/community/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("is NOT open — an email with no app token gets 401 token_required", async () => {
    const res = await post({ email: "open.check@example.com" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "token_required" });
  });

  it("refuses before the secret check — 401, not 503, even when the secret is unset", async () => {
    delete process.env.WXKANBAN_CONSUMER_SECRET;
    const res = await post({ email: "new.user@example.com" });
    expect(res.status).toBe(401);
  });

  it("a non-Bearer Authorization header is treated as no token", async () => {
    const res = await post({ email: "basic@example.com" }, { Authorization: "Basic abc" });
    expect(res.status).toBe(401);
  });
});
