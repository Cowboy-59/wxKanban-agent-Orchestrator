/**
 * [SCOPE 159 / T006] Bridge-stamped worker identity (FR-019) and gate-raiser record (FR-029).
 */
import { describe, expect, it } from "vitest";
import { GateRaisers, WorkerRegistry } from "../../apps/remote-bridge/src/worker-identity";
import { LocalRoom } from "../../apps/remote-bridge/src/local-room";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const W1 = { id: "w1", run: "r-1", unit: "T010", persona: "backend", model: "sonnet" };
const msg = (extra: object = {}) => ({
  contractVersion: "1.0.0",
  projectId: "p-1",
  source: "local",
  to: "agent",
  kind: "notice",
  body: "hello",
  ...extra,
});

describe("UT-040 the bridge stamps every worker message", () => {
  it("stamps run, unit, persona and model from the bridge's own record", () => {
    const reg = new WorkerRegistry();
    reg.register(W1);
    const r = reg.stamp("w1", msg());
    expect(r.ok && r.sender).toEqual({ kind: "worker", id: "w1", run: "r-1", unit: "T010", persona: "backend", model: "sonnet" });
    expect(r.ok && r.overwritten).toBe(false);
  });

  it("a claimed other sender is overwritten with the true identity and counted", () => {
    const reg = new WorkerRegistry();
    reg.register(W1);
    const r = reg.stamp("w1", msg({ sender: { kind: "user", id: "u-admin" } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.overwritten).toBe(true);
    expect("sender" in r.raw).toBe(false);
    expect(r.sender.kind).toBe("worker");
    expect(reg.overwriteCount()).toBe(1);
  });

  it("an unknown or stopped worker is refused", () => {
    const reg = new WorkerRegistry();
    expect(reg.stamp("ghost", msg())).toEqual({ ok: false, reason: "unknown_worker" });
    reg.register(W1);
    reg.unregister("w1");
    expect(reg.stamp("w1", msg()).ok).toBe(false);
    expect(reg.stamp("w1", "x").ok).toBe(false);
  });

  it("the stamped message lands in the local room under the worker's identity, never a user", () => {
    const reg = new WorkerRegistry();
    reg.register(W1);
    const room = new LocalRoom({ root: mkdtempSync(join(tmpdir(), "wx-ident-")), projectId: "p-1" });
    const r = reg.stamp("w1", msg({ sender: { kind: "user", id: "u-admin" } }));
    if (!r.ok) throw new Error("stamp failed");
    const posted = room.post(r.raw, r.sender);
    expect(posted.ok && posted.value.sender).toEqual(r.sender);
  });
});

describe("UT-041 each waiting gate records who raised it", () => {
  it("records, exposes oldest first, and forgets a settled gate", () => {
    let n = 0;
    const g = new GateRaisers(() => new Date(Date.UTC(2026, 10, 24, 0, 0, n++)));
    const reg = new WorkerRegistry();
    reg.register(W1);
    const stamp = reg.stampFor("w1")!;
    g.raise("g-1", stamp);
    g.raise("g-2", { kind: "manager", id: "manager" });
    expect(g.raiserOf("g-1")).toEqual(stamp);
    expect(g.waiting().map((x) => x.gateId)).toEqual(["g-1", "g-2"]);
    g.settle("g-1");
    expect(g.raiserOf("g-1")).toBeUndefined();
    expect(g.waiting()).toHaveLength(1);
  });
});
