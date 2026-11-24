/**
 * [SCOPE 159 / T008] Questions go up; worker messages and handovers (FR-023, FR-025..FR-028, FR-032).
 */
import { describe, expect, it } from "vitest";
import type { RoomMessage, SenderStamp } from "../../common-room/src/index";
import {
  Assignments,
  Handovers,
  escalatedRecord,
  routeWorkerMessage,
  searchAnswer,
  takeNextFree,
} from "../../apps/remote-bridge/src/manager-routing";

const W1: SenderStamp = { kind: "worker", id: "w1" };
const MGR: SenderStamp = { kind: "manager", id: "mgr" };
const msg = (to: RoomMessage["to"], sender: SenderStamp): RoomMessage => ({
  contractVersion: "1.0.0", seq: 1, projectId: "p", source: "local", to, kind: "notice", body: "x", sender,
  sentAt: "2026-11-24T00:00:00Z", deliveredAt: null, ackedAt: null, expiresAt: null,
});

describe("UT-043 questions go up, never sideways", () => {
  it("a worker line to KAIN is delivered to the Manager instead", () => {
    expect(routeWorkerMessage(msg("kain", W1))).toMatchObject({ deliverTo: "manager", rerouted: true });
  });
  it("worker-to-worker is information only and the Manager sees it", () => {
    expect(routeWorkerMessage(msg("peer", W1))).toMatchObject({ informationOnly: true, copyToManager: true });
    expect(routeWorkerMessage(msg("worker", W1))).toMatchObject({ informationOnly: true, copyToManager: true });
  });
  it("a Manager line is not rerouted", () => {
    expect(routeWorkerMessage(msg("worker", MGR)).rerouted).toBe(false);
  });
});

describe("UT-044 the search order", () => {
  const hit = (ref: string) => async () => ({ text: "a", ref });
  it("ledger first, then work memory, CompoundLearning, god-learnings", async () => {
    const calls: string[] = [];
    const spy = (n: string, ref?: string) => async () => {
      calls.push(n);
      return ref ? { text: "a", ref } : undefined;
    };
    const r = await searchAnswer("q", W1, { ledger: spy("ledger"), workmemory: spy("workmemory"), compoundlearning: spy("compound", "CL-1"), godlearnings: spy("god", "G-0001") });
    expect(calls).toEqual(["ledger", "workmemory", "compound"]);
    expect(r.found && r.record).toMatchObject({ answeredBy: "CL-1", source: "compoundlearning", askedBy: W1 });
  });
  it("steps missing in R1 are skipped, a throwing step is skipped, none found goes to KAIN or the owner", async () => {
    const r = await searchAnswer("q", W1, { ledger: async () => { throw new Error("down"); } });
    expect(r).toEqual({ found: false, escalateTo: "kain-or-owner" });
    expect((await searchAnswer("q", W1, { godlearnings: hit("G-0002") })).found).toBe(true);
    expect(escalatedRecord("q", W1, "u-admin", "owner").source).toBe("owner");
  });
});

describe("UT-045 assignments and handovers", () => {
  it("the Manager assigns and reassigns, logged with both identities; a worker is refused", () => {
    const a = new Assignments(() => new Date(Date.UTC(2026, 10, 24)));
    expect(a.assign("T1", "w1", MGR).ok).toBe(true);
    expect(a.assign("T1", "w2", MGR).ok).toBe(true);
    expect(a.assign("T1", "w3", W1)).toEqual({ ok: false, reason: "not_manager" });
    expect(a.ownerOf("T1")).toBe("w2");
    expect(a.log().map((r) => [r.from, r.to, r.by])).toEqual([[null, "w1", "mgr"], ["w1", "w2", "mgr"]]);
  });
  it("an unaccepted handover changes nothing; only the receiver accepts", () => {
    const a = new Assignments();
    a.assign("T1", "w1", MGR);
    const h = new Handovers(a, MGR);
    const p = h.propose("T1", "w1", "w2");
    expect(a.ownerOf("T1")).toBe("w1");
    expect(h.accept(p.id, "w3")).toEqual({ ok: false, reason: "not_receiver" });
    expect(a.ownerOf("T1")).toBe("w1");
    expect(h.accept(p.id, "w2").ok).toBe(true);
    expect(a.ownerOf("T1")).toBe("w2");
    expect(h.get(p.id)?.state).toBe("accepted");
  });
  it("a blocked worker takes the next free task and the notice names both", () => {
    const n = takeNextFree("T1", "w1", ["T1", "T2"]);
    expect(n?.taskId).toBe("T2");
    expect(n?.notice).toContain("T1");
    expect(n?.notice).toContain("T2");
    expect(takeNextFree("T1", "w1", ["T1"])).toBeUndefined();
  });
});
