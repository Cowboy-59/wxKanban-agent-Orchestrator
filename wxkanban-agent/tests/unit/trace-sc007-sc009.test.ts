/**
 * [SCOPE 159 / T020] SC-007 (every run carries task, spec and scope ids) and SC-009 (the panel snapshot
 * and the parallel status file show a state change within 10 s). Real files, real clock.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UnitTrace } from "../../apps/remote-bridge/src/unit-trace";
import { RunRecorder } from "../../apps/remote-bridge/src/run-record";
import { PARALLEL_STATUS_REL } from "../../apps/remote-bridge/src/parallel-status";
import { GateNotifier, NOTICE_WITHIN_MS, PANEL_SNAPSHOT_REL, buildPanel, writePanelSnapshot } from "../../apps/remote-bridge/src/room-view";

describe("SC-007 every run carries task, spec and scope ids", () => {
  it("100 units through every ending (done, parked, failed, no spec named) save 100 complete records", () => {
    const root = mkdtempSync(join(tmpdir(), "wx-sc007-"));
    const t = new UnitTrace({ root });
    for (let i = 0; i < 100; i += 1) {
      const unit = { num: String(200 + i), title: `Unit ${i}`, text: i % 2 ? `Implements SPEC-${200 + i}` : "no spec named here" };
      t.start(unit);
      if (i % 3 === 0) t.end(unit, { ok: false, parkedGates: [{ project: "p", scope: `SCOPE-${unit.num}`, question: "Go?", blocks: "x" }] });
      else if (i % 3 === 1) t.end(unit, { ok: false, error: "boom" });
      else t.end(unit, { ok: true });
    }
    const recs = new RunRecorder(root).read();
    expect(recs).toHaveLength(100);
    for (const r of recs) {
      expect(r.links.taskId).toMatch(/^unit:\d+$/);
      expect(r.links.scopeId).toMatch(/^SCOPE-\d+$/);
      expect(r.links.specId.length).toBeGreaterThan(0);
      expect(r.links.brainstormRecord.length).toBeGreaterThan(0);
    }
    // Where the unit text names no SPEC the id field is the explicit marker, never empty.
    const unresolved = recs.filter((r) => r.links.specId === "unresolved").length;
    process.stdout.write(`[sc007] 100 records, all carry task+scope+spec field; specId unresolved on ${unresolved}\n`);
    expect(unresolved).toBe(50);
  });

  it("a record missing any id is refused", () => {
    const root = mkdtempSync(join(tmpdir(), "wx-sc007b-"));
    const rec = new RunRecorder(root);
    for (const miss of ["taskId", "specId", "scopeId"] as const) {
      const links = { taskId: "t", specId: "s", scopeId: "c", [miss]: "" };
      expect(() => rec.save("r", links)).toThrow(/incomplete/);
    }
  });
});

describe("SC-009 state change visible within 10 seconds", () => {
  const poll = async (read: () => boolean, limitMs: number): Promise<number> => {
    const t0 = Date.now();
    while (Date.now() - t0 < limitMs) {
      if (read()) return Date.now() - t0;
      await new Promise((r) => setTimeout(r, 5));
    }
    return Infinity;
  };

  it("parallel status file: 30 trials of start, park, finish each show within 10 s", async () => {
    const root = mkdtempSync(join(tmpdir(), "wx-sc009-"));
    const t = new UnitTrace({ root });
    const file = join(root, PARALLEL_STATUS_REL);
    const seen = (s: string) => () => existsSync(file) && readFileSync(file, "utf8").includes(s);
    const worst: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const unit = { num: String(300 + i), title: `Trial ${i}`, text: "SPEC-300" };
      t.start(unit);
      worst.push(await poll(seen(`SCOPE-${unit.num} Trial ${i} | unit:${unit.num} | . | running`), NOTICE_WITHIN_MS));
      t.end(unit, { ok: false, parkedGates: [{ project: "p", scope: "s", question: `Q${i}?`, blocks: "b" }] });
      worst.push(await poll(seen(`Q${i}?`), NOTICE_WITHIN_MS));
      t.start(unit);
      t.end(unit, { ok: true });
      worst.push(await poll(seen(`Trial ${i} | unit:${unit.num} | . | finished`), NOTICE_WITHIN_MS));
    }
    process.stdout.write(`[sc009] status file: ${worst.length} changes, slowest ${Math.max(...worst)} ms\n`);
    expect(worst.every((w) => w < NOTICE_WITHIN_MS)).toBe(true);
  });

  it("panel snapshot and gate notice: 30 trials each show within 10 s", async () => {
    const root = mkdtempSync(join(tmpdir(), "wx-sc009p-"));
    const file = join(root, PANEL_SNAPSHOT_REL);
    const notifier = new GateNotifier();
    const times: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const gates = [{ gateId: `G-${i}`, raisedBy: "w1", raisedAt: new Date() }];
      writePanelSnapshot(root, buildPanel(root, [{ id: `w${i}`, role: "worker", persona: "builder", model: "sonnet", taskId: `T${i}`, state: "running", lane: "local", lastBeatAt: new Date() }], gates, [], new Date()));
      times.push(await poll(() => existsSync(file) && readFileSync(file, "utf8").includes(`"gateId":"G-${i}"`) && readFileSync(file, "utf8").includes(`"id":"w${i}"`), NOTICE_WITHIN_MS));
      const t0 = Date.now();
      const fresh = notifier.fresh(gates);
      times.push(Date.now() - t0);
      expect(fresh).toHaveLength(1);
      expect(fresh[0]?.canAnswer).toBe(false);
    }
    process.stdout.write(`[sc009] panel + notice: ${times.length} changes, slowest ${Math.max(...times)} ms\n`);
    expect(times.every((w) => w < NOTICE_WITHIN_MS)).toBe(true);
  });
});
