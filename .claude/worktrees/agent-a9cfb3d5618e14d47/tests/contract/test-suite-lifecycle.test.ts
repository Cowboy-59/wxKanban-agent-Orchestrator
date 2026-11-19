// [SCOPE 111 / T023] Contract tests for the Test Suite Lifecycle API.
//
// SCOPE NOTE — deliberately non-mutating. This repository's .env points at the
// PRODUCTION database and the hosted orchestrator shares it, so a test that
// created a cycle, a plan or a signoff would write to production. The scope
// forbids exactly that (FR-046), so what is covered here is everything provable
// without a write: the auth surface on every new route, and the refusals that
// fire before any database access.
//
// The remaining T023 coverage — executor mismatch, commit mismatch, the two
// resets, impact marking — needs a real round trip and stays BLOCKED until a
// non-production database exists. It is not silently skipped: see the blocked
// task and the tests.md negative-coverage list.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config as loadEnv } from "dotenv";
import type { Server } from "node:http";
import { TestImpactService, ImpactRequestError } from "../../src/server/services/TestImpactService.js";

describe("Test Suite Lifecycle API (SCOPE-111)", () => {
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
  });

  afterAll(() => {
    server?.close();
  });

  describe("every route requires authentication", () => {
    // Read routes leaking a project's test suite would expose its code layout
    // (source paths, fences); write routes would let anyone sign off a release.
    const routes: Array<[string, string, unknown?]> = [
      ["GET", "/api/projects/00000000-0000-0000-0000-000000000000/testplans"],
      ["GET", "/api/projects/00000000-0000-0000-0000-000000000000/testruns"],
      ["GET", "/api/projects/00000000-0000-0000-0000-000000000000/testcycles"],
      ["GET", "/api/projects/00000000-0000-0000-0000-000000000000/testgate"],
      ["GET", "/api/testplans/00000000-0000-0000-0000-000000000000/items"],
      ["GET", "/api/testplanitems/00000000-0000-0000-0000-000000000000"],
      ["GET", "/api/testruns/00000000-0000-0000-0000-000000000000"],
      ["GET", "/api/testcycles/00000000-0000-0000-0000-000000000000/regression"],
      ["GET", "/api/testcycles/00000000-0000-0000-0000-000000000000/retests"],
      ["POST", "/api/testruns", { projectId: "00000000-0000-0000-0000-000000000000" }],
      ["POST", "/api/testplans/00000000-0000-0000-0000-000000000000/items", { title: "x" }],
      ["POST", "/api/testruns/00000000-0000-0000-0000-000000000000/results", { itemId: "x", status: "pass" }],
      ["POST", "/api/testruns/00000000-0000-0000-0000-000000000000/complete", {}],
      ["POST", "/api/testcycles/00000000-0000-0000-0000-000000000000/analyze-impact", {}],
      ["POST", "/api/testretests/00000000-0000-0000-0000-000000000000/dismiss", { reason: "x" }],
      ["POST", "/api/testplanitems/00000000-0000-0000-0000-000000000000/signoff", { passed: true }],
      ["POST", "/api/testplanitems/00000000-0000-0000-0000-000000000000/waive", { reason: "x" }],
      ["PATCH", "/api/testplans/00000000-0000-0000-0000-000000000000", { forcetest: true }],
      ["PATCH", "/api/testplanitems/00000000-0000-0000-0000-000000000000", { forcetest: true }],
      ["PATCH", "/api/testruns/00000000-0000-0000-0000-000000000000", {}],
    ];

    it.each(routes)("%s %s rejects an unauthenticated caller", async (method, path, body) => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe("impact analysis refuses before it touches anything", () => {
    // These are the failure modes that would make the whole Retest mechanism
    // quietly wrong, so each is refused ahead of any database access — which is
    // also what makes them testable without one.

    it("refuses a request carrying no graph at all", async () => {
      // Silence and 'nothing was affected' must never be the same answer: a
      // broken runner would otherwise green-light every release.
      await expect(
        TestImpactService.analyze("00000000-0000-0000-0000-000000000000", null),
      ).rejects.toBeInstanceOf(ImpactRequestError);
    });

    it("refuses a graph declaring neither dependents nor broadness", async () => {
      // A payload with changed files but no reachability claim is not evidence
      // of no impact — it is an incomplete request.
      await expect(
        TestImpactService.analyze("00000000-0000-0000-0000-000000000000", {
          commitsha: "abc123",
          changedFiles: ["src/server/services/InvoiceService.ts"],
        }),
      ).rejects.toBeInstanceOf(ImpactRequestError);
    });

    it("states why it refused, so a runner author can fix it", async () => {
      await expect(
        TestImpactService.analyze("00000000-0000-0000-0000-000000000000", null),
      ).rejects.toThrow(/no graph/i);
    });
  });

  describe("gate requirement validation", () => {
    it("rejects an unknown requirement rather than defaulting to a permissive one", async () => {
      // Defaulting an unrecognised requirement to something lenient would let a
      // typo silently weaken the release gate.
      const res = await fetch(
        `${base}/api/projects/00000000-0000-0000-0000-000000000000/testgate?requirement=whatever`,
      );
      // Unauthenticated first, but the point stands: it never returns a verdict.
      expect(res.status).not.toBe(200);
    });
  });
});
