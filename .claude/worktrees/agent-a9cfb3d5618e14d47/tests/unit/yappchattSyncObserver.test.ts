/**
 * SPEC-144 (SCOPE-144) T007 — the sync observer runs after a user or engagement change
 * FINISHES successfully, never before and never on a failure, so it can neither block nor
 * fail those flows. Database and broker are mocked (the repo `.env` points at production).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

vi.mock("../../src/db/client.js", () => ({ db: {} }));
vi.mock("../../src/server/lib/yappchattBroker.js", () => ({
  YappchattBrokerError: class extends Error {},
  isCompanionUnavailable: () => false,
}));

import { companyYappchattService, yappchattSyncObserver } from "../../src/server/services/CompanyYappchattService.js";

// [SCOPE 144 / T007] BEGIN — sync observer tests
let server: Server;
let base: string;
const spy = vi.spyOn(companyYappchattService, "syncAfterRequest");

beforeAll(async () => {
  const app = express();
  app.use(yappchattSyncObserver);
  app.post("/api/team/:userId/remove", (req, res) => {
    if (req.params.userId === "fail") return res.status(403).json({ error: "no" });
    return res.json({ success: true });
  });
  app.post("/api/engagements/:id/end", (_req, res) => res.json({ ok: true }));
  app.post("/api/projects/:id/tasks", (_req, res) => res.json({ ok: true }));
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

beforeEach(() => {
  spy.mockReset();
  spy.mockResolvedValue(undefined);
});

const settle = () => new Promise((r) => setTimeout(r, 30));

describe("yappchattSyncObserver", () => {
  it("syncs after a successful user removal", async () => {
    const r = await fetch(`${base}/api/team/u1/remove`, { method: "POST" });
    expect(r.status).toBe(200);
    await settle();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ kind: "session-company", name: "team-user-change" });
  });

  it("does not sync when the change was refused", async () => {
    expect((await fetch(`${base}/api/team/fail/remove`, { method: "POST" })).status).toBe(403);
    await settle();
    expect(spy).not.toHaveBeenCalled();
  });

  it("syncs after an engagement ends, keyed by the engagement id", async () => {
    await fetch(`${base}/api/engagements/e-9/end`, { method: "POST" });
    await settle();
    expect(spy.mock.calls[0][0]).toMatchObject({ kind: "engagement", id: "e-9" });
  });

  it("ignores unrelated routes", async () => {
    await fetch(`${base}/api/projects/p1/tasks`, { method: "POST" });
    await settle();
    expect(spy).not.toHaveBeenCalled();
  });

  it("a failing sync never changes the response", async () => {
    spy.mockRejectedValue(new Error("boom"));
    const r = await fetch(`${base}/api/team/u1/remove`, { method: "POST" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true });
    await settle();
  });
});
// [SCOPE 144 / T007] END
