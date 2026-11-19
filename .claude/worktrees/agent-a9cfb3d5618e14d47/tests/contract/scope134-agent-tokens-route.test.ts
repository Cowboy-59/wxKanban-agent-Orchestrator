// [SCOPE 134 / T026] Contract test: GET /api/company/agent-tokens reaches the agent-token
// router. It used to be mounted after companyRoutes, whose GET /:id stub answered first
// (id = "agent-tokens") with a 200 and no `tokens` — the Agent Access panel read
// `undefined.length` and crashed the Company tab of Settings.
// Boots the real app and signs a session for a company that does not exist, so the
// listing is empty and nothing is written.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";

describe("agent-token listing route (SCOPE-134)", () => {
  let server: Server;
  let base: string;
  let cookie: string;

  beforeAll(async () => {
    loadEnv();
    const { createApp } = await import("../../src/server/app.js");
    const { signToken } = await import("../../src/server/lib/jwt.js");
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    base = `http://127.0.0.1:${port}`;
    cookie = `token=${signToken(randomUUID(), "route-test@example.invalid", {
      companyid: randomUUID(),
      usertype: "ADMIN",
      billingplan: "pro",
      subscriptionstatus: "active",
      maxusers: 5,
    })}`;
  }, 60000);

  afterAll(() => {
    server?.close();
  });

  it("answers GET with a tokens array, not the company /:id stub", async () => {
    const res = await fetch(`${base}/api/company/agent-tokens`, { headers: { cookie } });
    const body = (await res.json()) as { tokens?: unknown; count?: unknown };
    expect(res.status).toBe(200);
    expect(Array.isArray(body.tokens)).toBe(true);
    expect(body.count).toBe(0);
  });

  it("still gates the listing behind auth", async () => {
    const res = await fetch(`${base}/api/company/agent-tokens`);
    expect(res.status).toBe(401);
  });
});
