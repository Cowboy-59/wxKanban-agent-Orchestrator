// [SCOPE 106 / T018] Contract tests for the Borrow-a-Look template gallery + URL derive.
// Dependency-free: boots the real app on an ephemeral port and drives it with fetch.
// These assertions validate that the new endpoints are mounted (T009 wiring) and that
// every mutating/admin route is auth-gated — they hold regardless of DB seed state.
// The member-vs-admin distinction and cross-tenant isolation (which need seeded
// sessions) are exercised end-to-end in tests/e2e/scenarios/scope106-borrow-look.spec.ts.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config as loadEnv } from "dotenv";
import type { Server } from "node:http";

describe("Borrow-a-Look template gallery (SCOPE-106)", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    loadEnv();
    const { createApp } = await import("../../src/server/app.js");
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    base = `http://127.0.0.1:${port}`;
  }, 60000);

  afterAll(() => {
    server?.close();
  });

  const noAuth = { "Content-Type": "application/json" };

  it("gates GET /api/themes/templates behind auth", async () => {
    const res = await fetch(`${base}/api/themes/templates`);
    expect([401, 403]).toContain(res.status);
  });

  it("gates POST /api/themes/templates (member save) behind auth", async () => {
    const res = await fetch(`${base}/api/themes/templates`, {
      method: "POST",
      headers: noAuth,
      body: JSON.stringify({ name: "x", theme: {}, chrome: {} }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("gates PATCH rename (admin) behind auth", async () => {
    const res = await fetch(`${base}/api/themes/templates/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: noAuth,
      body: JSON.stringify({ name: "y" }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("gates DELETE (admin) behind auth", async () => {
    const res = await fetch(`${base}/api/themes/templates/00000000-0000-0000-0000-000000000000`, {
      method: "DELETE",
    });
    expect([401, 403]).toContain(res.status);
  });

  it("gates POST /api/projects/:id/theme/apply-template behind auth", async () => {
    const res = await fetch(
      `${base}/api/projects/00000000-0000-0000-0000-000000000000/theme/apply-template`,
      { method: "POST", headers: noAuth, body: JSON.stringify({ appType: "web", templateId: "x" }) },
    );
    expect([401, 403]).toContain(res.status);
  });

  it("mounts + gates POST /api/themes/derive/url (proves the route exists)", async () => {
    const res = await fetch(`${base}/api/themes/derive/url`, {
      method: "POST",
      headers: noAuth,
      body: JSON.stringify({ appType: "web", url: "https://example.com" }),
    });
    // Auth-gated (not 404) — the route is wired; unauthenticated is rejected.
    expect(res.status).not.toBe(404);
    expect([401, 403]).toContain(res.status);
  });
});
