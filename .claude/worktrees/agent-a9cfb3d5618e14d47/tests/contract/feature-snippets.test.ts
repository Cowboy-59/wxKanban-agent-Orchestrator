// [SCOPE 096 / T010] Contract tests for the Marketing Feature Snippets manager.
// Covers the public read invariant (published-only, correct shape — FR-002/003)
// and the SYSADMIN gate on every admin endpoint (FR-010). The mutating flows
// (toggle → carousel, translations flag, add-from-scope) are exercised at runtime;
// these assertions hold regardless of seed state. Dependency-free: boots the real
// app on an ephemeral port and drives it with global fetch (no supertest).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config as loadEnv } from "dotenv";
import type { Server } from "node:http";

// Features intentionally kept OFF (draft) — must never appear on the public read.
const SUPPRESSED = ["consulting-marketplace", "bring-your-own-llm", "project-theme"];

describe("Marketing Feature Snippets (SCOPE-096)", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    // Load .env before the app's config module evaluates (dynamic import below).
    loadEnv();
    const { createApp } = await import("../../src/server/app.js");
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server?.close();
  });

  describe("GET /api/marketing/feature-snippets (public)", () => {
    it("returns the published carousel set with the expected shape", async () => {
      const res = await fetch(`${base}/api/marketing/feature-snippets`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.locales)).toBe(true);
      expect(Array.isArray(body.features)).toBe(true);
      for (const f of body.features) {
        expect(typeof f.slug).toBe("string");
        expect(typeof f.name).toBe("string");
        expect(typeof f.dwellMs).toBe("number");
        expect(typeof f.enhanced).toBe("boolean");
        expect(Array.isArray(f.locales)).toBe(true);
      }
    });

    it("never exposes a suppressed (draft/off) snippet", async () => {
      const res = await fetch(`${base}/api/marketing/feature-snippets`);
      const body = await res.json();
      const slugs: string[] = body.features.map((f: { slug: string }) => f.slug);
      for (const s of SUPPRESSED) expect(slugs).not.toContain(s);
    });
  });

  describe("SYSADMIN gate (FR-010)", () => {
    it("rejects the admin list without a session", async () => {
      const res = await fetch(`${base}/api/sysadmin/marketing/feature-snippets`);
      expect([401, 403]).toContain(res.status);
    });

    it("rejects PATCH without a session", async () => {
      const res = await fetch(
        `${base}/api/sysadmin/marketing/feature-snippets/feature-anything`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ on: true }),
        },
      );
      expect([401, 403]).toContain(res.status);
    });

    it("rejects add-from-scope without a session", async () => {
      const res = await fetch(
        `${base}/api/sysadmin/marketing/feature-snippets/from-scope`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopeId: "096" }),
        },
      );
      expect([401, 403]).toContain(res.status);
    });
  });
});
